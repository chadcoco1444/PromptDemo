# S-A: Security Hardening — SSE Ownership + CORS

**Risks:** R7 (SSE ownership) + R8 (CORS wildcard) — P1  
**Date:** 2026-04-26  
**Status:** Approved — ready for implementation planning

---

## Problem

Two independent security gaps that can be addressed in a single PR:

### R7 — SSE Stream Has No Ownership Check

`GET /api/jobs/:id/stream` returns a full job object + live event stream to **any caller who knows the jobId**, regardless of whether they created it.

```ts
// apps/api/src/routes/stream.ts (current)
app.get('/api/jobs/:id/stream', async (req, reply) => {
  const job = await opts.store.get(req.params.id);
  if (!job) return reply.code(404).send({ error: 'not found' });
  // ← no userId check — any caller proceeds here
  ...
```

JobIds are UUIDs (low guessability), but this is security-by-obscurity. A user who obtains or guesses another user's jobId can:
- Read the full job input (URL, intent text, storyboard JSON)
- Subscribe to all future events on that job

### R8 — CORS Reflects Any Origin

```ts
// apps/api/src/app.ts:45
await app.register(cors, { origin: true });
```

`origin: true` makes `@fastify/cors` echo back whatever `Origin` header the request sends. Combined with browser-accessible endpoints, this allows any website to make credentialed cross-origin requests to the API.

The SSE route already sets `Access-Control-Allow-Origin` manually (correctly echoing origin), but the Fastify CORS plugin still applies the wildcard reflection to all other routes (`POST /api/jobs`, `GET /api/jobs/:id`, etc.).

---

## Design

### R7 — SSE Ownership Check

**Mechanism:** The stream route already operates within the authenticated context (the `X-User-Id` header is present when `AUTH_ENABLED=true`). The job record contains a `userId` field.

**Logic:**
```
if AUTH_ENABLED:
  extract userId from request header
  if job.userId ≠ undefined AND job.userId ≠ requestUserId:
    return 403 Forbidden
  (anonymous jobs — no userId on job — remain accessible to any authenticated user,
   matching existing GET /api/jobs/:id behaviour)
```

**When `AUTH_ENABLED=false`** (local dev, pre-auth mode): check is skipped entirely. Zero change to developer experience.

**Why not 404 instead of 403?** 403 leaks that the job exists. However, jobIds are UUIDs, so enumeration is not a practical threat. 404 would mislead legitimate debugging. We use **403** for clarity; this is consistent with how other resources handle ownership violations in this codebase.

**Header extraction:** reuse the existing `X-User-Id` header already validated by `verifyInternalToken` in the rate-limit middleware. The stream route reads `req.headers['x-user-id']` directly — same pattern as `postJob.ts`.

```ts
// Updated stream.ts (auth guard block)
const rawUserId = req.headers['x-user-id'];
const requestUserId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
if (opts.requireUserIdHeader && job.userId && job.userId !== requestUserId) {
  return reply.code(403).send({ error: 'forbidden' });
}
```

`StreamRouteOpts` gains one field:
```ts
export interface StreamRouteOpts {
  store: JobStore;
  broker: Broker;
  requireUserIdHeader?: boolean;   // ← new, mirrors postJob pattern
}
```

### R8 — CORS Hardening

Replace `origin: true` with an explicit allowlist driven by environment config:

```ts
// apps/api/src/app.ts
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001')
  .split(',')
  .map(o => o.trim());

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

**Environment variables:**

| Var | Local default | Production |
|---|---|---|
| `ALLOWED_ORIGINS` | `http://localhost:3001` | `https://lumespec.com,https://www.lumespec.com` |

**No-origin requests** (`!origin`) are allowed — these are server-to-server calls (curl, Fastify test client, internal services) which don't send an `Origin` header.

**The SSE route** already sets `Access-Control-Allow-Origin` manually on its raw response (bypassing the CORS plugin). It must be updated to use the same allowlist rather than unconditionally echoing the request origin:

```ts
// stream.ts — replace the echo pattern
const requestOrigin = req.headers.origin as string | undefined;
const corsOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
  ? requestOrigin
  : allowedOrigins[0] ?? '*';
reply.raw.writeHead(200, {
  ...
  'Access-Control-Allow-Origin': corsOrigin,
  ...
});
```

`allowedOrigins` is passed into `streamRoute` via its opts or read directly from `process.env` (acceptable since it's a deployment constant, not business logic).

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/routes/stream.ts` | Add ownership check block; fix CORS origin echo |
| `apps/api/src/app.ts` | Replace `origin: true` with allowlist closure |
| `apps/api/src/index.ts` | Pass `requireUserIdHeader: authEnabled` to `streamRoute` |
| `apps/api/.env.example` | Document `ALLOWED_ORIGINS` |
| `apps/api/tests/stream.test.ts` | Add ownership + CORS tests |
| `apps/api/tests/app.test.ts` | Verify CORS rejects unknown origin |

---

## Testing

**Ownership (stream.test.ts):**
- `AUTH_ENABLED` off → any caller can stream → 200
- `AUTH_ENABLED` on, userId matches → 200
- `AUTH_ENABLED` on, userId mismatch → 403
- `AUTH_ENABLED` on, anonymous job (no `job.userId`) → 200 (accessible to any authenticated user)

**CORS (app.test.ts):**
- Known origin → `Access-Control-Allow-Origin` matches
- Unknown origin → request rejected (CORS error)
- No origin header → allowed (server-to-server)

---

## Non-Goals

- Rate-limiting the SSE endpoint independently (handled by existing Fastify rate-limit plugin at the API level)
- Encrypting the SSE payload (TLS at the ingress handles this)
