import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { redis, queueConnection, bullConnection } from '../config/redis';
import { emailQueue, enqueueEmail } from './email.queue';

/**
 * Re-enqueue email jobs that exist in Postgres but are missing from the Redis
 * queue.
 *
 * Why this is needed: a job can be 'scheduled' in the database yet absent from
 * BullMQ — the seed used to insert rows without enqueuing, and a Redis outage
 * during scheduling used to leave the campaign behind. Such jobs never send and
 * make the queue monitor disagree with the dashboard. Postgres is authoritative,
 * so this re-projects it into the queue.
 *
 *   npm run reconcile            # fix
 *   npm run reconcile -- --dry-run   # report only
 */

const DRY_RUN = process.argv.includes('--dry-run');

/** States in which BullMQ will still pick the job up and run it. */
const LIVE_STATES = ['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'];

async function isStillQueued(bullJobId: string | null): Promise<boolean> {
  if (!bullJobId) return false;
  const job = await emailQueue.getJob(bullJobId);
  if (!job) return false;
  // getJob() also returns completed/failed jobs, which will never run again — so
  // the state must be checked, not just the job's existence.
  const state = await job.getState();
  return LIVE_STATES.includes(state);
}

async function reconcile() {
  const candidates = await prisma.emailJob.findMany({
    where: { status: { in: ['scheduled', 'processing'] } },
    orderBy: { scheduledAt: 'asc' },
  });

  let alreadyQueued = 0;
  let reset = 0;
  let requeued = 0;

  for (const job of candidates) {
    if (await isStillQueued(job.bullJobId)) {
      alreadyQueued += 1;
      continue;
    }

    // 'processing' with no queue entry means a worker died mid-send and lost its
    // lock. Reset it so it becomes eligible to send again.
    if (job.status === 'processing') {
      if (!DRY_RUN) {
        await prisma.emailJob.update({ where: { id: job.id }, data: { status: 'scheduled' } });
      }
      reset += 1;
    }

    if (DRY_RUN) {
      logger.info(
        { emailJobId: job.id, recipient: job.recipient, status: job.status },
        'Would re-enqueue (dry run)',
      );
      requeued += 1;
      continue;
    }

    // A unique suffix avoids BullMQ de-duplicating against the original job id,
    // which may still exist in the completed set.
    const delay = Math.max(0, job.scheduledAt.getTime() - Date.now());
    const bullJob = await enqueueEmail(job.id, delay, `reconcile:${Date.now()}`);
    if (bullJob.id) {
      await prisma.emailJob.update({
        where: { id: job.id },
        data: { bullJobId: bullJob.id },
      });
    }
    requeued += 1;
  }

  logger.info(
    { scanned: candidates.length, alreadyQueued, resetFromProcessing: reset, requeued, dryRun: DRY_RUN },
    DRY_RUN ? 'Reconcile dry run complete' : 'Reconcile complete',
  );
}

reconcile()
  .catch((err) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Reconcile failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    // Every module-level Redis connection must be closed or the event loop stays
    // alive and this script never exits.
    await emailQueue.close().catch(() => undefined);
    await Promise.allSettled([
      redis.quit(),
      queueConnection.quit(),
      bullConnection.quit(),
    ]);
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
