import { describe, it, expect, vi } from 'vitest';
import { makeDualWriteJobStore } from '../src/jobStoreDual.js';
import type { Job } from '../src/model/job.js';
import type { JobStore } from '../src/jobStore.js';

const sampleJob: Job = {
  jobId: 'jb-dual-test',
  status: 'queued',
  stage: null,
  progress: 0,
  input: { url: 'https://x.com', intent: 'test', duration: 30 },
  fallbacks: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

function mocks() {
  const primary: JobStore = {
    create: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(sampleJob),
    patch: vi.fn().mockResolvedValue(undefined),
  };
  const mirror: JobStore = {
    create: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    patch: vi.fn().mockResolvedValue(undefined),
  };
  const queueAdd = vi.fn().mockResolvedValue(undefined);
  const pgBackfillQueue = { add: queueAdd } as never;
  return { primary, mirror, pgBackfillQueue, queueAdd };
}

describe('DualWriteJobStore.create', () => {
  it('writes to primary then mirror; does not enqueue on success', async () => {
    const { primary, mirror, pgBackfillQueue, queueAdd } = mocks();
    const store = makeDualWriteJobStore({ primary, mirror, pgBackfillQueue });
    await store.create(sampleJob);
    expect(primary.create).toHaveBeenCalledWith(sampleJob);
    expect(mirror.create).toHaveBeenCalledWith(sampleJob);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('enqueues retry with jobId when mirror.create fails', async () => {
    const { primary, mirror, pgBackfillQueue, queueAdd } = mocks();
    (mirror.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNRESET'));
    const store = makeDualWriteJobStore({ primary, mirror, pgBackfillQueue });
    await store.create(sampleJob);
    expect(primary.create).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalledWith(
      'reconcile',
      { jobId: sampleJob.jobId },
      expect.objectContaining({
        jobId: sampleJob.jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      }),
    );
  });

  it('still throws when primary.create fails (does not swallow)', async () => {
    const { primary, mirror, pgBackfillQueue } = mocks();
    (primary.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Redis down'));
    const store = makeDualWriteJobStore({ primary, mirror, pgBackfillQueue });
    await expect(store.create(sampleJob)).rejects.toThrow('Redis down');
    expect(mirror.create).not.toHaveBeenCalled();
  });
});

describe('DualWriteJobStore.patch', () => {
  it('writes to primary then mirror; does not enqueue on success', async () => {
    const { primary, mirror, pgBackfillQueue, queueAdd } = mocks();
    const store = makeDualWriteJobStore({ primary, mirror, pgBackfillQueue });
    await store.patch('jb-1', { status: 'done' }, 1_700_000_001_000, 'rendering');
    expect(primary.patch).toHaveBeenCalledWith('jb-1', { status: 'done' }, 1_700_000_001_000, 'rendering');
    expect(mirror.patch).toHaveBeenCalledWith('jb-1', { status: 'done' }, 1_700_000_001_000, 'rendering');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('enqueues retry with jobId when mirror.patch fails', async () => {
    const { primary, mirror, pgBackfillQueue, queueAdd } = mocks();
    (mirror.patch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('pool exhausted'));
    const store = makeDualWriteJobStore({ primary, mirror, pgBackfillQueue });
    await store.patch('jb-2', { status: 'failed' }, 1_700_000_002_000);
    expect(queueAdd).toHaveBeenCalledWith(
      'reconcile',
      { jobId: 'jb-2' },
      expect.objectContaining({ jobId: 'jb-2', attempts: 5 }),
    );
  });
});

describe('DualWriteJobStore.get', () => {
  it('reads from primary only (Redis is authoritative during transition)', async () => {
    const { primary, mirror, pgBackfillQueue } = mocks();
    const store = makeDualWriteJobStore({ primary, mirror, pgBackfillQueue });
    const result = await store.get('jb-1');
    expect(primary.get).toHaveBeenCalledWith('jb-1');
    expect(mirror.get).not.toHaveBeenCalled();
    expect(result).toEqual(sampleJob);
  });
});
