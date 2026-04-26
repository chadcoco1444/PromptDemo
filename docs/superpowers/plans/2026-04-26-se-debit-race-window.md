# S-E: Debit Race Window — Credits Transaction Atomicity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the race window where credits are debited but the compensating refund never runs if the process crashes between the two separate DB calls.

**Architecture:** Add an optional `maxDurationForTier` callback to `debitForJob`; the callback is evaluated inside the existing `BEGIN … COMMIT` transaction block, after the tier is read and before the debit. If the callback returns `false`, the transaction rolls back with a new `duration_not_allowed_in_tier` result code — no credits touched. The compensating `refundForJob` call and its dynamic `import()` in `postJob.ts` are removed entirely.

**Tech Stack:** PostgreSQL (`pg`), TypeScript strict mode, Vitest.

---

## File Map

| File | Action |
|---|---|
| `apps/api/src/credits/store.ts` | Add `duration_not_allowed_in_tier` to `DebitResult.code`; add `maxDurationForTier?` to `debitForJob` params; insert guard after tier is read, inside the transaction |
| `apps/api/src/routes/postJob.ts` | Pass `maxDurationForTier` callback to `debitForJob`; handle new result code; remove lines 182–207 (comment block + isDurationAllowed check + dynamic refund import + return 403) |
| `apps/api/tests/credits/store.test.ts` | Add test: guard fires → transaction rollback → balance unchanged |
| `apps/api/tests/postJob.test.ts` | Add `vi.mock` for the store module; add describe block with two route-level tests |

---

### Task 1: Atomic duration guard in `debitForJob`

**Files:**
- Modify: `apps/api/src/credits/store.ts`
- Modify: `apps/api/tests/credits/store.test.ts`

- [ ] **Step 1: Write the failing test**

Add a third test inside the existing `describe('debitForJob', ...)` block in
`apps/api/tests/credits/store.test.ts`, after the two tests that are already there:

```ts
  it('does not debit when maxDurationForTier rejects', async () => {
    const { rows } = await pool.query<{ balance: number }>(
      `SELECT balance FROM credits WHERE user_id = $1`,
      [testUserId],
    );
    const balanceBefore = rows[0]!.balance;

    const result = await debitForJob(pool, {
      userId: testUserId,
      jobId: `duration-reject-${Date.now()}`,
      costSeconds: 10,
      maxDurationForTier: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('duration_not_allowed_in_tier');
    expect(result.tier).toBeDefined();

    const { rows: rows2 } = await pool.query<{ balance: number }>(
      `SELECT balance FROM credits WHERE user_id = $1`,
      [testUserId],
    );
    expect(rows2[0]!.balance).toBe(balanceBefore);
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/api && pnpm vitest run tests/credits/store.test.ts
```

Expected: TypeScript error — `maxDurationForTier` does not exist in the `params` type.

- [ ] **Step 3: Implement the guard in `store.ts`**

Three targeted edits to `apps/api/src/credits/store.ts`:

**3a. Extend `DebitResult.code`** — on the line that currently reads:

```ts
  code?: 'insufficient_credits' | 'concurrency_limit' | 'user_not_found';
```

Replace with:

```ts
  code?: 'insufficient_credits' | 'concurrency_limit' | 'user_not_found' | 'duration_not_allowed_in_tier';
```

**3b. Add `maxDurationForTier` to `debitForJob` params** — on the line that currently reads:

```ts
  params: { userId: number; jobId: string; costSeconds: number },
```

Replace with:

```ts
  params: { userId: number; jobId: string; costSeconds: number; maxDurationForTier?: (tier: Tier) => boolean },
```

**3c. Add the guard inside the transaction** — after the `const tier = ...` assignment
(currently around line 97, right after `const tier = (tierRes.rows[0]?.tier ?? 'free') as Tier;`)
and before the `const activeRes = ...` active-job count query, insert:

```ts
    if (params.maxDurationForTier !== undefined && !params.maxDurationForTier(tier)) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'duration_not_allowed_in_tier', tier };
    }
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd apps/api && pnpm vitest run tests/credits/store.test.ts
```

