import { EmailStatus, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { campaignRepository } from '../repositories/campaign.repository';
import { emailJobRepository } from '../repositories/emailJob.repository';
import { userRepository } from '../repositories/user.repository';
import { enqueueEmail } from '../queues/email.queue';
import { elasticsearchService } from '../integrations/elasticsearch/ElasticsearchService';
import { resolveAttachments } from '../integrations/attachments/AttachmentStore';
import { normalizeRecipients } from '../utils/email-validator';
import { AppError, BadRequest, NotFound } from '../utils/errors';
import { ScheduleEmailDto } from '../types';

const SCHEDULED_STATUSES: EmailStatus[] = ['scheduled', 'processing'];
const SENT_STATUSES: EmailStatus[] = ['sent', 'failed'];

export const emailService = {
  async scheduleCampaign(userId: string, dto: ScheduleEmailDto) {
    const { valid, duplicatesRemoved, invalidIgnored } = normalizeRecipients(dto.recipients);
    if (valid.length === 0) {
      throw BadRequest('No valid recipients provided after normalization');
    }

    const delayMs = Math.max(dto.delayMs, env.MIN_EMAIL_DELAY_MS);
    const hourlyLimit = Math.max(1, dto.hourlyLimit);
    const startTime = new Date(dto.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw BadRequest('Invalid startTime');
    }

    const user = await userRepository.findById(userId);
    if (!user) throw NotFound('User not found');
    const sender = await userRepository.ensureDefaultSender(userId, user.name, user.email);

    // Resolve uploaded attachments first — ownership is enforced here, so a user
    // can never attach a file they did not upload. Only metadata is persisted;
    // the on-disk path is recomputed at send time.
    const attachments = dto.attachmentIds?.length
      ? await resolveAttachments(dto.attachmentIds, userId)
      : [];

    // 1. Create campaign
    const campaign = await campaignRepository.create({
      userId,
      subject: dto.subject,
      body: dto.body,
      startTime,
      delayMs,
      hourlyLimit,
      rawFileUrl: dto.rawFileUrl ?? null,
      attachments: attachments.length
        ? attachments.map(({ id, filename, size, mimetype }) => ({
            id,
            filename,
            size,
            mimetype,
          }))
        : undefined,
    });

    // 2. Compute scheduled times and create jobs
    const now = Date.now();
    const startMs = startTime.getTime();
    const rows: Prisma.EmailJobCreateManyInput[] = valid.map((recipient, index) => ({
      campaignId: campaign.id,
      senderId: sender.id,
      recipient,
      subject: dto.subject,
      body: dto.body,
      scheduledAt: new Date(startMs + index * delayMs),
      status: 'scheduled',
    }));

    await emailJobRepository.createMany(rows);
    const jobs = await emailJobRepository.findByCampaign(campaign.id);

    // 2b. Project the new jobs into the search index (no-op when unconfigured).
    // Fire-and-forget: the index is derived, so a slow cluster must not delay the
    // response. Errors are swallowed inside the service.
    void elasticsearchService.indexJobs(jobs, userId).catch(() => undefined);

    // 3. Enqueue delayed BullMQ jobs (persisted in Redis, survive restarts)
    logger.info(
      {
        campaignId: campaign.id,
        requestedStartTime: startTime.toISOString(),
        now: new Date(now).toISOString(),
        firstDelayMs: Math.max(0, (jobs[0]?.scheduledAt.getTime() ?? now) - now),
        jobs: jobs.length,
      },
      '[Scheduler] Scheduling campaign',
    );

    let enqueued = 0;
    try {
      for (const job of jobs) {
        const delay = Math.max(0, job.scheduledAt.getTime() - now);
        const bullJob = await enqueueEmail(job.id, delay);
        if (bullJob.id) {
          await emailJobRepository.updateBullJobId(job.id, bullJob.id);
        }
        logger.debug(
          {
            emailJobId: job.id,
            recipient: job.recipient,
            scheduledAt: job.scheduledAt.toISOString(),
            delayMs: delay,
            executesAt: new Date(now + delay).toISOString(),
            bullJobId: bullJob.id,
          },
          '[Scheduler] Delayed job enqueued',
        );
        enqueued += 1;
      }
    } catch (err) {
      // The queue is unreachable. Roll the campaign back rather than leaving rows
      // that are 'scheduled' in Postgres but absent from Redis — those would never
      // send and would silently skew the queue monitor. Deleting the campaign
      // cascades to its jobs.
      await campaignRepository.delete(campaign.id).catch(() => undefined);
      throw err;
    }

    logger.info(
      { campaignId: campaign.id, jobs: enqueued, delayMs, hourlyLimit },
      'Campaign scheduled and jobs enqueued',
    );

    return {
      campaign,
      recipients: {
        valid: valid.length,
        duplicatesRemoved,
        invalidIgnored,
      },
      jobsCreated: enqueued,
    };
  },

  async listScheduled(userId: string, page: number, limit: number, status?: EmailStatus, search?: string) {
    if (status && !SCHEDULED_STATUSES.includes(status)) {
      throw BadRequest('Invalid status filter for scheduled emails');
    }
    const { items, total } = await emailJobRepository.paginateForUser({
      userId,
      statuses: SCHEDULED_STATUSES,
      page,
      limit,
      status,
      search,
      orderBy: 'scheduledAt',
      order: 'asc',
    });
    return { items, total };
  },

  async listSent(userId: string, page: number, limit: number, status?: EmailStatus, search?: string) {
    if (status && !SENT_STATUSES.includes(status)) {
      throw BadRequest('Invalid status filter for sent emails');
    }
    const { items, total } = await emailJobRepository.paginateForUser({
      userId,
      statuses: SENT_STATUSES,
      page,
      limit,
      status,
      search,
      orderBy: 'sentAt',
      order: 'desc',
    });
    return { items, total };
  },

  async getById(userId: string, id: string) {
    const job = await emailJobRepository.findByIdForUser(id, userId);
    if (!job) throw NotFound('Email job not found');
    return job;
  },

  async retry(userId: string, id: string) {
    const job = await emailJobRepository.findByIdForUser(id, userId);
    if (!job) throw NotFound('Email job not found');
    if (job.status !== 'failed') {
      throw new AppError(409, 'Only failed emails can be retried', 'CONFLICT');
    }
    await emailJobRepository.update(id, {
      status: 'scheduled',
      errorMessage: null,
      scheduledAt: new Date(),
    });
    const bullJob = await enqueueEmail(id, 0, `retry:${Date.now()}`);
    if (bullJob.id) await emailJobRepository.updateBullJobId(id, bullJob.id);
    const updated = await emailJobRepository.findByIdForUser(id, userId);
    if (updated) void elasticsearchService.indexJob(updated, userId).catch(() => undefined);
    return updated;
  },

  stats(userId: string) {
    return emailJobRepository.statsForUser(userId);
  },

  async search(userId: string, query: string) {
    const trimmed = query?.trim();
    if (!trimmed) return [];

    // Prefer Elasticsearch (relevance-ranked, fuzzy). `searchIds` returns null when
    // the cluster is unconfigured or unreachable, so we fall back to PostgreSQL.
    const ids = await elasticsearchService.searchIds(userId, trimmed);
    if (ids) {
      return emailJobRepository.findManyByIdsForUser(ids, userId);
    }
    return emailJobRepository.searchForUser(userId, trimmed);
  },
};
