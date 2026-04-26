# State Machine Correctness (R1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-layer defense (transition guard + Postgres OCC) to prevent stale BullMQ events from overwriting terminal job status and causing refund leaks.

**Architecture:** Layer 1 — `stateMachine.ts` VALID_EVENTS guard returns `null` for invalid/stale events; Layer 2 — `jobStorePostgres.ts` adds `WHERE status = $expectedStatus` so DB rejects concurrent stale writes. `orchestrator/index.ts` wires both layers together with warn logging.

**Tech Stack:** TypeScript, Vitest, pg (PostgreSQL), ioredis-mock

---

## File Map

| Action | Path |
|---|---|
| Modify | `apps/api/src/orchestrator/stateMachine.ts` |
| Modify | `apps/api/src/jobStore.ts` |
| Modify | `apps/api/src/jobStorePostgres.ts` |
| Modify | `apps/api/src/jobStoreDual.ts` |
| Modify | `apps/api/src/orchestrator/index.ts` |
| Modify | `apps/api/tests/stateMachine.test.ts` |
| Create | `apps/api/tests/jobStorePostgres.test.ts` |

---

### Task 1: State Machine Transition Guard

**Files:**
- Modify: `apps/api/src/orchestrator/stateMachine.ts`
- Modify: `apps/api/tests/stateMachine.test.ts`

- [ ] **Step 1: Write failing tests for the guard (terminal states + wrong-stage)**

Add to `apps/api/tests/stateMachine.test.ts` after the existing `describe` block:

```typescript
describe('reduceEvent — transition guard (new)', () => {
  it('returns null for any event when status is done (terminal)', () => {
    const job = { ...base, status: 'done' as const };
    expect(reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any })).toBeNull();
    expect(reduceEvent(job, { kind: 'render:failed', error: { code: 'E', message: 'm', retryable: false } })).toBeNull();
    expect(reduceEvent(job, { kind: 'crawl:active' })).toBeNull();
  });

  it('returns null for any event when status is failed (terminal)', () => {
    const job = { ...base, status: 'failed' as const };
    expect(reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any })).toBeNull();
    expect(reduceEvent(job, { kind: 'crawl:active' })).toBeNull();
  });

  it('returns null for wrong-stage event (render:completed while generating)', () => {
    const job = { ...base, status: 'generating' as const };
    expect(reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any })).toBeNull();
  });

  it('returns null for wrong-stage event (crawl:active while rendering)', () => {
    const job = { ...base, status: 'rendering' as const };
    expect(reduceEvent(job, { kind: 'crawl:active' })).toBeNull();
  });

  it('returns patch for valid transition: queued → crawl:active', () => {
    const job = { ...base, status: 'queued' as const };
    const patch = reduceEvent(job, { kind: 'crawl:active' });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('crawling');
  });

  it('returns patch for valid transition: rendering → render:completed', () => {
    const job = { ...base, status: 'rendering' as const };
    const patch = reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('done');
  });

  it('returns patch for valid transition: waiting_render_slot → render:active', () => {
    const job = { ...base, status: 'waiting_render_slot' as const };
    const patch = reduceEvent(job, { kind: 'render:active' });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('rendering');
  });
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
cd apps/api && pnpm test --reporter=verbose tests/stateMachine.test.ts
```

Expected: new `describe` block's tests all FAIL with TypeScript error or `null` not returned.

- [ ] **Step 3: Implement VALID_EVENTS guard in `stateMachine.ts`**

Replace the entire file with:

