# PG Backfill — Eventual-Consistency Reconciliation for Phantom Jobs · Design Document

**Date:** 2026-04-27
**Status:** Approved (brainstorming complete; ready for writing-plans)
**Owner:** chadcoco1444 + Claude (Opus 4.7)
**Risk reference:** Backlog item #2 — DualWriteJobStore phantom jobs (P1, blocks prod release)

---

## Goal

Eliminate the phantom-job class of failure: a user pays for a video, the orchestrator pipeline runs it to completion, but the user can never see it in the History Vault because the Postgres mirror write silently failed and Redis's 7-day TTL eventually evaporates the only surviving copy. Add a BullMQ-backed retry queue so every Redis write that the PG mirror dropped gets reconciled within seconds, with a console.error-grade DLQ for exhausted retries and a queue-depth health metric on `/healthz`.

---

## Background — the bug

`DualWriteJobStore` (`apps/api/src/jobStoreDual.ts`) wraps two stores:

```
DualWriteJobStore.create(job):
  await primary(redis).create(job)     ← MUST succeed (throws on fail)
  try mirror(pg).create(job)            ← fire-and-forget
  catch err → console.warn(...) and continue

DualWriteJobStore.patch(jobId, patch, ts, expectedStatus):
  await primary(redis).patch(...)       ← MUST succeed
  try mirror(pg).patch(...)             ← fire-and-forget
  catch err → console.warn(...) and continue
```

The `try/catch + console.warn + continue` pattern is correct for keeping `POST /api/jobs` available when PG hiccups (Q1 = B: prefer hot-path uptime over strong consistency). But it has zero recovery.

Because:
- `credit_transactions.job_id` is `TEXT` (not a FK) — credits get charged with a `job_id` reference even when the `jobs` row was never written
- History Vault (`apps/api/src/routes/getUserJobs.ts`) reads from PG only — phantom jobs are forever invisible to the user
- Redis TTL = 7 days — phantom is permanently lost when TTL expires
- No `onMirrorError` callback wired in `apps/api/src/index.ts` — the only failure signal is one `console.warn` line in a high-traffic log stream

Realistic phantom rate: anything that briefly disrupts PG (connection-pool exhaustion, network blip during deploy, query-cancel during long-running migration) silently produces ghost jobs. Prod release without this fix = guaranteed customer-support tickets demanding refunds for "videos I paid for that don't exist".

---

## Decisions Locked During Brainstorming

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | When PG is down, what does `POST /api/jobs` do? | **B — accept job, Redis is source of truth, PG mirror is best-effort with retry** | PLG product where front-door uptime matters more than strong consistency; PG-primary route would couple API uptime to PG uptime + require HA / failover work outside scope |
| 2 | What retry mechanism? | **BullMQ retry queue (`pg-backfill`)** | Project's existing primitive; native exponential backoff, native DLQ, native dedup-via-jobId, in-process worker = no new deployment unit. Beats raw Redis sorted set (reinvents BullMQ) and PG queue table (logically broken — can't write to retry queue when PG is down) |
| 3 | DLQ behavior on exhausted retries | **`console.error('[CRITICAL] pg-backfill DLQ: ...')` for v1; Slack/Pino integration deferred to Spec 4** | Avoid scope creep into observability tooling; the marker text is greppable and high-priority for a future Pino → log-aggregator pipeline |
| 4 | Queue-depth health metric | **Expose on `GET /healthz`** | Queue depth = system-health smoking gun; surfacing via existing health endpoint avoids inventing a metrics endpoint just for this |
| 5 | Reconciliation strategy on retry | **Worker reads CURRENT Redis state, writes full state via UPSERT** (not replaying the original failed payload) | Avoids create-vs-patch ordering races; one operation handles both "missing in PG" and "stale in PG"; payload is just `{ jobId }` so dedup by jobId is natural |
| 6 | UPSERT semantics | **`ON CONFLICT (id) DO UPDATE SET ... WHERE jobs.updated_at < EXCLUDED.updated_at`** | DO NOTHING was the original draft — caught during review as a real bug (PG would never get patch updates after initial create). The `WHERE updated_at <` clause is OCC belt-and-suspenders against a race with the orchestrator's normal patch landing newer state |

---

## Architecture

### Three-layer integration

