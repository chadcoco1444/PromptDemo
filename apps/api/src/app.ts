import Fastify, { type FastifyInstance } from 'fastify';
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
  logger?: boolean;
}

export async function build(opts: BuildOpts): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger === false ? false : { level: 'info' } });
  await app.register(cors, { origin: true });
  await app.register(sensible);
  // Single global rate-limit registration; the POST route is covered automatically.
  // (Plan suggested a double-register but notes to simplify if runtime issues arise;
  //  one global registration avoids double-counting.)
  await app.register(rateLimit, {
    max: opts.rateLimitPerMinute ?? 10,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    skipOnError: false,
  });

  await app.register(postJobRoute, {
    store: opts.store,
    crawlQueue: opts.crawlQueue,
    storyboardQueue: opts.storyboardQueue,
    requireUserIdHeader: opts.requireUserIdHeader ?? false,
    creditPool: opts.creditPool ?? null,
  });
  await app.register(getJobRoute, { store: opts.store });
  await app.register(getStoryboardRoute, { store: opts.store, fetchJson: opts.fetchJson });
  await app.register(streamRoute, { store: opts.store, broker: opts.broker });

  app.get('/healthz', async () => ({ ok: true }));
  return app;
}
