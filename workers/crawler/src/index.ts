import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { z } from 'zod';
import {
  makeS3Client,
  putObject,
  buildKey,
  s3ConfigFromEnv,
} from './s3/s3Client.js';
import { runCrawl } from './orchestrator.js';
import { runPlaywrightTrack, closePlaywrightBrowser } from './tracks/playwrightTrack.js';
import { runScreenshotOneTrack } from './tracks/screenshotOneTrack.js';
import { runCheerioTrack } from './tracks/cheerioTrack.js';
import { downloadLogo } from './logoDownloader.js';
import { startHealthServer } from './health.js';
import type { S3Uri } from '@promptdemo/schema';

const JobPayload = z.object({ jobId: z.string().min(1), url: z.string().url() });
type JobPayload = z.infer<typeof JobPayload>;

const env = process.env;
const redisUrl = env.REDIS_URL ?? 'redis://localhost:6379';
const rescueEnabled = env.CRAWLER_RESCUE_ENABLED === 'true';
const screenshotOneKey = env.SCREENSHOTONE_ACCESS_KEY ?? '';
const playwrightTimeoutMs = Number(env.PLAYWRIGHT_TIMEOUT_MS ?? '15000');

const s3Cfg = s3ConfigFromEnv(env);
const s3 = makeS3Client(s3Cfg);
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

startHealthServer();

const worker = new Worker<JobPayload>(
  'crawl',
  async (job: Job<JobPayload>) => {
    const payload = JobPayload.parse(job.data);

    const uploader = async (buf: Buffer, filename: string): Promise<S3Uri> => {
      const key = buildKey(payload.jobId, filename);
      const contentType = filename.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
      return putObject(s3, s3Cfg.bucket, key, buf, contentType);
    };

    const result = await runCrawl({
      url: payload.url,
      jobId: payload.jobId,
      rescueEnabled,
      runPlaywright: (url) => runPlaywrightTrack({ url, timeoutMs: playwrightTimeoutMs }),
      runScreenshotOne: (url) =>
        screenshotOneKey
          ? runScreenshotOneTrack({ url, accessKey: screenshotOneKey })
          : Promise.resolve({ kind: 'error', message: 'SCREENSHOTONE_ACCESS_KEY unset' } as const),
      runCheerio: (url) => runCheerioTrack({ url }),
      uploader,
      downloadLogo,
    });

    // Publish crawlResult.json next to the other artifacts.
    const resultJsonKey = buildKey(payload.jobId, 'crawlResult.json');
    const resultUri = await putObject(
      s3,
      s3Cfg.bucket,
      resultJsonKey,
      Buffer.from(JSON.stringify(result, null, 2)),
      'application/json'
    );
    return { crawlResultUri: resultUri };
  },
  {
    connection,
    concurrency: 2, // crawler is I/O-bound; safe above 1
    lockDuration: 90_000,
  }
);

worker.on('failed', (job, err) => {
  console.error('[crawler] job failed', { jobId: job?.id, err: err.message });
});

const shutdown = async () => {
  console.log('[crawler] shutting down');
  await worker.close();
  await connection.quit();
  await closePlaywrightBrowser();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[crawler] worker started, queue=crawl');
