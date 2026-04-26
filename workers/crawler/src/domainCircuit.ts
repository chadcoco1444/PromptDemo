import type { Redis } from 'ioredis';

export type CircuitState =
  | 'closed'
  | 'open'
  | 'half-open-probe-claimed'
  | 'half-open-probe-in-flight';

const STRIKE_THRESHOLD = 3;
const STRIKES_TTL_S   = 600;   // 10 min sliding window
const OPEN_TTL_S      = 1800;  // 30 min cooldown
const PROBE_TTL_S     = 120;   // 2 min probe lock timeout
const HEALTHY_TTL_S   = 60;    // 1 min fresh-success marker

function key(hostname: string, suffix: 'strikes' | 'open' | 'probe' | 'healthy'): string {
  return `circuit:${hostname}:${suffix}`;
}

/**
 * Check circuit state before launching Playwright.
 * 'closed' and 'half-open-probe-claimed' both mean: proceed with Playwright.
 * 'open' and 'half-open-probe-in-flight' mean: skip Playwright.
 */
export async function checkCircuit(redis: Redis, hostname: string): Promise<CircuitState> {
  // Fast path: recent success marks the circuit as definitively closed
  const healthyVal = await redis.get(key(hostname, 'healthy'));
  if (healthyVal !== null) return 'closed';

  // Circuit open flag
  const openVal = await redis.get(key(hostname, 'open'));
  if (openVal !== null) return 'open';

  // Try to claim the probe slot (half-open recovery or new domain)
  const claimed = await redis.set(key(hostname, 'probe'), '1', 'EX', PROBE_TTL_S, 'NX');
  if (claimed === 'OK') return 'half-open-probe-claimed';

  // Another job is already probing
  return 'half-open-probe-in-flight';
}

/**
 * Record a Playwright failure. Accumulates strikes; opens circuit at threshold.
 * Probe failures immediately re-open without needing 3 strikes.
 */
export async function recordFailure(redis: Redis, hostname: string): Promise<void> {
  const probeVal = await redis.get(key(hostname, 'probe'));
  if (probeVal !== null) {
    // Probe failure — re-open immediately, no threshold needed
    await redis.del(key(hostname, 'probe'));
    await redis.set(key(hostname, 'open'), '1', 'EX', OPEN_TTL_S);
    return;
  }

  const strikes = await redis.incr(key(hostname, 'strikes'));
  await redis.expire(key(hostname, 'strikes'), STRIKES_TTL_S);

  if (strikes >= STRIKE_THRESHOLD) {
    await redis.set(key(hostname, 'open'), '1', 'EX', OPEN_TTL_S);
    await redis.del(key(hostname, 'strikes'));
  }
}

/**
 * Record a Playwright success. Closes circuit and marks domain as healthy.
 */
export async function recordSuccess(redis: Redis, hostname: string): Promise<void> {
  await redis.set(key(hostname, 'healthy'), '1', 'EX', HEALTHY_TTL_S);
  await redis.del(
    key(hostname, 'strikes'),
    key(hostname, 'probe'),
    key(hostname, 'open'),
  );
}
