# S-E: Debit Race Window — Credits Transaction Atomicity

**Risk:** R4 — P1  
**Date:** 2026-04-26  
**Status:** Approved — ready for implementation planning

---

## Problem

In `apps/api/src/routes/postJob.ts` (lines 182–207), the credit debit and the tier-duration check are executed in **two separate operations**:

```
1. debitForJob(pool, { userId, jobId, duration, cost })  ← debits credits
   ↓ result.ok === true
2. isDurationAllowed(tier, input.duration)               ← checks tier AFTER debit
   ↓ false
3. refundForJob(pool, { userId, jobId, refundSeconds })  ← compensating refund
   ↓ return 403
```

**Race window:** between step 1 (debit committed) and step 3 (refund committed), there is a window where the user's balance is temporarily incorrect. If the process crashes, network drops, or an unhandled exception occurs between steps 1 and 3, the user loses credits permanently for a job that was never started.

The code even has an inline comment acknowledging this:
```ts
// TODO: fold tier-duration check into debitForJob for atomicity.
// For now we check post-debit and refund if disallowed — not ideal
// but avoids a separate SELECT for tier.
```

Additionally, the compensating refund in step 3 adds latency to what should be a fast rejection path.

---

## Approaches Considered

| Approach | Pros | Cons |
|---|---|---|
| **A) Fold isDurationAllowed into debitForJob transaction** ✅ | Atomic — no race window possible | Requires modifying `debitForJob` signature/logic |
| B) Pre-check tier before debit (separate SELECT) | Simple to understand | Adds a DB round-trip; tier could change between SELECT and debit (unlikely but theoretically possible) |
| C) Keep compensating refund, add retry | Minimal code change | Does not close the race window; crash between debit and refund still loses credits |

**Decision: A.** True atomicity requires the check and the debit to be in the same `BEGIN ... COMMIT` block. The existing `SELECT FOR UPDATE` pattern in `credits/store.ts` already provides this infrastructure.

---

## Architecture

### Current `debitForJob` signature

```ts
// apps/api/src/credits/store.ts
export async function debitForJob(
  pool: Pool,
  opts: {
    userId: number;
    jobId: string;
    duration: number;
    cost: number;
  }
): Promise<DebitResult>
```

`DebitResult` currently returns `{ ok: true; tier: Tier; balanceAfter: number } | { ok: false; code: ... }`.

### Updated `debitForJob` signature

Add an optional `allowedDurations` constraint checked inside the transaction:

```ts
export async function debitForJob(
  pool: Pool,
  opts: {
    userId: number;
    jobId: string;
    duration: number;
    cost: number;
    maxDurationForTier?: (tier: Tier) => boolean;  // ← new optional guard
  }
): Promise<DebitResult>
```

New failure code added to `DebitResult`:
```ts
| { ok: false; code: 'duration_not_allowed_in_tier'; tier: Tier }
```

### Transaction flow (inside `debitForJob`)

```sql
BEGIN;

SELECT balance, tier
  FROM credits
 WHERE user_id = $userId
   FOR UPDATE;                    -- row lock

-- Guard 1: sufficient balance
IF balance < cost THEN
  ROLLBACK; RETURN { ok: false, code: 'insufficient_credits' };

-- Guard 2: tier allows this duration (NEW — atomic check)
IF NOT maxDurationForTier(tier, duration) THEN
  ROLLBACK; RETURN { ok: false, code: 'duration_not_allowed_in_tier', tier };

-- Debit
UPDATE credits SET balance = balance - cost WHERE user_id = $userId;
INSERT INTO credit_ledger (...) VALUES (...);

COMMIT;
RETURN { ok: true, tier, balanceAfter: balance - cost };
```

### Updated `postJob.ts`

```ts
// Before: two-step debit + check + refund
// After: single call, result contains all outcomes

const result = await debitForJob(opts.creditPool, {
  userId: userIdNum,
  jobId,
  duration: input.duration,
  cost,
  maxDurationForTier: (tier) => isDurationAllowed(tier, input.duration),
});

if (!result.ok) {
  if (result.code === 'duration_not_allowed_in_tier') {
    return reply.code(403).send({
      error: 'duration_not_allowed_in_tier',
      message: `The ${input.duration}s duration is not available on the ${result.tier} plan.`,
      tier: result.tier,
    });
  }
  // handle insufficient_credits, concurrent_job_limit, user_not_found as before
}
```

**The compensating `refundForJob` call in `postJob.ts` is removed entirely.** No more partial-state window.

### `isDurationAllowed` location

`isDurationAllowed` is currently defined in (or imported into) `postJob.ts`. It must be importable from `credits/store.ts` or passed as a callback. The callback approach (`maxDurationForTier` parameter) keeps `credits/store.ts` free of duration-policy knowledge — the store remains a pure data layer.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/credits/store.ts` | Add `maxDurationForTier` optional param to `debitForJob`; add `duration_not_allowed_in_tier` result code; inline guard inside transaction |
| `apps/api/src/routes/postJob.ts` | Remove post-debit tier check + compensating refund (lines 182–207); handle new result code |
| `apps/api/tests/credits/store.test.ts` | Add test: `debitForJob` with `maxDurationForTier` returning false → no debit, returns `duration_not_allowed_in_tier` |
| `apps/api/tests/postJob.test.ts` | Update integration test: forbidden duration → 403, balance unchanged (verify no debit occurred) |

---

## Testing

**Unit — `credits/store.test.ts`:**
```ts
it('does not debit when maxDurationForTier rejects', async () => {
  const balanceBefore = await getBalance(pool, userId);
  const result = await debitForJob(pool, {
    userId,
    jobId: newUUID(),
    duration: 60,
    cost: 60,
    maxDurationForTier: () => false,   // always rejects
  });
  expect(result).toMatchObject({ ok: false, code: 'duration_not_allowed_in_tier' });
  const balanceAfter = await getBalance(pool, userId);
  expect(balanceAfter).toBe(balanceBefore);  // no credits consumed
});
```

**Integration — `postJob.test.ts`:**
```ts
it('returns 403 for forbidden duration without consuming credits', async () => {
  const before = await getBalance(pool, testUserId);
  const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { duration: 60 } });
  expect(res.statusCode).toBe(403);
  const after = await getBalance(pool, testUserId);
  expect(after).toBe(before);   // balance unchanged — atomic rejection
});
```

---

## Non-Goals

- Changing the credit cost model or tier definitions
- Adding a per-job idempotency key to prevent double-debit on request retry (separate concern; the existing `jobId` deduplication in the store handles this for the happy path)