```typescript
import type { Job, JobStatus } from '../model/job.js';
import type { S3Uri } from '@lumespec/schema';

export type OrchestratorEvent =
  | { kind: 'crawl:active'; progress?: number }
  | { kind: 'crawl:completed'; crawlResultUri: S3Uri }
  | { kind: 'crawl:failed'; error: { code: string; message: string; retryable: boolean } }
  | { kind: 'storyboard:active'; progress?: number }
  | { kind: 'storyboard:completed'; storyboardUri: S3Uri; canRender: boolean }
  | { kind: 'storyboard:failed'; error: { code: string; message: string; retryable: boolean } }
  | { kind: 'render:active'; progress?: number }
  | { kind: 'render:completed'; videoUrl: S3Uri }
  | { kind: 'render:failed'; error: { code: string; message: string; retryable: boolean } };

const VALID_EVENTS: Partial<Record<JobStatus, ReadonlySet<OrchestratorEvent['kind']>>> = {
  queued:              new Set(['crawl:active', 'crawl:failed']),
  crawling:            new Set(['crawl:active', 'crawl:completed', 'crawl:failed']),
  generating:          new Set(['storyboard:active', 'storyboard:completed', 'storyboard:failed']),
  waiting_render_slot: new Set(['render:active', 'render:completed', 'render:failed']),
  rendering:           new Set(['render:active', 'render:completed', 'render:failed']),
  // done / failed: absent → terminal states, all events return null
};

export function reduceEvent(job: Job, ev: OrchestratorEvent): Partial<Job> | null {
  if (!VALID_EVENTS[job.status]?.has(ev.kind)) return null;

  switch (ev.kind) {
    case 'crawl:active':
      return { status: 'crawling', stage: 'crawl', progress: ev.progress ?? 0 };
    case 'crawl:completed':
      return {
        status: 'generating',
        stage: 'storyboard',
        progress: 0,
        crawlResultUri: ev.crawlResultUri,
      };
    case 'crawl:failed':
      return { status: 'failed', error: ev.error };
    case 'storyboard:active':
      return { status: 'generating', stage: 'storyboard', progress: ev.progress ?? 0 };
    case 'storyboard:completed':
      return {
        status: ev.canRender ? 'rendering' : 'waiting_render_slot',
        stage: 'render',
        progress: 0,
        storyboardUri: ev.storyboardUri,
      };
    case 'storyboard:failed':
      return { status: 'failed', error: ev.error };
    case 'render:active':
      return { status: 'rendering', stage: 'render', progress: ev.progress ?? 0 };
    case 'render:completed':
      return { status: 'done', progress: 100, videoUrl: ev.videoUrl };
    case 'render:failed':
      return { status: 'failed', error: ev.error };
  }
}
```

- [ ] **Step 4: Fix existing stateMachine tests to use correct source status**

The existing tests all use `base` (`status: 'queued'`) but some events are only valid from other statuses. Replace the existing `describe('reduceEvent')` block (lines 16–70) with:

```typescript
describe('reduceEvent', () => {
  it('crawl started → crawling stage', () => {
    const job = { ...base, status: 'queued' as const };
    const patch = reduceEvent(job, { kind: 'crawl:active' });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('crawling');
    expect(patch!.stage).toBe('crawl');
    expect(patch!.progress).toBe(0);
  });

  it('crawl done → generating stage with URI stored', () => {
    const job = { ...base, status: 'crawling' as const }; // crawl:completed valid from crawling
    const patch = reduceEvent(job, {
      kind: 'crawl:completed',
      crawlResultUri: 's3://b/k/crawl.json' as any,
    });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('generating');
    expect(patch!.stage).toBe('storyboard');
    expect(patch!.crawlResultUri).toBe('s3://b/k/crawl.json');
  });

  it('storyboard done + render has capacity → rendering', () => {
    const job = { ...base, status: 'generating' as const };
    const patch = reduceEvent(job, {
      kind: 'storyboard:completed',
      storyboardUri: 's3://b/k/sb.json' as any,
      canRender: true,
    });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('rendering');
    expect(patch!.stage).toBe('render');
    expect(patch!.storyboardUri).toBe('s3://b/k/sb.json');
  });

  it('storyboard done + render full → waiting_render_slot', () => {
    const job = { ...base, status: 'generating' as const };
    const patch = reduceEvent(job, {
      kind: 'storyboard:completed',
      storyboardUri: 's3://b/k/sb.json' as any,
      canRender: false,
    });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('waiting_render_slot');
    expect(patch!.stage).toBe('render');
  });

  it('render done → done with videoUrl', () => {
    const job = { ...base, status: 'rendering' as const };
    const patch = reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('done');
    expect(patch!.videoUrl).toBe('s3://b/k/v.mp4');
    expect(patch!.progress).toBe(100);
  });

  it('any failed event → failed with error', () => {
    const job = { ...base, status: 'crawling' as const };
    const patch = reduceEvent(job, {
      kind: 'crawl:failed',
      error: { code: 'CRAWL_ALL_TRACKS_FAILED', message: 'no dice', retryable: false },
    });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('failed');
    expect(patch!.error).toBeDefined();
  });
});
```

