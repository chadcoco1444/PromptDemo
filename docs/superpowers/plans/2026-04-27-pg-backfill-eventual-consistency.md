# PG Backfill Eventual-Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate phantom jobs by enqueuing failed PG mirror writes to a `pg-backfill` BullMQ queue whose worker reconciles by reading current Redis state and upserting to PG.

**Architecture:** 3 layers, each shippable independently. Layer 1 adds a Postgres `upsert()` method (foundational). Layer 2 stands up the queue + worker + `/healthz` exposure (worker becomes live but idle until DualWriteJobStore enqueues anything). Layer 3 flips DualWriteJobStore from fire-and-forget to enqueue-on-failure. After each commit the system is shippable; no half-built intermediate states.

**Tech Stack:** TypeScript / Postgres / Redis / BullMQ / Vitest. Pre-existing patterns from `cron/retentionCron.ts` (BullMQ Worker shape) and `jobStorePostgres.ts` (Pool query shape) are reused.

**Reference spec:** [`docs/superpowers/specs/2026-04-27-pg-backfill-eventual-consistency-design.md`](../specs/2026-04-27-pg-backfill-eventual-consistency-design.md)

---

## File Structure

| File | Action | Responsibility | Task |
|---|---|---|---|
| `apps/api/src/jobStorePostgres.ts` | Modify | Add `upsert()` method (`ON CONFLICT DO UPDATE` with `WHERE updated_at <` OCC guard) + export `JobStoreWithUpsert` interface | T1 |
| `apps/api/tests/jobStorePostgres.test.ts` | Modify | Add 3 upsert tests: insert-when-missing, update-when-newer, skip-when-older (OCC) | T1 |
| `apps/api/src/queues.ts` | Modify | Add `pgBackfill: Queue` to QueueBundle + close in `closeQueueBundle` | T2 |
| `apps/api/src/cron/pgBackfill.ts` | **Create** | `reconcilePgBackfill()` (testable processor function) + `dlqLogLine()` (testable formatter) + `startPgBackfillWorker()` (BullMQ wireup) | T2 |
| `apps/api/tests/cron/pgBackfill.test.ts` | **Create** | Tests for `reconcilePgBackfill()` (3) + `dlqLogLine()` format | T2 |
| `apps/api/src/app.ts` | Modify | Extend `/healthz` to expose `pg-backfill` queue depth; add `pgBackfillQueue` to `BuildOpts` | T2 |
| `apps/api/tests/app.test.ts` | Modify | Update `healthz returns ok` test to assert new shape | T2 |
| `apps/api/src/jobStoreDual.ts` | Modify | Replace fire-and-forget with `pgBackfillQueue.add(...)`; make `pgBackfillQueue` a required ctor dep | T3 |
| `apps/api/tests/jobStoreDual.test.ts` | **Create** | First-ever dual-write tests: enqueue-on-create-fail, enqueue-on-patch-fail, no-enqueue-on-success, primary-throw-still-throws | T3 |
| `apps/api/src/index.ts` | Modify (T2 + T3) | T2: wire pgBackfill worker startup + shutdown + pass queue to BuildOpts. T3: pass queue to `makeDualWriteJobStore`. | T2 + T3 |
| `apps/api/DESIGN.md` | Modify (T1, T2, T3) | T1: small mention in Responsibilities; T2: full responsibility entry for pg-backfill cron; T3: anti-pattern #9 | every task |

---

## Pre-commit Hook Awareness

The DESIGN.md sync hook ([`scripts/check-design-sync.mjs`](../../../scripts/check-design-sync.mjs)) **will fire** for every task in this plan because each touches files under `apps/api/src/{cron,jobStore*.ts,queues.ts,app.ts,index.ts}`. **Every task commit MUST stage `apps/api/DESIGN.md`** alongside the source change. Do NOT use `--no-verify`.

---

### Task 1: Postgres `upsert()` method

**Files:**
- Modify: `apps/api/src/jobStorePostgres.ts`
- Modify: `apps/api/tests/jobStorePostgres.test.ts`
- Modify: `apps/api/DESIGN.md` (hook-required)

- [ ] **Step 1: Read `apps/api/DESIGN.md`**

CLAUDE.md mandates reading the module's DESIGN.md before modifying its code.

