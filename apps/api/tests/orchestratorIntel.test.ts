import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import { startOrchestrator } from '../src/orchestrator/index.js';
import { makeJobStore } from '../src/jobStore.js';
import { makeBroker } from '../src/sse/broker.js';
import { makeIntel } from '@lumespec/schema';

/**
 * Spin up the orchestrator with bare EventEmitters in place of real
 * BullMQ QueueEvents so we can poke `progress` events directly and assert
 * the broker fan-out without standing up Redis pub/sub.
 */
function buildOrchestrator() {
  const store = makeJobStore(new RedisMock() as any);
  const broker = makeBroker();
  const publishSpy = vi.spyOn(broker, 'publish');
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
  const stop = startOrchestrator({ queues, store, broker });
  return { stop, broker, publishSpy, crawlEvents, storyboardEvents, renderEvents };
}

describe('orchestrator intel relay', () => {
  it('forwards an intel progress payload to the broker as an `intel` event', async () => {
    const { publishSpy, crawlEvents, stop } = buildOrchestrator();
    await stop; // resolve the startOrchestrator promise

    const intel = makeIntel('crawl', 'Opening the page');
    crawlEvents.emit('progress', { jobId: 'job-1', data: intel });

    expect(publishSpy).toHaveBeenCalledWith('job-1', { event: 'intel', data: intel });
  });

  it('relays intel from all three queues independently', async () => {
    const { publishSpy, crawlEvents, storyboardEvents, renderEvents, stop } = buildOrchestrator();
    await stop;

    crawlEvents.emit('progress', { jobId: 'j', data: makeIntel('crawl', 'a') });
    storyboardEvents.emit('progress', { jobId: 'j', data: makeIntel('storyboard', 'b') });
    renderEvents.emit('progress', { jobId: 'j', data: makeIntel('render', 'c') });

    expect(publishSpy).toHaveBeenCalledTimes(3);
    expect(publishSpy.mock.calls.map((c) => (c[1] as any).data.message)).toEqual(['a', 'b', 'c']);
  });

  it('ignores progress payloads that are not intel (e.g. plain numeric progress)', async () => {
    const { publishSpy, crawlEvents, stop } = buildOrchestrator();
    await stop;

    // BullMQ default: numeric progress
    crawlEvents.emit('progress', { jobId: 'job-1', data: 42 });
    // Or an unrelated structured payload
    crawlEvents.emit('progress', { jobId: 'job-1', data: { foo: 'bar' } });

    expect(publishSpy).not.toHaveBeenCalled();
  });
});
