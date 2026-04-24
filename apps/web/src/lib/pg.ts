import { Pool } from 'pg';

/**
 * Shared Postgres pool for the Next.js server. Both the NextAuth adapter
 * (apps/web/src/auth.ts) and the user-facing /api/users/me/jobs endpoint
 * reuse this so we have a single connection pool per Next.js worker.
 *
 * Lazy-initialized: only connects when first called, so any part of the
 * web app that runs with AUTH_ENABLED=false never creates a pool.
 */
let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — Postgres features (auth, history) require it.');
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
  }
  return _pool;
}
