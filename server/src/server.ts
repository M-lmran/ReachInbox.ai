import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { checkDatabase } from './config/prisma';
import { checkRedis } from './config/redis';
import { elasticsearchService } from './integrations/elasticsearch/ElasticsearchService';

async function bootstrap() {
  const app = createApp();

  const [db, redisOk] = await Promise.all([checkDatabase(), checkRedis()]);
  logger.info({ database: db, redis: redisOk }, 'Startup dependency check');
  if (!db) logger.error('Database is not reachable — check DATABASE_URL / Postgres');
  if (!redisOk) logger.error('Redis is not reachable — check REDIS_URL');

  // Search index is optional; failure here must not stop the API from serving.
  if (elasticsearchService.isReady()) {
    const searchOk = await elasticsearchService.ensureIndex();
    logger.info({ elasticsearch: searchOk }, 'Search index check');
    if (!searchOk) {
      logger.warn('Elasticsearch unreachable — search will fall back to PostgreSQL');
    }
  } else {
    logger.info('ELASTICSEARCH_URL not set — search runs on PostgreSQL');
  }

  app.listen(env.PORT, () => {
    logger.info(`ReachInbox API listening on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`Queue dashboard: /api/admin/queues`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err: String(err) }, 'Fatal error during startup');
  process.exit(1);
});
