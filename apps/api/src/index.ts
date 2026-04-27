import { Redis } from 'ioredis';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { build } from './app.js';
import { loadConfig } from './config.js';
import { makeJobStore, type JobStore } from './jobStore.js';
import { makePostgresJobStore } from './jobStorePostgres.js';
import { makeDualWriteJobStore } from './jobStoreDual.js';
import { makeQueueBundle, closeQueueBundle } from './queues.js';
import { makeRedisBroker } from './sse/redisBroker.js';
import { startOrchestrator } from './orchestrator/index.js';
import { refundForJob } from './credits/store.js';
import { calculateCost, calculateRefund } from './credits/ledger.js';
import { scheduleRetentionJob } from './cron/retentionCron.js';

const cfg = loadConfig();
const redis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });

// Job store selection:
//   - AUTH_ENABLED=true + DATABASE_URL present → Redis (primary) + Postgres
//     (mirror) via DualWriteJobStore. Reads stay Redis-backed during the
//     v2.0 transition (Amendment A); Postgres accumulates user-attributed
//     history for /api/users/me/jobs.
//   - Otherwise → Redis-only (pre-auth mode, identical to v1 behavior).
const authEnabled = process.env.AUTH_ENABLED === 'true' && !!process.env.DATABASE_URL;
const pricingEnabled = authEnabled && process.env.PRICING_ENABLED === 'true';
let store: JobStore;
let shutdownPool: (() => Promise<void>) | null = null;
// Pool shared between the job-store mirror and the credits gate — one pool,
// two consumers, drained together on shutdown.
let pgPoolForCredits: import('pg').Pool | null = null;
if (authEnabled) {
  // Lazy import so the Redis-only path doesn't pull in pg.
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  pgPoolForCredits = pool;
  shutdownPool = () => pool.end();
  const pgStore = makePostgresJobStore({
    pool,
    resolveUserId: async (job) => (job as { userId?: string }).userId ?? null,
  });
  const redisStore = makeJobStore(redis);
  store = makeDualWriteJobStore({ primary: redisStore, mirror: pgStore });
  console.log('[apps/api] AUTH_ENABLED + DATABASE_URL present → DualWriteJobStore active');
  if (pricingEnabled) {
    console.log('[apps/api] PRICING_ENABLED=true → credit gate + concurrency cap active on POST /api/jobs');
  }
} else {
  store = makeJobStore(redis);
  console.log('[apps/api] AUTH_ENABLED=false → Redis-only job store');
}

const queues = makeQueueBundle(redis);
const subRedis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
const { broker, close: closeBroker } = makeRedisBroker({ publisher: redis, subscriber: subRedis });

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
  storyboardQueue: queues.storyboard,
  broker,
  fetchJson,
  rateLimitPerMinute: cfg.RATE_LIMIT_PER_MINUTE,
  requireUserIdHeader: authEnabled,
  creditPool: pricingEnabled ? pgPoolForCredits : null,
  apiKeyPool: pricingEnabled ? pgPoolForCredits : null,
  pgPool: authEnabled ? pgPoolForCredits : null,
});

const orchestratorOpts: Parameters<typeof startOrchestrator>[0] = {
  queues,
  store,
  broker,
  renderCap: cfg.RENDER_QUEUE_CAP,
  creditPool: pricingEnabled ? pgPoolForCredits : null,
};
if (pricingEnabled && pgPoolForCredits) {
  const pool = pgPoolForCredits;
  orchestratorOpts.onJobFailed = async ({ jobId, userId, stage, errorCode, duration }) => {
    if (!userId) return; // anonymous job, nothing to refund
    const parsedUserId = Number(userId);
    if (!Number.isFinite(parsedUserId)) return;
    const originalCost = calculateCost(duration);
    const refundSeconds = calculateRefund(stage, errorCode, originalCost);
    if (refundSeconds <= 0) return;
    try {
      await refundForJob(pool, { userId: parsedUserId, jobId, refundSeconds });
    } catch (err) {
      console.error('[apps/api] refundForJob failed:', { jobId, err });
    }
  };
}
const stopOrchestrator = await startOrchestrator(orchestratorOpts);

// Daily history retention: prune jobs older than tier's window (free=30d, pro=90d, max=365d).
// Only active when auth + pricing are enabled (we need the subscriptions table).
// Uses BullMQ Repeatable Job so N instances produce exactly one scheduled entry.
let retentionWorker: import('bullmq').Worker | null = null;
if (pricingEnabled && pgPoolForCredits) {
  retentionWorker = scheduleRetentionJob({
    queue: queues.retention,
    connection: redis,
    pool: pgPoolForCredits,
    s3,
  });
}

// Last-resort safety net: BullMQ QueueEvents callbacks register handlers
// asynchronously, so a thrown error there propagates out as an unhandled
// rejection. Default Node behaviour (>= 15) is to terminate the process.
// We log and keep running; per-handler try/catch is the real fix, this is
// just to prevent a single bug from taking down the whole API.
process.on('unhandledRejection', (reason) => {
  console.error('[apps/api] UNHANDLED REJECTION (process kept alive):', reason);
});

await app.listen({ port: cfg.PORT, host: '0.0.0.0' });

const shutdown = async () => {
  await app.close();
  await stopOrchestrator();
  if (retentionWorker) await retentionWorker.close();
  await closeBroker();           // ① quit subRedis before shared connections close
  await closeQueueBundle(queues);
  if (shutdownPool) await shutdownPool();
  await redis.quit();            // ③ shared publisher last
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
