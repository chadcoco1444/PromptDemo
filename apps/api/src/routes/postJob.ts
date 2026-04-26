import type { FastifyPluginAsync } from 'fastify';
import type { Queue } from 'bullmq';
import type { Pool } from 'pg';
import { JobInputSchema, type Job } from '../model/job.js';
import type { JobStore } from '../jobStore.js';
import { calculateCost, isDurationAllowed, type Tier } from '../credits/ledger.js';
import { debitForJob } from '../credits/store.js';
import { verifyInternalToken } from '../auth/internalToken.js';
import { verifyApiKey } from '../auth/apiKeyAuth.js';

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
  /**
   * When non-null, runs the Feature 5 credit gate before accepting the job:
   * debitForJob transaction (concurrency + balance + debit + audit log).
   * When null (PRICING_ENABLED=false), skipped entirely — the route behaves
   * identically to v1.
   */
  creditPool?: Pool | null;
  /**
   * When non-null, POST /api/jobs accepts direct API key authentication
   * (Bearer lume_xxx) in addition to the internal JWT. Only Max-tier keys
   * are accepted; others get a 403.
   */
  apiKeyPool?: Pool | null;
  now?: () => number;
  nanoid?: () => string;
}

export const postJobRoute: FastifyPluginAsync<PostJobRouteOpts> = async (app, opts) => {
  const now = opts.now ?? Date.now;
  const nano = opts.nanoid ?? ((await import('nanoid')).nanoid);
  const pricingEnabled = Boolean(opts.creditPool);

  app.post('/api/jobs', async (req, reply) => {
    const parse = JobInputSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parse.error.issues });
    }
    const input = parse.data;

    // User attribution: try API key first (lume_ prefix), fall back to the
    // trusted-proxy JWT minted by the Next.js BFF. Plaintext X-User-Id is
    // never accepted — too easy to forge if apps/api is ever exposed.
    let userId: string | undefined;
    if (opts.requireUserIdHeader) {
      const authHeader = req.headers['authorization'];
      const authStr = typeof authHeader === 'string' ? authHeader : undefined;
      const isApiKey = typeof authStr === 'string' && /Bearer\s+lume_/i.test(authStr);

      if (isApiKey && opts.apiKeyPool) {
        const v = await verifyApiKey(opts.apiKeyPool, authStr);
        if (!v.ok) {
          return reply.code(401).send({
            error: 'unauthorized',
            message:
              v.reason === 'revoked'
                ? 'This API key has been revoked.'
                : v.reason === 'not_found'
                ? 'API key not found. Generate one at /billing.'
                : 'Malformed API key.',
          });
        }
        if (v.tier !== 'max') {
          return reply.code(403).send({
            error: 'api_key_requires_max_tier',
            message:
              'Direct API access requires a Max tier subscription. Upgrade at /billing.',
            tier: v.tier,
          });
        }
        userId = String(v.userId);
      } else {
        // Internal JWT path: the Next.js BFF mints a 60-second HS256 token.
        const v = await verifyInternalToken(authStr);
        if (!v.ok) {
          return reply.code(401).send({
            error: 'unauthorized',
            message:
              v.reason === 'no_secret'
                ? 'AUTH_ENABLED=true requires INTERNAL_API_SECRET to be set on apps/api.'
                : v.reason === 'no_token'
                ? 'Missing Authorization: Bearer <token>. The trusted Next.js proxy must mint this.'
                : 'Invalid or expired internal token.',
          });
        }
        userId = v.userId;
      }
    }

    const jobId = nano();
    const createdAt = now();
    // PLG safe default: show watermark for any authenticated user unless
    // pricing confirms Pro/Max. Avoids PRICING_ENABLED=false silently
    // removing the watermark for all free-tier users.
    let showWatermark = userId != null;

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

    // Feature 5 credit gate. Runs only when PRICING_ENABLED + AUTH_ENABLED both
    // true. Tier-based duration check + balance + concurrency + debit are all
    // in one Postgres transaction. Cost is charged up-front; refund happens on
    // failure via the orchestrator (see credits/store.refundForJob).
    if (pricingEnabled && userId && opts.creditPool) {
      const cost = calculateCost(input.duration);
      const userIdNum = Number(userId);
      if (!Number.isFinite(userIdNum)) {
        return reply.code(400).send({
          error: 'invalid_user_id',
          message: 'X-User-Id header is not a valid numeric id.',
        });
      }

      const result = await debitForJob(opts.creditPool, {
        userId: userIdNum,
        jobId,
        costSeconds: cost,
        maxDurationForTier: (tier) => isDurationAllowed(tier, input.duration),
      });
      if (!result.ok) {
        if (result.code === 'duration_not_allowed_in_tier') {
          return reply.code(403).send({
            error: 'duration_not_allowed_in_tier',
            message: `The ${input.duration}s duration is not available on the ${result.tier ?? 'free'} plan. Upgrade to Pro for 60s videos.`,
            tier: result.tier,
          });
        }
        if (result.code === 'concurrency_limit') {
          return reply.code(429).send({
            error: 'concurrency_limit',
            message: `Your plan allows ${result.limit} concurrent video(s). You have ${result.activeCount} in flight — wait for one to finish before starting a new one.`,
            tier: result.tier,
          });
        }
        if (result.code === 'insufficient_credits') {
          return reply.code(402).send({
            error: 'insufficient_credits',
            message: `You need ${cost}s for this video but have only ${result.balanceAfter}s remaining this period. Upgrade your plan or wait for the monthly reset.`,
            tier: result.tier,
            balance: result.balanceAfter,
          });
        }
        if (result.code === 'user_not_found') {
          return reply.code(500).send({
            error: 'user_credits_not_initialized',
            message: 'Your credit record is missing. Sign out and back in to reinitialize — if it persists, contact support.',
          });
        }
      }

      showWatermark = (result.tier ?? 'free') === 'free';
    }

    // forceWatermark: dogfood/internal scripts can opt-in to the Pill Badge
    // regardless of tier (adds branding, never removes it).
    if (input.forceWatermark) showWatermark = true;

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
          showWatermark,
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
