import type { Pool, PoolClient } from 'pg';
import { CONCURRENCY_LIMIT, type Tier } from './ledger.js';

/**
 * Credit-persistence layer. Every mutation is wrapped in a transaction with
 * SELECT ... FOR UPDATE to serialize concurrent requests from the same user.
 * The credit_transactions audit log is written in the same tx so debit +
 * balance + transaction are one atomic unit.
 */

export interface DebitResult {
  ok: boolean;
  code?: 'insufficient_credits' | 'concurrency_limit' | 'user_not_found';
  balanceAfter?: number;
  tier?: Tier;
  activeCount?: number;
  limit?: number;
}

export interface CreditsSnapshot {
  balance: number;
  tier: Tier;
  allowance: number;
  activeJobs: number;
  concurrencyLimit: number;
}

/**
 * Load a user's current credits + tier + active-job count in one roundtrip.
 * Used by GET /api/users/me/credits to populate the UsageIndicator + /billing.
 */
export async function getSnapshot(pool: Pool, userId: number): Promise<CreditsSnapshot | null> {
  const { rows } = await pool.query(
    `SELECT
       c.balance AS balance,
       COALESCE(s.tier, 'free') AS tier,
       (SELECT count(*)::int FROM jobs WHERE user_id = $1
          AND status IN ('queued','crawling','generating','waiting_render_slot','rendering')
       ) AS active_jobs
     FROM users u
     LEFT JOIN credits c ON c.user_id = u.id
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const tier = (row.tier ?? 'free') as Tier;
  return {
    balance: row.balance ?? 0,
    tier,
    allowance: tierAllowance(tier),
    activeJobs: row.active_jobs ?? 0,
    concurrencyLimit: CONCURRENCY_LIMIT[tier],
  };
}

function tierAllowance(tier: Tier): number {
  // Avoid circular imports by inlining vs. re-exporting from ledger.
  return tier === 'free' ? 30 : tier === 'pro' ? 300 : 2000;
}

/**
 * Pre-flight debit: verify concurrency + balance + charge in one transaction.
 * Returns the new balance on success so the caller can pass it into the SSE
 * snapshot. On failure, the transaction rolls back — no partial state.
 *
 * This is the HOT path for POST /api/jobs when PRICING_ENABLED. Must stay fast.
 */
export async function debitForJob(
  pool: Pool,
  params: { userId: number; jobId: string; costSeconds: number },
): Promise<DebitResult> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Row-lock the user's credits row. FOR UPDATE serializes concurrent
    //    POST /api/jobs from the same user, so balance never goes negative.
    const balRes = await client.query(
      `SELECT balance FROM credits WHERE user_id = $1 FOR UPDATE`,
      [params.userId],
    );
    if (balRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'user_not_found' };
    }
    const currentBalance = balRes.rows[0].balance as number;

    // 2. Concurrency cap.
    const tierRes = await client.query(
      `SELECT COALESCE(s.tier, 'free') AS tier
       FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id
       WHERE u.id = $1`,
      [params.userId],
    );
    const tier = (tierRes.rows[0]?.tier ?? 'free') as Tier;
    const limit = CONCURRENCY_LIMIT[tier];

    const activeRes = await client.query(
      `SELECT count(*)::int AS n FROM jobs
       WHERE user_id = $1
         AND status IN ('queued','crawling','generating','waiting_render_slot','rendering')`,
      [params.userId],
    );
    const activeCount = activeRes.rows[0].n as number;
    if (activeCount >= limit) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'concurrency_limit', tier, activeCount, limit };
    }

    // 3. Balance check.
    if (currentBalance < params.costSeconds) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'insufficient_credits', tier, balanceAfter: currentBalance };
    }

    // 4. Debit + audit log.
    const newBalance = currentBalance - params.costSeconds;
    await client.query(
      `UPDATE credits SET balance = $2 WHERE user_id = $1`,
      [params.userId, newBalance],
    );
    await client.query(
      `INSERT INTO credit_transactions (user_id, job_id, delta, reason, balance_after)
       VALUES ($1, $2, $3, 'debit', $4)`,
      [params.userId, params.jobId, -params.costSeconds, newBalance],
    );
    await client.query('COMMIT');
    return { ok: true, balanceAfter: newBalance, tier };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Refund a previously-debited amount. Called by the orchestrator when a
 * job fails — refund percentage is decided by calculateRefund() in ledger.ts,
 * but the persistence is here.
 *
 * Idempotency: if a refund for the same jobId already exists in
 * credit_transactions with reason='refund', we skip. Protects against
 * orchestrator-restart replay.
 */
export async function refundForJob(
  pool: Pool,
  params: { userId: number; jobId: string; refundSeconds: number },
): Promise<{ ok: boolean; balanceAfter?: number; skipped?: 'already_refunded' }> {
  if (params.refundSeconds <= 0) return { ok: true };
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check.
    const existing = await client.query(
      `SELECT 1 FROM credit_transactions
       WHERE job_id = $1 AND reason = 'refund' LIMIT 1`,
      [params.jobId],
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK');
      return { ok: true, skipped: 'already_refunded' };
    }

    const balRes = await client.query(
      `SELECT balance FROM credits WHERE user_id = $1 FOR UPDATE`,
      [params.userId],
    );
    if (balRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: false };
    }
    const newBalance = (balRes.rows[0].balance as number) + params.refundSeconds;
    await client.query(
      `UPDATE credits SET balance = $2 WHERE user_id = $1`,
      [params.userId, newBalance],
    );
    await client.query(
      `INSERT INTO credit_transactions (user_id, job_id, delta, reason, balance_after)
       VALUES ($1, $2, $3, 'refund', $4)`,
      [params.userId, params.jobId, params.refundSeconds, newBalance],
    );
    await client.query('COMMIT');
    return { ok: true, balanceAfter: newBalance };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