Run: `cat apps/api/DESIGN.md`
Expected: prose document; locate the Responsibilities section (where T2 will later add the pg-backfill cron entry — for T1 just take a small mention).

- [ ] **Step 2: Read existing `jobStorePostgres.test.ts` to confirm test fixture pattern**

Run: `cat apps/api/tests/jobStorePostgres.test.ts | head -60`
Expected: tests use a real `pg.Pool` against `DATABASE_URL`. Note the `beforeAll` setup that inserts a test user + the cleanup in `afterAll`. New upsert tests follow the same pattern.

- [ ] **Step 3: Write 3 failing upsert tests**

Append to the bottom of `apps/api/tests/jobStorePostgres.test.ts` (inside the existing top-level `describe('jobStorePostgres')` if the file uses one; otherwise after the last `describe`):

```typescript
describe('upsert', () => {
  const baseJob = (overrides: Partial<Job> = {}): Job => ({
    jobId: `upsert-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'queued' as const,
    stage: null,
    progress: 0,
    input: { url: 'https://example.com', intent: 'test', duration: 30 as const },
    fallbacks: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  });

  it('inserts when row does not exist', async () => {
    const job = baseJob();
    await store.upsert(job);
    const row = await store.get(job.jobId);
    expect(row?.status).toBe('queued');
  });

  it('updates when row exists AND incoming updated_at is newer', async () => {
    const job = baseJob();
    await store.create(job);
    const updated = { ...job, status: 'done' as const, updatedAt: job.updatedAt + 1000 };
    await store.upsert(updated);
    const row = await store.get(job.jobId);
    expect(row?.status).toBe('done');
  });

  it('does NOT update when row exists AND incoming updated_at is older (OCC guard)', async () => {
    const job = baseJob({ status: 'done' });
    await store.create(job);
    // Stale write attempt — older updated_at
    const stale = { ...job, status: 'queued' as const, updatedAt: job.updatedAt - 1000 };
    await store.upsert(stale);
    const row = await store.get(job.jobId);
    expect(row?.status).toBe('done');  // unchanged
  });
});
```

If the test file uses a top-level `store` from `beforeAll`, reuse it. If it builds the store per-test, follow that pattern. Read the file first.

- [ ] **Step 4: Run the 3 new tests — verify they fail**

```bash
docker compose -f docker-compose.dev.yaml up -d postgres   # ensure PG is up
pnpm --filter @lumespec/api test jobStorePostgres
```

Expected: 3 new failures with TypeError or "store.upsert is not a function".

- [ ] **Step 5: Add the `JobStoreWithUpsert` interface and `upsert()` method**

Edit `apps/api/src/jobStorePostgres.ts`. After the existing `import { JobStore }` line, add the interface export:

```typescript
export interface JobStoreWithUpsert extends JobStore {
  /**
   * Idempotent reconciliation write — used by pg-backfill worker to land Redis state
   * into PG without depending on whether the row exists. Optimistic concurrency:
   * `WHERE jobs.updated_at < EXCLUDED.updated_at` prevents stale Redis reads from
   * regressing newer PG state during multi-worker races.
   */
  upsert(job: Job): Promise<void>;
}
```

Change the `makePostgresJobStore` return-type annotation from `JobStore` to `JobStoreWithUpsert`. Then inside the returned object (after `patch`), add:

```typescript
    async upsert(job) {
      const userId = await resolveUserId(job);
      if (!userId) return;
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
        [
          job.jobId,
          userId,
          job.parentJobId ?? null,
          job.status,
          job.stage,
          JSON.stringify(job.input),
          job.crawlResultUri ?? null,
          job.storyboardUri ?? null,
          job.videoUrl ?? null,
          JSON.stringify(job.fallbacks ?? []),
          job.error ? JSON.stringify(job.error) : null,
          0,
          job.createdAt,
          job.updatedAt,
        ],
      );
    },
