import type { FastifyPluginAsync } from 'fastify';
import type { JobStore } from '../jobStore.js';

export interface GetJobRouteOpts { store: JobStore; }

export const getJobRoute: FastifyPluginAsync<GetJobRouteOpts> = async (app, opts) => {
  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = await opts.store.get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'not found' });
    return job;
  });
};
