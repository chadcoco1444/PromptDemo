import type { Queue } from 'bullmq';
import type { JobStore } from './jobStore.js';
import type { Job } from './model/job.js';

/**
 * DualWriteJobStore — primary (Redis) is source of truth, mirror (Postgres) is
 * eventual-consistency target. When the mirror write fails, we enqueue a
 * reconciliation job to `pg-backfill` instead of swallowing the error. The
 * worker (cron/pgBackfill.ts) reads current Redis state and upserts to PG.
 *
 * Why required, not optional: prior to Spec #2 fix, the queue was an
 * optional onMirrorError callback that no caller wired up — silent log-and-
 * continue was the source of phantom jobs. Making the queue a required ctor
 * dep fails fast at startup if it isn't plumbed through.
 */
export interface DualWriteOptions {
  primary: JobStore;
  mirror: JobStore;
  pgBackfillQueue: Queue;
}

const RETRY_CONFIG = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

export function makeDualWriteJobStore(opts: DualWriteOptions): JobStore {
  const { primary, mirror, pgBackfillQueue } = opts;

  const enqueueRetry = (op: 'create' | 'patch', jobId: string, err: unknown) => {
    console.warn(
      `[jobStoreDual] ${op} mirror failed for ${jobId}; enqueued retry:`,
      (err as Error)?.message ?? err,
    );
    void pgBackfillQueue
      .add('reconcile', { jobId }, { jobId, ...RETRY_CONFIG })
      .catch((enqueueErr) => {
        // Pathological case: the Redis backing BullMQ is also down.
        console.error(
          `[jobStoreDual] ${op} retry-enqueue ALSO failed for ${jobId}:`,
          enqueueErr,
        );
      });
  };

  return {
    async create(job: Job) {
      await primary.create(job);
      try {
        await mirror.create(job);
      } catch (err) {
        enqueueRetry('create', job.jobId, err);
      }
    },
    async get(jobId: string) {
      return primary.get(jobId);
    },
    async patch(jobId, patch, updatedAt, expectedStatus?) {
      await primary.patch(jobId, patch, updatedAt, expectedStatus);
      try {
        await mirror.patch(jobId, patch, updatedAt, expectedStatus);
      } catch (err) {
        enqueueRetry('patch', jobId, err);
      }
    },
  };
}
