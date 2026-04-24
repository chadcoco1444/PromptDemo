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

// Entry point for @remotion/bundler — the Plan 3 package's Root.tsx.
// Resolved relative to the workspace so the render container can locate it.
const REMOTION_ENTRY_POINT = fileURLToPath(
  new URL('../../../packages/remotion/src/Root.tsx', import.meta.url)
);

const s3Cfg = s3ConfigFromEnv(env);
const s3 = makeS3Client(s3Cfg);
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const sdkPromise = defaultSdk();

const worker = new Worker<JobPayload>(
  'render',
  async (job: Job<JobPayload>) => {
    // resolverEndpoint assumes a path-style-reachable bucket (MinIO in dev, or
    // a public/read-through proxy in prod). For private S3 buckets, Plan 7 will
    // switch this to pre-signed URLs via @aws-sdk/s3-request-presigner.
    const payload = JobPayload.parse(job.data);
    const storyboard: Storyboard = StoryboardSchema.parse(await getObjectJson(s3, payload.storyboardUri));
    const sdk = await sdkPromise;

    return withTempDir('promptdemo-render-', async (dir) => {
      const outputPath = join(dir, `${payload.jobId}.mp4`);

      await renderComposition({
        entryPoint: REMOTION_ENTRY_POINT,
        compositionId: 'MainComposition',
        inputProps: {
          ...storyboard,
          sourceUrl: payload.sourceUrl,
          resolverEndpoint: s3Endpoint,
          forcePathStyle,
        },
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
