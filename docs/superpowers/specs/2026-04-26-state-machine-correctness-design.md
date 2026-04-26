# State Machine Correctness (R1) — Design Document

## Goal

Prevent race conditions in the job orchestrator from causing refund leaks or stale status overwrites. Two events (`render:completed` / `render:failed`) delivered out of order today can silently flip a terminal `failed` job to `done`, skipping the refund callback entirely.

## Architecture: Two-Layer Defense

```
BullMQ Event
    │
    ▼
Layer 1 — stateMachine.ts (VALID_EVENTS guard)
    │  null → warn log, return early (no DB I/O)
    ▼
Layer 2 — jobStorePostgres.ts (OCC WHERE status = $expectedStatus)
    │  rowCount = 0 → warn log (concurrent race blocked at DB)
    ▼
Redis + SSE publish (only if both layers pass)
```

**Why two layers:** Layer 1 catches the obvious case (wrong-stage or terminal-state events) before any I/O. Layer 2 guards against two *valid* events arriving concurrently (e.g., `render:completed` and `render:failed` both see `status: 'rendering'`, both pass Layer 1, but only the first DB write should win).

Redis store receives `expectedStatus?` in its interface but does not enforce OCC — adding a Lua atomic script is out of scope; Layer 1 already covers the single-instance case, and Postgres OCC is the authoritative safety net.

---

## Files Changed

| Action | Path |
|---|---|
| Modify | `apps/api/src/orchestrator/stateMachine.ts` |
| Modify | `apps/api/src/jobStore.ts` |
| Modify | `apps/api/src/jobStorePostgres.ts` |
| Modify | `apps/api/src/jobStoreDual.ts` |
| Modify | `apps/api/src/orchestrator/index.ts` |
| Modify (tests) | `apps/api/tests/stateMachine.test.ts` |
| Modify (tests) | `apps/api/tests/jobStorePostgres.test.ts` |
| Modify (tests) | `apps/api/tests/orchestrator.test.ts` |

---

## Layer 1: `stateMachine.ts`

### Valid transition table

```typescript
import type { JobStatus } from '../model/job.js';
import type { OrchestratorEvent } from './stateMachine.js';

const VALID_EVENTS: Partial<Record<JobStatus, ReadonlySet<OrchestratorEvent['kind']>>> = {
  queued:              new Set(['crawl:active', 'crawl:failed']),
  crawling:            new Set(['crawl:active', 'crawl:completed', 'crawl:failed']),
  generating:          new Set(['storyboard:active', 'storyboard:completed', 'storyboard:failed']),
  waiting_render_slot: new Set(['render:active', 'render:completed', 'render:failed']),
  rendering:           new Set(['render:active', 'render:completed', 'render:failed']),
  // done / failed: absent from map → terminal states, all events return null
};
```

### Updated function signature

`reduceEvent` now returns `Partial<Job> | null`.  
`null` means: stale or invalid event — caller must warn-log and skip.

```typescript
export function reduceEvent(job: Job, ev: OrchestratorEvent): Partial<Job> | null {
  if (!VALID_EVENTS[job.status]?.has(ev.kind)) return null;
  switch (ev.kind) {
    // ... original switch body unchanged ...
  }
}
```

---

## Layer 2: `jobStore.ts` interface

Add optional `expectedStatus` to `patch()`:

```typescript
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
```

---

## Layer 2: `jobStorePostgres.ts`

`patch()` adds a conditional `AND status = $N` to the WHERE clause:

```typescript
async patch(jobId, patch, updatedAt, expectedStatus?) {
  // ... existing bind() loop for set-columns ...

  const whereClause = expectedStatus
    ? `WHERE id = $1 AND status = $${sets.length + 2}`
    : `WHERE id = $1`;

  const result = await pool.query(
    `UPDATE jobs SET ${sets.join(', ')} ${whereClause}`,
    expectedStatus ? [jobId, ...vals, expectedStatus] : [jobId, ...vals],
  );

  if (expectedStatus && result.rowCount === 0) {
    console.warn('[jobStore:pg] OCC blocked stale patch', { jobId, expectedStatus });
  }
}
```

---

## `jobStoreDual.ts`

Forward `expectedStatus` to both primary (Redis) and mirror (Postgres):

```typescript
async patch(jobId, patch, updatedAt, expectedStatus?) {
  await primary.patch(jobId, patch, updatedAt, expectedStatus);
  try {
    await mirror.patch(jobId, patch, updatedAt, expectedStatus);
  } catch (err) {
    handleMirrorErr(err, 'patch', jobId);
  }
},
```

---

## `jobStore.ts` (Redis implementation)

