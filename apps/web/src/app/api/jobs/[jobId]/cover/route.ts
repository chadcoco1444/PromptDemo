import { GetObjectCommand } from '@aws-sdk/client-s3';
import { auth, isAuthEnabled } from '../../../../../auth';
import { getPool } from '../../../../../lib/pg';
import { getS3Client, getS3Bucket } from '../../../../../lib/s3';

export const dynamic = 'force-dynamic';

/**
 * GET /api/jobs/[jobId]/cover — proxies the crawler's viewport screenshot
 * for a job the signed-in user owns.
 *
 * v2.1 Phase 3.2: history cards use this as their cover image during the
 * Generating phase, so users see a recognizable preview within seconds of
 * submitting (vs. the current 1-3 minute wait for the render worker's
 * post-render thumb extraction).
 *
 * Path is deterministic — the crawler always writes to
 * jobs/<jobId>/viewport.jpg (the buildKey helper in workers/crawler stores
 * artifacts flat under the job dir, not under a /screenshots/ subdir). We
 * don't read crawlResult.json to avoid an extra S3 GET per history-page
 * render.
 *
 * Security: ownership check against the jobs table; 404 (not 403) for
 * non-owned jobs to avoid leaking job-id existence.
 */
export async function GET(_request: Request, ctx: { params: { jobId: string } }) {
  if (!isAuthEnabled() || !auth) {
    return new Response('not_found', { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return new Response('unauthorized', { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) return new Response('not_found', { status: 404 });

  const { jobId } = ctx.params;
  if (!jobId || jobId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(jobId)) {
    // Defensive: jobId is used in an S3 key, so refuse anything weird.
    return new Response('not_found', { status: 404 });
  }

  // Ownership + crawl-completion check in one query. We only return the
  // screenshot once the crawl stage is past — before that, the file may
  // not exist yet.
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM jobs
       WHERE id = $1 AND user_id = $2
         AND (crawl_result_uri IS NOT NULL OR stage IN ('storyboard','render') OR status = 'done')
       LIMIT 1`,
    [jobId, Number(userId)],
  );
  if (rows.length === 0) {
    return new Response('not_found', { status: 404 });
  }

  try {
    const s3 = getS3Client();
    const cmd = new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: `jobs/${jobId}/viewport.jpg`,
    });
    const res = await s3.send(cmd);
    if (!res.Body) return new Response('not_found', { status: 404 });
    // The SDK exposes a web-stream helper on Node 18+; cast to unknown then
    // ReadableStream to keep TS happy without polluting the public API.
    const stream = (res.Body as unknown as { transformToWebStream: () => ReadableStream }).transformToWebStream();
    return new Response(stream, {
      headers: {
        'Content-Type': 'image/jpeg',
        // Crawl screenshots are immutable; private cache is fine since the
        // route is auth-gated.
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    // S3 NoSuchKey or transient: gracefully degrade. The HistoryGrid will
    // show a placeholder rather than a broken image.
    console.warn('[api/jobs/cover] miss:', { jobId, err: (err as Error).message });
    return new Response('not_found', { status: 404 });
  }
}
