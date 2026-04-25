import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { auth, isAuthEnabled } from '../../../../../auth';
import { getPool } from '../../../../../lib/pg';
import { getS3Client } from '../../../../../lib/s3';

export const dynamic = 'force-dynamic';

const PRESIGN_EXPIRES = 900; // 15 minutes

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) return null;
  return { bucket: m[1]!, key: m[2]! };
}

export async function GET(request: Request, ctx: { params: { jobId: string } }) {
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
    return new Response('not_found', { status: 404 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  if (type !== 'mp4' && type !== 'storyboard') {
    return new Response(JSON.stringify({ error: 'type must be mp4 or storyboard' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pool = getPool();
  let rows: Array<{ video_url: string | null; storyboard_uri: string | null }>;
  try {
    const result = await pool.query(
      `SELECT video_url, storyboard_uri
       FROM jobs
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [jobId, Number(userId)],
    );
    rows = result.rows as Array<{ video_url: string | null; storyboard_uri: string | null }>;
  } catch (err) {
    console.error('[api/jobs/download] db error:', (err as Error).message);
    return new Response('internal_error', { status: 500 });
  }

  if (rows.length === 0) {
    return new Response('not_found', { status: 404 });
  }

  const row = rows[0]!;
  const rawUri = type === 'mp4' ? row.video_url : row.storyboard_uri;

  if (!rawUri) {
    return new Response('not_found', { status: 404 });
  }

  const parsed = parseS3Uri(rawUri);
  if (!parsed) {
    return new Response('not_found', { status: 404 });
  }

  const filename =
    type === 'mp4'
      ? `promptdemo-${jobId}.mp4`
      : `storyboard-${jobId}.json`;

  try {
    const s3 = getS3Client();
    const cmd = new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });
    const presignedUrl = await getSignedUrl(s3, cmd, { expiresIn: PRESIGN_EXPIRES });
    return Response.redirect(presignedUrl, 307);
  } catch (err) {
    console.error('[api/jobs/download] presign failed:', { jobId, type, err: (err as Error).message });
    return new Response('internal_error', { status: 500 });
  }
}
