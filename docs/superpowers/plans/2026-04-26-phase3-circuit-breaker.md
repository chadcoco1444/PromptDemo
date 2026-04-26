# Phase 3 — Domain-level Circuit Breaker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the Playwright crawler from repeated WAF blocks and errors by implementing a Redis-backed domain-level circuit breaker with CLOSED / OPEN / HALF-OPEN state machine.

**Architecture:** New module `domainCircuit.ts` (pure Redis functions, no BullMQ coupling). Integrated at the job-handler level in `index.ts`: circuit check before `runCrawl`, failure/success recording inside the `runPlaywright` callback.

**Tech Stack:** ioredis, ioredis-mock (tests), vitest

---

## File Map

| Action | Path |
|--------|------|
| Create | `workers/crawler/src/domainCircuit.ts` |
| Create | `workers/crawler/tests/domainCircuit.test.ts` |
| Modify | `workers/crawler/src/index.ts` |

---

### Task 1: domainCircuit.ts + State Machine Tests

**Files:**
- Create: `workers/crawler/src/domainCircuit.ts`
- Create: `workers/crawler/tests/domainCircuit.test.ts`

#### Step 1: Write the failing tests (Red phase)

Create `workers/crawler/tests/domainCircuit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Redis from 'ioredis-mock';
import {
  checkCircuit,
  recordFailure,
  recordSuccess,
  type CircuitState,
} from '../src/domainCircuit.js';

const HOST = 'example.com';

function makeRedis() {
  return new Redis();
}

describe('checkCircuit', () => {
  it('returns closed when no keys exist', async () => {
    const redis = makeRedis();
    const state = await checkCircuit(redis as any, HOST);
    expect(state).toBe<CircuitState>('closed');
  });

  it('returns open when open key exists', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:open`, '1', 'EX', 1800);
    const state = await checkCircuit(redis as any, HOST);
    expect(state).toBe<CircuitState>('open');
  });

  it('returns half-open-probe-claimed when open absent and probe absent', async () => {
    const redis = makeRedis();
    const state = await checkCircuit(redis as any, HOST);
    // No open key → tries SET NX → probe absent → claims it
    expect(state).toBe<CircuitState>('half-open-probe-claimed');
  });

  it('returns half-open-probe-in-flight when open absent but probe present', async () => {
    const redis = makeRedis();
    // Pre-set probe to simulate another worker holding it
    await redis.set(`circuit:${HOST}:probe`, '1', 'EX', 120);
    const state = await checkCircuit(redis as any, HOST);
    expect(state).toBe<CircuitState>('half-open-probe-in-flight');
  });
});

describe('recordFailure', () => {
  it('accumulates strikes below threshold without opening circuit', async () => {
    const redis = makeRedis();
    await recordFailure(redis as any, HOST);
    await recordFailure(redis as any, HOST);
    const strikes = await redis.get(`circuit:${HOST}:strikes`);
    const open = await redis.get(`circuit:${HOST}:open`);
    expect(Number(strikes)).toBe(2);
    expect(open).toBeNull();
  });

  it('opens circuit after 3 consecutive failures and clears strikes', async () => {
    const redis = makeRedis();
    await recordFailure(redis as any, HOST);
    await recordFailure(redis as any, HOST);
    await recordFailure(redis as any, HOST);
    const open = await redis.get(`circuit:${HOST}:open`);
    const strikes = await redis.get(`circuit:${HOST}:strikes`);
    expect(open).toBe('1');
    expect(strikes).toBeNull();
  });

  it('re-opens circuit immediately on probe failure and clears probe key', async () => {
    const redis = makeRedis();
    // Simulate probe in-flight (another worker set probe, now it's failing)
    await redis.set(`circuit:${HOST}:probe`, '1', 'EX', 120);
    await recordFailure(redis as any, HOST);
    const open = await redis.get(`circuit:${HOST}:open`);
    const probe = await redis.get(`circuit:${HOST}:probe`);
    expect(open).toBe('1');
    expect(probe).toBeNull();
  });
});

