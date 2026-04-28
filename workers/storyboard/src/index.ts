import Anthropic from '@anthropic-ai/sdk';
import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { z } from 'zod';
import { CrawlResultSchema, makeIntel, type Storyboard } from '@lumespec/schema';
import { makeS3Client, putObject, buildKey, s3ConfigFromEnv, getObjectJson } from './s3/s3Client.js';
import { generateStoryboard } from './generator.js';
import { createClaudeClient } from './claude/claudeClient.js';
import { loadMockStoryboard } from './mockMode.js';
import { startHealthServer } from './health.js';
import { evaluateTextPunchDiscipline } from './validation/textPunchDiscipline.js';

const JobPayload = z.object({
  jobId: z.string().min(1),
  crawlResultUri: z.string().startsWith('s3://'),
  intent: z.string().min(1),
  duration: z.union([z.literal(10), z.literal(30), z.literal(60)]),
  hint: z.string().optional(),
  previousStoryboardUri: z.string().startsWith('s3://').optional(),
  showWatermark: z.boolean().optional().default(false),
});
type JobPayload = z.infer<typeof JobPayload>;

const env = process.env;
const redisUrl = env.REDIS_URL ?? 'redis://localhost:6379';
const mockMode = env.MOCK_MODE === 'true';
const model = env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const maxTokens = Number(env.CLAUDE_MAX_TOKENS ?? '4096');

const s3Cfg = s3ConfigFromEnv(env);
const s3 = makeS3Client(s3Cfg);
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

startHealthServer();

const anthropic = mockMode
  ? null
  : new Anthropic({ apiKey: env.ANTHROPIC_API_KEY ?? (() => { throw new Error('ANTHROPIC_API_KEY unset'); })() });

const claude = anthropic ? createClaudeClient({ sdk: anthropic, model, maxTokens }) : null;


const worker = new Worker<JobPayload>(
  'storyboard',
  async (job: Job<JobPayload>) => {
    const payload = JobPayload.parse(job.data);

    let storyboard: Storyboard;
    let anthropicUsage: import('./anthropic/pricing.js').ClaudeUsage | undefined;
    if (mockMode) {
      await job.updateProgress(makeIntel('storyboard', 'Loading a canned storyboard (mock mode)'));
      storyboard = await loadMockStoryboard(payload.duration);
      storyboard.videoConfig.showWatermark = payload.showWatermark;
    } else {
      if (!claude) throw new Error('claude client not initialized');
      await job.updateProgress(makeIntel('storyboard', 'Reading the crawl results'));
      const crawlResult = CrawlResultSchema.parse(await getObjectJson(s3, payload.crawlResultUri));
      const previous = payload.previousStoryboardUri
        ? await getObjectJson<Storyboard>(s3, payload.previousStoryboardUri)
        : undefined;
      await job.updateProgress(makeIntel('storyboard', 'Asking Claude to plan the scenes'));
      const res = await generateStoryboard({
        claude,
        crawlResult,
        intent: payload.intent,
        duration: payload.duration,
        showWatermark: payload.showWatermark,
        ...(payload.hint ? { hint: payload.hint } : {}),
        ...(previous ? { previousStoryboard: previous } : {}),
      });
      if (res.kind === 'error') throw new Error(res.message);
      storyboard = res.storyboard;
      anthropicUsage = res.anthropicUsage;
      await job.updateProgress(
        makeIntel('storyboard', `Got ${storyboard.scenes.length} scenes from Claude`),
      );
    }

    // v1.7 soft telemetry — log TextPunch discipline. Does NOT reject.
    // Phase 5+ may decide to upgrade to hard refinement based on accumulated data.
    const discipline = evaluateTextPunchDiscipline(storyboard);
    console.log(
      `[storyboard-discipline] jobId=${payload.jobId} ` +
      `textPunchTotal=${discipline.total} consecutive=${discipline.consecutive} ` +
      `violatesMax=${discipline.violatesMaxCount} violatesConsec=${discipline.violatesNoConsecutive} ` +
      `variants=${JSON.stringify(discipline.variantCounts)}`,
    );

    await job.updateProgress(makeIntel('storyboard', 'Uploading the storyboard'));
    const storyboardKey = buildKey(payload.jobId, 'storyboard.json');
    const storyboardUri = await putObject(
      s3,
      s3Cfg.bucket,
      storyboardKey,
      Buffer.from(JSON.stringify(storyboard, null, 2)),
      'application/json'
    );
    return { storyboardUri, ...(anthropicUsage ? { anthropicUsage } : {}) };
  },
  {
    connection,
    concurrency: 4, // IO-bound on Claude API; no heavy CPU per job
    lockDuration: 60_000,
  }
);

worker.on('failed', (job, err) => {
  console.error('[storyboard] job failed', { jobId: job?.id, err: err.message });
});

const shutdown = async () => {
  console.log('[storyboard] shutting down');
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`[storyboard] worker started, queue=storyboard, mock=${mockMode}`);
