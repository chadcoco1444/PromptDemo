import { NextResponse } from 'next/server';
import { auth, isAuthEnabled } from '../../../../../auth';
import { getPool } from '../../../../../lib/pg';
import { generateApiKey, hashApiKey, keyDisplayPrefix } from '../../../../../lib/apiKey';

export const dynamic = 'force-dynamic';

const MAX_KEYS = 5;

function authGuard() {
  if (!isAuthEnabled() || !auth) {
    return NextResponse.json({ error: 'auth_disabled' }, { status: 404 });
  }
  return null;
}

/**
 * GET /api/users/me/api-keys
 * Returns list of active API keys for the authenticated Max-tier user.
 */
export async function GET() {
  const guard = authGuard();
  if (guard) return guard;

  const session = await auth!();
  if (!session?.user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  const userId = Number((session.user as { id?: string }).id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'session_missing_id' }, { status: 500 });

  const pool = getPool();
  const tierRes = await pool.query<{ tier: string }>(
    `SELECT COALESCE(s.tier, 'free') AS tier FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  const tier = tierRes.rows[0]?.tier ?? 'free';
  if (tier !== 'max') {
    return NextResponse.json({ error: 'api_keys_require_max_tier', tier }, { status: 403 });
  }

  const { rows } = await pool.query<{
    id: string;
    name: string;
    key_prefix: string;
    last_used_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, name, key_prefix, last_used_at, created_at
       FROM api_keys
      WHERE user_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC`,
    [userId],
  );

  return NextResponse.json({
    keys: rows.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.key_prefix,
      lastUsedAt: r.last_used_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    })),
  });
}

/**
 * POST /api/users/me/api-keys
 * Creates a new API key. Returns the raw key ONCE — it is not stored.
 * Body: { name?: string }
 */
export async function POST(request: Request) {
  const guard = authGuard();
  if (guard) return guard;

  const session = await auth!();
  if (!session?.user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  const userId = Number((session.user as { id?: string }).id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'session_missing_id' }, { status: 500 });

  const pool = getPool();

  // Verify Max tier
  const tierRes = await pool.query<{ tier: string }>(
    `SELECT COALESCE(s.tier, 'free') AS tier FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  const tier = tierRes.rows[0]?.tier ?? 'free';
  if (tier !== 'max') {
    return NextResponse.json({ error: 'api_keys_require_max_tier', tier }, { status: 403 });
  }

  // Enforce per-user key limit
  const countRes = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM api_keys WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  if (Number(countRes.rows[0]?.count ?? 0) >= MAX_KEYS) {
    return NextResponse.json(
      { error: 'key_limit_reached', message: `Max ${MAX_KEYS} active API keys per user. Revoke an existing key first.` },
      { status: 409 },
    );
  }

  let body: { name?: unknown } = {};
  try { body = await request.json(); } catch { /* body is optional */ }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'My API Key';

  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const prefix = keyDisplayPrefix(rawKey);

  const insertRes = await pool.query<{ id: string; created_at: Date }>(
    `INSERT INTO api_keys (user_id, key_hash, key_prefix, name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [userId, keyHash, prefix, name],
  );
  const row = insertRes.rows[0]!;

  return NextResponse.json(
    {
      id: row.id,
      name,
      keyPrefix: prefix,
      rawKey,  // shown ONCE — not stored
      createdAt: row.created_at.toISOString(),
    },
    { status: 201 },
  );
}
