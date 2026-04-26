# Spec 3: Architecture Boundary — Design Document

## Goal

Enforce three architectural boundaries that have drifted from the documented design, without changing any observable user-facing behaviour:

1. **R2** — `workers/storyboard` holds a direct PostgreSQL connection for Anthropic spend-guard. Workers must not touch PG (CLAUDE.md iron law).
2. **R6** — `apps/web` Route Handlers run complex PG SQL that belongs in `apps/api`. The web tier's PG pool must become NextAuth-only.
3. **R7** — `retentionCron` uses `setInterval` — unsafe when `apps/api` scales horizontally because each instance fires its own timer.

## Architecture: Three-Task Design

Each task maps to one R-item and is independently deployable and testable.

---

## Task 1 — R2: Storyboard Worker PG Isolation

### Current state

`workers/storyboard/src/index.ts:44–50` creates a `Pool` when `BUDGET_GUARD_ENABLED=true`, passes it as `spendGuardPool` to `generateStoryboard()`. Inside the generator's retry loop, two PG operations fire:

- `assertBudgetAvailable(pool)` — pre-Claude, SELECT FOR UPDATE on `system_limits`
- `recordSpend(pool, usage)` — post-Claude, UPDATE accumulated daily cost

Both functions live in `workers/storyboard/src/anthropic/spendGuard.ts`, violating the "Worker禁止直連 PostgreSQL" iron law.

### Chosen approach: Orchestrator gates + aggregate spend via job return value

```
Before                                  After
──────                ────────────────────────────────────────────
storyboard worker                       orchestrator (apps/api)
  ├─ assertBudgetAvailable(pool) ✗        ├─ crawl:completed handler
  └─ recordSpend(pool, usage)    ✗        │    └─ assertBudgetAvailable({ pool: creditPool })
                                          └─ storyboard:completed handler
                                               └─ recordSpend({ pool: creditPool },
                                                              ev.returnvalue.anthropicUsage)

storyboard worker (after)
  └─ generateStoryboard() → { storyboard, anthropicUsage: { aggregated across all attempts } }
     zero DATABASE_URL · zero BUDGET_GUARD_ENABLED · zero Pool dependency
```

### Trade-off: per-attempt vs. aggregate recording

Currently `recordSpend` fires inside the retry loop — each Claude attempt is recorded immediately. After migration, spend is recorded once when the orchestrator receives `storyboard:completed`. The aggregated `anthropicUsage` returned by the worker accumulates token counts across all retry attempts, so total spend is still correctly recorded. Intermediate failed attempts that don't produce a `storyboard:completed` event will have their spend omitted — acceptable, because the guard is a catastrophic-overspend brake (~$25/day cap), not a penny-accurate ledger. Maximum undercount per job = `MAX_ATTEMPTS × ~$0.05 ≈ $0.15`.

### `assertBudgetAvailable` call site

Called in the `crawl:completed` handler immediately before `queues.storyboard.add()`. This means one budget check per job, not per retry. Also acceptable — the guard prevents runaway job submission, not intra-job overspend.

### File-level changes

| Action | Path |
|---|---|
| Create | `apps/api/src/credits/spendGuard.ts` |
| Create | `apps/api/src/credits/anthropicPricing.ts` |
| Modify | `workers/storyboard/src/generator.ts` |
| Modify | `workers/storyboard/src/index.ts` |
| Modify | `apps/api/src/orchestrator/index.ts` |
| Delete | `workers/storyboard/src/anthropic/spendGuard.ts` |

`workers/storyboard/src/anthropic/pricing.ts` is **kept** — `claudeClient.ts` imports `ClaudeUsage` from it; it is not a PG boundary violation (no DB access). The `ClaudeUsage` interface in `apps/api/src/credits/anthropicPricing.ts` is structurally identical (TypeScript structural typing makes them assignable). The `anthropicUsage` field in the BullMQ job return value is typed as `unknown` in the orchestrator's event handler and cast to the local `ClaudeUsage` type.

### New files

**`apps/api/src/credits/anthropicPricing.ts`**

Standalone copy of token-to-USD math. Mirrors the storyboard worker's `pricing.ts` — duplication is accepted because the boundary enforcement (no shared mutable state, no runtime import across process boundaries) outweighs the DRY concern.

