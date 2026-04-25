/**
 * Lightweight in-memory rate limiter for the Next.js BFF proxy. Sliding
 * window keyed by `${ip}:${userId ?? 'anon'}` — both axes per the v2.1 spec.
 *
 * Why in-memory (not Redis):
 *   - The hot path is /api/jobs/create which runs on the Next.js server only.
 *     One process per region in prod (Vercel/Cloud Run); single-tenant
 *     workloads are fine with in-memory.
 *   - apps/api still has @fastify/rate-limit as defense-in-depth.
 *   - Keeps the BFF free of pg/redis deps for this hop.
 *
 * Cleanup runs amortized on each call: prune entries with no recent hits.
 */
const WINDOW_MS = 60_000;
const cleanupBudget = 100;
const buckets = new Map<string, number[]>();
let cleanupTicker = 0;

export interface RateLimitDecision {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(key: string, max: number, now: number = Date.now()): RateLimitDecision {
  const cutoff = now - WINDOW_MS;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    return { ok: false, remaining: 0, retryAfterMs: hits[0]! + WINDOW_MS - now };
  }
  hits.push(now);
  buckets.set(key, hits);

  // Amortized GC — only sweep every N calls so we don't iterate the map
  // every request. Keeps memory bounded under low traffic.
  cleanupTicker += 1;
  if (cleanupTicker >= cleanupBudget) {
    cleanupTicker = 0;
    for (const [k, v] of buckets) {
      const fresh = v.filter((t) => t > cutoff);
      if (fresh.length === 0) buckets.delete(k);
      else buckets.set(k, fresh);
    }
  }
  return { ok: true, remaining: max - hits.length, retryAfterMs: 0 };
}

// Test-only — not exported from index. Lets unit tests reset state between cases.
export function _resetRateLimit() {
  buckets.clear();
  cleanupTicker = 0;
}
