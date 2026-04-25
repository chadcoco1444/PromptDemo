/**
 * Pure functions for Feature 5 credit math.
 *
 * User-visible unit is render-SECONDS (not credits) per v2.0 Amendment C.
 * Internal storage maps 1:1: `credits.balance` column holds an integer
 * number of seconds.
 */

export type Tier = 'free' | 'pro' | 'max';

/** Monthly allowance in render-seconds. */
export const TIER_ALLOWANCE: Record<Tier, number> = {
  free: 30,    // 3 × 10s videos
  pro: 300,    // 10 × 30s videos (or any mix up to 300s total)
  max: 2000,   // 20 × 60s + 40 × 30s head room, overage beyond starts billing at $0.05/sec
};

/** Max concurrent in-flight jobs per tier. */
export const CONCURRENCY_LIMIT: Record<Tier, number> = {
  free: 1,
  pro: 3,
  max: 10,
};

/** Allowed durations per tier (free is restricted — the 60s lock is an upsell lever). */
export const ALLOWED_DURATIONS: Record<Tier, ReadonlyArray<10 | 30 | 60>> = {
  free: [10, 30],
  pro: [10, 30, 60],
  max: [10, 30, 60],
};

/**
 * How much a job costs in render-seconds. Simple linear: duration IS the cost.
 * This stays true across tiers — tiers differ in allowance + concurrency, not
 * per-video pricing.
 */
export function calculateCost(duration: 10 | 30 | 60): number {
  return duration;
}

/**
 * Refund policy per v2.0 spec Section 3. The stage is where the failure happened;
 * errorCode lets us distinguish retryable from non-retryable render failures.
 *
 * Rules:
 *   - Crawl failed               → 100% refund (nothing expensive ran)
 *   - Storyboard failed          → 50% refund (we ate the Claude call cost)
 *   - Render failed (retryable)  → 100% refund (BullMQ retries; if final attempt fails we still had infra but not LLM cost)
 *   - Render failed (non-retry)  → 50% refund (infra ran, we absorbed it)
 *   - Unknown stage / default    → 100% refund (user-friendly; err toward refunding)
 */
export function calculateRefund(
  stage: 'crawl' | 'storyboard' | 'render' | null,
  errorCode: string | null,
  originalCost: number,
): number {
  // Pre-flight rejections (budget cap, env misconfig, etc.) never spent
  // money — full refund regardless of stage.
  if (errorCode === 'STORYBOARD_BUDGET_EXCEEDED') return originalCost;
  if (stage === 'storyboard') return Math.floor(originalCost * 0.5);
  if (stage === 'render') {
    const retryable = errorCode !== null && /retryable|timeout|transient/i.test(errorCode);
    return retryable ? originalCost : Math.floor(originalCost * 0.5);
  }
  // crawl or unknown → full refund
  return originalCost;
}

/**
 * Decide whether a user's requested duration is allowed by their tier.
 * Used at form-submit validation time AND in the debit middleware.
 */
export function isDurationAllowed(tier: Tier, duration: 10 | 30 | 60): boolean {
  return ALLOWED_DURATIONS[tier].includes(duration);
}
