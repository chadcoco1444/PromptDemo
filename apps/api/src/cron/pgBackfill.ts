import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobStore } from '../jobStore.js';
import type { JobStoreWithUpsert } from '../jobStorePostgres.js';

/**
 * Pure reconciliation function — reads CURRENT Redis state and writes via PG upsert.
 * Extracted as a named export so it's testable without spinning up a BullMQ Worker.
 *
 * Reading Redis at execution time (rather than replaying the failed write payload)
 * sidesteps create-vs-patch ordering races: if the orchestrator landed a normal
 * patch into PG between the original failure and this retry, the OCC guard inside
 * upsert() (WHERE jobs.updated_at < EXCLUDED.updated_at) prevents regression.
 *
 * M2 defense: upsert() silently no-ops when resolveUserId returns null (anonymous
 * job edge case). Without post-write verification, the worker would think the
 * write succeeded, BullMQ would mark the job complete, DLQ would never fire, and
 * the phantom job would persist forever. We explicitly verify the row landed and
 * throw if it didn't — converting silent skip into a BullMQ retry/DLQ surface.
 */
export async function reconcilePgBackfill(
  jobId: string,
  primary: JobStore,
  mirror: JobStoreWithUpsert,
): Promise<void> {
  const current = await primary.get(jobId);
  if (!current) {
    console.warn(`[pg-backfill] jobId=${jobId} no longer in Redis; abandoning reconcile`);
    return;
  }
  await mirror.upsert(current);

  // M2 defense — see fn-level JSDoc.
  const verify = await mirror.get(jobId);
  if (!verify) {
    throw new Error(
      `[pg-backfill] post-upsert verify failed for jobId=${jobId}: ` +
      `mirror.get returned null after upsert. Likely cause: resolveUserId() returned ` +
      `null (anonymous job) so upsert() early-returned without writing. ` +
      `BullMQ will retry; if all retries fail, manual reconcile required.`,
    );
  }

  // M7 — neutral phrasing. "completed" describes the operation invocation, not
  // its semantic effect (which may legitimately be a no-op when the OCC WHERE
  // clause blocks an equal-timestamp UPDATE). Avoid "reconciled" / "synced" /
  // "fixed" which would imply something always happened.
  console.log(`[pg-backfill] upsert completed for jobId=${jobId}`);
}

/**
 * Greppable critical log marker for exhausted retries. Future Spec 4 (Pino +
 * log aggregator) wires this into Slack / PagerDuty alerts.
 */
export function dlqLogLine(jobId: string, attempts: number, lastError: string): string {
  return (
    `[CRITICAL] pg-backfill DLQ: jobId=${jobId} attempts=${attempts} lastError=${lastError}. ` +
    `Manual reconcile required after PG recovery.`
  );
}

export interface PgBackfillWorkerOpts {
  connection: Redis;
  primary: JobStore;
  mirror: JobStoreWithUpsert;
}

/**
 * Boots the BullMQ Worker that consumes the `pg-backfill` queue.
 * Returns the Worker so the caller can close it during graceful shutdown.
 */
export function startPgBackfillWorker(opts: PgBackfillWorkerOpts): Worker {
  const worker = new Worker<{ jobId: string }>(
    'pg-backfill',
    async (job) => reconcilePgBackfill(job.data.jobId, opts.primary, opts.mirror),
    {
      connection: opts.connection as never,
      concurrency: 4,
      lockDuration: 60_000,
    },
  );

  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 0)) {
      console.error(dlqLogLine(job.data.jobId, job.attemptsMade, err.message));
    }
  });

  return worker;
}
