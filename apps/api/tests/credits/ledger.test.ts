import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { vi } from 'vitest';
import {
  TIER_ALLOWANCE,
  CONCURRENCY_LIMIT,
  ALLOWED_DURATIONS,
  calculateCost,
  calculateRefund,
  isDurationAllowed,
  getUserTier,
} from '../../src/credits/ledger.js';

describe('TIER_ALLOWANCE', () => {
  it('matches v2.0 Amendment C: free 30s, pro 300s, max 2000s', () => {
    expect(TIER_ALLOWANCE).toEqual({ free: 30, pro: 300, max: 2000 });
  });
});

describe('CONCURRENCY_LIMIT', () => {
  it('matches the spec: 1/3/10 per tier', () => {
    expect(CONCURRENCY_LIMIT).toEqual({ free: 1, pro: 3, max: 10 });
  });
});

describe('ALLOWED_DURATIONS', () => {
  it('restricts free to 10s + 30s (60s is a paid upsell)', () => {
    expect(ALLOWED_DURATIONS.free).toEqual([10, 30]);
  });
  it('allows 10/30/60 on pro + max', () => {
    expect(ALLOWED_DURATIONS.pro).toEqual([10, 30, 60]);
    expect(ALLOWED_DURATIONS.max).toEqual([10, 30, 60]);
  });
});

describe('calculateCost', () => {
  it('returns the duration itself (1 second = 1 unit)', () => {
    expect(calculateCost(10)).toBe(10);
    expect(calculateCost(30)).toBe(30);
    expect(calculateCost(60)).toBe(60);
  });
});

describe('calculateRefund', () => {
  it('refunds 100% for a crawl-stage failure', () => {
    expect(calculateRefund('crawl', 'CRAWL_TIMEOUT', 30)).toBe(30);
  });

  it('refunds 50% for a storyboard-stage failure (we ate the Claude call cost)', () => {
    expect(calculateRefund('storyboard', 'STORYBOARD_GEN_FAILED', 30)).toBe(15);
    expect(calculateRefund('storyboard', null, 60)).toBe(30);
  });

  it('refunds 100% for a retryable render failure (we have a retry mechanism)', () => {
    expect(calculateRefund('render', 'RENDER_RETRYABLE', 60)).toBe(60);
    expect(calculateRefund('render', 'TRANSIENT_NETWORK', 30)).toBe(30);
    expect(calculateRefund('render', 'TIMEOUT_TRANSIENT', 10)).toBe(10);
  });

  it('refunds 50% for a non-retryable render failure (infra ran)', () => {
    expect(calculateRefund('render', 'RENDER_INVALID_STORYBOARD', 30)).toBe(15);
    expect(calculateRefund('render', null, 60)).toBe(30);
  });

  it('refunds 100% for an unknown stage (user-friendly default)', () => {
    expect(calculateRefund(null, 'UNKNOWN_ERROR', 30)).toBe(30);
  });

  it('handles fractional results by flooring (never over-refund due to rounding)', () => {
    // 25 * 0.5 = 12.5 → 12 (user gets 12 back, not 13)
    expect(calculateRefund('storyboard', 'X', 25)).toBe(12);
  });
});

describe('isDurationAllowed', () => {
  it('blocks 60s on free tier', () => {
    expect(isDurationAllowed('free', 60)).toBe(false);
    expect(isDurationAllowed('free', 10)).toBe(true);
    expect(isDurationAllowed('free', 30)).toBe(true);
  });
  it('allows all three durations on pro + max', () => {
    for (const d of [10, 30, 60] as const) {
      expect(isDurationAllowed('pro', d)).toBe(true);
      expect(isDurationAllowed('max', d)).toBe(true);
    }
  });
});

function mockPool(rows: Array<{ tier: string }>): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

describe('getUserTier', () => {
  it('returns "free" for a free-plan user (tier resolved to "free" by COALESCE)', async () => {
    // No subscription row → COALESCE(s.tier, 'free') = 'free' in SQL
    const pool = mockPool([{ tier: 'free' }]);
    expect(await getUserTier(pool, 42)).toBe('free');
  });

  it('returns "pro" for a user with an active pro subscription', async () => {
    const pool = mockPool([{ tier: 'pro' }]);
    expect(await getUserTier(pool, 42)).toBe('pro');
  });

  it('returns "max" for a user with an active max subscription', async () => {
    const pool = mockPool([{ tier: 'max' }]);
    expect(await getUserTier(pool, 42)).toBe('max');
  });

  it('returns "free" as safe fallback for unknown tier values', async () => {
    // Guards against future DB values not yet in the Tier union
    const pool = mockPool([{ tier: 'enterprise' }]);
    expect(await getUserTier(pool, 42)).toBe('free');
  });

  it('returns "free" when the user row is not found (empty result set)', async () => {
    const pool = mockPool([]);
    expect(await getUserTier(pool, 99999)).toBe('free');
  });
});
