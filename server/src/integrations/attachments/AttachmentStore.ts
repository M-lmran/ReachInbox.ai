import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { env, isObjectStorageConfigured } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Attachment storage for outgoing email.
 *
 * Two backends behind one interface:
 *
 *  - **Object storage** (S3-compatible) when S3_BUCKET and credentials are set.
 *    Required for any deployment where the API and the worker do not share a
 *    filesystem — which is the normal case, since they are separate services.
 *  - **Local disk** otherwise. Convenient for development, but the API and worker
 *    must run on the same machine for the worker to read what the API wrote.
 *
 * Layout is identical either way: `<id>/meta.json` plus `<id>/<filename>`, so an
 * attachment can be resolved from its id alone with no extra database table.
 *
 * Ownership is enforced on resolve: a user can only attach a file they uploaded.
 */

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB per file
export const MAX_ATTACHMENTS = 5;

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.zip',
];

export interface StoredAttachment {
  id: string;
  filename: string;
  size: number;
  mimetype: string;
}

export interface ResolvedAttachment extends StoredAttachment {
  /** Set when the file lives on local disk. */
  path?: string;
  /** Set when the file was fetched from object storage. */
  content?: Buffer;
}

interface AttachmentMeta extends StoredAttachment {
  userId: string;
  uploadedAt: string;
}

const ROOT = path.resolve(process.cwd(), 'uploads', 'attachments');

let s3Client: S3Client | null = null;
function s3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.S3_REGION,
      // R2, MinIO and Supabase Storage need an explicit endpoint; AWS S3 does not.
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      // MinIO and most self-hosted gateways require path-style addressing.
      ...(env.S3_FORCE_PATH_STYLE ? { forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

const useObjectStorage = () => isObjectStorageConfigured();
const objectKey = (id: string, name: string) => `attachments/${id}/${name}`;

function sanitize(filename: string): string {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.slice(0, 120) || 'file';
}

export function isAllowedAttachment(filename: string): boolean {
  return ALLOWED_ATTACHMENT_EXTENSIONS.includes(path.extname(filename).toLowerCase());
}

function dirFor(id: string): string {
  return path.join(ROOT, id);
}

/** Persist one uploaded file and return its descriptor. */
export async function saveAttachment(
  data: Buffer,
  originalName: string,
  mimetype: string,
  userId: string,
): Promise<StoredAttachment> {
  const id = randomUUID();
  const filename = sanitize(originalName);
  const meta: AttachmentMeta = {
    id,
    filename,
    size: data.length,
    mimetype: mimetype || 'application/octet-stream',
    userId,
    uploadedAt: new Date().toISOString(),
  };

  if (useObjectStorage()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey(id, filename),
        Body: data,
        ContentType: meta.mimetype,
      }),
    );
    await s3().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey(id, 'meta.json'),
        Body: JSON.stringify(meta, null, 2),
        ContentType: 'application/json',
      }),
    );
  } else {
    const dir = dirFor(id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), data);
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  }

  return { id, filename, size: meta.size, mimetype: meta.mimetype };
}

async function readMeta(id: string): Promise<AttachmentMeta | null> {
  try {
    if (useObjectStorage()) {
      const res = await s3().send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey(id, 'meta.json') }),
      );
      const body = await res.Body?.transformToString();
      return body ? (JSON.parse(body) as AttachmentMeta) : null;
    }
    const raw = await fs.readFile(path.join(dirFor(id), 'meta.json'), 'utf8');
    return JSON.parse(raw) as AttachmentMeta;
  } catch {
    return null;
  }
}

/**
 * Resolve ids to retrievable files, scoped to the owning user. Ids that are
 * unknown or owned by someone else are dropped rather than throwing, so a stale
 * id can never fail a whole campaign.
 */
export async function resolveAttachments(
  ids: string[],
  userId: string,
): Promise<ResolvedAttachment[]> {
  const out: ResolvedAttachment[] = [];

  for (const id of ids) {
    const meta = await readMeta(id);
    if (!meta) {
      logger.warn({ id }, 'Attachment id not found; skipping');
      continue;
    }
    if (meta.userId !== userId) {
      logger.warn({ id, userId }, 'Attachment belongs to another user; skipping');
      continue;
    }

    const base: StoredAttachment = {
      id: meta.id,
      filename: meta.filename,
      size: meta.size,
      mimetype: meta.mimetype,
    };

    if (useObjectStorage()) {
      try {
        const res = await s3().send(
          new GetObjectCommand({
            Bucket: env.S3_BUCKET,
            Key: objectKey(meta.id, meta.filename),
          }),
        );
        const bytes = await res.Body?.transformToByteArray();
        if (!bytes) {
          logger.warn({ id }, 'Attachment object had no body; skipping');
          continue;
        }
        out.push({ ...base, content: Buffer.from(bytes) });
      } catch (err) {
        logger.warn(
          { id, err: err instanceof Error ? err.message : String(err) },
          'Attachment object missing from storage; skipping',
        );
      }
    } else {
      out.push({ ...base, path: path.join(dirFor(meta.id), meta.filename) });
    }
  }

  return out;
}

/** Verify the file is still retrievable before handing it to the mailer. */
export async function attachmentExists(file: ResolvedAttachment): Promise<boolean> {
  if (file.content) return true;
  if (!file.path) return false;
  try {
    if (useObjectStorage()) {
      await s3().send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: file.path }));
      return true;
    }
    await fs.access(file.path);
    return true;
  } catch {
    return false;
  }
}