```

- [ ] **Step 6: Run the upsert tests — verify they pass**

```bash
pnpm --filter @lumespec/api test jobStorePostgres
```

Expected: all tests pass (existing + 3 new). The OCC guard test is the most likely to surface a SQL bug (e.g., if `WHERE` clause is missing or the column reference is wrong).

- [ ] **Step 7: Run full apps/api typecheck (catches `JobStoreWithUpsert` import issues)**

```bash
pnpm --filter @lumespec/api typecheck
```

Expected: zero errors.

- [ ] **Step 8: Update `apps/api/DESIGN.md`**

Find the Responsibilities section. Add a one-line entry near the existing job-store mention:

```markdown
- **PG mirror reconciliation primitive (`jobStorePostgres.upsert()`)** — idempotent INSERT-or-UPDATE used by `pg-backfill` worker (added in T2) to land current Redis state into PG. OCC-guarded by `WHERE jobs.updated_at < EXCLUDED.updated_at` so stale reads can't regress PG state.
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/jobStorePostgres.ts apps/api/tests/jobStorePostgres.test.ts apps/api/DESIGN.md
git commit -m "$(cat <<'EOF'
feat(api): add jobStorePostgres.upsert() with OCC guard for pg-backfill

Foundational primitive for the upcoming pg-backfill reconciliation worker
(spec: 2026-04-27-pg-backfill-eventual-consistency-design). Idempotent
INSERT-or-UPDATE; the WHERE jobs.updated_at < EXCLUDED.updated_at clause
prevents a backfill worker reading stale Redis state from regressing
newer PG state during a race with the orchestrator's normal patch.

JobStoreWithUpsert interface exported so the worker (T2) can type its
mirror dep without casting; existing JobStore consumers untouched.

3 integration tests added: insert-when-missing, update-when-newer,
skip-when-older (OCC guard). Real PG required (DATABASE_URL).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook **passes** (`apps/api/DESIGN.md` is staged alongside `src/jobStorePostgres.ts`).

---

### Task 2: pg-backfill queue + worker + `/healthz` exposure + wire into `index.ts`

**Files:**
- Modify: `apps/api/src/queues.ts`
- Create: `apps/api/src/cron/pgBackfill.ts`
- Create: `apps/api/tests/cron/pgBackfill.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/tests/app.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/DESIGN.md` (hook-required)

After this task lands, the worker is live and consuming from `pg-backfill` queue, but `DualWriteJobStore` still doesn't enqueue anything (T3 does that). System behaviour is unchanged for traffic; the worker simply idles. This is intentional — Task 2 is shippable on its own.

- [ ] **Step 1: Re-read `apps/api/DESIGN.md` if not fresh in context**

Run: `cat apps/api/DESIGN.md | head -80`
Expected: confirm where T1 added the upsert mention; T2 will add a second responsibility entry near it.

- [ ] **Step 2: Add `pgBackfill` to `QueueBundle` (`apps/api/src/queues.ts`)**

Edit `apps/api/src/queues.ts`. Add `pgBackfill: Queue;` to the interface:

```typescript
export interface QueueBundle {
  crawl: Queue;
  storyboard: Queue;
  render: Queue;
  retention: Queue;
  pgBackfill: Queue;
  crawlEvents: QueueEvents;
  storyboardEvents: QueueEvents;
  renderEvents: QueueEvents;
}
```

In `makeQueueBundle`, after the `retention:` line, add:

```typescript
    pgBackfill: new Queue('pg-backfill', { connection: connection as any }),
```

In `closeQueueBundle`, add `b.pgBackfill.close(),` to the `Promise.all` array (next to `b.retention.close()`).

- [ ] **Step 3: Write the failing test for `reconcilePgBackfill()` and `dlqLogLine()`**

Create `apps/api/tests/cron/pgBackfill.test.ts`:

