import { NextResponse } from 'next/server';
import { auth, isAuthEnabled } from '../../../../../auth';
import { getPool } from '../../../../../lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/me/jobs — returns the signed-in user's past jobs.
 *
 * Contract:
 *   - 404 when AUTH_ENABLED=false (feature not available).
 *   - 401 when no session cookie (not signed in).
 *   - 200 with { jobs: [...] } when signed in. Array may be empty until the
 *     apps/api dual-write lands — the page renders a helpful empty state.
 *   - Cursor-based pagination is scaffolded via ?before=ISO8601&limit=N;
 *     defaults to limit=24, no cursor = latest page. Pagination UI ships
 *     when the job count justifies it.
 */
export async function GET(request: Request) {
  if (!isAuthEnabled() || !auth) {
    return NextResponse.json({ error: 'auth_disabled' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  // NextAuth's User type doesn't surface the internal users.id; the pg
  // adapter stores it as the session's userId. Fall back to a lookup by
  // email if the adapter hasn't exposed it directly.
  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ jobs: [] });
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '24')));
  const before = url.searchParams.get('before');

  try {
    const pool = getPool();
    const params: unknown[] = [userId, limit];
    const beforeClause = before
      ? `AND created_at < $${params.push(new Date(before))}`
      : '';
    const { rows } = await pool.query(
      `SELECT id, status, stage, input, video_url, thumb_url,
              EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms
       FROM jobs
       WHERE user_id = $1 ${beforeClause}
       ORDER BY created_at DESC
       LIMIT $2`,
      params,
    );
    return NextResponse.json({
      jobs: rows.map((r) => ({
        jobId: r.id,
        status: r.status,
        stage: r.stage,
        input: r.input,
        videoUrl: r.video_url,
        thumbUrl: r.thumb_url,
        createdAt: Math.round(Number(r.created_at_ms)),
      })),
    });
  } catch (err) {
    console.error('[api/users/me/jobs] query failed:', err);
    // Graceful degrade — don't 500 the page, return empty and let the UI
    // render "no jobs yet" rather than an error card.
    return NextResponse.json({ jobs: [], warning: 'query_failed' });
  }
}
