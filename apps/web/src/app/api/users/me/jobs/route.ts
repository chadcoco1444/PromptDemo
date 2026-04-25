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

    // v2.2 — extended filter set + parent join + hasMore via limit+1 trick.
    // Per design: status enum 'generating' expands to the 5 in-flight raw
    // statuses; pg_trgm gin index on (input->>'intent') powers ILIKE.
    const queryParams: unknown[] = [userId];
    const where: string[] = ['j.user_id = $1'];
    const param = (val: unknown): string => {
      queryParams.push(val);
      return `$${queryParams.length}`;
    };

    const q = url.searchParams.get('q');
    if (q && q.trim().length > 0) {
      where.push(`(j.input->>'intent') ILIKE ${param(`%${q.trim()}%`)}`);
    }

    const status = url.searchParams.get('status');
    if (status === 'done') where.push(`j.status = ${param('done')}`);
    else if (status === 'failed') where.push(`j.status = ${param('failed')}`);
    else if (status === 'generating') {
      where.push(`j.status IN (${[
        param('queued'), param('crawling'), param('generating'),
        param('waiting_render_slot'), param('rendering'),
      ].join(',')})`);
    }

    const duration = Number(url.searchParams.get('duration'));
    if (duration === 10 || duration === 30 || duration === 60) {
      where.push(`(j.input->>'duration')::int = ${param(duration)}`);
    }

    const timePreset = url.searchParams.get('time');
    if (timePreset === '7d' || timePreset === '30d' || timePreset === '90d') {
      const days = parseInt(timePreset, 10);
      where.push(`j.created_at >= now() - ${param(`${days} days`)}::interval`);
    }

    if (before) {
      where.push(`j.created_at < ${param(new Date(before))}`);
    }

    // limit + 1 trick: fetch one extra row to know if hasMore=true without a
    // separate COUNT(*). Matches the spec's lean-pagination decision.
    const limitPlusOne = limit + 1;
    queryParams.push(limitPlusOne);

    const sql = `
      SELECT
        j.id, j.parent_job_id, j.status, j.stage, j.input,
        j.video_url, j.thumb_url, j.crawl_result_uri,
        EXTRACT(EPOCH FROM j.created_at) * 1000 AS created_at_ms,
        p.id           AS parent_id,
        p.input        AS parent_input,
        EXTRACT(EPOCH FROM p.created_at) * 1000 AS parent_created_at_ms
      FROM jobs j
      LEFT JOIN jobs p ON p.id = j.parent_job_id AND p.user_id = j.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY j.created_at DESC
      LIMIT $${queryParams.length}
    `;

    const { rows } = await pool.query(sql, queryParams);

    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      jobs: visible.map((r) => {
        // v2.1 Phase 3.2: surface a cover URL the moment crawl completes,
        // so history cards have a real preview during the long generating
        // phase. Falls back to thumbUrl (post-render extracted frame) once
        // the render worker fills it.
        const crawlComplete =
          r.crawl_result_uri !== null ||
          r.stage === 'storyboard' ||
          r.stage === 'render' ||
          r.status === 'done';
        const coverUrl = r.thumb_url ?? (crawlComplete ? `/api/jobs/${r.id}/cover` : null);
        const parent = r.parent_id
          ? {
              jobId: r.parent_id as string,
              hostname: ((r.parent_input as { url?: string } | null)?.url) ?? '',
              createdAt: Math.round(Number(r.parent_created_at_ms)),
            }
          : null;
        return {
          jobId: r.id,
          parentJobId: r.parent_job_id ?? null,
          status: r.status,
          stage: r.stage,
          input: r.input,
          videoUrl: r.video_url,
          thumbUrl: r.thumb_url,
          coverUrl,
          createdAt: Math.round(Number(r.created_at_ms)),
          parent,
        };
      }),
      hasMore,
    });
  } catch (err) {
    console.error('[api/users/me/jobs] query failed:', err);
    // Graceful degrade — don't 500 the page, return empty and let the UI
    // render "no jobs yet" rather than an error card.
    return NextResponse.json({ jobs: [], warning: 'query_failed' });
  }
}
