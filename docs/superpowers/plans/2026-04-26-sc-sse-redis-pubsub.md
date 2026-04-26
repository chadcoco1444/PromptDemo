# S-C: SSE Broker → Redis Pub/Sub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-process `Map`-based SSE broker with a Redis Pub/Sub broker so that job events published on any API instance reach all connected SSE clients across all instances.

**Architecture:** Each API instance creates one dedicated `subRedis` connection for subscriptions (separate from the shared `redis` used for PUBLISH and everything else). A per-instance local relay map routes Redis messages to the correct `SseWriter` callbacks. Reference counting ensures each `job:{jobId}` channel is subscribed/unsubscribed on Redis exactly once regardless of concurrent local writers. A 25 s heartbeat in `stream.ts` keeps SSE connections alive during Redis reconnects.

**Tech Stack:** ioredis (already in use), TypeScript, Vitest, Fastify raw response.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/sse/redisBroker.ts` | **Create** | `makeRedisBroker()` — pub/sub implementation with ref-counting |
| `apps/api/src/routes/stream.ts` | **Modify** | Add 25 s heartbeat keepalive |
| `apps/api/src/index.ts` | **Modify** | Create `subRedis`, wire `makeRedisBroker`, fix shutdown order |
| `apps/api/tests/broker.redis.test.ts` | **Create** | Unit tests with mocked ioredis |
| `apps/api/src/sse/broker.ts` | **Unchanged** | `makeBroker()` stays for local/test use |

---

## Task 1: Create `redisBroker.ts` with Reference Counting

**Files:**
- Create: `apps/api/src/sse/redisBroker.ts`

### Step 1a: Write the failing tests first

- [ ] **Step 1: Create `apps/api/tests/broker.redis.test.ts` with all unit tests**

```ts
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
      if (event === 'message') handlers.set('message', handler as (channel: string, message: string) => void);
    }),
    // Helper to simulate an incoming Redis message
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
      JSON.stringify({ event: 'done', data: { videoUrl: 'x' } })
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
```

- [ ] **Step 2: Run the tests to verify they fail (file doesn't exist yet)**

```bash
cd apps/api && npx vitest run tests/broker.redis.test.ts 2>&1 | head -20
```

Expected: `Cannot find module '../src/sse/redisBroker.js'`

### Step 1b: Implement `redisBroker.ts`

- [ ] **Step 3: Create `apps/api/src/sse/redisBroker.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests — all should pass**

```bash
cd apps/api && npx vitest run tests/broker.redis.test.ts
```

Expected: `9 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sse/redisBroker.ts apps/api/tests/broker.redis.test.ts
git commit -m "feat(sse): add makeRedisBroker with ref-counted Redis Pub/Sub"
```

---

## Task 2: Add Heartbeat to `stream.ts`

**Files:**
- Modify: `apps/api/src/routes/stream.ts`

The current `stream.ts` has no keepalive. The browser's `EventSource` closes idle connections after ~45 s. The heartbeat prevents that and keeps connections alive through Redis reconnects.

Current `req.raw.on('close', ...)` block (lines 36–39):
```ts
req.raw.on('close', () => {
  dispose();
  reply.raw.end();
});
```

- [ ] **Step 1: Add the heartbeat interval and clear it on close**

Replace the `req.raw.on('close', ...)` block with:

```ts
const heartbeat = setInterval(() => {
  reply.raw.write(': keepalive\n\n');
}, 25_000);

req.raw.on('close', () => {
  clearInterval(heartbeat);
  dispose();
  reply.raw.end();
});
```

Full updated `stream.ts` after the edit:

```ts
import type { FastifyPluginAsync } from 'fastify';
import type { JobStore } from '../jobStore.js';
import type { Broker } from '../sse/broker.js';

export interface StreamRouteOpts {
  store: JobStore;
  broker: Broker;
}

export const streamRoute: FastifyPluginAsync<StreamRouteOpts> = async (app, opts) => {
  app.get<{ Params: { id: string } }>('/api/jobs/:id/stream', async (req, reply) => {
    const job = await opts.store.get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'not found' });

    const origin = (req.headers.origin as string | undefined) ?? '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    });

    const write = (chunk: string) => {
      reply.raw.write(chunk);
    };

    write(`event: snapshot\ndata: ${JSON.stringify(job)}\n\n`);

    const dispose = opts.broker.subscribe(req.params.id, write);

    const heartbeat = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 25_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      dispose();
      reply.raw.end();
    });

    return reply;
  });
};
```

- [ ] **Step 2: Run the existing stream test to confirm it still passes**

```bash
cd apps/api && npx vitest run tests/stream.test.ts
```

