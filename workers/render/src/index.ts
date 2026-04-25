import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { z } from 'zod';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
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
import { StoryboardSchema, makeIntel, type Storyboard, type S3Uri } from '@promptdemo/schema';

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
// BGM: auto-detect mp3 presence. Files live at packages/remotion/src/assets/bgm/
// and are gitignored (licensing). If the specific track Claude picked is
// missing, force bgm=none at render time so BGMTrack returns null and
// Remotion doesn't 404 on the asset fetch.
const BGM_DIR = fileURLToPath(
  new URL('../../../packages/remotion/src/assets/bgm/', import.meta.url)
);
function bgmFileAvailable(mood: string): boolean {
  if (mood === 'none') return true;
  return existsSync(join(BGM_DIR, `${mood}.mp3`));
}

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
    await job.updateProgress(makeIntel('render', 'Loading the storyboard'));
    const storyboard: Storyboard = StoryboardSchema.parse(await getObjectJson(s3, payload.storyboardUri));
    const sdk = await sdkPromise;
    await job.updateProgress(makeIntel('render', 'Signing asset URLs for Remotion'));
    // Rewrite s3:// URIs in the storyboard to short-lived pre-signed HTTPS URLs
    // so Remotion's headless Chromium can fetch them from private buckets.
    // Plan 3's makeS3Resolver no-ops when input is already http(s).
    const signed = await rewriteStoryboardUrls(storyboard, defaultSigner(s3));
    // Force bgm=none if the mp3 for Claude's chosen track is missing (auto-detect).
    // BGMTrack component returns null for 'none', so Remotion won't try to fetch.
    const chosenBgm = signed.videoConfig.bgm;
    const finalStoryboard = bgmFileAvailable(chosenBgm)
      ? signed
      : { ...signed, videoConfig: { ...signed.videoConfig, bgm: 'none' as const } };
    if (!bgmFileAvailable(chosenBgm)) {
      console.log(`[render] bgm='${chosenBgm}' mp3 missing at ${BGM_DIR}; forcing bgm=none`);
    }

    return withTempDir('promptdemo-render-', async (dir) => {
      const outputPath = join(dir, `${payload.jobId}.mp4`);

      await job.updateProgress(makeIntel('render', 'Rendering frames with Remotion'));
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

      await job.updateProgress(makeIntel('render', 'Uploading the final video'));
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