```typescript
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
  it('reads current Redis state and calls mirror.upsert with it', async () => {
    const primary: Pick<JobStore, 'get'> = { get: vi.fn().mockResolvedValue(sampleJob) };
    const mirror: Pick<JobStoreWithUpsert, 'upsert'> = { upsert: vi.fn().mockResolvedValue(undefined) };
    await reconcilePgBackfill(sampleJob.jobId, primary as JobStore, mirror as JobStoreWithUpsert);
    expect(primary.get).toHaveBeenCalledWith(sampleJob.jobId);
    expect(mirror.upsert).toHaveBeenCalledWith(sampleJob);
  });

  it('skips upsert and warns when Redis no longer has the job (TTL expired)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const primary: Pick<JobStore, 'get'> = { get: vi.fn().mockResolvedValue(null) };
    const mirror: Pick<JobStoreWithUpsert, 'upsert'> = { upsert: vi.fn() };
    await reconcilePgBackfill('missing-jobid', primary as JobStore, mirror as JobStoreWithUpsert);
    expect(mirror.upsert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing-jobid'));
    warnSpy.mockRestore();
  });

  it('propagates upsert errors so BullMQ retry can fire', async () => {
    const primary: Pick<JobStore, 'get'> = { get: vi.fn().mockResolvedValue(sampleJob) };
    const mirror: Pick<JobStoreWithUpsert, 'upsert'> = {
      upsert: vi.fn().mockRejectedValue(new Error('PG still down')),
    };
    await expect(
      reconcilePgBackfill(sampleJob.jobId, primary as JobStore, mirror as JobStoreWithUpsert),
    ).rejects.toThrow('PG still down');
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
```

- [ ] **Step 4: Run the failing test — verify import error**

```bash
pnpm --filter @lumespec/api test cron/pgBackfill
```

Expected: 4 failures referencing `Cannot find module '../../src/cron/pgBackfill'`.

- [ ] **Step 5: Implement `apps/api/src/cron/pgBackfill.ts`**

Create the file:

```typescript
import { Worker, type Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobStore } from '../jobStore.js';
import type { JobStoreWithUpsert } from '../jobStorePostgres.js';

/**
 * Pure reconciliation function — reads CURRENT Redis state and writes via PG upsert.
 * Extracted as a named export so it's testable without spinning up a BullMQ Worker.
 *
 * Reading Redis at execution time (rather than replaying the failed write payload)
 * sidesteps create-vs-patch ordering races: if the orchestrator landed a normal
 * patch into PG between the original failure and this retry, the OCC guard inside
 * upsert() (WHERE jobs.updated_at < EXCLUDED.updated_at) prevents regression.
 */
export async function reconcilePgBackfill(
  jobId: string,
  primary: JobStore,
  mirror: JobStoreWithUpsert,
): Promise<void> {
  const current = await primary.get(jobId);
  if (!current) {
    console.warn(`[pg-backfill] jobId=${jobId} no longer in Redis; abandoning reconcile`);
    return;
  }
  await mirror.upsert(current);
}

/**
 * Greppable critical log marker for exhausted retries. Future Spec 4 (Pino +
 * log aggregator) wires this into Slack / PagerDuty alerts.
 */
export function dlqLogLine(jobId: string, attempts: number, lastError: string): string {
  return (
    `[CRITICAL] pg-backfill DLQ: jobId=${jobId} attempts=${attempts} lastError=${lastError}. ` +
    `Manual reconcile required after PG recovery.`
  );
}

export interface PgBackfillWorkerOpts {
  connection: Redis;
  primary: JobStore;
  mirror: JobStoreWithUpsert;
}

/**
 * Boots the BullMQ Worker that consumes the `pg-backfill` queue.
 * Returns the Worker so the caller can close it during graceful shutdown.
 */
export function startPgBackfillWorker(opts: PgBackfillWorkerOpts): Worker {
  const worker = new Worker<{ jobId: string }>(
    'pg-backfill',
    async (job) => reconcilePgBackfill(job.data.jobId, opts.primary, opts.mirror),
    {
      connection: opts.connection as never,
      concurrency: 4,
      lockDuration: 60_000,
    },
  );

  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 0)) {
      console.error(dlqLogLine(job.data.jobId, job.attemptsMade, err.message));
    }
  });

  return worker;
}
```

- [ ] **Step 6: Run the test — verify all 4 pass**

```bash
pnpm --filter @lumespec/api test cron/pgBackfill
```

Expected: 4 tests pass (3 reconcile + 1 dlqLogLine).

- [ ] **Step 7: Extend `/healthz` (`apps/api/src/app.ts`) — add `pgBackfillQueue` to BuildOpts**

Edit `apps/api/src/app.ts`. In the `BuildOpts` interface, add (after the `pgPool?` field):

```typescript
  /**
   * When set, /healthz exposes pg-backfill queue depth (waiting + delayed + failed)
   * as an operator-visible health signal. Omit to hide the field.
   */
  pgBackfillQueue?: Queue | null;
```

Replace the existing `app.get('/healthz', async () => ({ ok: true }));` line with:

