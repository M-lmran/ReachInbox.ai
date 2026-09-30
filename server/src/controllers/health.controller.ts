import { Request, Response } from 'express';
import { checkDatabase } from '../config/prisma';
import { checkRedis } from '../config/redis';
import { emailQueue } from '../queues/email.queue';
import { subscribe, unsubscribe } from '../queues/queueStream';
import { elasticsearchService } from '../integrations/elasticsearch/ElasticsearchService';

export const healthController = {
  async health(_req: Request, res: Response) {
    const [database, redisOk, searchOk] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      elasticsearchService.isReady() ? elasticsearchService.ping() : Promise.resolve(null),
    ]);
    // Search is an optional accelerator (search falls back to PostgreSQL), so an
    // unreachable cluster is reported but does not mark the service degraded.
    const status = database && redisOk ? 'ok' : 'degraded';
    return res.status(status === 'ok' ? 200 : 503).json({
      status,
      database: database ? 'connected' : 'disconnected',
      redis: redisOk ? 'connected' : 'disconnected',
      elasticsearch:
        searchOk === null ? 'not_configured' : searchOk ? 'connected' : 'disconnected',
    });
  },

  async queue(_req: Request, res: Response) {
    try {
      const counts = await emailQueue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
      );
      return res.json({ status: 'ok', queue: emailQueue.name, counts });
    } catch (err) {
      return res.status(503).json({ status: 'error', error: String(err) });
    }
  },

  /**
   * Server-Sent Events stream of live queue counts. Pushes a frame on every
   * BullMQ queue event (plus an initial snapshot and periodic heartbeats), so
   * the client never needs to poll.
   */
  queueStream(req: Request, res: Response) {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering so frames are delivered as they are written.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    subscribe(res);

    // Comment frames keep intermediaries from closing an idle connection.
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        /* client gone; cleanup below */
      }
    }, 15_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe(res);
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
  },
};
