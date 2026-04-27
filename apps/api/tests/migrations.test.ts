import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { Pool } from 'pg';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM __dirname shim — apps/api is "type": "module".
const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lumespec:lumespec@localhost:5432/lumespec';
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// Skip the whole suite if Postgres is not reachable — keeps CI runs that
// don't provision a DB green. Local devs running `pnpm test` after
// `pnpm infra:up` will exercise the test.
let postgresUp = false;

beforeAll(async () => {
  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await pool.query('SELECT 1');
    postgresUp = true;
  } catch {
    postgresUp = false;
  } finally {
    await pool.end();
  }
});

describe('db:migrate idempotency', () => {
  it('applying migrations twice succeeds and leaves pgmigrations stable', async () => {
    if (!postgresUp) {
      console.warn('[migrations.test] Postgres not reachable at', DATABASE_URL, '— skipping');
      return;
    }

    // First run: may apply 0..N migrations (depends on DB state when test starts).
    // We don't assert the count of NEW rows, only that the run succeeds.
    execSync('pnpm db:migrate', {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL },
      stdio: 'inherit',
    });

    const pool = new Pool({ connectionString: DATABASE_URL });
    const before = await pool.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY name');
    const beforeNames = before.rows.map((r) => r.name);

    // Sanity: every currently-checked-in migration file is applied.
    // Intentionally `arrayContaining` (subset check), NOT strict equality:
    // this test's single responsibility is idempotency (double-run stability).
    // Forcing strict equality would make every new 00N_*.sql require a test
    // fixture bump, adding friction without catching real bugs — manifest
    // drift is best caught by `pnpm db:migrate` itself failing on apply.
    const expectedNames = ['001_initial', '002_pricing', '003_api_keys', '004_history_polish'];
    expect(beforeNames).toEqual(expect.arrayContaining(expectedNames));

    // Second run: must be a no-op. Any migration that violates idempotency
    // (e.g., CREATE TABLE without IF NOT EXISTS) throws here.
    execSync('pnpm db:migrate', {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL },
      stdio: 'inherit',
    });

    const after = await pool.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY name');
    const afterNames = after.rows.map((r) => r.name);

    // Same names, same count — second run added nothing.
    expect(afterNames).toEqual(beforeNames);

    await pool.end();
  }, 60_000); // 60s timeout — node-pg-migrate cold start + 4 migrations
});