```typescript
  app.get('/healthz', async () => {
    if (!opts.pgBackfillQueue) {
      return { ok: true };
    }
    const counts = await opts.pgBackfillQueue.getJobCounts('waiting', 'delayed', 'failed');
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

- [ ] **Step 8: Update the `healthz returns ok` test (`apps/api/tests/app.test.ts`)**

Find the existing test at around line 133-150:

```typescript
  it('healthz returns ok', async () => {
    const store = makeJobStore(new RedisMock() as any);
    // ... existing build() call without pgBackfillQueue ...
    const r = await app.inject({ method: 'GET', url: '/healthz' });
    expect(r.json()).toEqual({ ok: true });
    await app.close();
  });
```

Augment by adding a SECOND test directly below it (do NOT modify the original — it asserts the queue-less default still returns `{ ok: true }`):

```typescript
  it('healthz exposes pg-backfill queue depth when pgBackfillQueue is provided', async () => {
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    const crawl = { add: vi.fn().mockResolvedValue({ id: 'q' }) } as any;
    const storyboard = { add: vi.fn().mockResolvedValue({ id: 'q2' }) } as any;
    const pgBackfillQueue = {
      getJobCounts: vi.fn().mockResolvedValue({ waiting: 2, delayed: 1, failed: 0 }),
    } as any;
    const app = await build({
      store,
      crawlQueue: crawl,
      storyboardQueue: storyboard,
      broker,
      fetchJson: async () => null,
      creditPool: null,
      pgBackfillQueue,
      logger: false,
    });
    const r = await app.inject({ method: 'GET', url: '/healthz' });
    expect(r.json()).toEqual({
      ok: true,
      pgBackfill: { waiting: 2, delayed: 1, failed: 0 },
    });
    expect(pgBackfillQueue.getJobCounts).toHaveBeenCalledWith('waiting', 'delayed', 'failed');
    await app.close();
  });
```

- [ ] **Step 9: Run /healthz tests — verify both pass**

```bash
pnpm --filter @lumespec/api test app.test
```

Expected: existing `healthz returns ok` still passes (queue-less default), new `healthz exposes pg-backfill queue depth` passes.

- [ ] **Step 10: Wire pg-backfill worker startup + shutdown into `apps/api/src/index.ts`**

Edit `apps/api/src/index.ts`:

(a) Add the import near the existing `import { scheduleRetentionJob } ...` line:

```typescript
import { startPgBackfillWorker } from './cron/pgBackfill.js';
```

(b) Inside the `if (authEnabled) { ... }` block — find the `const pgStore = makePostgresJobStore(...)` line. After the existing logic that constructs `store = makeDualWriteJobStore({ primary: redisStore, mirror: pgStore })`, the worker startup needs both `redisStore` and `pgStore`. Hoist them into the outer scope. Change:

```typescript
let store: JobStore;
let shutdownPool: (() => Promise<void>) | null = null;
let pgPoolForCredits: import('pg').Pool | null = null;
```

To:

```typescript
let store: JobStore;
let shutdownPool: (() => Promise<void>) | null = null;
let pgPoolForCredits: import('pg').Pool | null = null;
let redisStoreForBackfill: JobStore | null = null;
let pgStoreForBackfill: import('./jobStorePostgres.js').JobStoreWithUpsert | null = null;
```

Inside the `if (authEnabled)` block, after `const pgStore = makePostgresJobStore({...})` and `const redisStore = makeJobStore(redis)`, add:

```typescript
  redisStoreForBackfill = redisStore;
  pgStoreForBackfill = pgStore;
