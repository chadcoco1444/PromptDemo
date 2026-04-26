# S-C: SSE Broker → Redis Pub/Sub

**Risk:** R1 — P0 (must fix before horizontal scale)  
**Date:** 2026-04-26  
**Status:** Approved — ready for implementation planning

---

## Problem

`makeBroker()` stores SSE writers in an in-process `Map<jobId, Set<SseWriter>>`. With multiple `apps/api` instances, only the instance that received the BullMQ event calls `broker.publish()`. All other instances' SSE clients receive nothing.

```
Orchestrator (instance A)          Orchestrator (instance B)
     ↓ broker.publish('job:1')           ↓ (no event)
  writer_A1 ✅                        writer_B1 ❌ silent forever
```

---

## Approaches Considered

| Approach | Pros | Cons |
|---|---|---|
| **A) Redis Pub/Sub** ✅ | Zero new infra, Redis already present, ~1ms latency, native fan-out | Requires a dedicated subscriber connection |
| B) Redis Streams | Persistence, consumer groups | Over-engineering for unidirectional SSE |
| C) Sticky sessions (nginx) | No code changes | Ties scaling to infra; broken if pod dies |

**Decision: A.** Redis is already in use via ioredis. Pub/Sub is the minimal correct solution.

---

## Architecture

```
Orchestrator (any instance)
     ↓ publisher.publish('job:{jobId}', json)
  Redis channel: job:{jobId}
     ↓ (fan-out to all active subscribers)
  subRedis (instance A)    subRedis (instance B)
     ↓ relay → localMap        ↓ relay → localMap
  writer_A1 ✅              writer_B1 ✅
```

**Two Redis connections per instance:**
- `publisher` — existing shared `redis` instance (`index.ts`). Used only for `PUBLISH`. No new connection.
- `subscriber` — **new dedicated connection** (`subRedis`). ioredis forbids non-subscribe commands on a subscribed connection. Stays alive for the lifetime of the process.

**Local relay map (per-instance, not distributed):**
```
localWriters:    Map<jobId, Set<SseWriter>>
channelRefCount: Map<jobId, number>
```
Used only to route messages received from Redis to the correct local writers.

---

## Interface Contract

**`Broker` interface is unchanged.** `stream.ts` and the orchestrator require zero modifications.

```ts
// apps/api/src/sse/broker.ts — unchanged
export interface Broker {
  subscribe(jobId: string, writer: SseWriter): () => void;
  publish(jobId: string, ev: BrokerEvent): void;
  hasSubscribers(jobId: string): boolean;
}
```

**New factory:** `makeRedisBroker`

```ts
// apps/api/src/sse/redisBroker.ts (new file)
import type { Redis } from 'ioredis';
import type { Broker, BrokerEvent, SseWriter } from './broker.js';

export interface RedisBrokerResult {
  broker: Broker;
  close: () => Promise<void>;
}

export function makeRedisBroker(opts: {
  publisher: Redis;   // shared connection — PUBLISH only
  subscriber: Redis;  // dedicated connection — SUBSCRIBE only
}): RedisBrokerResult
```

---

## Channel Naming Convention

**Pattern:** `job:{jobId}`  
**Example:** `job:abc-123-def-456`

The `job:` prefix provides namespace isolation against any other Redis usage (BullMQ, rate-limit, session keys). The jobId is already a UUID — no sanitisation needed.

---

## Redis Connection Management — No Leaks

Reference counting per channel prevents orphaned `SUBSCRIBE` calls on Redis:

```
subscribe('job:X', writerA):
  localWriters['job:X'] → new Set → add writerA
  channelRefCount['job:X']: 0 → 1
  was 0 → subRedis.subscribe('job:X')      ← one SUBSCRIBE on Redis

subscribe('job:X', writerB):
  localWriters['job:X'] → add writerB
  channelRefCount['job:X']: 1 → 2
  was > 0 → no Redis call

dispose() by writerA:
  remove writerA from Set
  channelRefCount['job:X']: 2 → 1

dispose() by writerB:
  remove writerB from Set
  channelRefCount['job:X']: 1 → 0
  is 0 → subRedis.unsubscribe('job:X')     ← channel cleanup on Redis
```

Result: `subRedis` holds at most one active `SUBSCRIBE` per distinct jobId, regardless of how many SSE clients connect to the same job.

**Shutdown without leaks:**

```ts
close: async () => {
  await opts.subscriber.quit(); // release subscriber connection
  // opts.publisher is the shared redis — closed by index.ts shutdown
}
```

`index.ts` shutdown order:
```ts
await closeBroker();         // ① quit subRedis
await closeQueueBundle(...); // ②
await redis.quit();          // ③ shared publisher
process.exit(0);
```

---

## Error Handling & Graceful Degradation

**Scenario: Redis disconnects temporarily**

ioredis reconnects automatically with exponential backoff. During the outage:
- Pending `SUBSCRIBE` calls are queued and replayed on reconnect (ioredis native behaviour)
- `PUBLISH` calls fail silently — connected SSE clients receive no events during the window
- SSE connections stay open due to the heartbeat (see below)

**Heartbeat added to `stream.ts`:**

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

Without a heartbeat, the browser's `EventSource` closes the connection after ~45s of silence and retries — causing a second snapshot to be sent. The 25s interval stays safely under that threshold.

**Error logging without crashing:**

```ts
opts.subscriber.on('error', (err) => {
  console.error('[redisBroker] subscriber error:', err.message);
  // Do not rethrow — ioredis manages reconnection
});
```

**Scenario: Redis unavailable at startup** — ioredis retries in the background. The API starts normally. Job store reads (also Redis-backed) have the same failure mode — no new fragility introduced.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/sse/redisBroker.ts` | **New** — `makeRedisBroker()` implementation |
| `apps/api/src/sse/broker.ts` | **Unchanged** — `makeBroker()` remains for tests |
| `apps/api/src/routes/stream.ts` | **Add** heartbeat `setInterval` / `clearInterval` |
| `apps/api/src/index.ts` | Create `subRedis`, use `makeRedisBroker`, add `closeBroker()` to shutdown |
| `apps/api/tests/broker.redis.test.ts` | **New** — unit tests with mocked ioredis |

---

## Testing

**Unit tests (`broker.redis.test.ts`) — mocked ioredis:**
- `subscribe` → `subscriber.subscribe('job:{id}')` called exactly once per jobId even with 2 writers
- `dispose` of last writer → `subscriber.unsubscribe('job:{id}')` called
- `hasSubscribers` → returns `false` after all disposes
- SSE chunk format matches existing in-memory broker format

**Integration test (skipped without `REDIS_URL`):**

```ts
it.skipIf(!process.env.REDIS_URL)('cross-instance fan-out', async () => {
  // Two broker instances sharing the same Redis but distinct subRedis connections
  // Publish on brokerA → writer on brokerB receives the event
});
```

**Existing tests:** `broker.test.ts` uses `makeBroker()` (in-memory) — zero changes, continue to pass.
