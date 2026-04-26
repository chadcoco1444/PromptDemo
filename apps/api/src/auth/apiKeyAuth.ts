import { createHash, randomBytes } from 'crypto';
import type { Pool } from 'pg';

/** Raw key format: lume_<32 base64url chars> — total 37 chars. */
const KEY_REGEX = /^lume_[\w-]{32}$/;
const MAX_KEYS_PER_USER = 5;

export { MAX_KEYS_PER_USER };

export function generateApiKey(): string {
  return 'lume_' + randomBytes(24).toString('base64url');
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** First 12 chars used as display prefix in the UI (e.g. "lume_kJ4mN8"). */
export function keyDisplayPrefix(rawKey: string): string {
  return rawKey.slice(0, 12);
}

export interface ApiKeyVerifyResult {
  ok: boolean;
  userId?: number;
  tier?: string;
  reason?: 'no_token' | 'malformed' | 'not_found' | 'revoked';
}

/**
 * Verifies a Bearer token that starts with "lume_" against the api_keys table.
 * Updates last_used_at best-effort (fire-and-forget) on success.
 */
export async function verifyApiKey(
  pool: Pool,
  authHeader: string | undefined,
): Promise<ApiKeyVerifyResult> {
  if (!authHeader) return { ok: false, reason: 'no_token' };

  const m = /^Bearer\s+(lume_[\w-]{32})$/i.exec(authHeader.trim());
  if (!m || !KEY_REGEX.test(m[1]!)) return { ok: false, reason: 'malformed' };

  const rawKey = m[1]!;
  const hash = hashApiKey(rawKey);

  const { rows } = await pool.query<{
    id: string;
    user_id: number;
    revoked_at: Date | null;
    tier: string;
  }>(
    `SELECT ak.id, ak.user_id, ak.revoked_at, COALESCE(s.tier, 'free') AS tier
       FROM api_keys ak
       LEFT JOIN subscriptions s ON s.user_id = ak.user_id
      WHERE ak.key_hash = $1
      LIMIT 1`,
    [hash],
  );

  if (rows.length === 0) return { ok: false, reason: 'not_found' };
  const row = rows[0]!;
  if (row.revoked_at !== null) return { ok: false, reason: 'revoked' };

  // Best-effort — don't block the response on this write
  pool
    .query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [row.id])
    .catch(() => {});

  return { ok: true, userId: row.user_id, tier: row.tier };
}