```

(c) Pass `pgBackfillQueue` to `build({...})` — update the `await build({...})` call:

```typescript
const app = await build({
  store,
  crawlQueue: queues.crawl,
  storyboardQueue: queues.storyboard,
  broker,
  fetchJson,
  rateLimitPerMinute: cfg.RATE_LIMIT_PER_MINUTE,
  requireUserIdHeader: authEnabled,
  creditPool: pricingEnabled ? pgPoolForCredits : null,
  apiKeyPool: pricingEnabled ? pgPoolForCredits : null,
  pgPool: authEnabled ? pgPoolForCredits : null,
  pgBackfillQueue: authEnabled ? queues.pgBackfill : null,
});
```

(d) After the existing `let retentionWorker: ... = null; if (pricingEnabled && pgPoolForCredits) { ... }` block, add the pg-backfill worker startup:

```typescript
let pgBackfillWorker: import('bullmq').Worker | null = null;
if (authEnabled && redisStoreForBackfill && pgStoreForBackfill) {
  pgBackfillWorker = startPgBackfillWorker({
    connection: redis,
    primary: redisStoreForBackfill,
    mirror: pgStoreForBackfill,
  });
}
```

(e) Add to the `shutdown` function — between `if (retentionWorker) await retentionWorker.close();` and `await closeBroker();`:

```typescript
  if (pgBackfillWorker) await pgBackfillWorker.close();
```

- [ ] **Step 11: Run typecheck + full apps/api tests**

```bash
pnpm --filter @lumespec/api typecheck
pnpm --filter @lumespec/api test
```

Expected: typecheck zero errors; all existing tests still pass + the 4 new pgBackfill + 1 new healthz tests pass.

- [ ] **Step 12: Update `apps/api/DESIGN.md`**

In the Responsibilities section, add (near where T1 added the `upsert()` mention):

```markdown
- **PG mirror eventual-consistency cron (`cron/pgBackfill.ts`)** — BullMQ Worker on the `pg-backfill` queue. When `DualWriteJobStore` (T3) catches a PG mirror write failure, it enqueues `{ jobId }` to this queue. Worker reads CURRENT Redis state via `primary.get()` and writes to PG via `mirror.upsert()`. Retry config: `attempts: 5, backoff: exponential(5_000)` — total max wait 75s before DLQ. Exhausted retries log `[CRITICAL] pg-backfill DLQ: ...` (greppable for future log-aggregator alerts). Queue depth (waiting / delayed / failed) exposed on `GET /healthz`.
```

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/queues.ts apps/api/src/cron/pgBackfill.ts apps/api/tests/cron/pgBackfill.test.ts apps/api/src/app.ts apps/api/tests/app.test.ts apps/api/src/index.ts apps/api/DESIGN.md
git commit -m "$(cat <<'EOF'
feat(api): pg-backfill queue + worker + /healthz exposure (T2 of #2)

Stand up the reconciliation infrastructure that T3 will start using.
After this commit the worker is LIVE and consuming the pg-backfill
queue, but DualWriteJobStore is still fire-and-forget — so the queue
sits empty and the worker idles. Behavior is unchanged for traffic;
this is the deliberate intermediate state that lets each task ship
independently.

Components:
  - QueueBundle.pgBackfill (Redis queue, no defaultJobOptions; retry
    config is at the call site for explicitness)
  - cron/pgBackfill.ts: reconcilePgBackfill() (testable processor) +
    dlqLogLine() (testable formatter) + startPgBackfillWorker() (BullMQ
    wireup)
  - /healthz exposes { ok, pgBackfill: { waiting, delayed, failed } }
    when pgBackfillQueue is plumbed through BuildOpts; bare { ok: true }
    otherwise (preserves existing test contract)
  - index.ts: worker startup gated on authEnabled + dual-write store
    construction; close() in graceful-shutdown sequence

Tests:
  - 3 unit tests for reconcilePgBackfill (happy path, missing Redis
    state, error propagation for retry)
  - 1 unit test for dlqLogLine format
  - 1 new /healthz test asserting queue-depth shape

Spec: docs/superpowers/specs/2026-04-27-pg-backfill-eventual-consistency-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook **passes** (`apps/api/DESIGN.md` is staged alongside the source changes).

---

### Task 3: `DualWriteJobStore` enqueue-on-failure

**Files:**
- Modify: `apps/api/src/jobStoreDual.ts`
- Create: `apps/api/tests/jobStoreDual.test.ts`
- Modify: `apps/api/src/index.ts` (pass queue to `makeDualWriteJobStore`)
- Modify: `apps/api/DESIGN.md` (hook-required)

After this commit the full system is live: PG mirror failures get enqueued, the (already-running from T2) worker dequeues and reconciles via Redis-read + upsert.

- [ ] **Step 1: Re-read `apps/api/src/jobStoreDual.ts`**

Run: `cat apps/api/src/jobStoreDual.ts`
Expected: confirms current shape — `DualWriteOptions` has `primary, mirror, onMirrorError?`; the catch blocks call `handleMirrorErr` which just logs.

- [ ] **Step 2: Write failing tests for `DualWriteJobStore` enqueue behavior**

Create `apps/api/tests/jobStoreDual.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run the failing tests — verify mismatch**