```
1. packages/api/src/jobStorePostgres.ts  →  add upsert() method (ON CONFLICT DO UPDATE)
2. packages/api/src/queues.ts            →  add pgBackfill queue to QueueBundle
3. packages/api/src/jobStoreDual.ts      →  on mirror fail, enqueue { jobId } instead of console.warn
4. packages/api/src/cron/pgBackfill.ts   →  NEW — Worker that reconciles via Redis-read + PG-upsert
5. packages/api/src/routes/healthz.ts    →  extend to expose pg-backfill queue depth
6. packages/api/src/index.ts             →  wire pgBackfillWorker into shutdown
```

### Data flow — happy path

```
POST /api/jobs
  → DualWriteJobStore.create(job)
      → redis.create(job)               ✓ (5ms)
      → pg.create(job)                  ✓ (15ms)
  → reply 201 { jobId }
  → orchestrator picks up via queue events
  → ...lifecycle patches happen, both Redis and PG updated synchronously...
  → user opens /history → PG sees the row → ✅
```

### Data flow — PG hiccup with successful retry

```
POST /api/jobs
  → DualWriteJobStore.create(job)
      → redis.create(job)               ✓
      → pg.create(job)                  ✗ ECONNRESET (PG restarting)
      → catch → pgBackfillQueue.add('reconcile', { jobId }, {
                  jobId,                        // dedupe key
                  attempts: 5,
                  backoff: { type: 'exponential', delay: 5_000 },
                  removeOnComplete: { count: 100 },
                  removeOnFail: { count: 50 },
                })
  → reply 201 { jobId }                 ← USER UNAFFECTED

  ... 5 seconds later ...
  pgBackfillWorker dequeues:
    → redis.get(jobId)                  ✓ (current state, possibly already patched by orchestrator)
    → pg.upsert(currentState)           ✓ ON CONFLICT (id) DO UPDATE — PG now has the row
  → job complete in queue, history vault sees it ✅
```

### Data flow — PG sustained outage, retry exhaustion → DLQ

```
... PG is down for > 5 minutes ...

pgBackfillWorker attempts 1-5 all fail (4 backoff intervals between 5 attempts: 5+10+20+40 = 75s total wait time)
  → BullMQ moves job to `failed` queue
  → Worker's failed listener fires:
      console.error('[CRITICAL] pg-backfill DLQ: jobId={jobId} attempts={n} lastError={msg}. ' +
                    'Manual reconcile required after PG recovery.');

  ... operator notices via /healthz queue depth or log alerts ...
  ... after PG recovers, manual recovery: ...
       node scripts/reconcile-dlq.mjs    (out of scope for v1; future tooling)
```

In v1 the DLQ recovery is manual (one-shot script invocation per incident). Phase 2 follow-up adds a periodic sweep that ALSO catches edge cases like "process crashed between Redis write and BullMQ enqueue" — see Non-Goals + Future Expansions.

---

## Component Specs

### 1. `jobStorePostgres.ts` — new `upsert()` method

```typescript
// New method on the JobStore returned by makePostgresJobStore.
// Used ONLY by pg-backfill worker; the dual-write hot path keeps using create()
// (ON CONFLICT DO NOTHING — idempotent for the rare case of replay) and patch().
async upsert(job: Job): Promise<void> {
  const userId = await resolveUserId(job);
  if (!userId) return;  // anonymous — same skip semantics as create()
  await pool.query(
    `INSERT INTO jobs
       (id, user_id, parent_job_id, status, stage, input,
        crawl_result_uri, storyboard_uri, video_url, fallbacks,
        error, credits_charged, created_at, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6::jsonb,
        $7, $8, $9, $10::jsonb,
        $11, $12, to_timestamp($13 / 1000.0), to_timestamp($14 / 1000.0))
     ON CONFLICT (id) DO UPDATE SET
       status            = EXCLUDED.status,
       stage             = EXCLUDED.stage,
       crawl_result_uri  = EXCLUDED.crawl_result_uri,
       storyboard_uri    = EXCLUDED.storyboard_uri,
       video_url         = EXCLUDED.video_url,
       fallbacks         = EXCLUDED.fallbacks,
       error             = EXCLUDED.error,
       updated_at        = EXCLUDED.updated_at
     WHERE jobs.updated_at < EXCLUDED.updated_at`,
    [...same param list as create()...],
  );
}
```

**`WHERE jobs.updated_at < EXCLUDED.updated_at` matters** — guarantees "newer state wins". If a normal patch lands in PG between the original failure and the backfill execution, backfill's read of Redis will produce equal-or-newer state and the WHERE clause prevents a stale Redis read from regressing PG. Belt-and-suspenders against a theoretical multi-worker race.

The existing `create()` and `patch()` methods are NOT modified — `create()` keeps `ON CONFLICT DO NOTHING` semantics for the hot path (idempotent for client retry); only `upsert()` does the merge.

