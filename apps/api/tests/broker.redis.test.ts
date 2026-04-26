import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRedisBroker } from '../src/sse/redisBroker.js';

function makeMockRedis() {
  const handlers = new Map<string, (channel: string, message: string) => void>();
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn((event: string, handler: unknown) => {
      if (event === 'message') {
        handlers.set('message', handler as (channel: string, message: string) => void);
      }
    }),
    // Helper to simulate an incoming Redis message in tests
    _emit: (channel: string, message: string) => {
      handlers.get('message')?.(channel, message);
    },
  };
}

describe('makeRedisBroker', () => {
  let publisher: ReturnType<typeof makeMockRedis>;
  let subscriber: ReturnType<typeof makeMockRedis>;

  beforeEach(() => {
    publisher = makeMockRedis();
    subscriber = makeMockRedis();
  });

  it('subscribes to Redis channel on first writer for a jobId', () => {
    const { broker } = makeRedisBroker({ publisher: publisher as any, subscriber: subscriber as any });
    broker.subscribe('job-1', vi.fn());
    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledWith('job:job-1');
  });

  it('does NOT subscribe to Redis again for a second writer on the same jobId', () => {
    const { broker } = makeRedisBroker({ publisher: publisher as any, subscriber: subscriber as any });
    broker.subscribe('job-1', vi.fn());
    broker.subscribe('job-1', vi.fn());
    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from Redis when last writer disposes', () => {
    const { broker } = makeRedisBroker({ publisher: publisher as any, subscriber: subscriber as any });
    const d1 = broker.subscribe('job-1', vi.fn());
    const d2 = broker.subscribe('job-1', vi.fn());
    d1();
    expect(subscriber.unsubscribe).not.toHaveBeenCalled();
    d2();
    expect(subscriber.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriber.unsubscribe).toHaveBeenCalledWith('job:job-1');
  });

  it('hasSubscribers returns false after all disposes', () => {
    const { broker } = makeRedisBroker({ publisher: publisher as any, subscriber: subscriber as any });
    const dispose = broker.subscribe('job-1', vi.fn());
    expect(broker.hasSubscribers('job-1')).toBe(true);
    dispose();
    expect(broker.hasSubscribers('job-1')).toBe(false);
  });

  it('relays incoming Redis messages to local writers in SSE format', () => {
    const { broker } = makeRedisBroker({ publisher: publisher as any, subscriber: subscriber as any });
    const w1 = vi.fn();
    const w2 = vi.fn();
    broker.subscribe('job-1', w1);
    broker.subscribe('job-1', w2);
    subscriber._emit('job:job-1', JSON.stringify({ event: 'progress', data: { pct: 50 } }));
    expect(w1).toHaveBeenCalledWith('event: progress\ndata: {"pct":50}\n\n');
    expect(w2).toHaveBeenCalledWith('event: progress\ndata: {"pct":50}\n\n');
  });

  it('does NOT relay Redis messages to writers of a different jobId', () => {
    const { broker } = makeRedisBroker({ publisher: publisher as any, subscriber: subscriber as any });
    const w = vi.fn();
    broker.subscribe('job-1', w);
    subscriber._emit('job:job-2', JSON.stringify({ event: 'done', data: {} }));
    expect(w).not.toHaveBeenCalled();
  });

  it('publish sends PUBLISH command on the publisher connection', () => {
    const { broker } = makeRedisBroker({ publisher: publisher as any, subscriber: subscriber as any });
    broker.publish('job-1', { event: 'done', data: { videoUrl: 'x' } });
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      'job:job-1',
      JSON.stringify({ event: 'done', data: { videoUrl: 'x' } }),
    );
  });

  it('close() calls quit() on the subscriber connection only', async () => {
    const { close } = makeRedisBroker({ publisher: publisher as any, subscriber: subscriber as any });
    await close();
    expect(subscriber.quit).toHaveBeenCalledTimes(1);
    expect(publisher.quit).not.toHaveBeenCalled();
  });

  it('ignores malformed JSON from Redis without throwing', () => {
    const { broker } = makeRedisBroker({ publisher: publisher as any, subscriber: subscriber as any });
    const w = vi.fn();
    broker.subscribe('job-1', w);
    expect(() => subscriber._emit('job:job-1', 'not-json')).not.toThrow();
    expect(w).not.toHaveBeenCalled();
  });
});

describe('makeRedisBroker — cross-instance integration', () => {
  it.skipIf(!process.env.REDIS_URL)('event published on brokerA reaches writer on brokerB', async () => {
    const { Redis: IoRedis } = await import('ioredis');
    const url = process.env.REDIS_URL!;

    const pubA = new IoRedis(url, { maxRetriesPerRequest: null });
    const subA = new IoRedis(url, { maxRetriesPerRequest: null });
    const subB = new IoRedis(url, { maxRetriesPerRequest: null });

    const { broker: brokerA, close: closeA } = makeRedisBroker({ publisher: pubA, subscriber: subA });
    const { broker: brokerB, close: closeB } = makeRedisBroker({ publisher: pubA, subscriber: subB });

    const received = vi.fn();
    brokerB.subscribe('job-x', received);

    // Give subB time to complete the SUBSCRIBE handshake with Redis
    await new Promise(r => setTimeout(r, 100));

    brokerA.publish('job-x', { event: 'done', data: { videoUrl: 'x' } });

    await new Promise(r => setTimeout(r, 100));

    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0]?.[0]).toMatch(/^event: done\ndata:/);

    await closeA();
    await closeB();
    await pubA.quit();
  });
});
