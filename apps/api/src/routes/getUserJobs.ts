import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { verifyInternalToken } from '../auth/internalToken.js';

export interface GetUserJobsRouteOpts {
  pgPool: Pool;
}

export const getUserJobsRoute: FastifyPluginAsync<GetUserJobsRouteOpts> = async (app, opts) => {
  app.get(
    '/api/users/me/jobs',
    { config: { rateLimit: false } },
    async (req, reply) => {
      const v = await verifyInternalToken(req.headers['authorization']);
      if (!v.ok) return reply.code(401).send({ error: 'unauthorized' });
      const userId = v.userId!;

      const url = new URL(req.url, 'http://localhost');
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '24')));
      const before = url.searchParams.get('before');

      let tier: 'free' | 'pro' | 'max' = 'free';
      try {
        const tierResult = await opts.pgPool.query<{ tier: string }>(
          `SELECT COALESCE(s.tier, 'free') AS tier
           FROM users u
           LEFT JOIN subscriptions s ON s.user_id = u.id
           WHERE u.id = $1`,
          [Number(userId)],
        );
        const raw = tierResult.rows[0]?.tier ?? 'free';
        tier = raw === 'pro' || raw === 'max' ? raw : 'free';
      } catch {
        // Non-fatal: default to free
      }

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

      const { rows } = await opts.pgPool.query(sql, queryParams);
      const hasMore = rows.length > limit;
      const visible = hasMore ? rows.slice(0, limit) : rows;

      return {
        jobs: visible.map((r) => {
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
        tier,
      };
    },
  );
};
