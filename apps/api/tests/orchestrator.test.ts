import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import { startOrchestrator } from '../src/orchestrator/index.js';
import { makeJobStore } from '../src/jobStore.js';
import { makeBroker } from '../src/sse/broker.js';
import type { Job } from '../src/model/job.js';

const sampleJob: Job = {
  jobId: 'job-refund-test',
  status: 'failed',
  stage: 'render',
  progress: 0,
  input: { url: 'https://example.com', intent: 'demo', duration: 30 },
  fallbacks: [],
  error: { code: 'RENDER_FAILED', message: 'first failure', retryable: false },
  createdAt: 1000,
  updatedAt: 2000,
};

function buildOrchestratorWithSpies(onJobFailed: ReturnType<typeof vi.fn>) {
  const redis = new RedisMock() as any;
  const store = makeJobStore(redis);
  const patchSpy = vi.spyOn(store, 'patch');
  const broker = makeBroker();
  const crawlEvents = new EventEmitter();
  const storyboardEvents = new EventEmitter();
  const renderEvents = new EventEmitter();
  const queues = {
    crawl: { add: vi.fn() },
    storyboard: { add: vi.fn() },
    render: {
      add: vi.fn(),
      getJobCounts: vi.fn().mockResolvedValue({ active: 0, waiting: 0 }),
    },
    crawlEvents,
    storyboardEvents,
    renderEvents,
  } as any;
  const stop = startOrchestrator({ queues, store, broker, onJobFailed });
  return { stop, store, patchSpy, crawlEvents, storyboardEvents, renderEvents };
}

describe('orchestrator — refund-leak regression', () => {
  it('does not fire onJobFailed when duplicate render:failed arrives for an already-failed job', async () => {
    const onJobFailed = vi.fn();
    const { stop, store, patchSpy, renderEvents } = buildOrchestratorWithSpies(onJobFailed);
    await stop;

    // Pre-seed the job in terminal 'failed' state
    await store.create(sampleJob);

    // Emit a duplicate render:failed for the already-failed job
    const emitted = new Promise<void>((resolve) => {
      setImmediate(() => {
        renderEvents.emit('failed', { jobId: sampleJob.jobId, failedReason: 'duplicate failure' });
        resolve();
      });
    });
    await emitted;

    // Allow any async handlers to settle
    await new Promise((resolve) => setImmediate(resolve));

    expect(onJobFailed).not.toHaveBeenCalled();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('does not fire onJobFailed when duplicate crawl:failed arrives for an already-failed job', async () => {
    const onJobFailed = vi.fn();
    const { stop, store, patchSpy, crawlEvents } = buildOrchestratorWithSpies(onJobFailed);
    await stop;

    const failedCrawlJob: Job = { ...sampleJob, stage: 'crawl', error: { code: 'CRAWL_FAILED', message: 'first', retryable: false } };
    await store.create(failedCrawlJob);

    const emitted = new Promise<void>((resolve) => {
      setImmediate(() => {
        crawlEvents.emit('failed', { jobId: failedCrawlJob.jobId, failedReason: 'duplicate' });
        resolve();
      });
    });
    await emitted;
    await new Promise((resolve) => setImmediate(resolve));

    expect(onJobFailed).not.toHaveBeenCalled();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('does not fire onJobFailed when duplicate storyboard:failed arrives for an already-failed job', async () => {
    const onJobFailed = vi.fn();
    const { stop, store, patchSpy, storyboardEvents } = buildOrchestratorWithSpies(onJobFailed);
    await stop;

    const failedSbJob: Job = { ...sampleJob, stage: 'storyboard', error: { code: 'STORYBOARD_GEN_FAILED', message: 'first', retryable: false } };
    await store.create(failedSbJob);

    const emitted = new Promise<void>((resolve) => {
      setImmediate(() => {
        storyboardEvents.emit('failed', { jobId: failedSbJob.jobId, failedReason: 'duplicate' });
        resolve();
      });
    });
    await emitted;
    await new Promise((resolve) => setImmediate(resolve));

    expect(onJobFailed).not.toHaveBeenCalled();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('does fire onJobFailed exactly once for a legitimate first failure', async () => {
    const onJobFailed = vi.fn().mockResolvedValue(undefined);
    const { stop, store, patchSpy, renderEvents } = buildOrchestratorWithSpies(onJobFailed);
    await stop;

    const renderingJob: Job = {
      ...sampleJob,
      status: 'rendering',
      stage: 'render',
      error: undefined,
    };
    await store.create(renderingJob);

    const emitted = new Promise<void>((resolve) => {
      setImmediate(() => {
        renderEvents.emit('failed', { jobId: renderingJob.jobId, failedReason: 'render crashed' });
        resolve();
      });
    });
    await emitted;
    await new Promise((resolve) => setImmediate(resolve));

    expect(onJobFailed).toHaveBeenCalledTimes(1);
    expect(onJobFailed).toHaveBeenCalledWith({
      jobId: renderingJob.jobId,
      userId: undefined,
      stage: 'render',
      errorCode: 'RENDER_FAILED',
      duration: 30,
    });
    expect(patchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('orchestrator — assertBudgetAvailable error containment', () => {
  it('does not let an unexpected creditPool error escape as unhandled rejection', async () => {
    // Simulates the Postgres 42P18 crash: creditPool.connect throws and the
    // rejection MUST be swallowed inside the crawl:completed handler. If it
    // escapes, BullMQ's QueueEvents EventEmitter forwards it as an
    // unhandledRejection and Node terminates the api process.
    const onJobFailed = vi.fn().mockResolvedValue(undefined);
    const redis = new RedisMock() as any;
    const store = makeJobStore(redis);
    const broker = makeBroker();
    const crawlEvents = new EventEmitter();
    const storyboardEvents = new EventEmitter();
    const renderEvents = new EventEmitter();
    const queues = {
      crawl: { add: vi.fn() },
      storyboard: { add: vi.fn() },
      render: {
        add: vi.fn(),
        getJobCounts: vi.fn().mockResolvedValue({ active: 0, waiting: 0 }),
      },
      crawlEvents,
      storyboardEvents,
      renderEvents,
    } as any;

    const explodingPool = {
      connect: vi.fn().mockRejectedValue(new Error('pg 42P18 simulated')),
    } as any;

    await startOrchestrator({ queues, store, broker, onJobFailed, creditPool: explodingPool });

    const job: Job = {
      jobId: 'budget-crash-job',
      status: 'crawling',
      stage: 'crawl',
      progress: 100,
      input: { url: 'https://example.com', intent: 'demo', duration: 30 },
      fallbacks: [],
      createdAt: 1000,
      updatedAt: 2000,
    };
    await store.create(job);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    crawlEvents.emit('completed', {
      jobId: job.jobId,
      returnvalue: { crawlResultUri: 's3://b/crawl.json' },
    });

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toEqual([]);
    const updated = await store.get(job.jobId);
    expect(updated?.status).toBe('failed');
    expect(updated?.error?.code).toBe('INTERNAL_ERROR');
    expect(updated?.error?.retryable).toBe(true);
    // storyboard.add must NOT be reached
    expect(queues.storyboard.add).not.toHaveBeenCalled();
  });
});
