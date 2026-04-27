import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import type { Queue } from 'bullmq';
import type { Pool } from 'pg';
import type { JobStore } from './jobStore.js';
import type { Broker } from './sse/broker.js';
import { postJobRoute } from './routes/postJob.js';
import { getJobRoute } from './routes/getJob.js';
import { getStoryboardRoute } from './routes/getStoryboard.js';
import { streamRoute } from './routes/stream.js';
import { getUserJobsRoute } from './routes/getUserJobs.js';
import { getUserCreditsRoute } from './routes/getUserCredits.js';
import { verifyInternalToken } from './auth/internalToken.js';

export interface BuildOpts {
  store: JobStore;
  crawlQueue: Queue;
  storyboardQueue: Queue;
  broker: Broker;
  fetchJson: (uri: string) => Promise<unknown>;
  rateLimitPerMinute?: number;
  /**
   * When true, POST /api/jobs rejects requests without X-User-Id. Enabled
   * automatically when AUTH_ENABLED=true in env. Production must strip any
   * client-supplied X-User-Id at the ingress layer before it reaches apps/api.
   */
  requireUserIdHeader?: boolean;
  /**
   * When set, POST /api/jobs runs the Feature 5 credit gate: concurrency
   * check + balance check + debit + audit log, all in one Postgres
   * transaction. Omit to disable pricing (behaves identically to v1).
   */
  creditPool?: Pool | null;
  /**
   * When set, POST /api/jobs also accepts direct API key authentication
   * (Bearer lume_xxx) for Max-tier users. Typically the same pool as
   * creditPool. Omit to disable API key auth.
   */
  apiKeyPool?: Pool | null;
  /**
   * When set, GET /api/users/me/jobs and GET /api/users/me/credits are
   * registered. Requires AUTH_ENABLED=true so BFF can mint internal JWTs.
   * Typically the same pool as creditPool.
   */
  pgPool?: Pool | null;
  /**
   * When set, /healthz exposes pg-backfill queue depth (waiting + delayed + failed)
   * as an operator-visible health signal. Omit to hide the field.
   */
  pgBackfillQueue?: Queue | null;
  /**
   * Explicit list of origins allowed by the CORS plugin. Defaults to parsing
   * ALLOWED_ORIGINS env var (comma-separated), then 'http://localhost:3001'.
   * Always pass this in tests to avoid depending on process.env.
   */
  allowedOrigins?: string[];
  logger?: boolean;
}

export async function build(opts: BuildOpts): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger === false ? false : { level: 'info' } });
  const allowedOrigins = opts.allowedOrigins ??
    (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001').split(',').map(o => o.trim());

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('CORS: origin not allowed'), false);
      }
    },
  });
  await app.register(sensible);
  // v2.1 Phase 5.2 — defense-in-depth rate limit.
  //   - Per-user when an internal JWT is present (BFF proxy hop attaches it).
  //     Verifies the JWT synchronously-ish before bucketing; if verification
  //     fails we fall back to per-IP so we never accidentally bypass.
  //   - Per-IP otherwise (anonymous mode + any unsigned request).
  // The BFF (apps/web's /api/jobs/create) also rate-limits at its own hop
  // before signing the JWT — this Fastify layer protects every other route
  // and catches any traffic that bypasses the BFF.
  await app.register(rateLimit, {
    max: opts.rateLimitPerMinute ?? 10,
    timeWindow: '1 minute',
    keyGenerator: async (req: FastifyRequest) => {
      const auth = req.headers['authorization'];
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        const v = await verifyInternalToken(auth);
        if (v.ok && v.userId) return `user:${v.userId}`;
      }
      return `ip:${req.ip}`;
    },
    skipOnError: false,
  });

  await app.register(postJobRoute, {
    store: opts.store,
    crawlQueue: opts.crawlQueue,
    storyboardQueue: opts.storyboardQueue,
    requireUserIdHeader: opts.requireUserIdHeader ?? false,
    creditPool: opts.creditPool ?? null,
    apiKeyPool: opts.apiKeyPool ?? null,
  });
  await app.register(getJobRoute, { store: opts.store });
  await app.register(getStoryboardRoute, { store: opts.store, fetchJson: opts.fetchJson });
  await app.register(streamRoute, {
    store: opts.store,
    broker: opts.broker,
    allowedOrigins,
  });
  if (opts.pgPool) {
    await app.register(getUserJobsRoute, { pgPool: opts.pgPool });
    await app.register(getUserCreditsRoute, { pgPool: opts.pgPool });
  }

  app.get('/healthz', async () => {
    if (!opts.pgBackfillQueue) {
      return { ok: true };
    }
    const counts = await opts.pgBackfillQueue.getJobCounts('waiting', 'delayed', 'failed');
    return {
      ok: true,
      pgBackfill: {
        waiting: counts.waiting,
        delayed: counts.delayed,
        failed: counts.failed,
      },
    };
  });
  return app;
}
