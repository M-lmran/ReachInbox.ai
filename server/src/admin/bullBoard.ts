import { Router, Request, Response, NextFunction } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from '../queues/email.queue';
import { env } from '../config/env';

// Basic-auth protection for the queue dashboard.
function basicAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user === env.ADMIN_USER && pass === env.ADMIN_PASSWORD) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="ReachInbox Queues"');
  return res.status(401).send('Authentication required');
}

export function buildBullBoardRouter(): Router {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/api/admin/queues');

  createBullBoard({
    // Cast: @bull-board/api and bullmq have a known type-only mismatch on JobProgress.
    queues: [new BullMQAdapter(emailQueue) as unknown as never],
    serverAdapter,
  });

  const router = Router();
  router.use(basicAuth, serverAdapter.getRouter());
  return router;
}
