import type { Pool } from 'pg';
import { totalCostUsd, type ClaudeUsage } from './pricing.js';

/**
 * Anthropic daily-spend guard. Reads/writes the `system_limits` table seeded
 * by db/migrations/002_pricing.sql. Two effective hooks:
 *
 *   1. assertBudgetAvailable(pool) — pre-flight, throws BudgetExceededError
 *      if today's running total has hit the configured cap. Resets the
 *      counter to 0 when the previous reset_at marker is from a prior UTC
 *      day. Concurrency-safe via SELECT FOR UPDATE.
 *
 *   2. recordSpend(pool, usage) — post-Claude-call, increments the day's
 *      running total by the computed USD cost. Idempotent under retry only
 *      to the extent that the underlying UPDATE is atomic; no per-call
 *      idempotency key (we accept slight over-count on rare worker restarts
 *      vs. risking under-count and over-spend).
 *
 * Both are no-ops when pool is null — keeps PRICING_ENABLED=false and
 * BUDGET_GUARD_ENABLED=false paths identical to v1.
 */

export class BudgetExceededError extends Error {
  readonly code = 'STORYBOARD_BUDGET_EXCEEDED';
  constructor(public readonly spend: number, public readonly limit: number) {
    super(`Anthropic daily spend ${spend.toFixed(2)} USD has reached the cap of ${limit.toFixed(2)} USD. Job rejected.`);
    this.name = 'BudgetExceededError';
  }
}

const TODAY_UTC = () => new Date(Date.UTC(
  new Date().getUTCFullYear(),
  new Date().getUTCMonth(),
  new Date().getUTCDate(),
));

export interface SpendGuardOpts {
  pool: Pool | null;
  /** Override now() for unit tests. */
  now?: () => Date;
}

export async function assertBudgetAvailable(opts: SpendGuardOpts): Promise<void> {
  if (!opts.pool) return;
  const now = (opts.now ?? (() => new Date()))();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const client = await opts.pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the three relevant rows so a concurrent reset doesn't race the read.
    const { rows } = await client.query(
      `SELECT key, value FROM system_limits
       WHERE key IN ('anthropic_daily_limit_usd','anthropic_daily_spend_usd','anthropic_daily_reset_at')
       FOR UPDATE`,
    );
    const map = new Map<string, string>(rows.map((r) => [r.key as string, r.value as string]));
    const limit = Number(map.get('anthropic_daily_limit_usd') ?? '25');
    let spend = Number(map.get('anthropic_daily_spend_usd') ?? '0');
    const resetMarker = map.get('anthropic_daily_reset_at') ?? '';
    const isStale = resetMarker !== today.toISOString();
    if (isStale) {
      await client.query(
        `UPDATE system_limits SET value=$2 WHERE key='anthropic_daily_spend_usd'`,
        [today.toISOString(), '0'],
      );
      await client.query(
        `UPDATE system_limits SET value=$1 WHERE key='anthropic_daily_reset_at'`,
        [today.toISOString()],
      );
      spend = 0;
    }
    await client.query('COMMIT');
    if (spend >= limit) {
      throw new BudgetExceededError(spend, limit);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function recordSpend(opts: SpendGuardOpts, usage: ClaudeUsage): Promise<number> {
  if (!opts.pool) return 0;
  const cost = totalCostUsd(usage);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  // Single-statement UPDATE so we don't need a transaction. value is TEXT
  // in system_limits so we cast through numeric for the math.
  const { rows } = await opts.pool.query(
    `UPDATE system_limits
       SET value = ((COALESCE(NULLIF(value, ''), '0')::numeric + $1::numeric))::text
     WHERE key = 'anthropic_daily_spend_usd'
     RETURNING value`,
    [cost.toString()],
  );
  const newTotal = rows.length > 0 ? Number(rows[0]!.value) : 0;
  return newTotal;
}
