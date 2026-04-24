# Feature 4 Auth + History — Enablement Guide

**Status:** Scaffolded 2026-04-25. OAuth integration landed. History endpoint + job persistence deferred.

## What shipped

- **Postgres service** in `docker-compose.dev.yaml` with auto-migration from `db/migrations/*.sql`.
- **Initial schema** (`db/migrations/001_initial.sql`): `users`, `subscriptions`, `credits`, `credit_transactions`, `jobs` with indexes, CHECK constraints, and an `updated_at` trigger. NextAuth session tables (`accounts`, `sessions`, `verification_tokens`) are created by `@auth/pg-adapter` on first auth run, not here.
- **NextAuth v5** + `@auth/pg-adapter` + `pg` installed in `apps/web`.
- **`apps/web/src/auth.ts`** — NextAuth config with Google provider + database session strategy. Gated behind `AUTH_ENABLED` env var so it's a no-op until the user opts in.
- **`apps/web/src/app/api/auth/[...nextauth]/route.ts`** — handler re-export, returns 404 when `AUTH_ENABLED=false`.
- **`apps/web/src/components/AuthButton.tsx`** — server component rendering Sign in / avatar + Sign out / History link in the nav. Renders `null` when `AUTH_ENABLED=false`.
- **`apps/web/src/app/history/page.tsx`** — skeleton list page with animated placeholder cards. Redirects to `/api/auth/signin?callbackUrl=/history` if not signed in. Waiting on the data-fetch endpoint (see below).
- **`.env.example`** updated with the full F4 + F5 env var skeleton and a `AUTH_ENABLED` flag (default `false`).

## What's deferred (next session)

1. **`GET /api/users/me/jobs`** endpoint in `apps/api` — returns the signed-in user's past jobs. Needs session-validation middleware + Postgres read.
2. **Job store dual-write** — `apps/api/src/jobStore.ts` writes to BOTH Redis (current) AND Postgres (new). Progress stays Redis-only per spec Amendment A.
3. **Client-side fetch in `/history`** — replace the placeholder skeleton grid with real job cards rendered from `/api/users/me/jobs`.
4. **Regenerate-with-hint lineage** — wire `parentJobId` through `POST /api/jobs` when user clicks "Regenerate" from history.
5. **Per-tier retention** — S3/GCS bucket-level lifecycle rules (30d free / 90d pro / 365d max) configured via `infra/lifecycle.yaml` and applied at provisioning time.

## Enabling auth locally

```bash
# 1. Start Postgres (runs migration automatically on an empty volume)
docker compose -f docker-compose.dev.yaml up -d postgres

# 2. Populate .env with the creds you already have + generate AUTH_SECRET
#    (see .env.example)
openssl rand -hex 32
# paste the output as AUTH_SECRET=...

# 3. Flip the flag
AUTH_ENABLED=true

# 4. Restart the web service so NextAuth picks up the env
pnpm --filter @promptdemo/web dev
```

Then visit `http://localhost:3001` → you'll see a "Sign in" button in the nav. Click it, complete the Google OAuth flow, and you'll land back on the home page with your avatar + a History link.

## Known gotchas

- **Google OAuth authorized redirect URI.** In the Google Cloud Console for the OAuth 2.0 client, add `http://localhost:3001/api/auth/callback/google` to the authorized redirect URIs. NextAuth uses this callback path regardless of whether the provider is Google/GitHub/Discord/etc.
- **pg-adapter initial migration.** The first sign-in attempt triggers `@auth/pg-adapter` to create its session tables inline. If Postgres isn't up, that fails with a connection error that looks scarier than it is — just start the DB.
- **`AUTH_ENABLED=false` is a complete short-circuit.** With the flag off, the `/history` page shows a "not configured" placeholder and `/api/auth/*` returns 404 — no stealth DB connections, no stealth OAuth calls. Matches the product rule "breaking changes to auth must never surprise users who didn't opt in."
- **Session strategy = `database`.** We explicitly chose database-backed sessions (not JWT) because Feature 5 credit enforcement needs a hot path to `users` + `credits` anyway, and database sessions give us cheap revocation for refunds/abuse. JWT would be faster but requires a separate revocation list.

## Rotate the OAuth secret

The `GOOGLE_CLIENT_SECRET` in `.env` was transmitted via chat on 2026-04-25. Before shipping to production, rotate it in the Google Cloud Console under Credentials → OAuth 2.0 Client → Reset Secret.

## Pointers for the next session

- `apps/api/src/jobStore.ts` — where dual-write lives. Touch the `create` + `patch` methods to mirror to Postgres.
- `apps/api/src/routes/postJob.ts` — add session lookup here (user_id → jobs.user_id) once AUTH_ENABLED.
- Add a new `apps/api/src/routes/userJobs.ts` with `GET /api/users/me/jobs` that SELECTs from the `jobs` table.
- Client-side fetch in `/history/page.tsx` — convert from async server component to client component, or do the fetch server-side with `cookies()` + API call.
