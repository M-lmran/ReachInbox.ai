import { Queue } from 'bullmq';
import { queueConnection } from '../config/redis';
import { AppError } from '../utils/errors';
import { EmailJobData } from '../types';

export const EMAIL_QUEUE_NAME = 'email-send-queue';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 5000 },
  },
});

/** Add a delayed send job. Uses emailJobId as a stable jobId for idempotency. */
export async function enqueueEmail(emailJobId: string, delayMs: number, jobIdSuffix?: string) {
  const jobId = jobIdSuffix ? `${emailJobId}:${jobIdSuffix}` : emailJobId;
  try {
    return await emailQueue.add(
      'send',
      { emailJobId },
      { delay: Math.max(0, Math.floor(delayMs)), jobId },
    );
  } catch {
    // Redis/queue unreachable. Surface a clean 503 rather than leaking the
    // driver's message ("Stream isn't writeable...") as an internal error.
    throw new AppError(503, 'Email queue is unavailable', 'SERVICE_UNAVAILABLE');
  }
}
