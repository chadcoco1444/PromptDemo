import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { debitForJob, refundForJob } from '../../src/credits/store.js';
import { calculateRefund } from '../../src/credits/ledger.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://lumespec:lumespec@localhost:5432/lumespec';

let pool: pg.Pool;
let testUserId: number;
const TEST_JOB_ID = `test-store-${Date.now()}`;
const TEST_JOB_ID_2 = `test-store2-${Date.now()}`;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (name, email, "emailVerified", image)
     VALUES ('Test Store User', $1, now(), null)
     RETURNING id`,
    [`test-store-${Date.now()}@example.com`],
  );
  testUserId = rows[0]!.id;
  await pool.query(
    `INSERT INTO credits (user_id, balance) VALUES ($1, 50)
     ON CONFLICT (user_id) DO UPDATE SET balance = 50`,
    [testUserId],
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM credit_transactions WHERE user_id = $1`, [testUserId]);
  await pool.query(`DELETE FROM credits WHERE user_id = $1`, [testUserId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  await pool.end();
});

describe('debitForJob', () => {
  it('debits the correct amount and returns balanceAfter', async () => {
    const result = await debitForJob(pool, {
      userId: testUserId,
      jobId: TEST_JOB_ID,
      costSeconds: 30,
    });
    expect(result.ok).toBe(true);
    expect(result.balanceAfter).toBe(20); // 50 - 30
  });

  it('returns insufficient_credits when balance is too low', async () => {
    // Balance is now 20; try to debit 30 again
    const result = await debitForJob(pool, {
      userId: testUserId,
      jobId: TEST_JOB_ID_2,
      costSeconds: 30,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('insufficient_credits');
  });
});

describe('refundForJob', () => {
  it('adds back the refund amount and returns new balance', async () => {
    const refundSeconds = calculateRefund('render', 'RENDER_FAILED', 30);
    expect(refundSeconds).toBe(15); // 50% non-retryable render refund

    const result = await refundForJob(pool, {
      userId: testUserId,
      jobId: TEST_JOB_ID,
      refundSeconds,
    });
    expect(result.ok).toBe(true);
    expect(result.balanceAfter).toBe(35); // 20 + 15
  });

  it('is idempotent — double refund is skipped', async () => {
    const result = await refundForJob(pool, {
      userId: testUserId,
      jobId: TEST_JOB_ID,
      refundSeconds: 15,
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe('already_refunded');
    const { rows } = await pool.query<{ balance: number }>(
      `SELECT balance FROM credits WHERE user_id = $1`,
      [testUserId],
    );
    expect(rows[0]!.balance).toBe(35);
  });

  it('is a no-op when refundSeconds is 0', async () => {
    const result = await refundForJob(pool, {
      userId: testUserId,
      jobId: 'nonexistent',
      refundSeconds: 0,
    });
    expect(result.ok).toBe(true);
  });
});
