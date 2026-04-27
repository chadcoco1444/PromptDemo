# S-A: Security Hardening — SSE Ownership + CORS Allowlist

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two P1 security gaps: SSE stream has no ownership check (any caller who knows a jobId can subscribe), and CORS reflects any arbitrary origin instead of an explicit allowlist.

**Architecture:** Task 1 adds a `requireUserIdHeader` flag to `StreamRouteOpts` — when set, the route validates that `req.headers['x-user-id']` matches `job.userId` before starting the stream. Task 2 replaces `origin: true` in the `@fastify/cors` plugin with a callback closure that checks against an `ALLOWED_ORIGINS` env-var allowlist; the same list is passed into `streamRoute` so the raw SSE `Access-Control-Allow-Origin` header uses the allowlist rather than unconditionally echoing the request origin.

**Tech Stack:** Fastify 5, `@fastify/cors` 10, `light-my-request` 6 (`payloadAsStream: true` for SSE test injection), Vitest.

---

## File Map

| File | Action |
|---|---|
| `apps/api/src/routes/stream.ts` | Add `requireUserIdHeader?` and `allowedOrigins?` to `StreamRouteOpts`; add ownership guard; fix CORS echo |
| `apps/api/src/app.ts` | Add `allowedOrigins?` to `BuildOpts`; parse from env; replace `origin: true`; forward both fields to `streamRoute` |
| `apps/api/tests/stream.test.ts` | 4 new ownership tests (403 mismatch, 200 match, 200 auth-off, 200 anonymous job) |
| `apps/api/tests/app.test.ts` | 3 CORS tests (known origin, unknown origin, no origin) |
| `apps/api/.env.example` | Document `ALLOWED_ORIGINS` |

`apps/api/src/index.ts` — **no changes needed**. It already passes `requireUserIdHeader: authEnabled` to `build()`, which will forward it to `streamRoute` after this plan's changes.

---

### Task 1: SSE Ownership Check

**Files:**
- Modify: `apps/api/src/routes/stream.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/tests/stream.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `apps/api/tests/stream.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import RedisMock from 'ioredis-mock';
import { makeJobStore } from '../src/jobStore.js';
import { makeBroker } from '../src/sse/broker.js';
import { streamRoute } from '../src/routes/stream.js';

const BASE_JOB = {
  status: 'queued' as const,
  stage: null,
  progress: 0,
  input: { url: 'https://x.com', intent: 'test', duration: 30 as const },
  fallbacks: [] as never[],
  createdAt: 1000,
  updatedAt: 1000,
};

describe('GET /api/jobs/:id/stream', () => {
  it('returns 404 for missing job', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    app.register(streamRoute, { store, broker });
    const res = await app.inject({ method: 'GET', url: '/api/jobs/missing/stream' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when x-user-id does not match job.userId', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker(), requireUserIdHeader: true });
    await store.create({ jobId: 'j-mismatch', userId: '1', ...BASE_JOB });
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-mismatch/stream',
      headers: { 'x-user-id': '2' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'forbidden' });
    await app.close();
  });

  it('starts SSE stream when x-user-id matches job.userId', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker(), requireUserIdHeader: true });
    await store.create({ jobId: 'j-match', userId: '42', ...BASE_JOB });
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-match/stream',
      headers: { 'x-user-id': '42' },
      payloadAsStream: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    await app.close();
  });

  it('bypasses ownership check when requireUserIdHeader=false', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker(), requireUserIdHeader: false });
    await store.create({ jobId: 'j-auth-off', userId: '1', ...BASE_JOB });
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-auth-off/stream',
      headers: { 'x-user-id': '999' }, // different user, but auth disabled
      payloadAsStream: true,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('allows any authenticated user to stream an anonymous job (no userId on job)', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker(), requireUserIdHeader: true });
    await store.create({ jobId: 'j-anon', ...BASE_JOB }); // no userId field
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-anon/stream',
      headers: { 'x-user-id': '99' },
      payloadAsStream: true,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd apps/api && pnpm vitest run tests/stream.test.ts