### 2. `queues.ts` — extend `QueueBundle`

```typescript
export interface QueueBundle {
  crawl: Queue;
  storyboard: Queue;
  render: Queue;
  retention: Queue;
  pgBackfill: Queue;     // NEW
  crawlEvents: QueueEvents;
  storyboardEvents: QueueEvents;
  renderEvents: QueueEvents;
}

// In makeQueueBundle:
pgBackfill: new Queue('pg-backfill', { connection: connection as any }),

// In closeQueueBundle:
b.pgBackfill.close(),
```

No `defaultJobOptions` on this queue — every enqueue specifies its own retry config so it's explicit at the call site.

### 3. `jobStoreDual.ts` — replace fire-and-forget with enqueue

```typescript
export interface DualWriteOptions {
  primary: JobStore;
  mirror: JobStore;
  pgBackfillQueue: Queue;   // NEW — required, not optional (no silent-drop fallback)
}

export function makeDualWriteJobStore(opts: DualWriteOptions): JobStore {
  const { primary, mirror, pgBackfillQueue } = opts;
  const enqueueRetry = (op: 'create' | 'patch', jobId: string, err: unknown) => {
    console.warn(`[jobStoreDual] ${op} mirror failed for ${jobId}; enqueued retry:`, (err as Error)?.message ?? err);
    void pgBackfillQueue.add(
      'reconcile',
      { jobId },
      {
        jobId,                                    // dedup: one retry slot per app jobId
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    ).catch((enqueueErr) => {
      // pathological case: Redis (which backs BullMQ) is also down
      console.error(`[jobStoreDual] ${op} retry-enqueue ALSO failed for ${jobId}:`, enqueueErr);
    });
  };

  return {
    async create(job) {
      await primary.create(job);
      try { await mirror.create(job); }
      catch (err) { enqueueRetry('create', job.jobId, err); }
    },
    async get(jobId) { return primary.get(jobId); },
    async patch(jobId, patch, updatedAt, expectedStatus?) {
      await primary.patch(jobId, patch, updatedAt, expectedStatus);
      try { await mirror.patch(jobId, patch, updatedAt, expectedStatus); }
      catch (err) { enqueueRetry('patch', jobId, err); }
    },
  };
}
```

The old `onMirrorError` optional callback is removed — the queue is now mandatory infrastructure, not an opt-in observer.

### 4. `cron/pgBackfill.ts` — new file (mirrors `cron/retentionCron.ts` structure)

```typescript
import { Worker, type Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobStore } from '../jobStore.js';

export interface PgBackfillWorkerOpts {
  queue: Queue;             // for completion / failed events
  connection: Redis;
  primary: JobStore;        // Redis source of truth
  mirror: JobStore;         // Postgres target with upsert()
}

export function startPgBackfillWorker(opts: PgBackfillWorkerOpts): Worker {
  const worker = new Worker<{ jobId: string }>(
    'pg-backfill',
    async (job) => {
      const { jobId } = job.data;
      // Read CURRENT Redis state — avoids create-vs-patch ordering races
      const current = await opts.primary.get(jobId);
      if (!current) {
        // Redis TTL expired or job was deleted — nothing to reconcile
        console.warn(`[pg-backfill] jobId=${jobId} no longer in Redis; abandoning reconcile`);
        return;
      }
      // Cast required because JobStore interface doesn't expose upsert();
      // mirror is known to be a Postgres impl with the new method.
      await (opts.mirror as JobStore & { upsert: (j: typeof current) => Promise<void> })
        .upsert(current);
    },
    {
      connection: opts.connection as never,
      concurrency: 4,
      lockDuration: 60_000,
    },
  );

  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 0)) {
      // CRITICAL marker — greppable for future log-aggregator alerts
      console.error(
        `[CRITICAL] pg-backfill DLQ: jobId=${job.data.jobId} attempts=${job.attemptsMade} lastError=${err.message}. ` +
        `Manual reconcile required after PG recovery.`,
      );
    }
  });

  return worker;
}
```

### 5. `routes/healthz.ts` (extends current `/healthz` in `app.ts`)

The existing `/healthz` is `app.get('/healthz', async () => ({ ok: true }));`. Extend to:

```typescript
app.get('/healthz', async () => {
  const counts = await pgBackfillQueue.getJobCounts('waiting', 'delayed', 'failed');
  return {
    ok: true,
    pgBackfill: {
      waiting: counts.waiting,
      delayed: counts.delayed,
      failed: counts.failed,
    },
  };
});
```

