import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import PostgresAdapter from '@auth/pg-adapter';
import { Pool } from 'pg';
import { assertAuthEnv, isAuthEnabled } from './lib/authEnabled';

/**
 * NextAuth v5 wiring. All paths that touch the adapter or Google provider
 * are guarded behind AUTH_ENABLED. When the flag is off we export stub
 * handlers that return 404 — keeps the route file static-analysable without
 * crashing at module load time.
 *
 * Session strategy: database (sessions table managed by @auth/pg-adapter).
 * Database-backed sessions rather than JWT because the credit enforcement
 * layer (Feature 5) needs to hit the users + credits tables on every
 * authenticated request anyway, so session-table roundtrip costs are
 * negligible. Also: easy session revocation for refund/abuse workflows.
 */

let _pool: Pool | null = null;
function pool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Modest pool for dev — scale up in production via env if needed.
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
  }
  return _pool;
}

// Validate env at module load so mis-configuration is surfaced immediately.
assertAuthEnv();

const nextAuth = isAuthEnabled()
  ? NextAuth({
      adapter: PostgresAdapter(pool()),
      providers: [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ],
      session: { strategy: 'database' },
      // AUTH_SECRET is verified non-null by assertAuthEnv() above — the
      // non-null assertion keeps TS's exactOptionalPropertyTypes happy.
      secret: process.env.AUTH_SECRET!,
    })
  : null;

/**
 * Guarded re-exports. The non-null assertions are safe because any code that
 * calls these MUST gate on isAuthEnabled() first. See /app/api/auth/route.ts
 * and history/page.tsx for the pattern.
 */
export const handlers = nextAuth?.handlers;
export const auth = nextAuth?.auth;
export const signIn = nextAuth?.signIn;
export const signOut = nextAuth?.signOut;

export { isAuthEnabled } from './lib/authEnabled';
