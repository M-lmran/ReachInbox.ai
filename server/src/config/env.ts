import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8010),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  FRONTEND_URL: z.string().default('*'),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  MIN_EMAIL_DELAY_MS: z.coerce.number().default(2000),
  MAX_EMAILS_PER_HOUR: z.coerce.number().default(200),
  JWT_SECRET: z.string().default('reachinbox-dev-secret'),
  ETHEREAL_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_PORT: z.coerce.number().default(587),
  ETHEREAL_USER: z.string().optional().default(''),
  ETHEREAL_PASSWORD: z.string().optional().default(''),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().optional().default(''),
  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().optional().default(''),
  APP_PUBLIC_URL: z.string().optional().default(''),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  ELASTICSEARCH_URL: z.string().optional().default(''),
  /**
   * Object storage for attachments (S3-compatible: AWS S3, Cloudflare R2,
   * Supabase Storage, MinIO). When unset, attachments fall back to local disk —
   * fine for development, but NOT for a multi-service deployment, where the API
   * and worker do not share a filesystem.
   */
  S3_BUCKET: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('auto'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  ADMIN_USER: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('admin'),
  /**
   * Development sign-in bypasses all credential checks. It is therefore OFF by
   * default in production and can only be forced on with an explicit
   * DEV_LOGIN_ENABLED=true, which should never be set on a public deployment.
   */
  DEV_LOGIN_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isGoogleConfigured = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const isSlackOAuthConfigured = () => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
export const isSupabaseConfigured = () => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
export const isElasticsearchConfigured = () => Boolean(env.ELASTICSEARCH_URL);

/** Attachments use object storage when configured, otherwise local disk. */
export const isObjectStorageConfigured = () =>
  Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);

/** Dev sign-in is available unless explicitly disabled, or running in production. */
export const isDevLoginEnabled = () =>
  env.DEV_LOGIN_ENABLED ?? env.NODE_ENV !== 'production';
