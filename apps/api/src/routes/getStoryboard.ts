import type { FastifyPluginAsync } from 'fastify';
import type { JobStore } from '../jobStore.js';

export interface GetStoryboardRouteOpts {
  store: JobStore;
  fetchJson: (uri: string) => Promise<unknown>;
}

export const getStoryboardRoute: FastifyPluginAsync<GetStoryboardRouteOpts> = async (app, opts) => {
  app.get<{ Params: { id: string } }>('/api/jobs/:id/storyboard', async (req, reply) => {
    const job = await opts.store.get(req.params.id);
    if (!job?.storyboardUri) return reply.code(404).send({ error: 'no storyboard yet' });
    const storyboard = await opts.fetchJson(job.storyboardUri);
    return storyboard;
  });
};
