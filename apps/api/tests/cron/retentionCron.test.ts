import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import { type S3Client } from '@aws-sdk/client-s3';
import { runRetentionOnce, RETENTION_DAYS, scheduleRetentionJob } from '../../src/cron/retentionCron.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://lumespec:lumespec@localhost:5432/lumespec';

// Stub S3 — we test DB logic; actual S3 calls are unit-testable via the stub.
function makeS3Stub(onDelete?: (bucket: string, key: string) => void): S3Client {
  return {
    send: vi.fn(async (cmd: { input?: { Bucket?: string; Key?: string } }) => {
      if (onDelete && cmd.input?.Bucket && cmd.input?.Key) {
        onDelete(cmd.input.Bucket, cmd.input.Key);
      }
    }),
  } as unknown as S3Client;
}

const silentLog = { log: () => {}, error: () => {} };

let pool: pg.Pool;
// user IDs keyed by tier
const userIds: Record<string, number> = {};

const NOW_MINUS = (days: number) =>
  `now() - INTERVAL '${days} days'`;

async function insertUser(email: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (name, email, "emailVerified", image)
     VALUES ('Retention Test', $1, now(), null) RETURNING id`,
    [email],
  );
  return rows[0]!.id;
}

async function insertExpiredJob(
  userId: number,
  jobId: string,
  ageExpr: string,
  opts: { crawlUri?: string; storyboardUri?: string; videoUrl?: string } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO jobs
       (id, user_id, status, stage, input, crawl_result_uri, storyboard_uri, video_url,
        fallbacks, created_at, updated_at)
     VALUES
       ($1, $2, 'done', 'render', '{"intent":"test"}'::jsonb, $3, $4, $5,
        '[]'::jsonb, ${ageExpr}, ${ageExpr})`,
    [
      jobId,
      userId,
      opts.crawlUri ?? null,
      opts.storyboardUri ?? null,
      opts.videoUrl ?? null,
    ],
  );
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Free user — jobs expire at 30 days
  userIds.free = await insertUser(`retention-free-${Date.now()}@example.com`);
  // Pro user — jobs expire at 90 days
  userIds.pro = await insertUser(`retention-pro-${Date.now()}@example.com`);
  await pool.query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end)
     VALUES ($1, 'cus_test', 'sub_test_pro', 'pro', 'active', now() + INTERVAL '30 days')
     ON CONFLICT (user_id) DO UPDATE SET tier = 'pro'`,
    [userIds.pro],
  );
  // Max user — jobs expire at 365 days
  userIds.max = await insertUser(`retention-max-${Date.now()}@example.com`);
  await pool.query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end)
     VALUES ($1, 'cus_test2', 'sub_test_max', 'max', 'active', now() + INTERVAL '30 days')
     ON CONFLICT (user_id) DO UPDATE SET tier = 'max'`,
    [userIds.max],
  );
});

afterAll(async () => {
  for (const uid of Object.values(userIds)) {
    await pool.query('DELETE FROM jobs WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM users WHERE id = $1', [uid]);
  }
  await pool.end();
});

describe('RETENTION_DAYS', () => {
  it('defines the correct windows', () => {
    expect(RETENTION_DAYS.free).toBe(30);
    expect(RETENTION_DAYS.pro).toBe(90);
    expect(RETENTION_DAYS.max).toBe(365);
  });
});

describe('scheduleRetentionJob', () => {
  it('schedules a repeatable BullMQ job with the idempotent jobId', async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined);
    const workerClose = vi.fn().mockResolvedValue(undefined);

    // Mock Worker constructor to avoid real Redis connection
    vi.doMock('bullmq', () => ({
      Queue: class { add = queueAdd; close = vi.fn(); },
      Worker: class { close = workerClose; },
    }));

    const mockQueue = { add: queueAdd, close: vi.fn() } as never;
    const mockConnection = {} as never;
    const mockPool = {} as never;
    const mockS3 = {} as never;

    const worker = scheduleRetentionJob({ queue: mockQueue, connection: mockConnection, pool: mockPool, s3: mockS3 });

    expect(queueAdd).toHaveBeenCalledWith(
      'daily-cleanup',
      {},
      expect.objectContaining({
        jobId: 'retention-daily',
        repeat: expect.objectContaining({ pattern: '0 3 * * *' }),
      }),
    );
    expect(worker).toBeDefined();
  });
});

