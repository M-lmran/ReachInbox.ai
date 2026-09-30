import { Client } from '@elastic/elasticsearch';
import { env, isElasticsearchConfigured } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Elasticsearch-backed full-text search for email jobs.
 *
 * Design notes:
 * - Every public method is a safe no-op when ELASTICSEARCH_URL is unset, so the
 *   app runs unchanged without a search cluster.
 * - Indexing and searching never throw into the request/worker path: failures are
 *   logged and swallowed, and callers fall back to PostgreSQL. The database stays
 *   the source of truth; the index is a derived, rebuildable projection.
 */

export const EMAIL_JOBS_INDEX = 'email_jobs';

export interface EmailJobSource {
  id: string;
  campaignId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: Date;
  sentAt: Date | null;
  createdAt: Date;
  previewUrl: string | null;
  errorMessage: string | null;
}

export interface EmailJobDocument {
  emailJobId: string;
  userId: string;
  campaignId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
  previewUrl: string | null;
  errorMessage: string | null;
}

const INDEX_MAPPING = {
  properties: {
    emailJobId: { type: 'keyword' },
    userId: { type: 'keyword' },
    campaignId: { type: 'keyword' },
    senderId: { type: 'keyword' },
    recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
    subject: { type: 'text', fields: { keyword: { type: 'keyword' } } },
    body: { type: 'text' },
    status: { type: 'keyword' },
    scheduledAt: { type: 'date' },
    sentAt: { type: 'date' },
    createdAt: { type: 'date' },
    previewUrl: { type: 'keyword' },
    errorMessage: { type: 'text' },
  },
} as const;

class ElasticsearchService {
  private client: Client | null = null;
  private indexReady = false;
  /** Epoch ms until which the cluster is treated as unreachable. */
  private unavailableUntil = 0;

  /** How long to stop calling a cluster that just failed. */
  private static readonly BACKOFF_MS = 30_000;

  isReady(): boolean {
    return isElasticsearchConfigured();
  }

  /**
   * True while the cluster is in its post-failure back-off window. Checked before
   * every call so a down cluster costs zero network round-trips instead of a
   * timeout per operation.
   */
  private inBackoff(): boolean {
    return Date.now() < this.unavailableUntil;
  }

  private markUnavailable(): void {
    this.unavailableUntil = Date.now() + ElasticsearchService.BACKOFF_MS;
  }

  private markHealthy(): void {
    this.unavailableUntil = 0;
  }

  private getClient(): Client {
    if (!this.client) {
      this.client = new Client({
        node: env.ELASTICSEARCH_URL,
        // The index is a derived projection, so a slow/unreachable cluster must
        // never hold up a request. Bound each attempt instead of inheriting the
        // 30s default, and skip retries (a refused connection will not recover
        // within the request).
        requestTimeout: 2000,
        maxRetries: 0,
      });
    }
    return this.client;
  }

  /** Map a Prisma EmailJob row (+ its owning user) to an index document. */
  toDocument(job: EmailJobSource, userId: string): EmailJobDocument {
    return {
      emailJobId: job.id,
      userId,
      campaignId: job.campaignId,
      senderId: job.senderId,
      recipient: job.recipient,
      subject: job.subject,
      body: job.body,
      status: job.status,
      scheduledAt: job.scheduledAt.toISOString(),
      sentAt: job.sentAt ? job.sentAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
      previewUrl: job.previewUrl ?? null,
      errorMessage: job.errorMessage ?? null,
    };
  }

