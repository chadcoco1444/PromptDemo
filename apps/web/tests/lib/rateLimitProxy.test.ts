import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, _resetRateLimit } from '../../src/lib/rateLimitProxy';

describe('checkRateLimit', () => {
  beforeEach(() => _resetRateLimit());

  it('allows up to max requests in the window', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit('k1', 5, now + i);
      expect(r.ok).toBe(true);
    }
  });

  it('rejects the (max+1)th request and surfaces retry-after', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) checkRateLimit('k1', 5, now + i);
    const blocked = checkRateLimit('k1', 5, now + 6);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('lets traffic through again after the window slides past', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) checkRateLimit('k1', 5, now + i);
    expect(checkRateLimit('k1', 5, now + 6).ok).toBe(false);
    // After 60s + 1ms, the original hits fall out of the sliding window.
    expect(checkRateLimit('k1', 5, now + 60_001).ok).toBe(true);
  });

  it('isolates buckets per key (different ip:user pair = independent quota)', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) checkRateLimit('alice', 5, now + i);
    expect(checkRateLimit('alice', 5, now + 6).ok).toBe(false);
    expect(checkRateLimit('bob', 5, now + 6).ok).toBe(true);
  });
});