```typescript
export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function rate(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function totalCostUsd(usage: ClaudeUsage): number {
  const inRate  = rate('CLAUDE_INPUT_RATE_USD_PER_MTOK', 3);
  const outRate = rate('CLAUDE_OUTPUT_RATE_USD_PER_MTOK', 15);
  return (
    ((usage.input_tokens ?? 0) / 1_000_000) * inRate +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * inRate * 0.1 +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * inRate * 1.25 +
    ((usage.output_tokens ?? 0) / 1_000_000) * outRate
  );
}
```

**`apps/api/src/credits/spendGuard.ts`**

Direct copy of the two functions from the storyboard worker's `spendGuard.ts`, with imports updated to point to the local `anthropicPricing.ts`. API is identical — only import paths change.

### Modified files (key diffs only)

**`workers/storyboard/src/generator.ts`**

Remove `spendGuardPool` from `GenerateInput`. Remove `assertBudgetAvailable` and `recordSpend` calls. Add `anthropicUsage` accumulator across attempts. Return `anthropicUsage` in the `'ok'` result:

```typescript
// GenerateInput: remove spendGuardPool field

// GenerateResult:
type GenerateResult =
  | { kind: 'ok'; storyboard: Storyboard; anthropicUsage: ClaudeUsage }
  | { kind: 'error'; message: string; attempts: number };

// Inside retry loop: accumulate instead of record
let accUsage: ClaudeUsage = { input_tokens: 0, output_tokens: 0 };
// after each resp:
accUsage = {
  input_tokens: accUsage.input_tokens + resp.usage.input_tokens,
  output_tokens: accUsage.output_tokens + resp.usage.output_tokens,
  cache_read_input_tokens: (accUsage.cache_read_input_tokens ?? 0) + (resp.usage.cache_read_input_tokens ?? 0),
  cache_creation_input_tokens: (accUsage.cache_creation_input_tokens ?? 0) + (resp.usage.cache_creation_input_tokens ?? 0),
};

// Final return:
return { kind: 'ok', storyboard, anthropicUsage: accUsage };
```

**`workers/storyboard/src/index.ts`**

Remove `spendGuardPool`, `budgetGuardEnabled`, and the `import('pg')` block. Remove `spendGuardPool` from `generateStoryboard()` call. Add `anthropicUsage` to the BullMQ job return value:

```typescript
// Before
return { storyboardUri };

// After
return { storyboardUri, anthropicUsage: res.anthropicUsage };
```

**`apps/api/src/orchestrator/index.ts`**

```typescript
// Import at top:
import { assertBudgetAvailable, recordSpend } from '../credits/spendGuard.js';
import type { ClaudeUsage } from '../credits/anthropicPricing.js';

// In crawl:completed handler, before queues.storyboard.add():
if (cfg.creditPool) {
  try {
    await assertBudgetAvailable({ pool: cfg.creditPool });
  } catch (err) {
    if ((err as { code?: string }).code === 'STORYBOARD_BUDGET_EXCEEDED') {
      const patch = reduceEvent(current, { kind: 'storyboard:failed',
        error: { code: 'BUDGET_EXCEEDED', message: (err as Error).message } });
      await applyPatch(jobId, patch, current.status);
      return;
    }
    throw err;
  }
}

// In storyboard:completed handler:
const anthropicUsage = (ev.returnvalue as { anthropicUsage?: ClaudeUsage }).anthropicUsage;
if (cfg.creditPool && anthropicUsage) {
  await recordSpend({ pool: cfg.creditPool }, anthropicUsage).catch((err) =>
    console.error('[orchestrator] recordSpend failed:', err),
  );
}
```

### Tests

| File | New tests |
|---|---|
| `apps/api/tests/spendGuard.test.ts` (create) | `assertBudgetAvailable` — passes when under cap; throws BudgetExceededError when over; resets counter at UTC midnight |
| `workers/storyboard/tests/generator.test.ts` (modify) | `generateStoryboard` returns `anthropicUsage`; no PG calls |
| `apps/api/tests/orchestrator.test.ts` (modify) | budget-exceeded path sets job to failed; recordSpend called with aggregated usage on storyboard:completed |

---

## Task 2 — R6: apps/web DB Decoupling (RSC-first)

### Current state

Two Route Handlers in `apps/web` run business-logic PG queries:
- `apps/web/src/app/api/users/me/jobs/route.ts` — 120-line SQL with JOINs, filters, pagination
- `apps/web/src/app/api/users/me/credits/route.ts` — credit + tier snapshot

