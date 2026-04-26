# Phase 1: Saga Compensation for Redis Write Failures in postJob

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure credits are never permanently lost when Redis writes fail after a successful Postgres debit in `POST /api/jobs`.

**Architecture:** Two failure points in `postJob.ts` come after `debitForJob()` commits to Postgres — `store.create()` (Redis SET) and `queue.add()` (BullMQ). Both are currently unguarded. Wrap each in try-catch. On failure: log structured error, call `refundForJob()` when pricing is enabled (idempotent — safe to retry), patch job to `failed` when `store.create` succeeded but `queue.add` failed, return 500. The compensation helper is a closure over `userId`, `jobId`, and `cost` built once before the writes begin.

**Tech Stack:** TypeScript, Fastify, BullMQ, ioredis, Vitest, ioredis-mock.

---

## File Map

| File | Action |
|---|---|
| `apps/api/src/routes/postJob.ts` | Add `refundForJob` import; build `compensatingRefund` closure; wrap `store.create` and each `queue.add` in try-catch with logging, patch, and refund |
| `apps/api/tests/postJob.test.ts` | Add new `describe` block with three tests: store failure, queue failure (fresh job), queue failure (skip-crawl path) |

---

### Task 1: Saga compensation in `postJob.ts`

**Files:**
- Modify: `apps/api/src/routes/postJob.ts`
- Modify: `apps/api/tests/postJob.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the bottom of `apps/api/tests/postJob.test.ts`, after the existing `describe('POST /api/jobs — credit gate', ...)` block:

```ts
describe('POST /api/jobs — saga compensation on Redis failure', () => {
  function buildWithSaga({
    storeCreateFails = false,
    crawlAddFails = false,
  }: {
    storeCreateFails?: boolean;
    crawlAddFails?: boolean;
  } = {}) {
    const app = Fastify();
    const redis = new RedisMock();
    const baseStore = makeJobStore(redis as any);
    const store = {
      create: storeCreateFails
        ? vi.fn().mockRejectedValue(new Error('Redis connection refused'))
        : vi.fn().mockImplementation(baseStore.create.bind(baseStore)),
      get: vi.fn().mockImplementation(baseStore.get.bind(baseStore)),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    const crawl = {
      add: crawlAddFails
        ? vi.fn().mockRejectedValue(new Error('BullMQ Redis write timeout'))
        : vi.fn().mockResolvedValue({ id: 'q1' }),
    };
    const storyboard = { add: vi.fn().mockResolvedValue({ id: 'q2' }) };
    app.register(postJobRoute, {
      store: store as any,
      crawlQueue: crawl as any,
      storyboardQueue: storyboard as any,
      requireUserIdHeader: true,
      creditPool: {} as any, // non-null enables pricing gate; debitForJob is vi.mocked
      now: () => 1000,
      nanoid: () => 'saga01',
    });
    return { app, store, crawl };
  }

  beforeEach(() => {
    vi.mocked(debitForJob).mockReset();
    vi.mocked(refundForJob).mockReset();
    vi.mocked(debitForJob).mockResolvedValue({ ok: true, tier: 'pro', balanceAfter: 270 });
    vi.mocked(refundForJob).mockResolvedValue({ ok: true, balanceAfter: 300 });
  });

  it('refunds and returns 500 when store.create throws', async () => {
    const { app } = buildWithSaga({ storeCreateFails: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'test', duration: 30 },
      headers: { Authorization: await bearerFor('7') },
    });
    expect(res.statusCode).toBe(500);
    // debit ran first, so refund must compensate for the full job cost
    expect(vi.mocked(refundForJob)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobId: 'saga01', refundSeconds: 30 }),
    );
  });

  it('patches job to failed and refunds when crawlQueue.add throws', async () => {
    const { app, store } = buildWithSaga({ crawlAddFails: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'test', duration: 30 },
      headers: { Authorization: await bearerFor('7') },
    });
    expect(res.statusCode).toBe(500);
    // store.create succeeded (job written to Redis), so patch it to failed
    expect(store.patch).toHaveBeenCalledWith(
      'saga01',
      expect.objectContaining({ status: 'failed', error: expect.objectContaining({ code: 'QUEUE_ERROR' }) }),
      expect.any(Number),
    );
    // credits must be returned
    expect(vi.mocked(refundForJob)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobId: 'saga01', refundSeconds: 30 }),
    );
  });

  it('does NOT call refundForJob when pricing is disabled and store.create throws', async () => {
    // Regression guard: compensation must be no-op when creditPool=null
    const app = Fastify();
    const store = {
      create: vi.fn().mockRejectedValue(new Error('Redis down')),
      get: vi.fn(),
      patch: vi.fn(),
    };
    app.register(postJobRoute, {
      store: store as any,
      crawlQueue: { add: vi.fn() } as any,
      storyboardQueue: { add: vi.fn() } as any,
      requireUserIdHeader: false,
      creditPool: null, // pricing off
      now: () => 1000,
      nanoid: () => 'noprice01',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'test', duration: 10 },
    });
    expect(res.statusCode).toBe(500);
    expect(vi.mocked(refundForJob)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm --filter @lumespec/api test -- --reporter=verbose --testNamePattern="saga compensation"
```

Expected: 3 tests fail. The first and second fail because the current code has no try-catch (the unhandled rejection surfaces as a 500 from Fastify's default error handler, but `refundForJob` is never called and `store.patch` is never called). The third may pass accidentally if `refundForJob` was never called — that's OK, it confirms the guard is not needed yet.

- [ ] **Step 3: Add `refundForJob` import to `postJob.ts`**

In `apps/api/src/routes/postJob.ts`, change the import on line 8:

```ts
// Before:
import { debitForJob } from '../credits/store.js';

// After:
import { debitForJob, refundForJob } from '../credits/store.js';
```

- [ ] **Step 4: Build the compensating-refund closure and wrap both Redis writes**

Replace lines 197–234 in `apps/api/src/routes/postJob.ts` (from `const newJob: Job` to the final `return reply.code(201)`) with:

```ts
    const newJob: Job & { userId?: string } = {
      jobId,
      ...(input.parentJobId ? { parentJobId: input.parentJobId } : {}),
      ...(userId ? { userId } : {}),
      status: inheritedCrawlUri ? 'generating' : 'queued',
      stage: inheritedCrawlUri ? 'storyboard' : null,
      progress: 0,
      input,
      ...(inheritedCrawlUri ? { crawlResultUri: inheritedCrawlUri } : {}),
      fallbacks: [],
      createdAt,
      updatedAt: createdAt,
    };

    // Saga compensation: if any Redis write below fails after the Postgres debit
    // has committed, call refundForJob so credits are not permanently lost.
    // No-op when pricing is disabled (creditPool null) or user is anonymous.
    const compensatingRefund = pricingEnabled && userId && opts.creditPool
      ? async () => {
          await refundForJob(opts.creditPool!, {
            userId: Number(userId!),
            jobId,
            refundSeconds: calculateCost(input.duration),
          }).catch((e) => req.log.error({ jobId, err: e }, 'refundForJob failed during saga compensation'));
        }
      : () => Promise.resolve();

    try {
      await opts.store.create(newJob);
    } catch (err) {
      req.log.error({ jobId, err }, 'store.create failed — job not persisted, refunding credits');
      await compensatingRefund();
      return reply.code(500).send({ error: 'store_create_failed', jobId });
    }

    // Skip-crawl fast path when regenerating from a parent's crawl result.
    if (inheritedCrawlUri) {
      try {
        await opts.storyboardQueue.add(
          'generate',
          {
            jobId,
            crawlResultUri: inheritedCrawlUri,
            intent: input.intent,
            duration: input.duration,
            showWatermark,
            ...(input.hint ? { hint: input.hint } : {}),
          },
          { jobId },
        );
      } catch (err) {
        req.log.error({ jobId, err }, 'storyboardQueue.add failed — patching job to failed, refunding credits');
        await opts.store.patch(
          jobId,
          { status: 'failed', error: { code: 'QUEUE_ERROR', message: 'Failed to enqueue storyboard job. Credits will be refunded.', retryable: true } },
          now(),
        ).catch(() => {});
        await compensatingRefund();
        return reply.code(500).send({ error: 'queue_enqueue_failed', jobId });
      }
      return reply.code(201).send({ jobId, skippedCrawl: true });
    }

    // Fresh job — normal crawl-first flow.
    try {
      await opts.crawlQueue.add('crawl', { jobId, url: input.url }, { jobId });
    } catch (err) {
      req.log.error({ jobId, err }, 'crawlQueue.add failed — patching job to failed, refunding credits');
      await opts.store.patch(
        jobId,
        { status: 'failed', error: { code: 'QUEUE_ERROR', message: 'Failed to enqueue crawl job. Credits will be refunded.', retryable: true } },
        now(),
      ).catch(() => {});
      await compensatingRefund();
      return reply.code(500).send({ error: 'queue_enqueue_failed', jobId });
    }
    return reply.code(201).send({ jobId });
```

- [ ] **Step 5: Run the tests to confirm all three pass**

```bash
pnpm --filter @lumespec/api test -- --reporter=verbose --testNamePattern="saga compensation"
```

Expected: 3 tests pass.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```bash
pnpm --filter @lumespec/api test
```

Expected: all tests pass (previous postJob tests, credit gate tests, saga compensation tests).

- [ ] **Step 7: Run typecheck**

```bash
pnpm --filter @lumespec/api typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/postJob.ts apps/api/tests/postJob.test.ts
git commit -m "fix(api): saga compensation for Redis write failures after Postgres debit

- Import refundForJob into postJob route
- Build compensatingRefund closure after credit gate block; no-op when
  pricing is disabled or user is anonymous
- Wrap store.create in try-catch: on failure, call compensatingRefund
  and return 500 (credits restored before job is ever visible to Redis)
- Wrap crawlQueue.add / storyboardQueue.add in try-catch: on failure,
  patch job status to failed, call compensatingRefund, return 500
- store.patch inside catch uses .catch(() => {}) so a secondary Redis
  failure during error-path cleanup never masks the original error
- Three new tests: store failure with refund, queue failure with patch
  + refund, pricing-disabled guard (no refundForJob call)"
```

---

## Design Notes

**Why `compensatingRefund` is a closure (not inline in each catch):** DRY — the userId/jobId/cost triple would repeat three times. Extracted once after the auth/credit gate block where all three are in scope.

**Why `store.patch(...).catch(() => {})` inside the queue failure catch:** The patch is best-effort. If Redis is down (which caused the queue failure), the patch will also fail. We must not let a secondary failure in the error path mask the primary error or block the refund call.

**Why `retryable: true` on the QUEUE_ERROR:** The client's `onRetry` handler calls `window.location.reload()` which re-POSTs the form. Since the queue failure is infrastructure-level (transient Redis overload), retrying is correct.

**Why NOT wrap `refundForJob` failures as a hard error:** If `refundForJob` itself fails (e.g., Postgres is also down), we've already returned 500 to the client. Throwing here would be double-faulting on an already-faulted path. The `.catch` logs the failure for ops alerting; a manual refund can be issued from the audit log.

**Scope of `opts.creditPool!` non-null assertion:** Safe — `compensatingRefund` is only non-no-op when `opts.creditPool` is truthy; the closure captures the check.