```bash
pnpm --filter @lumespec/api test jobStoreDual
```

Expected: type / shape errors because `DualWriteOptions` doesn't yet have `pgBackfillQueue`. Some tests may pass accidentally (e.g., the success-path tests if they don't require the queue), but the enqueue-on-fail tests will fail because the current code calls `handleMirrorErr`, not `queue.add`.

- [ ] **Step 4: Rewrite `apps/api/src/jobStoreDual.ts`**

Replace the entire file with:

```typescript
import type { Queue } from 'bullmq';
import type { JobStore } from './jobStore.js';
import type { Job } from './model/job.js';

/**
 * DualWriteJobStore — primary (Redis) is source of truth, mirror (Postgres) is
 * eventual-consistency target. When the mirror write fails, we enqueue a
 * reconciliation job to `pg-backfill` instead of swallowing the error. The
 * worker (cron/pgBackfill.ts) reads current Redis state and upserts to PG.
 *
 * Why required, not optional: prior to Spec #2 fix, the queue was an
 * optional onMirrorError callback that no caller wired up — silent log-and-
 * continue was the source of phantom jobs. Making the queue a required ctor
 * dep fails fast at startup if it isn't plumbed through.
 */
export interface DualWriteOptions {
  primary: JobStore;
  mirror: JobStore;
  pgBackfillQueue: Queue;
}

const RETRY_CONFIG = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

export function makeDualWriteJobStore(opts: DualWriteOptions): JobStore {
  const { primary, mirror, pgBackfillQueue } = opts;

  const enqueueRetry = (op: 'create' | 'patch', jobId: string, err: unknown) => {
    console.warn(
      `[jobStoreDual] ${op} mirror failed for ${jobId}; enqueued retry:`,
      (err as Error)?.message ?? err,
    );
    void pgBackfillQueue
      .add('reconcile', { jobId }, { jobId, ...RETRY_CONFIG })
      .catch((enqueueErr) => {
        // Pathological case: the Redis backing BullMQ is also down.
        console.error(
          `[jobStoreDual] ${op} retry-enqueue ALSO failed for ${jobId}:`,
          enqueueErr,
        );
      });
  };

  return {
    async create(job: Job) {
      await primary.create(job);
      try {
        await mirror.create(job);
      } catch (err) {
        enqueueRetry('create', job.jobId, err);
      }
    },
    async get(jobId: string) {
      return primary.get(jobId);
    },
    async patch(jobId, patch, updatedAt, expectedStatus?) {
      await primary.patch(jobId, patch, updatedAt, expectedStatus);
      try {
        await mirror.patch(jobId, patch, updatedAt, expectedStatus);
      } catch (err) {
        enqueueRetry('patch', jobId, err);
      }
    },
  };
}
```

The previously-public `onMirrorError` callback is removed; no caller used it.

- [ ] **Step 5: Run dual-write tests — verify all 6 pass**

```bash
pnpm --filter @lumespec/api test jobStoreDual
```

Expected: all 6 tests pass.

- [ ] **Step 6: Update `apps/api/src/index.ts` to pass `pgBackfillQueue` to `makeDualWriteJobStore`**

Edit `apps/api/src/index.ts`. Find:

```typescript
    store = makeDualWriteJobStore({ primary: redisStore, mirror: pgStore });
```

Replace with:

```typescript
    store = makeDualWriteJobStore({
      primary: redisStore,
      mirror: pgStore,
      pgBackfillQueue: queues.pgBackfill,
    });
```

Note: `queues` is constructed at line 57 via `makeQueueBundle(redis)`, BEFORE the `if (authEnabled)` block (line 31). But the dual-write construction happens INSIDE the `if (authEnabled)` block. To pass `queues.pgBackfill` into the dual-write constructor, the `makeQueueBundle` call needs to move BEFORE the `if (authEnabled)` block.

Reorder: cut the `const queues = makeQueueBundle(redis);` line (currently around line 57) and paste it immediately after `const redis = new Redis(...)` (around line 16), before the `if (authEnabled)` block.

