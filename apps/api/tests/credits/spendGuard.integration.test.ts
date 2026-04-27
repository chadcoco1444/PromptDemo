import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { assertBudgetAvailable } from '../../src/credits/spendGuard.js';

/**
 * Regression for "could not determine data type of parameter $1" (pg 42P18).
 *
 * The mock-based test in spendGuard.test.ts was too permissive — it accepted
 * SQL that bound 2 params but only referenced `$2`, hiding the fact that real
 * Postgres rejects unreferenced placeholders. This integration test runs
 * assertBudgetAvailable against a real DB so the bug surfaces.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://lumespec:lumespec@localhost:5432/lumespec';

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DATABASE_URL });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Force the isStale branch by clearing the reset marker.
  await pool.query(
    `UPDATE system_limits SET value = '' WHERE key = 'anthropic_daily_reset_at'`,
  );
  await pool.query(
    `UPDATE system_limits SET value = '0' WHERE key = 'anthropic_daily_spend_usd'`,
  );
});

describe('assertBudgetAvailable — real pg integration', () => {
  it('completes the isStale reset branch without "parameter $1" error', async () => {
    // Pre-Spec3 R2 follow-up: the reset UPDATE bound 2 params but only
    // referenced $2 in SQL → pg threw 42P18 and crashed the orchestrator.
    await expect(assertBudgetAvailable({ pool })).resolves.toBeUndefined();

    // After the reset, spend should be 0 and reset_at should be today.
    const { rows } = await pool.query<{ key: string; value: string }>(
      `SELECT key, value FROM system_limits
       WHERE key IN ('anthropic_daily_spend_usd','anthropic_daily_reset_at')`,
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    expect(map.get('anthropic_daily_spend_usd')).toBe('0');
    expect(map.get('anthropic_daily_reset_at')).not.toBe('');
  });
});