```

Expected: TypeScript error — `requireUserIdHeader` does not exist in `StreamRouteOpts`. The existing 404 test should still pass.

- [ ] **Step 3: Add `requireUserIdHeader` to `StreamRouteOpts` and add the ownership guard**

In `apps/api/src/routes/stream.ts`:

**3a. Extend `StreamRouteOpts`** — replace:

```ts
export interface StreamRouteOpts {
  store: JobStore;
  broker: Broker;
}
```

With:

```ts
export interface StreamRouteOpts {
  store: JobStore;
  broker: Broker;
  requireUserIdHeader?: boolean;
  allowedOrigins?: string[];
}
```

**3b. Add the ownership guard** — immediately after the `if (!job)` 404 check (after line 13), insert:

```ts
    if (opts.requireUserIdHeader && job.userId) {
      const rawId = req.headers['x-user-id'];
      const requestUserId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (job.userId !== requestUserId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
    }
```

- [ ] **Step 4: Forward `requireUserIdHeader` to `streamRoute` in `app.ts`**

In `apps/api/src/app.ts`, replace the `streamRoute` registration (currently the last `app.register` before `healthz`):

```ts
await app.register(streamRoute, { store: opts.store, broker: opts.broker });
```

With:

```ts
await app.register(streamRoute, {
  store: opts.store,
  broker: opts.broker,
  requireUserIdHeader: opts.requireUserIdHeader ?? false,
});
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
cd apps/api && pnpm vitest run tests/stream.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/stream.ts apps/api/src/app.ts apps/api/tests/stream.test.ts
git commit -m "feat(stream): add SSE ownership check — 403 for userId mismatch when AUTH_ENABLED"
```

---

### Task 2: CORS Hardening

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/stream.ts`
- Modify: `apps/api/tests/app.test.ts`
- Create: `apps/api/.env.example`

- [ ] **Step 1: Write the failing CORS tests**

Add a new `describe('CORS', ...)` block at the end of `apps/api/tests/app.test.ts` (after the closing `});` of the existing `describe('api app', ...)` block):

```ts
describe('CORS allowlist', () => {
  async function buildCorsApp(allowedOrigins: string[]) {
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    return build({
      store,
      crawlQueue: { add: vi.fn().mockResolvedValue({ id: 'q' }) } as any,
      storyboardQueue: { add: vi.fn().mockResolvedValue({ id: 'q2' }) } as any,
      broker,
      fetchJson: async () => null,
      creditPool: null,
      logger: false,
      allowedOrigins,
    });
  }

  it('sets Access-Control-Allow-Origin for a known origin', async () => {
    const app = await buildCorsApp(['http://localhost:3001']);
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://localhost:3001' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    await app.close();
  });

  it('rejects requests from an unknown origin with 500', async () => {
    const app = await buildCorsApp(['http://localhost:3001']);
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://evil.com' },
    });
    expect(res.statusCode).toBe(500); // @fastify/cors sends 500 when callback passes an Error
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('allows server-to-server requests with no Origin header', async () => {
    const app = await buildCorsApp(['http://localhost:3001']);
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd apps/api && pnpm vitest run tests/app.test.ts
```

Expected: the 3 new CORS tests fail — `allowedOrigins` is not yet in `BuildOpts`, and the CORS plugin still uses `origin: true`.

- [ ] **Step 3: Update `app.ts` — add `allowedOrigins` to `BuildOpts`, parse from env, replace CORS plugin**

In `apps/api/src/app.ts`:

**3a. Add `allowedOrigins?` to `BuildOpts`** — insert after the `apiKeyPool?: Pool | null;` line:

```ts
  /**
   * Explicit list of origins allowed by the CORS plugin. Defaults to parsing
   * ALLOWED_ORIGINS env var (comma-separated), then 'http://localhost:3001'.
   * Always pass this in tests to avoid depending on process.env.
   */
  allowedOrigins?: string[];
```

**3b. Replace the CORS registration** — replace the line:

```ts
  await app.register(cors, { origin: true });
```

With:

```ts
  const allowedOrigins = opts.allowedOrigins ??
    (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001').split(',').map(o => o.trim());

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('CORS: origin not allowed'), false);
      }
    },
  });
```

**3c. Pass `allowedOrigins` to `streamRoute`** — update the streamRoute registration
(changed in Task 1 Step 4) to also include `allowedOrigins`:

```ts
  await app.register(streamRoute, {
    store: opts.store,
    broker: opts.broker,
    requireUserIdHeader: opts.requireUserIdHeader ?? false,
    allowedOrigins,
  });
```

- [ ] **Step 4: Fix the CORS echo in `stream.ts`**

In `apps/api/src/routes/stream.ts`, replace:

```ts
    // The raw response bypasses Fastify's CORS plugin; set the headers ourselves.
    // Echo the request's Origin so the browser's EventSource accepts the stream.
    // (EventSource doesn't send credentials by default, so we don't need Allow-Credentials.)
    const origin = (req.headers.origin as string | undefined) ?? '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    });
```

With:

```ts
    // The raw response bypasses Fastify's CORS plugin; set the header ourselves
    // using the same allowlist as the plugin — no unconditional origin echo.
    const allowedOrigins = opts.allowedOrigins ?? ['http://localhost:3001'];
    const requestOrigin = req.headers.origin as string | undefined;
    const corsOrigin = (requestOrigin !== undefined && allowedOrigins.includes(requestOrigin))
      ? requestOrigin
      : (allowedOrigins[0] ?? '*');
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': corsOrigin,
      Vary: 'Origin',
    });
```

- [ ] **Step 5: Create `apps/api/.env.example`**

```
# Comma-separated list of origins the CORS plugin and SSE stream will accept.
# First entry is the default for SSE connections with no Origin header.
# Development default: http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3001
```

- [ ] **Step 6: Run the new CORS tests to confirm they pass**

```bash
cd apps/api && pnpm vitest run tests/app.test.ts
```

Expected: all 7 tests PASS (4 existing + 3 new CORS tests).

- [ ] **Step 7: Run full workspace typecheck and test suite**

```bash
cd ../.. && pnpm typecheck && pnpm test
```

Expected:
- `pnpm typecheck`: 0 errors across all 8 workspace packages
- `pnpm test`: all tests PASS (≥620 passing; 3 skipped as before)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/stream.ts apps/api/tests/app.test.ts apps/api/.env.example
git commit -m "feat(cors): replace origin:true with ALLOWED_ORIGINS allowlist in CORS plugin and SSE stream"
```
