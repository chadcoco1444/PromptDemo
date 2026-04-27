import type { Pool } from 'pg';
import { JobSchema, type Job, type JobStatus } from './model/job.js';
import type { JobStore } from './jobStore.js';

export interface JobStoreWithUpsert extends JobStore {
  /**
   * Idempotent reconciliation write — used by pg-backfill worker to land Redis state
   * into PG without depending on whether the row exists. Optimistic concurrency:
   * `WHERE jobs.updated_at < EXCLUDED.updated_at` prevents stale Redis reads from
   * regressing newer PG state during multi-worker races.
   */
  upsert(job: Job): Promise<void>;
}

/**
 * Postgres-backed implementation of JobStore. Mirrors the Redis shape but
 * splits into native SQL columns for queryability (user filter, status
 * filter, FTS on input.intent).
 *
 * Intentional omissions vs. Redis:
 *   - `progress` — stays Redis-only (v2.0 Amendment A). Render workers emit
 *     ~5 updates/sec; writing those to Postgres is a WAL storm generator.
 *     The `jobs` table records status/stage transitions only. `get()` here
 *     returns `progress: 0` as a placeholder; the real-time value is read
 *     from Redis via the dual-write wrapper's get() preference.
 */
export interface PostgresJobStoreOptions {
  pool: Pool;
  /**
   * Caller is responsible for mapping a jobId → userId when calling create().
   * Pass `null` here to skip Postgres writes entirely — useful when the Job
   * belongs to an anonymous session (AUTH_ENABLED=false) so we don't end up
   * with orphan rows that violate the user_id NOT NULL constraint.
   */
  resolveUserId: (job: Job) => Promise<string | null>;
}

export function makePostgresJobStore(opts: PostgresJobStoreOptions): JobStoreWithUpsert {
  const { pool, resolveUserId } = opts;

  return {
    async create(job) {
      const userId = await resolveUserId(job);
      if (!userId) return; // anonymous — skip Postgres
      await pool.query(
        `INSERT INTO jobs
           (id, user_id, parent_job_id, status, stage, input,
            crawl_result_uri, storyboard_uri, video_url, fallbacks,
            error, credits_charged, created_at, updated_at)
         VALUES
           ($1, $2, $3, $4, $5, $6::jsonb,
            $7, $8, $9, $10::jsonb,
            $11, $12, to_timestamp($13 / 1000.0), to_timestamp($14 / 1000.0))
         ON CONFLICT (id) DO NOTHING`,
        [
          job.jobId,
          userId,
          job.parentJobId ?? null,
          job.status,
          job.stage,
          JSON.stringify(job.input),
          job.crawlResultUri ?? null,
          job.storyboardUri ?? null,
          job.videoUrl ?? null,
          JSON.stringify(job.fallbacks ?? []),
          job.error ? JSON.stringify(job.error) : null,
          0, // credits_charged — Feature 5 populates
          job.createdAt,
          job.updatedAt,
        ],
      );
    },

    async get(jobId) {
      const r = await pool.query(
        `SELECT id, parent_job_id, status, stage, input,
                crawl_result_uri, storyboard_uri, video_url, thumb_url,
                fallbacks, error,
                EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms,
                EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
         FROM jobs WHERE id = $1`,
        [jobId],
      );
      if (r.rowCount === 0) return null;
      const row = r.rows[0];
      const candidate = {
        jobId: row.id,
        parentJobId: row.parent_job_id ?? undefined,
        status: row.status,
        stage: row.stage,
        progress: 0, // Redis is authoritative; Postgres doesn't persist progress
        input: row.input,
        crawlResultUri: row.crawl_result_uri ?? undefined,
        storyboardUri: row.storyboard_uri ?? undefined,
        videoUrl: row.video_url ?? undefined,
        fallbacks: row.fallbacks ?? [],
        error: row.error ?? undefined,
        createdAt: Math.round(Number(row.created_at_ms)),
        updatedAt: Math.round(Number(row.updated_at_ms)),
      };
      const parsed = JobSchema.safeParse(candidate);
      return parsed.success ? parsed.data : null;
    },

    async patch(jobId, patch, updatedAt, expectedStatus?: JobStatus) {
      // Only write the subset of fields Postgres stores. Progress + any
      // transient state stays in Redis.
      const sets: string[] = [];
      const vals: unknown[] = [];
      const bind = (col: string, val: unknown) => {
        sets.push(`${col} = $${sets.length + 2}`);
        vals.push(val);
      };
      if (patch.status !== undefined) bind('status', patch.status);
      if (patch.stage !== undefined) bind('stage', patch.stage);
      if (patch.crawlResultUri !== undefined) bind('crawl_result_uri', patch.crawlResultUri);
      if (patch.storyboardUri !== undefined) bind('storyboard_uri', patch.storyboardUri);
      if (patch.videoUrl !== undefined) bind('video_url', patch.videoUrl);
      if (patch.fallbacks !== undefined) bind('fallbacks', JSON.stringify(patch.fallbacks));
      if (patch.error !== undefined) bind('error', patch.error ? JSON.stringify(patch.error) : null);
      sets.push(`updated_at = to_timestamp($${sets.length + 2} / 1000.0)`);
      vals.push(updatedAt);
      if (sets.length === 1) return; // only updated_at → skip (no real change)

      const whereClause = expectedStatus
        ? `WHERE id = $1 AND status = $${vals.length + 2}`
        : `WHERE id = $1`;
      const params = expectedStatus ? [jobId, ...vals, expectedStatus] : [jobId, ...vals];

      const result = await pool.query(
        `UPDATE jobs SET ${sets.join(', ')} ${whereClause}`,
        params,
      );
      if (expectedStatus && (result.rowCount ?? 0) === 0) {
        console.warn('[jobStore:pg] OCC blocked or row not found', { jobId, expectedStatus });
      }
    },

    async upsert(job) {
      const userId = await resolveUserId(job);
      if (!userId) return;
      await pool.query(
        `INSERT INTO jobs
           (id, user_id, parent_job_id, status, stage, input,
            crawl_result_uri, storyboard_uri, video_url, fallbacks,
            error, credits_charged, created_at, updated_at)
         VALUES
           ($1, $2, $3, $4, $5, $6::jsonb,
            $7, $8, $9, $10::jsonb,
            $11, $12, to_timestamp($13 / 1000.0), to_timestamp($14 / 1000.0))
         ON CONFLICT (id) DO UPDATE SET
           status            = EXCLUDED.status,
           stage             = EXCLUDED.stage,
           crawl_result_uri  = EXCLUDED.crawl_result_uri,
           storyboard_uri    = EXCLUDED.storyboard_uri,
           video_url         = EXCLUDED.video_url,
           fallbacks         = EXCLUDED.fallbacks,
           error             = EXCLUDED.error,
           updated_at        = EXCLUDED.updated_at
         WHERE jobs.updated_at < EXCLUDED.updated_at`,
        [
          job.jobId,
          userId,
          job.parentJobId ?? null,
          job.status,
          job.stage,
          JSON.stringify(job.input),
          job.crawlResultUri ?? null,
          job.storyboardUri ?? null,
          job.videoUrl ?? null,
          JSON.stringify(job.fallbacks ?? []),
          job.error ? JSON.stringify(job.error) : null,
          0,
          job.createdAt,
          job.updatedAt,
        ],
      );
    },
  };
}