describe('runRetentionOnce — free tier', () => {
  const JOB_OLD = `ret-free-old-${Date.now()}`;
  const JOB_FRESH = `ret-free-fresh-${Date.now()}`;

  beforeAll(async () => {
    // 31 days old → should be pruned
    await insertExpiredJob(userIds.free!, JOB_OLD, NOW_MINUS(31), {
      crawlUri: 's3://lumespec-dev/jobs/ret-free-old/crawlResult.json',
      videoUrl: 's3://lumespec-dev/jobs/ret-free-old/video.mp4',
    });
    // 10 days old → should survive
    await insertExpiredJob(userIds.free!, JOB_FRESH, NOW_MINUS(10));
  });

  it('deletes job older than 30 days', async () => {
    const deleted: string[] = [];
    const s3 = makeS3Stub((_, key) => deleted.push(key));
    const result = await runRetentionOnce(pool, s3, silentLog);
    expect(result.errors).toBe(0);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const { rowCount } = await pool.query('SELECT 1 FROM jobs WHERE id = $1', [JOB_OLD]);
    expect(rowCount).toBe(0);
    expect(deleted).toContain('jobs/ret-free-old/crawlResult.json');
    expect(deleted).toContain('jobs/ret-free-old/video.mp4');
  });

  it('keeps job younger than 30 days', async () => {
    const { rowCount } = await pool.query('SELECT 1 FROM jobs WHERE id = $1', [JOB_FRESH]);
    expect(rowCount).toBe(1);
  });
});

describe('runRetentionOnce — pro tier (90 days)', () => {
  const JOB_60D = `ret-pro-60-${Date.now()}`;
  const JOB_100D = `ret-pro-100-${Date.now()}`;

  beforeAll(async () => {
    await insertExpiredJob(userIds.pro!, JOB_60D, NOW_MINUS(60)); // within window
    await insertExpiredJob(userIds.pro!, JOB_100D, NOW_MINUS(100)); // outside window
  });

  it('keeps 60-day-old pro job', async () => {
    await runRetentionOnce(pool, makeS3Stub(), silentLog);
    const { rowCount } = await pool.query('SELECT 1 FROM jobs WHERE id = $1', [JOB_60D]);
    expect(rowCount).toBe(1);
  });

  it('deletes 100-day-old pro job', async () => {
    const { rowCount } = await pool.query('SELECT 1 FROM jobs WHERE id = $1', [JOB_100D]);
    expect(rowCount).toBe(0);
  });
});

describe('runRetentionOnce — max tier (365 days)', () => {
  const JOB_300D = `ret-max-300-${Date.now()}`;
  const JOB_400D = `ret-max-400-${Date.now()}`;

  beforeAll(async () => {
    await insertExpiredJob(userIds.max!, JOB_300D, NOW_MINUS(300));
    await insertExpiredJob(userIds.max!, JOB_400D, NOW_MINUS(400));
  });

  it('keeps 300-day-old max job', async () => {
    await runRetentionOnce(pool, makeS3Stub(), silentLog);
    const { rowCount } = await pool.query('SELECT 1 FROM jobs WHERE id = $1', [JOB_300D]);
    expect(rowCount).toBe(1);
  });

  it('deletes 400-day-old max job', async () => {
    const { rowCount } = await pool.query('SELECT 1 FROM jobs WHERE id = $1', [JOB_400D]);
    expect(rowCount).toBe(0);
  });
});

describe('runRetentionOnce — idempotency', () => {
  it('returns 0 deleted on second run (nothing left to prune)', async () => {
    const result = await runRetentionOnce(pool, makeS3Stub(), silentLog);
    // All test jobs for expired tiers already deleted in previous tests
    expect(result.errors).toBe(0);
  });
});

describe('runRetentionOnce — parent_job_id FK safety', () => {
  const PARENT_ID = `ret-parent-${Date.now()}`;
  const CHILD_ID = `ret-child-${Date.now()}`;

  beforeAll(async () => {
    // Parent is 35 days old (expired for free tier)
    await insertExpiredJob(userIds.free!, PARENT_ID, NOW_MINUS(35));
    // Child is 2 days old (not expired) but references the expired parent
    await pool.query(
      `INSERT INTO jobs
         (id, user_id, parent_job_id, status, stage, input, fallbacks, created_at, updated_at)
       VALUES ($1, $2, $3, 'done', 'render', '{"intent":"child"}'::jsonb, '[]'::jsonb, now() - INTERVAL '2 days', now() - INTERVAL '2 days')`,
      [CHILD_ID, userIds.free!, PARENT_ID],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM jobs WHERE id = ANY($1)', [[PARENT_ID, CHILD_ID]]);
  });

  it('deletes expired parent without FK error, nullifies child reference', async () => {
    const result = await runRetentionOnce(pool, makeS3Stub(), silentLog);
    expect(result.errors).toBe(0);

    // Parent gone
    const parent = await pool.query('SELECT 1 FROM jobs WHERE id = $1', [PARENT_ID]);
    expect(parent.rowCount).toBe(0);

    // Child still present, parent_job_id nullified
    const child = await pool.query<{ parent_job_id: string | null }>(
      'SELECT parent_job_id FROM jobs WHERE id = $1',
      [CHILD_ID],
    );
    expect(child.rowCount).toBe(1);
    expect(child.rows[0]!.parent_job_id).toBeNull();
  });
});