Accept `expectedStatus?` in signature but do not enforce — no Lua atomicity:

```typescript
async patch(jobId, patch, updatedAt, _expectedStatus?) {
  const raw = await redis.get(key(jobId));
  if (!raw) throw new Error(`job not found: ${jobId}`);
  const current = JobSchema.parse(JSON.parse(raw));
  const merged = { ...current, ...patch, updatedAt };
  const parsed = JobSchema.parse(merged);
  await redis.set(key(jobId), JSON.stringify(parsed), 'KEEPTTL');
},
```

---

## `orchestrator/index.ts`

### `applyPatch` — null guard + pass `current.status`

```typescript
const applyPatch = async (
  jobId: string,
  patch: Partial<Job> | null,
  expectedStatus: JobStatus,
) => {
  if (patch === null) {
    console.warn('[orchestrator] stale event skipped', { jobId });
    return;
  }
  await cfg.store.patch(jobId, patch, now(), expectedStatus);
  const brokerEvent = patchToEvent(patch);
  if (brokerEvent) cfg.broker.publish(jobId, brokerEvent);
};
```

### All event handlers — pass `current.status`

Every handler already reads `current` before calling `reduceEvent`. The only change is adding `current.status` as the third argument to `applyPatch`:

```typescript
// Before:
await applyPatch(jobId, reduceEvent(current, { kind: 'render:completed', videoUrl: ... }));

// After:
await applyPatch(
  jobId,
  reduceEvent(current, { kind: 'render:completed', videoUrl: ... }),
  current.status,  // ← added
);
```

This pattern applies to all 9 event handlers (crawl:active, crawl:completed, crawl:failed, storyboard:active, storyboard:completed, storyboard:failed, render:active, render:completed, render:failed).

---

## Test Coverage

### `stateMachine.test.ts` (new tests)

```typescript
describe('reduceEvent — transition guard', () => {
  it('returns null for any event when status is done (terminal)', () => {
    const job = mk('done');
    expect(reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://...' })).toBeNull();
    expect(reduceEvent(job, { kind: 'render:failed', error: { ... } })).toBeNull();
  });

  it('returns null for any event when status is failed (terminal)', () => {
    const job = mk('failed');
    expect(reduceEvent(job, { kind: 'crawl:active' })).toBeNull();
  });

  it('returns null for wrong-stage event (render:completed while generating)', () => {
    const job = mk('generating');
    expect(reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://...' })).toBeNull();
  });

  it('returns patch for valid transition (rendering → render:completed)', () => {
    const job = mk('rendering');
    const patch = reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://v.mp4' });
    expect(patch).toMatchObject({ status: 'done' });
  });
});
```

### `jobStorePostgres.test.ts` (new tests)

```typescript
it('applies patch when expectedStatus matches current DB status', async () => {
  await store.create(mk('rendering'));
  await store.patch(jobId, { status: 'done' }, Date.now(), 'rendering');
  const job = await store.get(jobId);
  expect(job?.status).toBe('done');
});

it('blocks patch and warns when expectedStatus does not match', async () => {
  const warn = vi.spyOn(console, 'warn');
  await store.create(mk('failed'));   // already failed
  await store.patch(jobId, { status: 'done' }, Date.now(), 'rendering'); // stale
  const job = await store.get(jobId);
  expect(job?.status).toBe('failed');  // unchanged
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('OCC'), expect.any(Object));
});
```

### `orchestrator.test.ts` (new integration test)

```typescript
it('does not overwrite failed status when render:completed arrives late', async () => {
  // Setup: job is already failed
  store.get.mockResolvedValue(mk('failed'));
  const onJobFailed = vi.fn();

  // render:completed arrives after render:failed
  await simulateEvent(orchestrator, 'render:completed', { videoUrl: 's3://v.mp4' });

  // store.patch must NOT have been called
  expect(store.patch).not.toHaveBeenCalled();
  // onJobFailed must NOT be called a second time
  expect(onJobFailed).not.toHaveBeenCalled();
});
```

---

## Non-Goals (Out of Scope)

- R6 (apps/web direct PG pool) — Spec 3
- Redis Lua atomic OCC — future if multi-instance Redis is needed
- Structured logging (pino) — Spec 3 / P3

---

## Rollout Safety

All changes are backward-compatible:
- `expectedStatus?` is optional; existing callers without it continue to work
- `reduceEvent` returning `null` is a new code path; callers that don't handle null will get a TypeScript compile error (not a silent runtime regression)
- The Postgres `WHERE status` clause only runs when `expectedStatus` is provided — no blast radius on the existing unconditional UPDATE path
