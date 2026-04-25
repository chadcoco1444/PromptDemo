import { describe, it, expect, vi } from 'vitest';
import { assertBudgetAvailable, recordSpend, BudgetExceededError } from '../../src/anthropic/spendGuard.js';

/**
 * Mock pg.Pool with a tiny in-memory key/value store. Lets us exercise the
 * sql logic without spinning up Postgres. Each test gets a fresh fixture so
 * we never leak state between assertions.
 */
function makeMockPool(initial: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial));
  const events: Array<{ q: string; params: unknown[] }> = [];

  const client = {
    async query(q: string, params?: unknown[]) {
      events.push({ q, params: params ?? [] });
      const text = q.trim();
      if (text.startsWith('BEGIN')) return { rows: [], rowCount: 0 };
      if (text.startsWith('COMMIT')) return { rows: [], rowCount: 0 };
      if (text.startsWith('ROLLBACK')) return { rows: [], rowCount: 0 };

      // SELECT key, value FROM system_limits WHERE key IN (...) FOR UPDATE
      if (text.startsWith('SELECT key, value')) {
        const rows = [...store.entries()].map(([k, v]) => ({ key: k, value: v }));
        return { rows, rowCount: rows.length };
      }

      if (text.startsWith('UPDATE system_limits SET value=$2 WHERE key=')) {
        // assertBudgetAvailable's stale-marker reset (2 args: ts, value)
        store.set('anthropic_daily_spend_usd', String(params?.[1] ?? '0'));
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith("UPDATE system_limits SET value=$1 WHERE key='anthropic_daily_reset_at'")) {
        store.set('anthropic_daily_reset_at', String(params?.[0] ?? ''));
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith('UPDATE system_limits') && text.includes('numeric + $1::numeric')) {
        const cur = Number(store.get('anthropic_daily_spend_usd') ?? '0');
        const inc = Number(params?.[0] ?? '0');
        const next = cur + inc;
        store.set('anthropic_daily_spend_usd', next.toString());
        return { rows: [{ value: next.toString() }], rowCount: 1 };
      }
      throw new Error(`unmocked query: ${text}`);
    },
    release: vi.fn(),
  };

  const pool = {
    async connect() {
      return client;
    },
    async query(q: string, params?: unknown[]) {
      return client.query(q, params);
    },
  } as never;

  return { pool, store, events };
}

describe('spend guard', () => {
  it('is a no-op when pool is null', async () => {
    await expect(assertBudgetAvailable({ pool: null })).resolves.toBeUndefined();
    await expect(recordSpend({ pool: null }, { input_tokens: 100, output_tokens: 100 })).resolves.toBe(0);
  });

  it('passes when spend < limit', async () => {
    const today = new Date('2026-04-25T00:00:00Z');
    const { pool } = makeMockPool({
      anthropic_daily_limit_usd: '25',
      anthropic_daily_spend_usd: '5',
      anthropic_daily_reset_at: today.toISOString(),
    });
    await expect(
      assertBudgetAvailable({ pool, now: () => today }),
    ).resolves.toBeUndefined();
  });

  it('throws BudgetExceededError when spend >= limit', async () => {
    const today = new Date('2026-04-25T00:00:00Z');
    const { pool } = makeMockPool({
      anthropic_daily_limit_usd: '25',
      anthropic_daily_spend_usd: '25.5',
      anthropic_daily_reset_at: today.toISOString(),
    });
    await expect(assertBudgetAvailable({ pool, now: () => today })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it('resets spend to 0 when reset_at marker is from a prior UTC day', async () => {
    const today = new Date('2026-04-25T12:00:00Z');
    const yesterday = new Date('2026-04-24T00:00:00Z');
    const { pool, store } = makeMockPool({
      anthropic_daily_limit_usd: '25',
      anthropic_daily_spend_usd: '24.99',
      anthropic_daily_reset_at: yesterday.toISOString(),
    });
    // Yesterday's spend was almost-cap, but today resets to 0.
    await expect(
      assertBudgetAvailable({ pool, now: () => today }),
    ).resolves.toBeUndefined();
    expect(store.get('anthropic_daily_spend_usd')).toBe('0');
  });

  it('recordSpend increments by the calculated USD cost', async () => {
    const { pool, store } = makeMockPool({
      anthropic_daily_spend_usd: '0',
    });
    // 1M input @ $3/M = $3
    await recordSpend({ pool }, { input_tokens: 1_000_000, output_tokens: 0 });
    expect(Number(store.get('anthropic_daily_spend_usd'))).toBeCloseTo(3, 4);
    // Another 1M output @ $15/M
    await recordSpend({ pool }, { input_tokens: 0, output_tokens: 1_000_000 });
    expect(Number(store.get('anthropic_daily_spend_usd'))).toBeCloseTo(18, 4);
  });
});
