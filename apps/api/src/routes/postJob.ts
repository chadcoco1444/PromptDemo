import type { FastifyPluginAsync } from 'fastify';
import type { Queue } from 'bullmq';
import { JobInputSchema } from '../model/job.js';
import type { JobStore } from '../jobStore.js';

export interface PostJobRouteOpts {
  store: JobStore;
  crawlQueue: Queue;
  now?: () => number;
  nanoid?: () => string;
}

export const postJobRoute: FastifyPluginAsync<PostJobRouteOpts> = async (app, opts) => {
  const now = opts.now ?? Date.now;
  const nano = opts.nanoid ?? ((await import('nanoid')).nanoid);

  app.post('/api/jobs', async (req, reply) => {
    const parse = JobInputSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parse.error.issues });
    }
    const input = parse.data;
    const jobId = nano();
    const createdAt = now();
    await opts.store.create({
      jobId,
      ...(input.parentJobId ? { parentJobId: input.parentJobId } : {}),
      status: 'queued',
      stage: null,
      progress: 0,
      input,
      fallbacks: [],
      createdAt,
      updatedAt: createdAt,
    });
    // Pass our app jobId as the BullMQ jobId so QueueEvents.on('completed', ({ jobId }))
    // hands us back the id we use to look up the job record in Redis.
    await opts.crawlQueue.add('crawl', { jobId, url: input.url }, { jobId });
    return reply.code(201).send({ jobId });
  });
};
