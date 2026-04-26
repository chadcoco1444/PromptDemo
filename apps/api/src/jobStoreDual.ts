import type { JobStore } from './jobStore.js';
import type { Job } from './model/job.js';

/**
 * DualWriteJobStore — mirrors every write to both Redis and Postgres,
 * reads from Redis (progress + hot path). Feature 4 transition strategy
 * per v2.0 spec Part 2 Section 2:
 *
 *   Phase 1 (now): dual-write, reads from Redis. Postgres backfilled
 *   asynchronously for listings.
 *   Phase 2 (future): cutover reads to Postgres for history/listing queries,
 *   keep Redis reads only for live progress.
 *   Phase 3: Redis drops job:<id> hashes entirely; only progress:<id> stays.
 *
 * Writes to Postgres are fire-and-forget from the caller's POV — failures
 * are logged but don't block the Redis write, so a Postgres outage can't
 * take down the primary job-submission flow. Postgres will backfill from
 * Redis once it recovers (via an operator-run backfill script; not yet
 * built — tracked in the followup guide).
 */
export interface DualWriteOptions {
  primary: JobStore; // Redis — source of truth during transition
  mirror: JobStore; // Postgres — best-effort secondary
  onMirrorError?: (err: unknown, op: 'create' | 'patch', jobId: string) => void;
}

export function makeDualWriteJobStore(opts: DualWriteOptions): JobStore {
  const { primary, mirror, onMirrorError } = opts;
  const handleMirrorErr = (err: unknown, op: 'create' | 'patch', jobId: string) => {
    if (onMirrorError) onMirrorError(err, op, jobId);
    else console.warn(`[jobStoreDual] ${op} mirror failed for ${jobId}:`, (err as Error)?.message ?? err);
  };

  return {
    async create(job: Job) {
      await primary.create(job); // Redis — must succeed
      try {
        await mirror.create(job); // Postgres — fire-and-forget
      } catch (err) {
        handleMirrorErr(err, 'create', job.jobId);
      }
    },
    async get(jobId: string) {
      return primary.get(jobId); // Redis is authoritative during transition
    },
    async patch(jobId, patch, updatedAt, expectedStatus?) {
      await primary.patch(jobId, patch, updatedAt, expectedStatus); // Redis — must succeed
      try {
        await mirror.patch(jobId, patch, updatedAt, expectedStatus); // Postgres — fire-and-forget
      } catch (err) {
        handleMirrorErr(err, 'patch', jobId);
      }
    },
  };
}