The Route Handlers are called by two `'use client'` components:
- `HistoryGrid` — initial load + load-more + filter changes via client-side `fetch`
- `UsageIndicator` — re-fetches on navigation

### Chosen approach: RSC pre-fetch + thin JWT proxy for client incremental loads

The SQL logic moves to `apps/api`. Two new endpoints are added. The Route Handlers become thin JWT-proxy wrappers (~15 lines each) needed to serve `HistoryGrid`'s and `UsageIndicator`'s client-side incremental fetches. The initial page render uses RSC pre-fetch, eliminating the first-paint client waterfall.

```
Initial page load (history/page.tsx, Server Component):
  await auth() → userId → signInternalToken(userId)
  fetch(`${API_URL}/api/users/me/jobs?${searchParams}`)  ← server-to-server, no CORS
  → pass { initialJobs, initialHasMore, initialTier } to <HistoryGrid />

Client incremental (load-more, filter change):
  HistoryGrid.fetch('/api/users/me/jobs?...')            ← browser → Next.js Route Handler
  Route Handler: signInternalToken(userId) → fetch(API_URL/api/users/me/jobs)  ← JWT proxy
  apps/api Route Handler: runs SQL, returns JSON

Nav credit indicator (UsageIndicator):
  Similar — layout.tsx passes initialCredits as prop;
  re-fetches through /api/users/me/credits JWT proxy on navigation.
```

### Why thin proxy Route Handlers still exist

`HistoryGrid` uses `useState`/`useEffect` and must remain a Client Component to support:
- Filter state changes without full page reload
- Cursor-based load-more (append to existing list)

Client Components cannot call apps/api directly (cross-origin, no session cookie forwarding). The Route Handler as a JWT bridge is necessary infrastructure, not business logic. The key improvement is that the 120-line SQL query moves out of apps/web entirely.

### New apps/api endpoints

**`GET /api/users/me/jobs`** (`apps/api/src/routes/getUserJobs.ts`)

Reads JWT `sub` as `userId`. Accepts same query params as the current web Route Handler: `q`, `status`, `duration`, `time`, `before`, `limit`. Runs the same query currently in apps/web, returns identical JSON shape `{ jobs: [...], hasMore: boolean, tier: string }`.

**`GET /api/users/me/credits`** (`apps/api/src/routes/getUserCredits.ts`)

Reads JWT `sub` as `userId`. Returns `{ balance, tier, allowance, activeJobs, concurrencyLimit }`. Mirrors the current web Route Handler query.

Both routes use `verifyInternalToken` (already exists) — same JWT verification as `POST /api/jobs`.

**`apps/api/src/app.ts`**: register both routes with `requireUserIdHeader: true` (JWT mandatory).

### apps/web changes

**`apps/web/src/app/history/page.tsx`** (Server Component — already RSC):

