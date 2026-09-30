import { Response } from 'express';
import { QueueEvents } from 'bullmq';
import { bullConnection } from '../config/redis';
import { logger } from '../config/logger';
import { emailQueue, EMAIL_QUEUE_NAME } from './email.queue';

/**
 * Realtime queue state over Server-Sent Events.
 *
 * The API and the worker run as separate processes, so in-process queue events
 * would never fire here. `QueueEvents` subscribes to the Redis event stream
 * instead, which is what lets this endpoint see jobs the worker completes.
 *
 * A single shared QueueEvents instance fans out to every connected client, so
 * the number of Redis listeners stays constant no matter how many browsers are
 * watching.
 */

const COUNT_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'] as const;

const QUEUE_EVENTS = [
  'added',
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'progress',
  'stalled',
  'removed',
  'drained',
  'paused',
  'resumed',
  'retries-exhausted',
  'waiting-children',
] as const;

const clients = new Set<Response>();
let queueEvents: QueueEvents | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

async function snapshot() {
  const counts = await emailQueue.getJobCounts(...COUNT_STATES);
  return { queue: emailQueue.name, counts, at: new Date().toISOString() };
}

/** Push the current counts to one client (used for the initial frame). */
export async function writeSnapshot(res: Response): Promise<void> {
  try {
    const payload = `event: counts\ndata: ${JSON.stringify(await snapshot())}\n\n`;
    res.write(payload);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to write initial queue snapshot',
    );
  }
}

/**
 * Coalesce bursts: a single job emits several events (added → waiting → active
 * → completed) and many jobs can land at once, so collapse them into one write.
 */
function scheduleBroadcast(): void {
  if (debounceTimer) return;
  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    if (clients.size === 0) return;
    let payload: string;
    try {
      payload = `event: counts\ndata: ${JSON.stringify(await snapshot())}\n\n`;
    } catch {
      return; // Redis blip; the next event or heartbeat will retry.
    }
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        clients.delete(res);
      }
    }
  }, 150);
}

function ensureQueueEvents(): void {
  if (queueEvents) return;
  queueEvents = new QueueEvents(EMAIL_QUEUE_NAME, { connection: bullConnection });
  queueEvents.on('error', (err: Error) =>
    logger.warn({ err: err.message }, 'QueueEvents connection error'),
  );
  for (const event of QUEUE_EVENTS) {
    queueEvents.on(event, scheduleBroadcast);
  }
  logger.info('Queue event stream ready');
}

export function subscribe(res: Response): void {
  ensureQueueEvents();
  clients.add(res);
  void writeSnapshot(res);
}

export function unsubscribe(res: Response): void {
  clients.delete(res);
}

export async function closeQueueStream(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  clients.clear();
  if (queueEvents) {
    await queueEvents.close().catch(() => undefined);
    queueEvents = null;
  }
}