Expected: all 7 tests PASS (3 in `describe('debitForJob')`, 4 in `describe('refundForJob')`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/credits/store.ts apps/api/tests/credits/store.test.ts
git commit -m "feat(credits): add atomic duration guard to debitForJob"
```

---

### Task 2: Update route — pass guard, handle new code, remove compensating refund

**Files:**
- Modify: `apps/api/src/routes/postJob.ts`
- Modify: `apps/api/tests/postJob.test.ts`

- [ ] **Step 1: Add `vi.mock` and write the failing tests**

**1a. Extend the vitest import** — the current first line of `apps/api/tests/postJob.test.ts` is:

```ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
```

Replace with:

```ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
```

**1b. Add the mock declaration and import** — immediately after ALL existing import lines (before the `const TEST_SECRET` line), insert:

```ts
vi.mock('../src/credits/store.js');
import { debitForJob, refundForJob } from '../src/credits/store.js';
```

`vi.mock` is hoisted by Vitest before any imports execute, so this works correctly even though it appears after import statements in source order.

**1c. Add a new describe block** at the very end of the file (after the closing `});` of the existing `describe('POST /api/jobs', ...)` block):

```ts
describe('POST /api/jobs — credit gate', () => {
  function buildWithCredits() {
    const app = Fastify();
    const redis = new RedisMock();
    const store = makeJobStore(redis as any);
    const crawl = { add: vi.fn().mockResolvedValue({ id: 'q1' }) };
    const storyboard = { add: vi.fn().mockResolvedValue({ id: 'q2' }) };
    app.register(postJobRoute, {
      store,
      crawlQueue: crawl as any,
      storyboardQueue: storyboard as any,
      requireUserIdHeader: true,
      creditPool: {} as any,  // non-null enables pricing gate; debitForJob is mocked
      now: () => 1000,
      nanoid: () => 'cred01',
    });
    return { app, crawl };
  }

  beforeEach(() => {
    vi.mocked(debitForJob).mockReset();
    vi.mocked(refundForJob).mockReset();
  });

  it('returns 403 and does NOT call refundForJob when duration not allowed for tier', async () => {
    vi.mocked(debitForJob).mockResolvedValue({
      ok: false,
      code: 'duration_not_allowed_in_tier',
      tier: 'free',
    });
    const { app } = buildWithCredits();
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'promo', duration: 60 },
      headers: { Authorization: await bearerFor('user-99') },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'duration_not_allowed_in_tier', tier: 'free' });
    expect(vi.mocked(refundForJob)).not.toHaveBeenCalled();
  });

  it('passes maxDurationForTier callback to debitForJob on every credit-gated request', async () => {
    vi.mocked(debitForJob).mockResolvedValue({ ok: true, tier: 'pro', balanceAfter: 240 });
    const { app } = buildWithCredits();
    await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'promo', duration: 30 },
      headers: { Authorization: await bearerFor('user-99') },
    });
    expect(vi.mocked(debitForJob)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxDurationForTier: expect.any(Function) }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd apps/api && pnpm vitest run tests/postJob.test.ts
```

Expected: the two new credit gate tests fail — the route doesn't handle `duration_not_allowed_in_tier` and doesn't pass `maxDurationForTier` yet. The existing tests should still pass (they use `creditPool: null` so the mock is not invoked).

- [ ] **Step 3: Update `postJob.ts`**

Three edits to `apps/api/src/routes/postJob.ts`:

**3a. Pass `maxDurationForTier` callback** — replace the current `debitForJob` call (lines 153–157):

```ts
      const result = await debitForJob(opts.creditPool, {
        userId: userIdNum,
        jobId,
        costSeconds: cost,
      });
```

With:

```ts
      const result = await debitForJob(opts.creditPool, {
        userId: userIdNum,
        jobId,
        costSeconds: cost,
        maxDurationForTier: (tier) => isDurationAllowed(tier, input.duration),
      });
```

**3b. Handle the new result code** — inside the `if (!result.ok)` block (after line 158),
add as the FIRST `if` check, before `result.code === 'concurrency_limit'`:

```ts
        if (result.code === 'duration_not_allowed_in_tier') {
          return reply.code(403).send({
            error: 'duration_not_allowed_in_tier',
            message: `The ${input.duration}s duration is not available on the ${result.tier ?? 'free'} plan. Upgrade to Pro for 60s videos.`,
            tier: result.tier,
          });
        }
```

**3c. Remove lines 182–207 and replace with `showWatermark` assignment** — delete the
entire block from the `// Tier-restricted duration check` comment through the closing `}`
of `if (!isDurationAllowed(tier, input.duration))`. In its place, insert one line:

```ts
      showWatermark = (result.tier ?? 'free') === 'free';
```

The resulting credit gate section should now look like this (condensed view):

```ts
      const result = await debitForJob(opts.creditPool, {
        userId: userIdNum,
        jobId,
        costSeconds: cost,
        maxDurationForTier: (tier) => isDurationAllowed(tier, input.duration),
      });
      if (!result.ok) {
        if (result.code === 'duration_not_allowed_in_tier') {
          return reply.code(403).send({
            error: 'duration_not_allowed_in_tier',
            message: `The ${input.duration}s duration is not available on the ${result.tier ?? 'free'} plan. Upgrade to Pro for 60s videos.`,
            tier: result.tier,
          });
        }
        if (result.code === 'concurrency_limit') { ... }
        if (result.code === 'insufficient_credits') { ... }
        if (result.code === 'user_not_found') { ... }
      }
      showWatermark = (result.tier ?? 'free') === 'free';
```

- [ ] **Step 4: Run the new tests to confirm they pass**

```bash
cd apps/api && pnpm vitest run tests/postJob.test.ts
```

Expected: all tests PASS — including the two new credit gate tests and all pre-existing postJob tests.

- [ ] **Step 5: Run full workspace typecheck and test suite**

```bash
cd ../.. && pnpm typecheck && pnpm test
```

Expected:
- `pnpm typecheck`: 0 errors across all 8 workspace packages
- `pnpm test`: all tests PASS (≥354 passing; 3 skipped as before)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/postJob.ts apps/api/tests/postJob.test.ts
git commit -m "feat(credits): fold duration check into debitForJob transaction, remove compensating refund"
```
