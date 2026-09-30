import { NextFunction, Request, Response } from 'express';
import { EmailStatus } from '@prisma/client';
import { emailService } from '../services/email.service';
import { created, ok } from '../utils/response';
import { BadRequest } from '../utils/errors';
import { listQuerySchema, searchQuerySchema } from '../validators/email.validator';
import {
  isAllowedAttachment,
  saveAttachment,
  type StoredAttachment,
} from '../integrations/attachments/AttachmentStore';

export const emailController = {
  async schedule(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await emailService.scheduleCampaign(req.user!.id, req.body);
      return created(res, result);
    } catch (err) {
      return next(err);
    }
  },

  async scheduled(req: Request, res: Response, next: NextFunction) {
    try {
      const q = listQuerySchema.parse(req.query);
      const { items, total } = await emailService.listScheduled(
        req.user!.id,
        q.page,
        q.limit,
        q.status as EmailStatus | undefined,
        q.search,
      );
      return ok(res, items, { page: q.page, limit: q.limit, total });
    } catch (err) {
      return next(err);
    }
  },

  async sent(req: Request, res: Response, next: NextFunction) {
    try {
      const q = listQuerySchema.parse(req.query);
      const { items, total } = await emailService.listSent(
        req.user!.id,
        q.page,
        q.limit,
        q.status as EmailStatus | undefined,
        q.search,
      );
      return ok(res, items, { page: q.page, limit: q.limit, total });
    } catch (err) {
      return next(err);
    }
  },

  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await emailService.stats(req.user!.id);
      return ok(res, stats);
    } catch (err) {
      return next(err);
    }
  },

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const q = searchQuerySchema.parse(req.query);
      const results = await emailService.search(req.user!.id, q.q);
      return ok(res, results);
    } catch (err) {
      return next(err);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await emailService.getById(req.user!.id, req.params.id);
      return ok(res, job);
    } catch (err) {
      return next(err);
    }
  },

  async retry(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await emailService.retry(req.user!.id, req.params.id);
      return ok(res, job);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Accept multipart uploads and return ids to pass as `attachmentIds` when
   * scheduling. Files are not yet bound to a campaign at this point.
   */
  async uploadAttachments(req: Request, res: Response, next: NextFunction) {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        throw BadRequest('No files were uploaded');
      }
      const saved: StoredAttachment[] = [];
      for (const file of files) {
        if (!isAllowedAttachment(file.originalname)) {
          throw BadRequest(
            `Unsupported file type: ${file.originalname}. Allowed: pdf, doc(x), xls(x), csv, txt, png, jpg, gif, zip`,
          );
        }
        saved.push(
          await saveAttachment(file.buffer, file.originalname, file.mimetype, req.user!.id),
        );
      }
      return created(res, { attachments: saved });
    } catch (err) {
      return next(err);
    }
  },
};
