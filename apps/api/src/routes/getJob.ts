import type { FastifyPluginAsync } from 'fastify';
import type { JobStore } from '../jobStore.js';

export interface GetJobRouteOpts { store: JobStore; }

export const getJobRoute: FastifyPluginAsync<GetJobRouteOpts> = async (app, opts) => {
  // Status polling is read-only and high-frequency (dogfood / UI ping every
  // few seconds). Exempt from the global write-oriented rate limiter so
  // legitimate polling doesn't hit the 10 req/min ceiling.
  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id',
    { config: { rateLimit: false } },
    async (req, reply) => {
      const job = await opts.store.get(req.params.id);
      if (!job) return reply.code(404).send({ error: 'not found' });
      return job;
    },
  );
};
