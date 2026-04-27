import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { verifyInternalToken } from '../auth/internalToken.js';

export interface GetUserCreditsRouteOpts {
  pgPool: Pool;
}

export const getUserCreditsRoute: FastifyPluginAsync<GetUserCreditsRouteOpts> = async (app, opts) => {
  app.get(
    '/api/users/me/credits',
    { config: { rateLimit: false } },
    async (req, reply) => {
      const v = await verifyInternalToken(req.headers['authorization']);
      if (!v.ok) return reply.code(401).send({ error: 'unauthorized' });
      const userId = Number(v.userId);
      if (!Number.isFinite(userId)) return reply.code(401).send({ error: 'invalid_user_id' });

      const { rows } = await opts.pgPool.query(
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
      if (rows.length === 0) return reply.code(404).send({ error: 'user_not_found' });

      const row = rows[0];
      const tier = row.tier as 'free' | 'pro' | 'max';
      const allowance = tier === 'free' ? 30 : tier === 'pro' ? 300 : 2000;
      const concurrencyLimit = tier === 'free' ? 1 : tier === 'pro' ? 3 : 10;
      return {
        balance: row.balance,
        tier,
        allowance,
        activeJobs: row.active_jobs,
        concurrencyLimit,
      };
    },
  );
};