Health check stays a 200 even when queue depth is high — operators consume the JSON to gauge severity. (Promoting "queue depth > N" to a 503 would require a hardcoded threshold per environment; defer to future capacity-planning work.)

### 6. `apps/api/src/index.ts` — wire it all together

```typescript
// After makeQueueBundle, before makeDualWriteJobStore:
const dualStore = makeDualWriteJobStore({
  primary: redisStore,
  mirror: pgStore,
  pgBackfillQueue: queues.pgBackfill,    // NEW required dep
});

// New worker startup, after orchestrator + retentionWorker:
let pgBackfillWorker: Worker | null = null;
if (authEnabled && pgPoolForCredits) {   // same guard as retention
  pgBackfillWorker = startPgBackfillWorker({
    queue: queues.pgBackfill,
    connection: redis,
    primary: redisStore,
    mirror: pgStore,
  });
}

// Shutdown sequence (extends existing):
const shutdown = async () => {
  await app.close();
  await stopOrchestrator();
  if (retentionWorker) await retentionWorker.close();
  if (pgBackfillWorker) await pgBackfillWorker.close();   // NEW
  await closeBroker();
  await closeQueueBundle(queues);
  if (shutdownPool) await shutdownPool();
  await redis.quit();
  process.exit(0);
};
```

---

## Files Changed

