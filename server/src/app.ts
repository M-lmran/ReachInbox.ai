import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import routes from './routes';
import { buildBullBoardRouter } from './admin/bullBoard';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

export function createApp(): Application {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.FRONTEND_URL === '*' ? true : env.FRONTEND_URL.split(','),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '5mb' }));

  // Basic API rate limiting (per IP) — protects public endpoints.
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Bull Board dashboard (own auth; mounted before the API limiter/json needs).
  app.use('/api/admin/queues', buildBullBoardRouter());

  app.use('/api', apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