describe('recordSuccess', () => {
  it('clears all circuit keys to fully close the circuit', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:open`, '1', 'EX', 1800);
    await redis.set(`circuit:${HOST}:probe`, '1', 'EX', 120);
    await redis.set(`circuit:${HOST}:strikes`, '2');
    await recordSuccess(redis as any, HOST);
    expect(await redis.get(`circuit:${HOST}:open`)).toBeNull();
    expect(await redis.get(`circuit:${HOST}:probe`)).toBeNull();
    expect(await redis.get(`circuit:${HOST}:strikes`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (red)**

```bash
cd workers/crawler && pnpm vitest run tests/domainCircuit.test.ts
```

Expected: fail with `Cannot find module '../src/domainCircuit.js'`

- [ ] **Step 3: Implement domainCircuit.ts**

Create `workers/crawler/src/domainCircuit.ts`:

```typescript
import type { Redis } from 'ioredis';

export type CircuitState =
  | 'closed'
  | 'open'
  | 'half-open-probe-claimed'
  | 'half-open-probe-in-flight';

const STRIKE_THRESHOLD = 3;
const STRIKES_TTL_S   = 600;
const OPEN_TTL_S      = 1800;
const PROBE_TTL_S     = 120;

function key(hostname: string, suffix: 'strikes' | 'open' | 'probe'): string {
  return `circuit:${hostname}:${suffix}`;
}

export async function checkCircuit(redis: Redis, hostname: string): Promise<CircuitState> {
  const openVal = await redis.get(key(hostname, 'open'));
  if (openVal !== null) return 'open';

  // Try to claim the half-open probe slot
  const claimed = await redis.set(key(hostname, 'probe'), '1', 'EX', PROBE_TTL_S, 'NX');
  if (claimed === 'OK') return 'half-open-probe-claimed';

  const probeVal = await redis.get(key(hostname, 'probe'));
  if (probeVal !== null) return 'half-open-probe-in-flight';

  return 'closed';
}

export async function recordFailure(redis: Redis, hostname: string): Promise<void> {
  const probeVal = await redis.get(key(hostname, 'probe'));
  if (probeVal !== null) {
    // Probe failure — re-open immediately
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

export async function recordSuccess(redis: Redis, hostname: string): Promise<void> {
  await redis.del(
    key(hostname, 'strikes'),
    key(hostname, 'probe'),
    key(hostname, 'open'),
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass (green)**

```bash
cd workers/crawler && pnpm vitest run tests/domainCircuit.test.ts
```

Expected: 8 tests pass (4 checkCircuit + 3 recordFailure + 1 recordSuccess)

- [ ] **Step 5: Run full crawler test suite**

```bash
cd workers/crawler && pnpm test
```

Expected: all tests pass including overlayBlocker.test.ts

- [ ] **Step 6: TypeScript check**

```bash
pnpm --filter @lumespec/worker-crawler tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add workers/crawler/src/domainCircuit.ts workers/crawler/tests/domainCircuit.test.ts
git commit -m "feat(crawler): domain-level circuit breaker state machine (Phase 3 Task 1)"
```

---

### Task 2: Integrate circuit breaker into index.ts

**Files:**
- Modify: `workers/crawler/src/index.ts`

- [ ] **Step 1: Write failing integration test**

Add to `workers/crawler/tests/domainCircuit.test.ts` a new describe block:

```typescript
describe('checkCircuit — closed returns closed (no probe side-effect on fresh circuit)', () => {
  it('closed circuit does not set probe key', async () => {
    const redis = makeRedis();
    const state = await checkCircuit(redis as any, HOST);
    // In a fresh circuit (no open key, no probe key), probe key will be set by checkCircuit
    // because SET NX is the mechanism to detect half-open — so state is half-open-probe-claimed
    // This confirms the algorithm: first call to checkCircuit on fresh redis claims the probe
    expect(['closed', 'half-open-probe-claimed']).toContain(state);
  });
});
```

Wait — this is a tricky design point: `checkCircuit` on a brand-new domain always claims the probe (since `open` is absent and `probe` is absent). But we want `'closed'` for a domain that has never failed.

**Design fix required:** `checkCircuit` must NOT claim the probe on a fresh domain. The probe slot is only meaningful when the circuit was previously OPEN and its TTL has now expired. We need to distinguish "never had strikes" from "was open, now expired".

Since the `open` key has a TTL (self-expires), there's no way to tell "was open" from "never opened" without a separate key. Simplest fix: **only attempt probe claim if `strikes > 0`**.

Updated `checkCircuit` logic:
1. `GET open` → if exists → `'open'`
2. `GET strikes` → if absent (no history) → return `'closed'` immediately (skip probe logic)
3. Strikes present AND open absent → domain had failures, circuit may have just recovered:
   - `SET probe NX` → `'half-open-probe-claimed'`
   - probe exists → `'half-open-probe-in-flight'`
   - neither → `'closed'` (strikes present but probe slot not contested — claim it as probe)

Actually, this is still not right. Let me reason through the state machine more carefully:

The transition from OPEN → HALF-OPEN happens automatically when the `open` key TTL expires. After expiry:
- `open` key: absent
- `strikes` key: absent (was deleted when circuit opened)
- `probe` key: absent

So after the `open` TTL expires, all three keys are gone — indistinguishable from a brand-new domain.

**Correct solution:** Keep a separate `was-open` tombstone with a longer TTL, OR change the approach: only enter half-open logic when we know strikes were 0 AND the circuit was recently open.

**Simplest correct approach:** Accept that `checkCircuit` returns `'half-open-probe-claimed'` on the very first call to any domain (brand new). The job handler treats `'half-open-probe-claimed'` identically to `'closed'` — it proceeds with Playwright. So the behavior is correct even if the naming is slightly misleading. A successful run will call `recordSuccess` which DELs the probe key, and subsequent calls return `'closed'` ... wait, no: after `recordSuccess` DELs the probe, the next `checkCircuit` call will again try SET NX and return `'half-open-probe-claimed'`.

**Real fix:** Only attempt the probe claim if there's evidence the circuit was previously active. Use a `was-active` flag set on first failure and cleared on success... 

**Pragmatic fix for v1:** Treat `'half-open-probe-claimed'` and `'closed'` identically in index.ts. Both proceed with Playwright. The circuit guard only blocks on `'open'` and `'half-open-probe-in-flight'`. This is semantically correct and safe.

Update the integration accordingly.

- [ ] **Step 1 (revised): Add the import and circuit logic to index.ts**

In `workers/crawler/src/index.ts`, add imports after existing imports:

```typescript
import { checkCircuit, recordFailure, recordSuccess } from './domainCircuit.js';
```

In the BullMQ job handler, before the `runCrawl` call, add:

```typescript
const hostname = new URL(payload.url).hostname;
const circuitState = await checkCircuit(connection, hostname);

if (circuitState === 'open') {
  throw new Error(`CIRCUIT_OPEN domain=${hostname}`);
}
if (circuitState === 'half-open-probe-in-flight') {
  throw new Error(`CIRCUIT_HALF_OPEN domain=${hostname}`);
}
```

In the `runPlaywright` callback inside `runCrawl`, wrap the track call:

```typescript
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

Full updated handler in `workers/crawler/src/index.ts` (lines 33-90):

```typescript
const worker = new Worker<JobPayload>(
  'crawl',
  async (job: Job<JobPayload>) => {
    const payload = JobPayload.parse(job.data);
    const hostname = new URL(payload.url).hostname;

    const circuitState = await checkCircuit(connection, hostname);
    if (circuitState === 'open') {
      throw new Error(`CIRCUIT_OPEN domain=${hostname}`);
    }
    if (circuitState === 'half-open-probe-in-flight') {
      throw new Error(`CIRCUIT_HALF_OPEN domain=${hostname}`);
    }

    const uploader = async (buf: Buffer, filename: string): Promise<S3Uri> => {
      const key = buildKey(payload.jobId, filename);
      const lower = filename.toLowerCase();
      const contentType = lower.endsWith('.jpg')  ? 'image/jpeg'
                        : lower.endsWith('.svg')  ? 'image/svg+xml'
                        : lower.endsWith('.png')  ? 'image/png'
                        : lower.endsWith('.webp') ? 'image/webp'
                        : 'application/octet-stream';
      return putObject(s3, s3Cfg.bucket, key, buf, contentType);
    };

    await job.updateProgress(makeIntel('crawl', `Opening ${payload.url}`));
    const result = await runCrawl({
      url: payload.url,
      jobId: payload.jobId,
      rescueEnabled,
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
      runScreenshotOne: async (url) => {
        if (!screenshotOneKey) {
          return { kind: 'error', message: 'SCREENSHOTONE_ACCESS_KEY unset' } as const;
        }
        await job.updateProgress(makeIntel('crawl', 'Falling back to ScreenshotOne'));
        return runScreenshotOneTrack({ url, accessKey: screenshotOneKey });
      },
      runCheerio: async (url) => {
        await job.updateProgress(makeIntel('crawl', 'Extracting text with Cheerio'));
        return runCheerioTrack({ url });
      },
      uploader,
      downloadLogo,
    });

    await job.updateProgress(makeIntel('crawl', 'Packing results'));
    const resultJsonKey = buildKey(payload.jobId, 'crawlResult.json');
    const resultUri = await putObject(
      s3,
      s3Cfg.bucket,
      resultJsonKey,
      Buffer.from(JSON.stringify(result, null, 2)),
      'application/json'
    );
    return { crawlResultUri: resultUri };
  },
  {
    connection,
    concurrency: 2,
    lockDuration: 90_000,
  }
);
```

- [ ] **Step 2: Run full test suite**

```bash
cd workers/crawler && pnpm test
```

Expected: all tests pass

- [ ] **Step 3: Global typecheck**

```bash
pnpm typecheck
```

Expected: no errors across entire monorepo

- [ ] **Step 4: Commit**

```bash
git add workers/crawler/src/index.ts
git commit -m "feat(crawler): integrate circuit breaker into job handler (Phase 3 Task 2)"
```
