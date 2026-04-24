import type { FastifyPluginAsync } from 'fastify';
import type { Queue } from 'bullmq';
import { JobInputSchema, type Job } from '../model/job.js';
import type { JobStore } from '../jobStore.js';

export interface PostJobRouteOpts {
  store: JobStore;
  crawlQueue: Queue;
  /**
   * Storyboard queue — used only when the request includes a parentJobId and
   * we're reusing the parent's crawlResultUri. In that case we skip the crawl
   * stage entirely and enqueue directly to storyboard.
   */
  storyboardQueue: Queue;
  /**
   * When true, reads X-User-Id from request headers and requires it. This
   * header is expected to be set by the trusted Next.js proxy (apps/web's
   * /api/jobs/create), NEVER by end-user clients directly.
   *
   * Production deploys MUST prevent clients from forging X-User-Id at the
   * ingress (Cloud Run / API Gateway), otherwise any user could claim any
   * userId. Tracked in the followup guide.
   */
  requireUserIdHeader: boolean;
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

    // User attribution. Only consumed when dual-write is active (i.e. AUTH
    // layer expects Postgres-backed jobs). When requireUserIdHeader=false,
    // anonymous jobs are still accepted (writes go to Redis-only).
    const headerUserId = req.headers['x-user-id'];
    const userId = typeof headerUserId === 'string' && headerUserId.length > 0 ? headerUserId : undefined;
    if (opts.requireUserIdHeader && !userId) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'AUTH_ENABLED=true requires the X-User-Id header (set by the trusted Next.js proxy).',
      });
    }

    const jobId = nano();
    const createdAt = now();

    // Regenerate-with-hint path: caller supplied a parentJobId so we can
    // reuse that parent's crawlResult and skip the crawl stage entirely.
    // SECURITY: we look up the parent via our own store — we do NOT accept
    // a client-supplied crawlResultUri under any circumstance. Otherwise a
    // malicious caller could submit parentJobId=anything + a hand-crafted
    // S3 URI and trick the storyboard worker into reading arbitrary files.
    let inheritedCrawlUri: Job['crawlResultUri'] | undefined;
    if (input.parentJobId) {
      const parent = await opts.store.get(input.parentJobId);
      if (!parent) {
        return reply.code(404).send({
          error: 'parent_not_found',
          message: `parentJobId=${input.parentJobId} does not exist (it may have expired).`,
        });
      }
      if (!parent.crawlResultUri) {
        return reply.code(409).send({
          error: 'parent_crawl_incomplete',
          message: `parent job has not completed its crawl stage yet — cannot regenerate from it.`,
        });
      }
      inheritedCrawlUri = parent.crawlResultUri;
    }

    const newJob: Job & { userId?: string } = {
      jobId,
      ...(input.parentJobId ? { parentJobId: input.parentJobId } : {}),
      ...(userId ? { userId } : {}),
      status: inheritedCrawlUri ? 'generating' : 'queued',
      stage: inheritedCrawlUri ? 'storyboard' : null,
      progress: 0,
      input,
      ...(inheritedCrawlUri ? { crawlResultUri: inheritedCrawlUri } : {}),
      fallbacks: [],
      createdAt,
      updatedAt: createdAt,
    };
    await opts.store.create(newJob);

    // Skip-crawl fast path when regenerating.
    if (inheritedCrawlUri) {
      await opts.storyboardQueue.add(
        'generate',
        {
          jobId,
          crawlResultUri: inheritedCrawlUri,
          intent: input.intent,
          duration: input.duration,
          ...(input.hint ? { hint: input.hint } : {}),
        },
        { jobId },
      );
      return reply.code(201).send({ jobId, skippedCrawl: true });
    }

    // Fresh job — normal crawl-first flow.
    // Pass our app jobId as the BullMQ jobId so QueueEvents.on('completed', ({ jobId }))
    // hands us back the id we use to look up the job record in Redis.
    await opts.crawlQueue.add('crawl', { jobId, url: input.url }, { jobId });
    return reply.code(201).send({ jobId });
  });
};
