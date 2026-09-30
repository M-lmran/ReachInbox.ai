import { z } from 'zod';
import { MAX_ATTACHMENTS } from '../integrations/attachments/AttachmentStore';

export const scheduleEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required'),
  startTime: z.string().min(1, 'Start time is required'),
  delayMs: z.coerce.number().min(0, 'Delay must be >= 0'),
  hourlyLimit: z.coerce.number().min(1, 'Hourly limit must be >= 1'),
  recipients: z.array(z.string()).min(1, 'At least one recipient is required'),
  rawFileUrl: z.string().url().optional(),
  // Ids returned by POST /emails/attachments. Optional so existing clients and
  // the current UI keep working unchanged.
  attachmentIds: z.array(z.string().uuid()).max(MAX_ATTACHMENTS).optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['scheduled', 'processing', 'sent', 'failed']).optional(),
  search: z.string().optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Query is required'),
});