- [ ] **Step 5: Run all stateMachine tests — expect all pass**

```bash
cd apps/api && pnpm test --reporter=verbose tests/stateMachine.test.ts
```

Expected: all tests PASS (original 6 + new 7 = 13 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orchestrator/stateMachine.ts apps/api/tests/stateMachine.test.ts
git commit -m "feat(api): add VALID_EVENTS transition guard to stateMachine — returns null for stale/terminal events"
```

---

### Task 2: JobStore Interface + Redis Store

**Files:**
- Modify: `apps/api/src/jobStore.ts`

- [ ] **Step 1: Update interface and Redis implementation**

Replace the entire `apps/api/src/jobStore.ts` with:

```typescript
import type { Redis } from 'ioredis';
import { JobSchema, type Job } from './model/job.js';
import type { JobStatus } from './model/job.js';

const TTL_SECONDS = 7 * 24 * 3600;

export interface JobStore {
  create(job: Job): Promise<void>;
  get(jobId: string): Promise<Job | null>;
  patch(
    jobId: string,
    patch: Partial<Job>,
    updatedAt: number,
    expectedStatus?: JobStatus,
  ): Promise<void>;
}

function key(jobId: string): string {
  return `job:${jobId}`;
}

export function makeJobStore(redis: Redis): JobStore {
  return {
    async create(job) {
      await redis.set(key(job.jobId), JSON.stringify(job), 'EX', TTL_SECONDS);
    },
    async get(jobId) {
      const raw = await redis.get(key(jobId));
      if (!raw) return null;
      const parsed = JobSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    },
    async patch(jobId, patch, updatedAt, _expectedStatus?) {
      const raw = await redis.get(key(jobId));
      if (!raw) throw new Error(`job not found: ${jobId}`);
      const current = JobSchema.parse(JSON.parse(raw));
      const merged = { ...current, ...patch, updatedAt };
      const parsed = JobSchema.parse(merged);
      await redis.set(key(jobId), JSON.stringify(parsed), 'KEEPTTL');
    },
  };
}
```

- [ ] **Step 2: Run existing jobStore tests — expect all pass (backward compat)**

```bash
cd apps/api && pnpm test --reporter=verbose tests/jobStore.test.ts
```

Expected: all 4 tests PASS. The `_expectedStatus?` param is optional, existing calls without it still work.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/jobStore.ts
git commit -m "feat(api): add optional expectedStatus to JobStore.patch interface + Redis impl (no-op)"
```

---

### Task 3: DualWriteJobStore — Forward expectedStatus

**Files:**
- Modify: `apps/api/src/jobStoreDual.ts`

- [ ] **Step 1: Update patch() to forward expectedStatus**

Replace the `patch` method in `apps/api/src/jobStoreDual.ts` (lines 46–53):

```typescript
    async patch(jobId, patch, updatedAt, expectedStatus?) {
      await primary.patch(jobId, patch, updatedAt, expectedStatus); // Redis — must succeed
      try {
        await mirror.patch(jobId, patch, updatedAt, expectedStatus); // Postgres — fire-and-forget
      } catch (err) {
        handleMirrorErr(err, 'patch', jobId);
      }
    },
```

- [ ] **Step 2: Run full API test suite to confirm no regressions**

```bash
cd apps/api && pnpm test --reporter=verbose
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/jobStoreDual.ts
git commit -m "feat(api): forward expectedStatus through DualWriteJobStore.patch to both stores"
```

---

### Task 4: Postgres OCC (Layer 2)

**Files:**
- Modify: `apps/api/src/jobStorePostgres.ts`
- Create: `apps/api/tests/jobStorePostgres.test.ts`

**Prerequisite:** PostgreSQL container must be running:
```bash
docker compose -f docker-compose.dev.yaml up -d postgres
```

- [ ] **Step 1: Write failing Postgres OCC tests**

Create `apps/api/tests/jobStorePostgres.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { makePostgresJobStore } from '../src/jobStorePostgres.js';
import type { Job } from '../src/model/job.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lumespec:lumespec@localhost:5432/lumespec';

let pool: Pool;

const sample: Job = {
  jobId: 'pg-occ-test-001',
  status: 'rendering',
  stage: 'render',
  progress: 50,
  input: { url: 'https://example.com', intent: 'test', duration: 30 },
  fallbacks: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  // Ensure test row doesn't exist from a previous run
  await pool.query('DELETE FROM jobs WHERE id = $1', [sample.jobId]);

  // Insert a minimal user row if needed (jobs.user_id FK)
  // For OCC tests we use resolveUserId returning null (anonymous) to skip FK constraint
});

afterAll(async () => {
  await pool.query('DELETE FROM jobs WHERE id = $1', [sample.jobId]);
  await pool.end();
});

describe('jobStorePostgres — OCC patch', () => {
  it('applies patch when no expectedStatus provided (unconditional — backward compat)', async () => {
    const store = makePostgresJobStore({ pool, resolveUserId: async () => null });
    await store.create(sample);
    // No expectedStatus — legacy unconditional update (skipped when userId is null)
    // OCC test uses direct pool query to set up then test patch directly
    await pool.query(
      `INSERT INTO jobs (id, user_id, status, stage, input, fallbacks, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4::jsonb, $5::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = $2`,
      [sample.jobId, 'rendering', 'render', JSON.stringify(sample.input), JSON.stringify([])],
    );

    // patch without expectedStatus — must succeed regardless of current status
    await store.patch(sample.jobId, { status: 'done', progress: 100 }, Date.now());

    const r = await pool.query('SELECT status FROM jobs WHERE id = $1', [sample.jobId]);
    expect(r.rows[0].status).toBe('done');
  });

  it('applies patch when expectedStatus matches current DB status', async () => {
    // Reset to 'rendering'
    await pool.query('UPDATE jobs SET status = $1 WHERE id = $2', ['rendering', sample.jobId]);
    const store = makePostgresJobStore({ pool, resolveUserId: async () => null });

    await store.patch(sample.jobId, { status: 'done', progress: 100 }, Date.now(), 'rendering');

    const r = await pool.query('SELECT status FROM jobs WHERE id = $1', [sample.jobId]);
    expect(r.rows[0].status).toBe('done');
  });

  it('blocks patch and emits warn when expectedStatus does not match (OCC)', async () => {
    // Row is now 'done' (terminal) — simulate stale render:failed arriving late
    const store = makePostgresJobStore({ pool, resolveUserId: async () => null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await store.patch(
      sample.jobId,
      { status: 'failed', error: { code: 'RENDER_FAILED', message: 'late', retryable: false } },
      Date.now(),
      'rendering', // wrong — DB is now 'done'
    );

    const r = await pool.query('SELECT status FROM jobs WHERE id = $1', [sample.jobId]);
    expect(r.rows[0].status).toBe('done'); // unchanged
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('OCC'),
      expect.objectContaining({ jobId: sample.jobId, expectedStatus: 'rendering' }),
    );
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd apps/api && pnpm test --reporter=verbose tests/jobStorePostgres.test.ts
```

Expected: 2nd and 3rd tests FAIL (OCC logic not yet implemented).

- [ ] **Step 3: Update `jobStorePostgres.ts` patch() with OCC WHERE clause**

In `apps/api/src/jobStorePostgres.ts`, replace the `patch` method (lines 95–117) with:

```typescript
    async patch(jobId, patch, updatedAt, expectedStatus?) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      const bind = (col: string, val: unknown) => {
        sets.push(`${col} = $${sets.length + 2}`);
        vals.push(val);
      };
      if (patch.status !== undefined) bind('status', patch.status);
      if (patch.stage !== undefined) bind('stage', patch.stage);
      if (patch.crawlResultUri !== undefined) bind('crawl_result_uri', patch.crawlResultUri);
      if (patch.storyboardUri !== undefined) bind('storyboard_uri', patch.storyboardUri);
      if (patch.videoUrl !== undefined) bind('video_url', patch.videoUrl);
      if (patch.fallbacks !== undefined) bind('fallbacks', JSON.stringify(patch.fallbacks));
      if (patch.error !== undefined) bind('error', patch.error ? JSON.stringify(patch.error) : null);
      sets.push(`updated_at = to_timestamp($${sets.length + 2} / 1000.0)`);
      vals.push(updatedAt);
      if (sets.length === 1) return; // only updated_at → skip

      const whereClause = expectedStatus
        ? `WHERE id = $1 AND status = $${vals.length + 2}`
        : `WHERE id = $1`;
      const params = expectedStatus ? [jobId, ...vals, expectedStatus] : [jobId, ...vals];

      const result = await pool.query(
        `UPDATE jobs SET ${sets.join(', ')} ${whereClause}`,
        params,
      );
      if (expectedStatus && result.rowCount === 0) {
        console.warn('[jobStore:pg] OCC blocked stale patch', { jobId, expectedStatus });
      }
    },
```

- [ ] **Step 4: Run Postgres tests — expect all 3 pass**

```bash
cd apps/api && pnpm test --reporter=verbose tests/jobStorePostgres.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobStorePostgres.ts apps/api/tests/jobStorePostgres.test.ts
git commit -m "feat(api): add OCC WHERE status guard to jobStorePostgres.patch (Layer 2)"
```

---

### Task 5: Orchestrator — Wire Both Layers

**Files:**
- Modify: `apps/api/src/orchestrator/index.ts`

- [ ] **Step 1: Update `applyPatch` to handle null + pass expectedStatus**

In `apps/api/src/orchestrator/index.ts`, replace lines 47–51:

```typescript
  // Before:
  const applyPatch = async (jobId: string, patch: Partial<Job>) => {
    await cfg.store.patch(jobId, patch, now());
    const brokerEvent = patchToEvent(patch);
    if (brokerEvent) cfg.broker.publish(jobId, brokerEvent);
  };
```

With:

```typescript
  // After:
  const applyPatch = async (jobId: string, patch: Partial<Job> | null, expectedStatus: JobStatus) => {
    if (patch === null) {
      console.warn('[orchestrator] stale event skipped', { jobId });
      return;
    }
    await cfg.store.patch(jobId, patch, now(), expectedStatus);
    const brokerEvent = patchToEvent(patch);
    if (brokerEvent) cfg.broker.publish(jobId, brokerEvent);
  };
```

Add `JobStatus` to the import at the top of the file:

```typescript
import type { Job, JobStatus } from '../model/job.js';
```

- [ ] **Step 2: Update all 9 event handlers to pass `current.status`**

For each handler, add `, current.status` as the third argument to `applyPatch`. Also fix the `render:completed` handler which mutates `patch` (must guard against null):

**crawl:active (line 66–70):**
```typescript
  cfg.queues.crawlEvents.on('active', async ({ jobId }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    await applyPatch(jobId, reduceEvent(current, { kind: 'crawl:active' }), current.status);
  });
```

**crawl:completed (line 72–109):**
```typescript
  cfg.queues.crawlEvents.on('completed', async ({ jobId, returnvalue }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    const parsed = parseReturn<{ crawlResultUri: S3Uri }>(returnvalue);
    await applyPatch(
      jobId,
      reduceEvent(current, { kind: 'crawl:completed', crawlResultUri: parsed.crawlResultUri }),
      current.status,
    );

    let showWatermark = current.userId != null;
    if (cfg.creditPool && current.userId) {
      const userIdNum = Number(current.userId);
      if (Number.isFinite(userIdNum)) {
        try {
          const tier = await getUserTier(cfg.creditPool, userIdNum);
          showWatermark = tier === 'free';
        } catch (err) {
          console.error('[orchestrator] getUserTier failed; defaulting showWatermark=true', { jobId, err });
        }
      }
    }
    if (current.input.forceWatermark) showWatermark = true;

    await cfg.queues.storyboard.add(
      'generate',
      {
        jobId,
        crawlResultUri: parsed.crawlResultUri,
        intent: current.input.intent,
        duration: current.input.duration,
        showWatermark,
        ...(current.input.hint ? { hint: current.input.hint } : {}),
      },
      { jobId },
    );
  });
```

**crawl:failed (line 111–130):**
```typescript
  cfg.queues.crawlEvents.on('failed', async ({ jobId, failedReason }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    await applyPatch(
      jobId,
      reduceEvent(current, {
        kind: 'crawl:failed',
        error: { code: 'CRAWL_FAILED', message: failedReason ?? 'unknown', retryable: false },
      }),
      current.status,
    );
    if (cfg.onJobFailed) {
      await cfg.onJobFailed({ jobId, userId: current.userId, stage: 'crawl', errorCode: 'CRAWL_FAILED', duration: current.input.duration });
    }
  });
```

**storyboard:completed (line 132–162):**
```typescript
    await applyPatch(
      jobId,
      reduceEvent(current, { kind: 'storyboard:completed', storyboardUri: parsed.storyboardUri, canRender: !defer }),
      current.status,
    );
```

**storyboard:failed (line 164–183):**
```typescript
    await applyPatch(
      jobId,
      reduceEvent(current, { kind: 'storyboard:failed', error: { code: 'STORYBOARD_GEN_FAILED', message: failedReason ?? 'unknown', retryable: false } }),
      current.status,
    );
```

**render:active (line 185–189):**
```typescript
    await applyPatch(jobId, reduceEvent(current, { kind: 'render:active' }), current.status);
```

**render:completed (line 191–199) — special: guards against null before mutating:**
```typescript
  cfg.queues.renderEvents.on('completed', async ({ jobId, returnvalue }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    const parsed = parseReturn<{ videoUrl: S3Uri; thumbUrl?: S3Uri }>(returnvalue);
    const patch = reduceEvent(current, { kind: 'render:completed', videoUrl: parsed.videoUrl });
    if (parsed.thumbUrl && patch) {
      patch.thumbUrl = parsed.thumbUrl;
    }
    await applyPatch(jobId, patch, current.status);
  });
```

**render:failed (line 202–220):**
```typescript
    await applyPatch(
      jobId,
      reduceEvent(current, { kind: 'render:failed', error: { code: 'RENDER_FAILED', message: failedReason ?? 'unknown', retryable: false } }),
      current.status,
    );
```

- [ ] **Step 3: Run full API test suite**

```bash
cd apps/api && pnpm test --reporter=verbose
```

Expected: all tests PASS (including new jobStorePostgres tests).

- [ ] **Step 4: Run full monorepo test suite**

```bash
# From repo root — postgres container must be running
docker compose -f docker-compose.dev.yaml up -d postgres
pnpm test
```

Expected: all tests PASS, zero failures.

- [ ] **Step 5: TypeScript check**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orchestrator/index.ts
git commit -m "feat(api): wire transition guard + OCC into orchestrator — stale events now warn-and-skip"
```

- [ ] **Step 7: Push**

```bash
git push
```
