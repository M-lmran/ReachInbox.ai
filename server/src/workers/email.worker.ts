import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { bullConnection } from '../config/redis';
import { prisma } from '../config/prisma';
import { EMAIL_QUEUE_NAME, enqueueEmail } from '../queues/email.queue';
import { emailProvider } from '../integrations/email/EtherealEmailProvider';
import { elasticsearchService } from '../integrations/elasticsearch/ElasticsearchService';
import {
  resolveAttachments,
  attachmentExists,
  type StoredAttachment,
} from '../integrations/attachments/AttachmentStore';
import { rateLimitService } from '../services/rateLimit.service';
import { slackService } from '../integrations/slack/SlackService';
import { EmailJobData, EmailAttachment } from '../types';

/**
 * Re-project a job into the search index after a state change.
 * Best-effort: never throws, so indexing problems cannot fail a send.
 */
async function syncSearchIndex(emailJobId: string, userId: string): Promise<void> {
  try {
    const row = await prisma.emailJob.findUnique({ where: { id: emailJobId } });
    // Fire-and-forget: never let a slow search cluster delay job completion.
    if (row) void elasticsearchService.indexJob(row, userId).catch(() => undefined);
  } catch {
    // Ignored: the index is a derived projection; Postgres remains authoritative.
  }
}

/**
 * Processes a single email send job.
 * Idempotent: safe state transition scheduled -> processing -> sent/failed.
 * Rate-limited: reschedules (not fails) when the sender's hourly cap is reached.
 */
async function processEmailJob(job: Job<EmailJobData>) {
  const { emailJobId } = job.data;
  const emailJob = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    include: { campaign: true, sender: true },
  });

  if (!emailJob) {
    logger.warn({ emailJobId }, 'Email job not found in DB; skipping');
    return { skipped: true };
  }

  // Idempotency fast-path: never resend an already-sent email.
  if (emailJob.status === 'sent') {
    logger.debug({ emailJobId }, 'Already sent; skipping (idempotent)');
    return { skipped: true };
  }

  // Atomic claim — safe across concurrent workers/instances.
  // Only one worker can transition scheduled -> processing; others skip (no double send).
  const claim = await prisma.emailJob.updateMany({
    where: { id: emailJobId, status: 'scheduled' },
    data: { status: 'processing', attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    logger.debug({ emailJobId }, 'Job already claimed/processed by another worker; skipping');
    return { skipped: true };
  }
  await syncSearchIndex(emailJobId, emailJob.campaign.userId);

  // Rate limit check (Redis-backed, per sender, per hour) — after claiming ownership.
  const decision = await rateLimitService.tryConsume(emailJob.senderId, emailJob.campaign.hourlyLimit);
  if (!decision.allowed) {
    const nextStart = new Date(decision.nextWindowStartMs);
    const delay = Math.max(1000, decision.nextWindowStartMs - Date.now());
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'scheduled',
        rescheduledForRateLimit: true,
        scheduledAt: nextStart,
      },
    });
    await enqueueEmail(emailJobId, delay, `rl:${decision.hourWindow}`);
    await slackService.sendRateLimitNotification(emailJob.campaign.userId, {
      senderId: emailJob.senderId,
      senderEmail: emailJob.sender.email,
      limit: decision.limit,
      nextWindowStart: nextStart,
    });
    logger.info({ emailJobId, nextStart }, 'Rate limit reached; rescheduled email');
    await syncSearchIndex(emailJobId, emailJob.campaign.userId);
    return { rescheduled: true };
  }

  try {
    // Resolve the campaign's attachments. Local-disk files resolve to a path;
    // object-storage files are fetched into memory. A missing file is skipped
    // with a warning rather than failing the whole send.
    const attachmentMeta =
      (emailJob.campaign.attachments as StoredAttachment[] | null) ?? [];
    const resolved = attachmentMeta.length
      ? await resolveAttachments(
          attachmentMeta.map((a) => a.id),
          emailJob.campaign.userId,
        )
      : [];
    const attachments: EmailAttachment[] = [];
    for (const file of resolved) {
      if (!(await attachmentExists(file))) {
        logger.warn(
          { emailJobId, attachmentId: file.id },
          'Attachment unavailable; sending without it',
        );
        continue;
      }
      attachments.push(
        file.content
          ? { filename: file.filename, content: file.content, contentType: file.mimetype }
          : { filename: file.filename, path: file.path, contentType: file.mimetype },
      );
    }

    const result = await emailProvider.sendEmail({
      from: `${emailJob.sender.name} <${emailJob.sender.email}>`,
      to: emailJob.recipient,
      subject: emailJob.subject,
      html: emailJob.body,
      text: emailJob.body.replace(/<[^>]+>/g, ''),
      attachments,
    });
    logger.info(
      {
        emailJobId,
        recipient: emailJob.recipient,
        scheduledAt: emailJob.scheduledAt.toISOString(),
        executedAt: new Date().toISOString(),
        attachments: attachments.length,
      },
      '[Worker] Scheduled email executed',
    );

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        previewUrl: result.previewUrl ?? null,
        errorMessage: null,
      },
    });
    logger.info({ emailJobId, previewUrl: result.previewUrl }, 'Email sent');
    await syncSearchIndex(emailJobId, emailJob.campaign.userId);
    return { sent: true, previewUrl: result.previewUrl };
  } catch (err) {
    const attemptsLimit = job.opts.attempts ?? 1;
    const willRetry = job.attemptsMade + 1 < attemptsLimit;
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: willRetry ? 'scheduled' : 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    logger.warn({ emailJobId, willRetry }, 'Email send failed');
    await syncSearchIndex(emailJobId, emailJob.campaign.userId);
    throw err; // Let BullMQ handle retry/backoff.
  }
}

export function startWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: bullConnection,
    concurrency: env.WORKER_CONCURRENCY,
  });

  worker.on('completed', (job) => logger.debug({ jobId: job.id }, 'Job completed'));
  worker.on('failed', (job, err) =>
    logger.warn({ jobId: job?.id, err: err.message }, 'Job failed'),
  );
  worker.on('ready', () =>
    logger.info(`Email worker ready (concurrency=${env.WORKER_CONCURRENCY})`),
  );

  return worker;
}

// Run standalone when executed directly (supervisor / npm run worker).
if (require.main === module) {
  startWorker();
  logger.info('Email worker process started');
}
