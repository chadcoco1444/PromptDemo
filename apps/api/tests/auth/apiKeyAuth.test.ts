import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import {
  generateApiKey,
  hashApiKey,
  keyDisplayPrefix,
  verifyApiKey,
} from '../../src/auth/apiKeyAuth.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://lumespec:lumespec@localhost:5432/lumespec';

let pool: pg.Pool;
let testUserId: number;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (name, email, "emailVerified", image)
     VALUES ('API Key Test User', $1, now(), null)
     RETURNING id`,
    [`apikey-test-${Date.now()}@example.com`],
  );
  testUserId = rows[0]!.id;
  // Seed Max-tier subscription so the verify path returns tier='max'
  await pool.query(
    `INSERT INTO subscriptions (user_id, tier, status, current_period_end)
     VALUES ($1, 'max', 'active', now() + interval '30 days')
     ON CONFLICT (user_id) DO UPDATE SET tier = 'max'`,
    [testUserId],
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM api_keys WHERE user_id = $1`, [testUserId]);
  await pool.query(`DELETE FROM subscriptions WHERE user_id = $1`, [testUserId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  await pool.end();
});

// ---------------------------------------------------------------------------
// Pure-function unit tests (no DB)
// ---------------------------------------------------------------------------

describe('generateApiKey', () => {
  it('generates keys with lume_ prefix and 32-char suffix', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^lume_[\w-]{32}$/);
  });

  it('generates unique keys each call', () => {
    const keys = new Set(Array.from({ length: 20 }, generateApiKey));
    expect(keys.size).toBe(20);
  });
});

describe('hashApiKey', () => {
  it('produces a 64-char hex string (SHA-256)', () => {
    const hash = hashApiKey('lume_someKey');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const key = 'lume_abc123';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('different keys produce different hashes', () => {
    expect(hashApiKey('lume_aaa')).not.toBe(hashApiKey('lume_bbb'));
  });
});

describe('keyDisplayPrefix', () => {
  it('returns first 12 chars', () => {
    const key = 'lume_kJ4mN8pQrSTUVWXYZ1234567890ab';
    expect(keyDisplayPrefix(key)).toBe('lume_kJ4mN8p'); // 12 chars: 'lume_' + 7
  });
});

// ---------------------------------------------------------------------------
// Integration tests against real DB
// ---------------------------------------------------------------------------

describe('verifyApiKey (integration)', () => {
  it('returns not_found for an unknown key', async () => {
    const key = generateApiKey();
    const result = await verifyApiKey(pool, `Bearer ${key}`);
    expect(result).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('returns malformed for a token without lume_ prefix', async () => {
    const result = await verifyApiKey(pool, 'Bearer someRandomToken');
    expect(result).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('returns no_token for a missing header', async () => {
    const result = await verifyApiKey(pool, undefined);
    expect(result).toMatchObject({ ok: false, reason: 'no_token' });
  });

  it('returns ok + userId + tier for a valid active key', async () => {
    const rawKey = generateApiKey();
    const hash = hashApiKey(rawKey);
    const prefix = keyDisplayPrefix(rawKey);
    await pool.query(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, 'Test Key')`,
      [testUserId, hash, prefix],
    );

    const result = await verifyApiKey(pool, `Bearer ${rawKey}`);
    expect(result.ok).toBe(true);
    expect(result.userId).toBe(testUserId);
    expect(result.tier).toBe('max');
  });

  it('returns revoked for a key with revoked_at set', async () => {
    const rawKey = generateApiKey();
    const hash = hashApiKey(rawKey);
    const prefix = keyDisplayPrefix(rawKey);
    await pool.query(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, name, revoked_at) VALUES ($1, $2, $3, 'Revoked Key', now())`,
      [testUserId, hash, prefix],
    );

    const result = await verifyApiKey(pool, `Bearer ${rawKey}`);
    expect(result).toMatchObject({ ok: false, reason: 'revoked' });
  });

  it('updates last_used_at after successful verification', async () => {
    const rawKey = generateApiKey();
    const hash = hashApiKey(rawKey);
    const prefix = keyDisplayPrefix(rawKey);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, 'Used Key') RETURNING id`,
      [testUserId, hash, prefix],
    );
    const keyId = rows[0]!.id;

    const before = await pool.query<{ last_used_at: Date | null }>(
      'SELECT last_used_at FROM api_keys WHERE id = $1',
      [keyId],
    );
    expect(before.rows[0]!.last_used_at).toBeNull();

    await verifyApiKey(pool, `Bearer ${rawKey}`);

    // last_used_at is set fire-and-forget — give it a moment
    await new Promise((r) => setTimeout(r, 50));
    const after = await pool.query<{ last_used_at: Date | null }>(
      'SELECT last_used_at FROM api_keys WHERE id = $1',
      [keyId],
    );
    expect(after.rows[0]!.last_used_at).not.toBeNull();
  });
});
