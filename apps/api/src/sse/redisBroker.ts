import type { Redis } from 'ioredis';
import type { Broker, BrokerEvent, SseWriter } from './broker.js';

export interface RedisBrokerResult {
  broker: Broker;
  close: () => Promise<void>;
}

export function makeRedisBroker(opts: {
  publisher: Redis;
  subscriber: Redis;
}): RedisBrokerResult {
  const localWriters = new Map<string, Set<SseWriter>>();
  const channelRefCount = new Map<string, number>();

  opts.subscriber.on('error', (err: Error) => {
    console.error('[redisBroker] subscriber error:', err.message);
  });

  opts.subscriber.on('message', (channel: string, message: string) => {
    let parsed: BrokerEvent;
    try {
      parsed = JSON.parse(message) as BrokerEvent;
    } catch {
      return;
    }
    const jobId = channel.slice('job:'.length);
    const writers = localWriters.get(jobId);
    if (!writers) return;
    const chunk = `event: ${parsed.event}\ndata: ${JSON.stringify(parsed.data)}\n\n`;
    for (const w of writers) w(chunk);
  });

  const broker: Broker = {
    subscribe(jobId, writer) {
      let writers = localWriters.get(jobId);
      if (!writers) {
        writers = new Set();
        localWriters.set(jobId, writers);
      }
      writers.add(writer);

      const prev = channelRefCount.get(jobId) ?? 0;
      channelRefCount.set(jobId, prev + 1);
      if (prev === 0) {
        opts.subscriber.subscribe(`job:${jobId}`);
      }

      return () => {
        const ws = localWriters.get(jobId);
        if (ws) {
          ws.delete(writer);
          if (ws.size === 0) localWriters.delete(jobId);
        }
        const count = channelRefCount.get(jobId) ?? 0;
        const next = Math.max(0, count - 1);
        if (next === 0) {
          channelRefCount.delete(jobId);
          opts.subscriber.unsubscribe(`job:${jobId}`);
        } else {
          channelRefCount.set(jobId, next);
        }
      };
    },

    publish(jobId, ev) {
      opts.publisher.publish(`job:${jobId}`, JSON.stringify(ev));
    },

    hasSubscribers(jobId) {
      return (localWriters.get(jobId)?.size ?? 0) > 0;
    },
  };

  return {
    broker,
    close: async () => {
      await opts.subscriber.quit();
    },
  };
}