- [ ] **Step 7: Run full apps/api typecheck + tests**

```bash
pnpm --filter @lumespec/api typecheck
pnpm --filter @lumespec/api test
```

Expected: zero typecheck errors; all tests pass (existing + new T1 upsert + T2 pgBackfill + T3 dual-write).

- [ ] **Step 8: Update `apps/api/DESIGN.md` — add anti-pattern #9**

Find the `🚫 反模式 (Anti-Patterns)` section and append:

```markdown
### 9. 對 PG mirror 失敗用 fire-and-forget log-and-continue
Pre-Spec(#2 fix) 寫法 `try { await mirror.write(); } catch { console.warn(); }` 是 phantom job 災難的源頭：使用者付了錢、影片真的跑出來，但 history vault 永遠看不到。**任何 mirror 寫入失敗必須丟進 `pg-backfill` retry queue**（BullMQ + 5 attempts exponential + dedup by jobId），絕不可純 log 後 continue。Worker 透過讀 Redis 當下狀態 + PG upsert 達成最終一致性，避開 create-vs-patch 順序競爭。
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/jobStoreDual.ts apps/api/tests/jobStoreDual.test.ts apps/api/src/index.ts apps/api/DESIGN.md
git commit -m "$(cat <<'EOF'
feat(api): DualWriteJobStore enqueues retry on mirror fail (T3 of #2)

Replaces fire-and-forget log-and-continue with required pg-backfill
queue enqueue. After this commit the full eventual-consistency loop is
live — PG mirror hiccups now produce a queued retry instead of a
silently-dropped write.

Wiring:
  - DualWriteOptions: pgBackfillQueue is now required (was optional
    onMirrorError callback that nobody used)
  - Retry config (5 attempts, exponential 5s backoff, dedup by jobId)
    embedded as a const; max wait before DLQ ~75s
  - index.ts: makeQueueBundle hoisted before the if (authEnabled) block
    so queues.pgBackfill can be passed into makeDualWriteJobStore

Tests:
  - 6 unit tests covering create/patch happy path, mirror-fail enqueue,
    primary-fail still throws, get reads from primary only

Anti-pattern #9 added to apps/api/DESIGN.md codifies the rule for
future maintainers: never fire-and-forget on PG mirror failures.

Closes the P1 prod-release blocker from the remaining-tech-debt backlog.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook **passes** (`apps/api/DESIGN.md` is staged).

---

## Verification Checklist (after Task 3)

| Check | Command / Action | Expected |
|---|---|---|
| Schema upsert lands cleanly | `pnpm --filter @lumespec/api test jobStorePostgres` | 3 new upsert tests pass + existing pass |
| Worker function isolated | `pnpm --filter @lumespec/api test cron/pgBackfill` | 4 tests pass |
| Healthz queue depth wired | `pnpm --filter @lumespec/api test app.test` | Both `healthz returns ok` + `healthz exposes pg-backfill queue depth` pass |
| Dual-write enqueue contract | `pnpm --filter @lumespec/api test jobStoreDual` | 6 tests pass |
| Full apps/api green | `pnpm --filter @lumespec/api test` | All packages ≥ baseline counts |
| Typecheck zero errors | `pnpm --filter @lumespec/api typecheck` | clean |
| Full monorepo green | `pnpm test` | all packages pass |
| Manual smoke test | Start `pnpm lume start`, POST /api/jobs, watch logs for `[jobStoreDual]` and `pg-backfill` references | None on healthy path; on simulated PG outage, retries fire and recover |
| All 3 commits land cleanly | `git log --oneline -3` | T1 → T2 → T3, all signed-off, none used `--no-verify` |

---

## Rollback

Each task is a single commit and purely additive:
- T1: revert if `upsert()` causes any unrelated `jobStorePostgres` test breakage. Worker (T2) hasn't shipped yet, so no consumer.
- T2: revert if worker startup interferes with apps/api boot. T1 stays — its addition is unused but doesn't hurt anything.
- T3: revert if dual-write enqueue causes a regression in the hot path. T2 stays — the worker idles until anyone enqueues. System reverts to fire-and-forget log-and-continue (i.e., the original phantom-job behavior).
