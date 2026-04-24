import { Redis } from 'ioredis';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { build } from './app.js';
import { loadConfig } from './config.js';
import { makeJobStore } from './jobStore.js';
import { makeQueueBundle, closeQueueBundle } from './queues.js';
import { makeBroker } from './sse/broker.js';
import { startOrchestrator } from './orchestrator/index.js';

const cfg = loadConfig();
const redis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
const store = makeJobStore(redis);
const queues = makeQueueBundle(redis);
const broker = makeBroker();

// Build S3 options conditionally to satisfy exactOptionalPropertyTypes.
const s3Opts: ConstructorParameters<typeof S3Client>[0] = {
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
};
if (process.env.S3_ENDPOINT) s3Opts.endpoint = process.env.S3_ENDPOINT;
if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
  s3Opts.credentials = {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };
}
const s3 = new S3Client(s3Opts);

async function fetchJson(uri: string): Promise<unknown> {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) throw new Error('not an s3 uri');
  const res = await s3.send(new GetObjectCommand({ Bucket: m[1]!, Key: m[2]! }));
  const body = await res.Body?.transformToString('utf8');
  return body ? JSON.parse(body) : null;
}

const app = await build({
  store,
  crawlQueue: queues.crawl,
  broker,
  fetchJson,
  rateLimitPerMinute: cfg.RATE_LIMIT_PER_MINUTE,
});

const stopOrchestrator = await startOrchestrator({
  queues,
  store,
  broker,
  renderCap: cfg.RENDER_QUEUE_CAP,
});

await app.listen({ port: cfg.PORT, host: '0.0.0.0' });

const shutdown = async () => {
  await app.close();
  await stopOrchestrator();
  await closeQueueBundle(queues);
  await redis.quit();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