| File | Action | Note |
|---|---|---|
| `apps/api/src/jobStorePostgres.ts` | Modify — add `upsert()` method | ON CONFLICT DO UPDATE with `WHERE updated_at <` OCC guard |
| `apps/api/src/jobStoreDual.ts` | Modify — replace fire-and-forget with enqueue | `pgBackfillQueue` becomes required ctor dep |
| `apps/api/src/queues.ts` | Modify — extend `QueueBundle` with `pgBackfill: Queue` | mirrors retention queue pattern |
| `apps/api/src/cron/pgBackfill.ts` | **Create** — `startPgBackfillWorker()` | mirrors `cron/retentionCron.ts` structure |
| `apps/api/src/app.ts` | Modify — `/healthz` gains `pgBackfill` queue counts | also need to plumb queue ref through `BuildOpts` |
| `apps/api/src/index.ts` | Modify — wire dual-write deps + worker startup + shutdown | small additive changes |
| `apps/api/tests/jobStoreDual.test.ts` | **Create** — first-ever test for DualWriteJobStore | enqueue-on-fail behavior + happy path |
| `apps/api/tests/cron/pgBackfill.test.ts` | **Create** — worker reconciliation tests | mock primary/mirror, verify upsert called with current Redis state |
| `apps/api/tests/jobStorePostgres.test.ts` | Modify — add `upsert()` tests | ON CONFLICT DO UPDATE behavior + WHERE clause OCC guard |
| `apps/api/tests/app.test.ts` | Modify — `/healthz` shape assertion | new fields present |
| `apps/api/DESIGN.md` | Modify — document the eventual-consistency contract | new responsibility entry + new anti-pattern (#9 below) |

**Pre-commit hook will fire** for changes under `apps/api/src/{jobStore*.ts,queues.ts,cron/,app.ts,index.ts}` — `apps/api/DESIGN.md` MUST be staged in the same commit.

---

## DESIGN.md updates

Add to `apps/api/DESIGN.md` Responsibilities:

> - **PG-mirror eventual consistency (`cron/pgBackfill.ts`)** — `DualWriteJobStore` enqueues a reconcile job to `pg-backfill` BullMQ queue when the Postgres mirror write fails. Worker reads current Redis state and upserts to PG (`ON CONFLICT (id) DO UPDATE SET ... WHERE jobs.updated_at < EXCLUDED.updated_at`). Exhausted retries log `[CRITICAL] pg-backfill DLQ: ...` for future log-aggregator alerts. Queue depth exposed on `/healthz`.

Add a new anti-pattern #9 to `apps/api/DESIGN.md`:

> ### 9. 對 PG mirror 失敗用 fire-and-forget log-and-continue
> Pre-Spec(#2 fix) 寫法 `try { await mirror.write(); } catch { console.warn(); }` 是 phantom job 災難的源頭：使用者付了錢、影片真的跑出來，但 history vault 永遠看不到。**任何 mirror 寫入失敗必須丟進 `pg-backfill` retry queue**（BullMQ + 5 attempts exponential + dedup by jobId），絕不可純 log 後 continue。Worker 透過讀 Redis 當下狀態 + PG upsert 達成最終一致性，避開 create-vs-patch 順序競爭。

---

## Testing Strategy

### Unit (mocked deps)

```typescript
// jobStoreDual.test.ts (new)
describe('DualWriteJobStore', () => {
  it('forwards create to primary; on mirror fail, enqueues reconcile with jobId', async () => {
    const primary = { create: vi.fn(), get: vi.fn(), patch: vi.fn() };
    const mirror = { create: vi.fn().mockRejectedValue(new Error('ECONNRESET')), ... };
    const queueAdd = vi.fn().mockResolvedValue(undefined);
    const queue = { add: queueAdd } as never;
    const store = makeDualWriteJobStore({ primary, mirror, pgBackfillQueue: queue });
    await store.create(sampleJob);
    expect(primary.create).toHaveBeenCalledWith(sampleJob);
    expect(queueAdd).toHaveBeenCalledWith(
      'reconcile',
      { jobId: sampleJob.jobId },
      expect.objectContaining({ jobId: sampleJob.jobId, attempts: 5 }),
    );
  });
  it('does not enqueue when mirror succeeds', async () => { ... });
  it('still throws when primary fails (no swallow)', async () => { ... });
  // analogous tests for patch()
});

// pgBackfill.test.ts (new)
describe('pgBackfillWorker', () => {
  it('reads current Redis state and calls mirror.upsert', async () => { ... });
  it('skips reconcile and warns when Redis no longer has the job (TTL expired)', async () => { ... });
  it('emits [CRITICAL] log on attemptsMade >= attempts', async () => { ... });
});

// jobStorePostgres.test.ts (extend existing)
describe('upsert', () => {
  it('inserts when row does not exist', async () => { ... });
  it('updates when row exists AND incoming updated_at is newer', async () => { ... });
  it('does NOT update when row exists AND incoming updated_at is older (OCC guard)', async () => { ... });
});
```

### Integration

The integration test that would prove the most: simulate PG outage during a real job lifecycle. This is hard to do without mocking pg.Pool itself — the tests above + DLQ behavior coverage are sufficient for v1.

---

## Non-Goals (explicit out-of-scope)

- **Phase 2 sweep job** that periodically scans Redis `job:*` keys and back-fills any PG misses — addresses the "process crashed between Redis write and BullMQ enqueue" edge case. Designed but deferred (see Future Expansions).
- **Slack/PagerDuty alerting** — `[CRITICAL]` log marker is the v1 hand-off; real alerting depends on Spec 4's Pino + log-aggregator pipeline.
- **DLQ recovery tooling** (`scripts/reconcile-dlq.mjs`) — operator manually re-queues from BullMQ failed list for v1; if DLQ accumulation becomes a recurring incident, build proper tooling.
- **Promoting `/healthz` to 503 when queue depth > N** — requires per-env capacity planning; v1 just exposes the count for operator inspection.
- **Migrating `credit_transactions.job_id` to a real FK** — would have caught the bug at SQL level by failing the credit insert; but adding the FK risks breaking the existing credit-debit-before-job-create order. Out of scope; revisit when financial reconciliation tooling is built.

---

## Future Expansions (not committed)

| Feature | Trigger to revisit |
|---|---|
| Periodic Redis-↔-PG sweep (Phase 2 safety net) | When DLQ frequency > 1/week, or before SLA contract that promises history-vault completeness |
| Pino structured logging + correlation IDs | Spec 4 (already in tech-debt backlog as #4) |
| `pnpm lume status` surfaces pg-backfill queue depth | When operators report manually `curl /healthz`-ing too often |
| Auto-DLQ-recovery cron after PG recovers | When manual DLQ recovery becomes operational toil |

---

## Rollout Safety

All changes are additive at the data layer:
- Existing `create()` and `patch()` methods on `jobStorePostgres` are unchanged — `upsert()` is a new method
- `DualWriteJobStore` constructor signature changes (now requires `pgBackfillQueue`) — every call site is in `apps/api/src/index.ts`, single update
- New BullMQ queue `pg-backfill` is namespaced — does not collide with existing crawl/storyboard/render/retention queues
- DESIGN.md updates flag the new responsibility for future maintainers

Failure modes during rollout itself:
- **First deploy with empty `pg-backfill` queue**: nothing in queue → worker idles, no behavior change for happy-path traffic
- **Deploy DURING a PG outage**: enqueue path activates immediately, retry kicks in once PG recovers → data consistency restored without manual intervention
- **Rollback**: simple `git revert` of the 1 commit; old fire-and-forget behavior returns. No schema changes to roll back.
