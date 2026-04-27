import { describe, it, expect, vi } from 'vitest';
import { reconcilePgBackfill, dlqLogLine } from '../../src/cron/pgBackfill.js';
import type { Job } from '../../src/model/job.js';
import type { JobStore } from '../../src/jobStore.js';
import type { JobStoreWithUpsert } from '../../src/jobStorePostgres.js';

const sampleJob: Job = {
  jobId: 'jb-pg-backfill-test',
  status: 'done',
  stage: 'render',
  progress: 0,
  input: { url: 'https://x.com', intent: 'test', duration: 30 },
  fallbacks: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_500,
};

describe('reconcilePgBackfill', () => {
  it('reads current Redis state, calls mirror.upsert, then verifies the row exists', async () => {
    const primary: Pick<JobStore, 'get'> = { get: vi.fn().mockResolvedValue(sampleJob) };
    const mirror: Pick<JobStoreWithUpsert, 'upsert' | 'get'> = {
      upsert: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(sampleJob),  // verify finds row
    };
    await reconcilePgBackfill(sampleJob.jobId, primary as JobStore, mirror as JobStoreWithUpsert);
    expect(primary.get).toHaveBeenCalledWith(sampleJob.jobId);
    expect(mirror.upsert).toHaveBeenCalledWith(sampleJob);
    expect(mirror.get).toHaveBeenCalledWith(sampleJob.jobId);  // M2: verify step ran
  });

  it('skips upsert and warns when Redis no longer has the job (TTL expired)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const primary: Pick<JobStore, 'get'> = { get: vi.fn().mockResolvedValue(null) };
    const mirror: Pick<JobStoreWithUpsert, 'upsert' | 'get'> = {
      upsert: vi.fn(),
      get: vi.fn(),
    };
    await reconcilePgBackfill('missing-jobid', primary as JobStore, mirror as JobStoreWithUpsert);
    expect(mirror.upsert).not.toHaveBeenCalled();
    expect(mirror.get).not.toHaveBeenCalled();  // verify never reached
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing-jobid'));
    warnSpy.mockRestore();
  });

  it('propagates upsert errors so BullMQ retry can fire', async () => {
    const primary: Pick<JobStore, 'get'> = { get: vi.fn().mockResolvedValue(sampleJob) };
    const mirror: Pick<JobStoreWithUpsert, 'upsert' | 'get'> = {
      upsert: vi.fn().mockRejectedValue(new Error('PG still down')),
      get: vi.fn(),
    };
    await expect(
      reconcilePgBackfill(sampleJob.jobId, primary as JobStore, mirror as JobStoreWithUpsert),
    ).rejects.toThrow('PG still down');
    expect(mirror.get).not.toHaveBeenCalled();  // verify never reached when upsert throws
  });

  it('throws when post-upsert verify finds the row missing (M2 defense against silent skip)', async () => {
    const primary: Pick<JobStore, 'get'> = { get: vi.fn().mockResolvedValue(sampleJob) };
    const mirror: Pick<JobStoreWithUpsert, 'upsert' | 'get'> = {
      upsert: vi.fn().mockResolvedValue(undefined),  // upsert "succeeds" silently
      get: vi.fn().mockResolvedValue(null),          // but PG row is still missing
    };
    await expect(
      reconcilePgBackfill(sampleJob.jobId, primary as JobStore, mirror as JobStoreWithUpsert),
    ).rejects.toThrow(/post-upsert verify failed/i);
    expect(mirror.upsert).toHaveBeenCalled();  // upsert was attempted
    expect(mirror.get).toHaveBeenCalledWith(sampleJob.jobId);  // verify ran
  });
});

describe('dlqLogLine', () => {
  it('formats with [CRITICAL] marker, jobId, attempts, lastError', () => {
    const line = dlqLogLine('jb-xyz', 5, 'ECONNREFUSED');
    expect(line).toContain('[CRITICAL]');
    expect(line).toContain('pg-backfill DLQ');
    expect(line).toContain('jobId=jb-xyz');
    expect(line).toContain('attempts=5');
    expect(line).toContain('lastError=ECONNREFUSED');
    expect(line).toContain('Manual reconcile required after PG recovery');
  });
});
