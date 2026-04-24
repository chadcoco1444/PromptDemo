import { NextResponse } from 'next/server';
import { auth, isAuthEnabled } from '../../../../../auth';
import { getPool } from '../../../../../lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/me/credits — current balance + tier + concurrency snapshot.
 *
 * Mirrors the shape `getSnapshot` in apps/api/src/credits/store.ts returns,
 * but queried from apps/web (which already has the Postgres pool for the
 * NextAuth adapter). No duplication of the apps/api credit gate — this
 * endpoint is read-only.
 *
 * When PRICING_ENABLED=false the tier falls back to 'free' but allowance
 * is still advisory (users see "30s remaining" even if enforcement isn't on).
 */
export async function GET() {
  if (!isAuthEnabled() || !auth) {
    return NextResponse.json({ error: 'auth_disabled' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }
  const userId = Number((session.user as { id?: string }).id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'session_missing_id' }, { status: 500 });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         COALESCE(c.balance, 0)::int AS balance,
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
    if (rows.length === 0) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }
    const row = rows[0];
    const tier = row.tier as 'free' | 'pro' | 'max';
    const allowance = tier === 'free' ? 30 : tier === 'pro' ? 300 : 2000;
    const concurrencyLimit = tier === 'free' ? 1 : tier === 'pro' ? 3 : 10;
    return NextResponse.json({
      balance: row.balance,
      tier,
      allowance,
      activeJobs: row.active_jobs,
      concurrencyLimit,
    });
  } catch (err) {
    console.error('[api/users/me/credits] query failed:', err);
    // Graceful degrade so the nav UsageIndicator doesn't blow up the page on
    // transient DB hiccups.
    return NextResponse.json(
      { balance: 0, tier: 'free', allowance: 30, activeJobs: 0, concurrencyLimit: 1, warning: 'query_failed' },
      { status: 200 },
    );
  }
}
