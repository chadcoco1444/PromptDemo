# Phase 3 — Domain-level Circuit Breaker Design

## Goal

Prevent wasted Playwright executions and IP bans by tracking per-domain failure rates in Redis. When a domain accumulates 3 consecutive Playwright failures (WAF block or error), the circuit opens for 30 minutes. Subsequent jobs for that domain throw immediately before launching a browser, falling through to the existing ScreenshotOne / Cheerio fallback chain.

## Architecture

The circuit breaker lives entirely in `workers/crawler/src/domainCircuit.ts`. It is a pure function module: callers pass in a Redis client. All state is stored in Redis so the circuit is shared across all worker instances (concurrency=2 today, could be higher later).

Integration point: `workers/crawler/src/index.ts` — the BullMQ job handler. Circuit is checked before `runCrawl` and wired into the `runPlaywright` callback.

## Redis Key Schema

```
circuit:<hostname>:strikes   integer (INCR)   TTL=600s   — consecutive failure count
circuit:<hostname>:open      "1"              TTL=1800s  — circuit is open
circuit:<hostname>:probe     "1" SET NX       TTL=120s   — half-open probe slot
```

All keys are namespaced by hostname (e.g. `circuit:linear.app:strikes`).

## State Machine

```
CLOSED  → (strikes >= 3)       → OPEN
OPEN    → (TTL expires 30min)  → HALF-OPEN
HALF-OPEN → (probe claimed, success) → CLOSED
HALF-OPEN → (probe claimed, failure) → OPEN  (immediate, no threshold)
HALF-OPEN → (probe in-flight)        → reject job (don't pile on)
```

## checkCircuit(redis, hostname)

Returns one of four values:

| Return value                  | Meaning                                                        |
|-------------------------------|----------------------------------------------------------------|
| `'closed'`                    | Normal — proceed with Playwright                               |
| `'open'`                      | Circuit is tripped — skip Playwright immediately               |
| `'half-open-probe-claimed'`   | This job is the probe — proceed with Playwright as trial       |
| `'half-open-probe-in-flight'` | Another job is already probing — skip Playwright for this job  |

Logic:
1. `GET circuit:<hostname>:open` → if exists → return `'open'`
2. `SET circuit:<hostname>:probe "1" NX EX 120` → if succeeded → return `'half-open-probe-claimed'`
3. `GET circuit:<hostname>:probe` → if exists → return `'half-open-probe-in-flight'`
4. Return `'closed'`

## recordFailure(redis, hostname)

1. If `GET circuit:<hostname>:probe` → probe is failing:
   - `DEL circuit:<hostname>:probe`
   - `SET circuit:<hostname>:open "1" EX 1800` — re-open immediately
   - Return
2. Else (normal failure):
   - `INCR circuit:<hostname>:strikes`
   - `EXPIRE circuit:<hostname>:strikes 600`
   - If strikes >= 3: `SET circuit:<hostname>:open "1" EX 1800`, `DEL circuit:<hostname>:strikes`

## recordSuccess(redis, hostname)

- `DEL circuit:<hostname>:strikes circuit:<hostname>:probe circuit:<hostname>:open`

This closes the circuit from HALF-OPEN and resets the strike counter on any successful Playwright run.

## Integration in index.ts

```ts
const hostname = new URL(payload.url).hostname;
const state = await checkCircuit(connection, hostname);

if (state === 'open') {
  throw new Error(`CIRCUIT_OPEN domain=${hostname}`);
}
if (state === 'half-open-probe-in-flight') {
  throw new Error(`CIRCUIT_HALF_OPEN domain=${hostname}`);
}

// ... runCrawl call with runPlaywright callback:
runPlaywright: async (url) => {
  await job.updateProgress(makeIntel('crawl', 'Rendering with Playwright'));
  const pw = await runPlaywrightTrack({ url, timeoutMs: playwrightTimeoutMs });
  if (pw.kind === 'ok') {
    await recordSuccess(connection, hostname);
  } else {
    await recordFailure(connection, hostname);
  }
  return pw;
},
```

## Test Strategy (7 scenarios)

1. **Closed circuit** — no keys → `checkCircuit` returns `'closed'`
2. **Open circuit** — `open` key present → returns `'open'`
3. **Half-open probe claimed** — `open` absent, `probe` absent → SET NX succeeds → returns `'half-open-probe-claimed'`
4. **Half-open probe in-flight** — `open` absent, `probe` present → SET NX fails → returns `'half-open-probe-in-flight'`
5. **Strike accumulation below threshold** — 2 `recordFailure` calls → strikes=2, open absent
6. **Strike threshold reached** — 3 `recordFailure` calls → open key set, strikes key deleted
7. **Probe failure re-opens** — set probe key, call `recordFailure` → open key set, probe key deleted

Bonus (if desired): `recordSuccess` clears all three keys.

## Configuration

All values are constants in `domainCircuit.ts` (no env vars needed for v1):

```ts
const STRIKE_THRESHOLD = 3;
const STRIKES_TTL_S   = 600;   // 10 min sliding window
const OPEN_TTL_S      = 1800;  // 30 min cooldown
const PROBE_TTL_S     = 120;   // 2 min probe timeout
```

## Module Exports

```ts
export type CircuitState =
  | 'closed'
  | 'open'
  | 'half-open-probe-claimed'
  | 'half-open-probe-in-flight';

export async function checkCircuit(redis: Redis, hostname: string): Promise<CircuitState>
export async function recordFailure(redis: Redis, hostname: string): Promise<void>
export async function recordSuccess(redis: Redis, hostname: string): Promise<void>
```

Where `Redis` is `import type { Redis } from 'ioredis'`.