```typescript
// Read search params (Next.js 15 passes as props)
export default async function HistoryPage({ searchParams }: { searchParams: URLSearchParams }) {
  // ... auth check unchanged ...
  const userId = (session.user as { id?: string }).id!;
  const token = await signInternalToken(userId);
  const params = new URLSearchParams(Object.fromEntries(searchParams));
  params.set('limit', '24');
  const { API_BASE: apiUrl } = await import('../../../lib/config');
  const res = await fetch(`${apiUrl}/api/users/me/jobs?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const { jobs = [], hasMore = false, tier = 'free' } = res.ok ? await res.json() : {};
  return <main …><HistoryGrid initialJobs={jobs} initialHasMore={hasMore} initialTier={tier} /></main>;
}
```

**`apps/web/src/components/HistoryGrid.tsx`**: accept `initialJobs`, `initialHasMore`, `initialTier` props; use them to seed `useState` (skip initial fetch if props present):

```typescript
export function HistoryGrid({
  initialJobs = [],
  initialHasMore = false,
  initialTier = 'free',
}: { initialJobs?: HistoryJob[]; initialHasMore?: boolean; initialTier?: 'free'|'pro'|'max' }) {
  const [state, setState] = useState<FetchState>({
    jobs: initialJobs,
    hasMore: initialHasMore,
    loading: initialJobs.length === 0,  // skip initial fetch if pre-loaded
    loadingMore: false,
    error: null,
    tier: initialTier,
  });
  // useEffect initial fetch: runs only when initialJobs.length === 0
```

**`apps/web/src/app/layout.tsx`** (Server Component): fetch initial credits server-side and pass to `UsageIndicator`:

```typescript
// Near top of RootLayout (async Server Component):
const session = await auth?.();
let initialCredits: CreditsSnapshot | null = null;
if (session?.user) {
  const userId = (session.user as { id?: string }).id;
  if (userId) {
    const token = await signInternalToken(userId);
    const { API_BASE } = await import('../lib/config');
    const r = await fetch(`${API_BASE}/api/users/me/credits`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).catch(() => null);
    if (r?.ok) initialCredits = await r.json();
  }
}
// …
<UsageIndicator initialCredits={initialCredits} />
```

**`apps/web/src/components/UsageIndicator.tsx`**: accept `initialCredits` prop; skip initial fetch if provided.

**`apps/web/src/app/api/users/me/jobs/route.ts`**: replace 120-line SQL with JWT proxy:

```typescript
export async function GET(request: Request) {
  if (!isAuthEnabled() || !auth) return NextResponse.json({ error: 'auth_disabled' }, { status: 404 });
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  const userId = (session.user as { id?: string }).id!;
  const token = await signInternalToken(userId);
  const { searchParams } = new URL(request.url);
  const { API_BASE: apiUrl } = await import('../../../lib/config');
  const upstream = await fetch(`${apiUrl}/api/users/me/jobs?${searchParams}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}
```

**`apps/web/src/app/api/users/me/credits/route.ts`**: identical thin proxy pattern.

**`apps/web/src/lib/pg.ts`**: add a note that this pool is NextAuth-only post-R6; business queries are prohibited here.

### Env var (no new var needed)

`NEXT_PUBLIC_API_BASE` already exists in `apps/web/src/lib/config.ts` and is used by `POST /api/jobs/create`. Server-side RSC fetches and proxy Route Handlers import `API_BASE` from `lib/config.ts` directly — no new env var required.

### Tests

| File | New tests |
|---|---|
| `apps/api/tests/getUserJobs.test.ts` (create) | Returns 401 without JWT; returns 200 with jobs array for valid JWT; pagination works |
| `apps/api/tests/getUserCredits.test.ts` (create) | Returns 401 without JWT; returns correct snapshot for valid JWT |
| `apps/web/src/components/HistoryGrid.test.tsx` (modify, if exists) | Renders with initialJobs without making a fetch call |

---

## Task 3 — R7: Retention Cron Distributed Lock (BullMQ Repeatable Job)

### Current state

`apps/api/src/index.ts:123–125` calls `startRetentionCron({ pool, s3 })` which uses `setInterval(24h)`. With N instances of apps/api, N parallel retention runs fire simultaneously — creating race conditions on S3 delete and redundant PG DELETEs.

### Chosen approach: BullMQ Repeatable Job

BullMQ Repeatable Jobs are deduplicated in Redis at the queue level. No matter how many apps/api instances are running, BullMQ ensures exactly one job fires per schedule period and exactly one worker processes it.

```
apps/api startup (all N instances):
  queues.retention.add('daily-cleanup', {}, { repeat: { pattern: '0 3 * * *' }, jobId: 'retention-daily' })
  ← BullMQ deduplicates by (queue, jobId, repeat key) — only one entry in Redis

BullMQ retention Worker (runs in each apps/api instance):
  ← exactly one instance gets the job lock
  ← calls runRetentionOnce(pool, s3)
  ← other instances: worker is idle during this window
```

The `jobId: 'retention-daily'` static key ensures `queue.add()` on startup is idempotent — calling it N times from N instances doesn't create N repeatable job entries.

### File-level changes

| Action | Path |
|---|---|
| Modify | `apps/api/src/queues.ts` |
| Modify | `apps/api/src/cron/retentionCron.ts` |
| Modify | `apps/api/src/index.ts` |

### Modified files

**`apps/api/src/queues.ts`** — add retention queue to `QueueBundle`:

```typescript
export interface QueueBundle {
  crawl: Queue; storyboard: Queue; render: Queue; retention: Queue;
  crawlEvents: QueueEvents; storyboardEvents: QueueEvents; renderEvents: QueueEvents;
}

export function makeQueueBundle(connection: Redis): QueueBundle {
  const opts = { connection: connection as any, defaultJobOptions: JOB_DEFAULTS };
  return {
    crawl:    new Queue('crawl', opts),
    storyboard: new Queue('storyboard', opts),
    render:   new Queue('render', opts),
    retention: new Queue('retention', { connection: connection as any }),  // no defaultJobOptions — repeatable
    crawlEvents:      new QueueEvents('crawl',      { connection: connection as any }),
    storyboardEvents: new QueueEvents('storyboard', { connection: connection as any }),
    renderEvents:     new QueueEvents('render',     { connection: connection as any }),
  };
}

export async function closeQueueBundle(b: QueueBundle): Promise<void> {
  await Promise.all([
    b.crawl.close(), b.storyboard.close(), b.render.close(), b.retention.close(),
    b.crawlEvents.close(), b.storyboardEvents.close(), b.renderEvents.close(),
  ]);
}
```

**`apps/api/src/cron/retentionCron.ts`** — add `scheduleRetentionJob` alongside the existing `runRetentionOnce` (which stays unchanged):

```typescript
import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';

export const RETENTION_CRON_PATTERN = process.env.RETENTION_CRON_PATTERN ?? '0 3 * * *'; // 03:00 UTC daily

/**
 * Schedule the daily retention job in BullMQ.
 * Safe to call from all instances — BullMQ deduplicates by jobId.
 * Returns a Worker that processes the job; call worker.close() on shutdown.
 */
export function scheduleRetentionJob(opts: {
  queue: Queue;
  connection: Redis;
  pool: Pool;
  s3: S3Client;
  log?: Pick<typeof console, 'log' | 'error'>;
}): Worker {
  const { queue, connection, pool, s3, log = console } = opts;

  void queue.add(
    'daily-cleanup',
    {},
    {
      jobId: 'retention-daily',
      repeat: { pattern: RETENTION_CRON_PATTERN },
      removeOnComplete: { count: 7 },
      removeOnFail:     { count: 7 },
    },
  );

  // `connection` is the shared `redis` instance from index.ts (maxRetriesPerRequest: null).
  // BullMQ Workers require maxRetriesPerRequest: null — use the same connection as other Workers.
  const worker = new Worker(
    'retention',
    async (_job: Job) => {
      await runRetentionOnce(pool, s3, log);
    },
    { connection: connection as any, concurrency: 1, lockDuration: 300_000 },
  );

  worker.on('failed', (_job, err) => {
    log.error('[retentionCron] BullMQ job failed:', err);
  });

  return worker;
}
```

**`apps/api/src/index.ts`** — replace `startRetentionCron` with `scheduleRetentionJob`:

```typescript
// Remove:
let stopRetentionCron: (() => void) | null = null;
if (pricingEnabled && pgPoolForCredits) {
  stopRetentionCron = startRetentionCron({ pool: pgPoolForCredits, s3 });
}

// Add:
let retentionWorker: import('bullmq').Worker | null = null;
if (pricingEnabled && pgPoolForCredits) {
  retentionWorker = scheduleRetentionJob({
    queue: queues.retention,
    connection: redis,
    pool: pgPoolForCredits,
    s3,
  });
}

// In shutdown():
if (retentionWorker) await retentionWorker.close();
```

### Tests

| File | New tests |
|---|---|
| `apps/api/tests/retentionCron.test.ts` (modify) | `scheduleRetentionJob` calls `queue.add` with correct `jobId` and `repeat.pattern`; worker processes job by calling `runRetentionOnce` |

---

## Non-Goals

- Restructuring `HistoryGrid` to URL-based pagination (removes load-more UX) — future Spec
- Moving NextAuth DB adapter away from PG — out of scope
- Redis Lua OCC for the storyboard budget guard — not needed; single-process assertBudgetAvailable is sequential per job

## Rollout Safety

All three tasks are backward-compatible:

- **R2**: `BUDGET_GUARD_ENABLED` and `DATABASE_URL` are removed from the storyboard worker env. The guard moves to the orchestrator, gated on `pricingEnabled && creditPool` (same condition as today). No DB schema changes.
- **R6**: The two new apps/api endpoints are additive. The web Route Handlers switch to proxy mode — their response shape is identical, so no client-side changes beyond `initialJobs` prop (backward-compatible with `= []` default).
- **R7**: `scheduleRetentionJob` is idempotent. Deploying multiple instances before and after the change is safe because BullMQ deduplication prevents double-scheduling.
