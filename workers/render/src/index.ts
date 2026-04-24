import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { z } from 'zod';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeS3Client,
  putObject,
  uploadFile,
  buildKey,
  s3ConfigFromEnv,
  getObjectJson,
} from './s3/s3Client.js';
import { withTempDir } from './tempDir.js';
import { renderComposition, defaultSdk } from './renderer.js';
import { startHealthServer } from './health.js';
import { rewriteStoryboardUrls, defaultSigner } from './presignedRewrite.js';
import { StoryboardSchema, type Storyboard, type S3Uri } from '@promptdemo/schema';

const JobPayload = z.object({
  jobId: z.string().min(1),
  storyboardUri: z.string().startsWith('s3://'),
  sourceUrl: z.string().url(),
  duration: z.union([z.literal(10), z.literal(30), z.literal(60)]),
});
type JobPayload = z.infer<typeof JobPayload>;

const env = process.env;
const redisUrl = env.REDIS_URL ?? 'redis://localhost:6379';
const s3Endpoint = env.S3_ENDPOINT ?? 'http://localhost:9000';
const forcePathStyle = env.S3_FORCE_PATH_STYLE === 'true';
// BGM mp3 files are gitignored (licensing). Default off so dev doesn't 404.
// Set BGM_ENABLED=true after dropping mp3s into packages/remotion/src/assets/bgm/.
const bgmEnabled = env.BGM_ENABLED === 'true';

// Entry point for @remotion/bundler — the Plan 3 package's Root.tsx.
// Resolved relative to the workspace so the render container can locate it.
const REMOTION_ENTRY_POINT = fileURLToPath(
  new URL('../../../packages/remotion/src/Root.tsx', import.meta.url)
);

const s3Cfg = s3ConfigFromEnv(env);
const s3 = makeS3Client(s3Cfg);
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

startHealthServer();

const sdkPromise = defaultSdk();

const worker = new Worker<JobPayload>(
  'render',
  async (job: Job<JobPayload>) => {
    const payload = JobPayload.parse(job.data);
    const storyboard: Storyboard = StoryboardSchema.parse(await getObjectJson(s3, payload.storyboardUri));
    const sdk = await sdkPromise;
    // Rewrite s3:// URIs in the storyboard to short-lived pre-signed HTTPS URLs
    // so Remotion's headless Chromium can fetch them from private buckets.
    // Plan 3's makeS3Resolver no-ops when input is already http(s).
    const signed = await rewriteStoryboardUrls(storyboard, defaultSigner(s3));
    // Force bgm=none when mp3 assets aren't available (default in dev).
    // BGMTrack component returns null for 'none', so no render error.
    const finalStoryboard = bgmEnabled
      ? signed
      : { ...signed, videoConfig: { ...signed.videoConfig, bgm: 'none' as const } };

    return withTempDir('promptdemo-render-', async (dir) => {
      const outputPath = join(dir, `${payload.jobId}.mp4`);

      await renderComposition({
        entryPoint: REMOTION_ENTRY_POINT,
        compositionId: 'MainComposition',
        inputProps: {
          ...finalStoryboard,
          sourceUrl: payload.sourceUrl,
          resolverEndpoint: s3Endpoint,
          forcePathStyle,
        } as any, // cast: SignedStoryboard widens S3Uri to string
        outputPath,
        codec: 'h264',
        sdk,
      });

      const key = buildKey(payload.jobId, 'video.mp4');
      const videoUrl: S3Uri = await uploadFile(s3, s3Cfg.bucket, key, outputPath, 'video/mp4');
      return { videoUrl };
    });
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000, // match Cloud Run max request + p99 render
  }
);

worker.on('failed', (job, err) => {
  console.error('[render] job failed', { jobId: job?.id, err: err.message });
});

const shutdown = async () => {
  console.log('[render] shutting down');
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[render] worker started, queue=render, concurrency=1');
