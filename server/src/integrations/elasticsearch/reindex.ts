import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { elasticsearchService } from './ElasticsearchService';

/**
 * Rebuild the Elasticsearch index from PostgreSQL.
 *
 * The database is the source of truth, so this is always safe to run: it
 * re-projects every email job (and its owning user) into the index. Use it to
 * backfill after enabling search, or to repair a drifted/cleared index.
 *
 *   npm run reindex
 */

const BATCH_SIZE = 500;

async function reindex() {
  if (!elasticsearchService.isReady()) {
    logger.error('ELASTICSEARCH_URL is not set — nothing to reindex');
    process.exitCode = 1;
    return;
  }

  const created = await elasticsearchService.ensureIndex();
  if (!created) {
    logger.error('Elasticsearch is not reachable — aborting reindex');
    process.exitCode = 1;
    return;
  }

  const jobs = await prisma.emailJob.findMany({
    include: { campaign: { select: { userId: true } } },
    orderBy: { createdAt: 'asc' },
  });
  logger.info({ total: jobs.length }, 'Reindexing email jobs into Elasticsearch');

  let indexed = 0;
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const docs = batch.map((job) => elasticsearchService.toDocument(job, job.campaign.userId));
    await elasticsearchService.bulkIndexDocuments(docs);
    indexed += docs.length;
    logger.info({ indexed, total: jobs.length }, 'Reindex progress');
  }

  logger.info({ indexed }, 'Reindex complete');
}

reindex()
  .catch((err) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Reindex failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await elasticsearchService.close();
    await prisma.$disconnect();
  });
