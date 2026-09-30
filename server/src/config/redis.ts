import IORedis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Attach an error listener. ioredis emits 'error' on connection failures; without
 * a listener Node reports "Unhandled error event" and the failure bypasses our
 * logger, so every connection below is wrapped.
 */
function withErrorLogging(connection: IORedis, label: string): IORedis {
  connection.on('error', (err: Error) => {
    logger.warn({ err: err.message, connection: label }, 'Redis connection error');
  });
  return connection;
}

// BullMQ requires maxRetriesPerRequest = null on the connection its Worker uses
// (blocking commands must not be aborted).
export const bullConnection = withErrorLogging(
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }),
  'bull-worker',
);

// Producer connection used to enqueue jobs. Unlike the worker connection this one
// fails fast: with enableOfflineQueue disabled and a bounded retry count, an
// enqueue while Redis is down rejects promptly instead of buffering the command
// forever and leaving the HTTP request hanging with no response.
export const queueConnection = withErrorLogging(
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    enableOfflineQueue: false,
  }),
  'bull-queue',
);

// Separate connection for application-level operations (rate limiting, health).
export const redis = withErrorLogging(
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
  }),
  'app',
);

export async function checkRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
