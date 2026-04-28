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
 *
 * Fails-open (returns 'closed') if Redis is unavailable, so crawl proceeds
 * rather than hanging.
 */
export async function checkCircuit(redis: Redis, hostname: string): Promise<CircuitState> {
  try {
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
  } catch {
    // Redis infra failure — fail-open so crawl proceeds rather than hanging
    return 'closed';
  }
}

/**
 * Record a Playwright failure. Accumulates strikes; opens circuit at threshold.
 * Probe failures immediately re-open without needing 3 strikes.
 *
 * @param wasProbe - Pass true when this worker held the probe (half-open-probe-claimed).
 *                   Avoids re-reading the probe key from Redis (TOCTOU fix).
 */
export async function recordFailure(redis: Redis, hostname: string, wasProbe: boolean): Promise<void> {
  if (wasProbe) {
    // Probe failure — re-open immediately, no threshold needed
    await redis.del(key(hostname, 'probe'));
    await redis.set(key(hostname, 'open'), '1', 'EX', OPEN_TTL_S);
    return;
  }

  // Use a pipeline so INCR + EXPIRE are issued atomically; avoids a zombie
  // strikes key with no TTL if the process crashes between the two commands.
  const pipeline = redis.pipeline();
  pipeline.incr(key(hostname, 'strikes'));
  pipeline.expire(key(hostname, 'strikes'), STRIKES_TTL_S);
  const results = await pipeline.exec();
  const strikes = (results?.[0]?.[1] as number) ?? 0;

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

/**
 * Result type for evaluateCircuit. Distinguishes "go ahead with playwright"
 * (with wasProbe flag for recordFailure attribution) from "playwright is
 * gated by circuit state, surface this as a track-blocked signal".
 */
export type CircuitGateResult =
  | { kind: 'allow'; wasProbe: boolean }
  | { kind: 'blocked'; reason: 'CIRCUIT_OPEN' | 'CIRCUIT_HALF_OPEN' };

/**
 * Translate a circuit state into a structured gate decision for the
 * Playwright track. Encapsulates the 3-state mapping so the orchestrator's
 * runPlaywright lambda doesn't have to repeat the switch.
 *
 * Pre-2026-04-28: the worker handler called checkCircuit() at the top level
 * and threw UnrecoverableError on 'open' / 'half-open-probe-in-flight',
 * killing the entire job. That bypassed the orchestrator's pickTrack
 * fallback chain (playwright → ScreenshotOne → cheerio) — defeating the
 * whole point of having alternate tracks. Bug #3 Sub C moved the check
 * inside the runPlaywright lambda and converts blocking states into
 * `{ kind: 'blocked' }` results — pickTrack handles the rest.
 */
export async function evaluateCircuit(
  redis: Redis,
  hostname: string
): Promise<CircuitGateResult> {
  const state = await checkCircuit(redis, hostname);
  if (state === 'open') return { kind: 'blocked', reason: 'CIRCUIT_OPEN' };
  if (state === 'half-open-probe-in-flight') {
    return { kind: 'blocked', reason: 'CIRCUIT_HALF_OPEN' };
  }
  return { kind: 'allow', wasProbe: state === 'half-open-probe-claimed' };
}