  /** Create the index with an explicit mapping if it does not already exist. */
  async ensureIndex(): Promise<boolean> {
    if (!this.isReady()) return false;
    // Success is cached for the process lifetime; failure is cached for BACKOFF_MS.
    if (this.indexReady) return true;
    if (this.inBackoff()) return false;
    try {
      const exists = await this.getClient().indices.exists({ index: EMAIL_JOBS_INDEX });
      if (!exists) {
        await this.getClient().indices.create({
          index: EMAIL_JOBS_INDEX,
          // Single-node dev cluster: a replica can never be allocated, which would
          // leave the cluster permanently yellow. Zero replicas keeps it green.
          settings: { number_of_replicas: 0 },
          mappings: INDEX_MAPPING,
        });
        logger.info({ index: EMAIL_JOBS_INDEX }, 'Elasticsearch index created');
      }
      this.indexReady = true;
      this.markHealthy();
      return true;
    } catch (err) {
      this.markUnavailable();
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), index: EMAIL_JOBS_INDEX },
        'Elasticsearch unreachable; backing off for 30s',
      );
      return false;
    }
  }

  /** Index (upsert) a single job document. */
  async indexJob(job: EmailJobSource, userId: string): Promise<void> {
    if (!this.isReady() || this.inBackoff()) return;
    try {
      if (!(await this.ensureIndex())) return;
      await this.getClient().index({
        index: EMAIL_JOBS_INDEX,
        id: job.id,
        document: this.toDocument(job, userId),
      });
      this.markHealthy();
    } catch (err) {
      this.markUnavailable();
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), emailJobId: job.id },
        'Elasticsearch indexJob failed (continuing; Postgres is source of truth)',
      );
    }
  }

  /** Index many job documents in one bulk request, all owned by the same user. */
  async indexJobs(jobs: EmailJobSource[], userId: string): Promise<void> {
    await this.bulkIndexDocuments(jobs.map((job) => this.toDocument(job, userId)));
  }

  /** Index arbitrary documents (used by reindex, which spans multiple users). */
  async bulkIndexDocuments(docs: EmailJobDocument[]): Promise<void> {
    if (!this.isReady() || docs.length === 0 || this.inBackoff()) return;
    try {
      if (!(await this.ensureIndex())) return;
      const operations = docs.flatMap((doc) => [
        { index: { _index: EMAIL_JOBS_INDEX, _id: doc.emailJobId } },
        doc,
      ]);
      const result = await this.getClient().bulk({ operations });
      this.markHealthy();
      if (result.errors) {
        logger.warn({ count: docs.length }, 'Elasticsearch bulk index reported errors');
      }
    } catch (err) {
      this.markUnavailable();
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), count: docs.length },
        'Elasticsearch bulkIndexDocuments failed (continuing; Postgres is source of truth)',
      );
    }
  }

  /** Remove a job document from the index. */
  async deleteJob(id: string): Promise<void> {
    if (!this.isReady() || this.inBackoff()) return;
    try {
      if (!(await this.ensureIndex())) return;
      await this.getClient().delete({ index: EMAIL_JOBS_INDEX, id }, { ignore: [404] });
      this.markHealthy();
    } catch (err) {
      this.markUnavailable();
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), emailJobId: id },
        'Elasticsearch deleteJob failed',
      );
    }
  }

  /**
   * Full-text search scoped to one user. Returns matching email job ids in
   * relevance order; the caller hydrates full rows from PostgreSQL so the
   * response shape stays identical to the database-backed implementation.
   * Returns null when the cluster is unavailable, which triggers that fallback.
   */
  async searchIds(userId: string, query: string, limit = 25): Promise<string[] | null> {
    if (!this.isReady() || this.inBackoff()) return null;
    try {
      if (!(await this.ensureIndex())) return null;
      const result = await this.getClient().search<{ emailJobId: string }>({
        index: EMAIL_JOBS_INDEX,
        size: limit,
        query: {
          bool: {
            filter: [{ term: { userId } }],
            must: [
              {
                multi_match: {
                  query,
                  fields: ['recipient^3', 'subject^2', 'body'],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                },
              },
            ],
          },
        },
        sort: ['_score', { createdAt: 'desc' }],
      });
      this.markHealthy();
      return result.hits.hits
        .map((hit) => hit._source?.emailJobId)
        .filter((id): id is string => Boolean(id));
    } catch (err) {
      this.markUnavailable();
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Elasticsearch search failed; falling back to PostgreSQL',
      );
      return null;
    }
  }

  /** Cluster reachability probe for the health endpoint. */
  async ping(): Promise<boolean> {
    if (!this.isReady()) return false;
    // Respect the back-off so the health endpoint does not hammer a down cluster.
    if (this.inBackoff()) return false;
    try {
      await this.getClient().ping();
      this.markHealthy();
      return true;
    } catch {
      this.markUnavailable();
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

export const elasticsearchService = new ElasticsearchService();