Expected: `1 test passed`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/stream.ts
git commit -m "feat(sse): add 25s keepalive heartbeat to stream route"
```

---

## Task 3: Wire `makeRedisBroker` in `index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`

Three changes:
1. Import `makeRedisBroker` alongside `makeBroker`
2. Create `subRedis` (dedicated subscriber connection) and instantiate `makeRedisBroker`
3. Fix shutdown order: `closeBroker()` → `closeQueueBundle()` → `redis.quit()`

- [ ] **Step 1: Replace broker instantiation in `index.ts`**

Find this section (lines 9, 53):
```ts
import { makeBroker } from './sse/broker.js';
...
const broker = makeBroker();
```

Replace with:
```ts
import { makeRedisBroker } from './sse/redisBroker.js';
...
const subRedis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
const { broker, close: closeBroker } = makeRedisBroker({ publisher: redis, subscriber: subRedis });
```

- [ ] **Step 2: Fix the shutdown function in `index.ts`**

Find this block (lines 123–131):
```ts
const shutdown = async () => {
  await app.close();
  await stopOrchestrator();
  if (stopRetentionCron) stopRetentionCron();
  await closeQueueBundle(queues);
  if (shutdownPool) await shutdownPool();
  await redis.quit();
  process.exit(0);
};
```

Replace with:
```ts
const shutdown = async () => {
  await app.close();
  await stopOrchestrator();
  if (stopRetentionCron) stopRetentionCron();
  await closeBroker();           // ① quit subRedis first
  await closeQueueBundle(queues);
  if (shutdownPool) await shutdownPool();
  await redis.quit();            // ③ shared publisher last
  process.exit(0);
};
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run the full `apps/api` test suite**

```bash
cd apps/api && npx vitest run
```

Expected: all tests pass (including new `broker.redis.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(sse): wire makeRedisBroker in index.ts with correct shutdown order"
```

---

## Task 4: Add Cross-Instance Integration Test (Skipped Without REDIS_URL)

**Files:**
- Modify: `apps/api/tests/broker.redis.test.ts`

This test is skipped in CI unless a real Redis URL is present. It documents the exact fan-out guarantee the broker provides across two instances.

- [ ] **Step 1: Append the integration test to `broker.redis.test.ts`**

Add at the bottom of the file, after the existing `describe` block:

```ts
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

    // Give subB time to finish SUBSCRIBE handshake with Redis
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
```

- [ ] **Step 2: Run the unit tests to confirm the new describe block doesn't break them**

```bash
cd apps/api && npx vitest run tests/broker.redis.test.ts
```

Expected: 9 unit tests pass, 1 integration test skipped (no `REDIS_URL` in CI).

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/broker.redis.test.ts
git commit -m "test(sse): add cross-instance integration test for makeRedisBroker"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Run the full workspace test suite**

```bash
pnpm test
```

Expected: all tests pass. `broker.redis.test.ts` contributes 9 new passing tests. `broker.test.ts` (in-memory broker) is unchanged and still passes.

- [ ] **Step 2: TypeScript check across all packages**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Confirm git state is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 4: Verify commit log**

```bash
git log --oneline -4
```

Expected (top 3 commits are S-C):
```
<hash> test(sse): add cross-instance integration test for makeRedisBroker
<hash> feat(sse): wire makeRedisBroker in index.ts with correct shutdown order
<hash> feat(sse): add 25s keepalive heartbeat to stream route
<hash> feat(sse): add makeRedisBroker with ref-counted Redis Pub/Sub
```

---

## Self-Review Against Spec

| Spec requirement | Task |
|---|---|
| New `redisBroker.ts` with `makeRedisBroker(publisher, subscriber)` | Task 1 |
| Reference counting — one Redis SUBSCRIBE per distinct jobId | Task 1 Step 3 |
| Dispose last writer → `UNSUBSCRIBE` from Redis channel | Task 1 Step 3 |
| `close()` quits `subscriber` only; shared `publisher` closed by `index.ts` | Task 1 Step 3 |
| Error handler on subscriber — log, don't crash | Task 1 Step 3 |
| Malformed JSON from Redis ignored silently | Task 1 Step 3 + test |
| SSE chunk format matches in-memory broker format | Task 1 (verified by relay test) |
| 25 s heartbeat in `stream.ts` | Task 2 |
| `stream.ts` clears heartbeat on connection close | Task 2 |
| `index.ts` creates `subRedis` (dedicated subscriber) | Task 3 |
| Shutdown order: closeBroker → closeQueueBundle → redis.quit | Task 3 |
| Existing `makeBroker()` / `broker.test.ts` unchanged | All tasks (broker.ts untouched) |
| Unit tests with mocked ioredis | Task 1 Step 1 |
| Integration test skipped without `REDIS_URL` | Task 4 |
