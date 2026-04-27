import { DeleteObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { parseS3Uri } from '@lumespec/schema';
import type { Pool } from 'pg';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';

/** History retention windows in days, keyed by subscription tier. */
export const RETENTION_DAYS = { free: 30, pro: 90, max: 365 } as const;

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

type ExpiredRow = {
  id: string;
  crawl_result_uri: string | null;
  storyboard_uri: string | null;
  video_url: string | null;
  thumb_url: string | null;
};

async function deleteS3IfValid(s3: S3Client, uri: string): Promise<void> {
  let parsed: { bucket: string; key: string };
  try {
    parsed = parseS3Uri(uri as `s3://${string}/${string}`);
  } catch {
    return; // not an s3:// URI (e.g. presigned HTTPS) — skip
  }
  await s3.send(new DeleteObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
}

export async function runRetentionOnce(
  pool: Pool,
  s3: S3Client,
  log: Pick<typeof console, 'log' | 'error'> = console,
): Promise<{ deleted: number; errors: number }> {
  const { rows } = await pool.query<ExpiredRow>(`
    SELECT j.id, j.crawl_result_uri, j.storyboard_uri, j.video_url, j.thumb_url
    FROM   jobs j
    LEFT   JOIN subscriptions s ON s.user_id = j.user_id
    WHERE  j.status IN ('done', 'failed')
      AND  j.created_at < now() - (
             CASE COALESCE(s.tier, 'free')
               WHEN 'pro' THEN INTERVAL '90 days'
               WHEN 'max' THEN INTERVAL '365 days'
               ELSE            INTERVAL '30 days'
             END
           )
  `);

  if (rows.length === 0) {
    log.log('[retentionCron] no expired jobs');
    return { deleted: 0, errors: 0 };
  }

  log.log(`[retentionCron] pruning ${rows.length} expired job(s)`);

  const ids = rows.map(r => r.id);

  // Nullify parent_job_id in still-active child jobs whose parent is being
  // deleted, to avoid FK violation (parent_job_id references jobs.id).
  await pool.query(
    `UPDATE jobs SET parent_job_id = NULL
     WHERE  parent_job_id = ANY($1::text[])
       AND  id != ALL($1::text[])`,
    [ids],
  );

  let deleted = 0;
  let errors = 0;

  for (const job of rows) {
    // Delete S3 objects first. If S3 fails the DB row stays and the next run
    // retries — no object leak, just deferred cleanup.
    const uris = [
      job.crawl_result_uri,
      job.storyboard_uri,
      job.video_url,
      job.thumb_url,
    ].filter((u): u is string => !!u);

    let s3Ok = true;
    for (const uri of uris) {
      try {
        await deleteS3IfValid(s3, uri);
      } catch (err) {
        log.error(`[retentionCron] S3 delete failed (${uri}):`, err);
        s3Ok = false;
        errors++;
      }
    }

    if (!s3Ok) continue; // retry DB deletion next run once S3 is clear

    try {
      await pool.query('DELETE FROM jobs WHERE id = $1', [job.id]);
      deleted++;
    } catch (err) {
      log.error(`[retentionCron] DB delete failed (${job.id}):`, err);
      errors++;
    }
  }

  log.log(`[retentionCron] done — ${deleted} deleted, ${errors} errors`);
  return { deleted, errors };
}

/**
 * Start the daily history-retention cron. Runs once immediately on startup
 * to drain any backlog, then every `intervalMs` (default: 24h).
 *
 * Returns a stop function; call it during graceful shutdown.
 */
export function startRetentionCron(opts: {
  pool: Pool;
  s3: S3Client;
  log?: Pick<typeof console, 'log' | 'error'>;
  intervalMs?: number;
}): () => void {
  const { pool, s3, log = console, intervalMs = DEFAULT_INTERVAL_MS } = opts;

  void runRetentionOnce(pool, s3, log).catch(err =>
    log.error('[retentionCron] startup run failed:', err),
  );

  const timer = setInterval(
    () =>
      void runRetentionOnce(pool, s3, log).catch(err =>
        log.error('[retentionCron] scheduled run failed:', err),
      ),
    intervalMs,
  );
  timer.unref(); // don't prevent clean process.exit()

  return () => clearInterval(timer);
}

/**
 * Schedule the daily retention job via BullMQ Repeatable Jobs.
 *
 * BullMQ deduplicates on `jobId: 'retention-daily'` in Redis — N instances
 * calling this function still produce exactly one scheduled entry. The Worker
 * uses `concurrency: 1` and a 5-minute lock so only one instance runs the
 * cleanup at a time even in a multi-replica deployment.
 *
 * Returns the Worker so the caller can close it during graceful shutdown.
 */
export function scheduleRetentionJob(opts: {
  queue: Queue;
  connection: Redis;
  pool: Pool;
  s3: S3Client;
  log?: Pick<typeof console, 'log' | 'error'>;
}): Worker {
  const { queue, connection, pool, s3, log = console } = opts;

  void queue.add(
    'daily-cleanup',
    {},
    {
      jobId: 'retention-daily',
      repeat: { pattern: '0 3 * * *' },
      removeOnComplete: { count: 7 },
      removeOnFail: { count: 7 },
    },
  );

  return new Worker(
    'retention',
    async () => {
      await runRetentionOnce(pool, s3, log);
    },
    {
      connection: connection as never,
      concurrency: 1,
      lockDuration: 300_000, // 5 min — retention can take a while on large datasets
    },
  );
}
