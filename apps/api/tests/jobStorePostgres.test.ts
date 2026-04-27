import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { makePostgresJobStore } from '../src/jobStorePostgres.js';
import type { Job } from '../src/model/job.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lumespec:lumespec@localhost:5432/lumespec';

let pool: Pool;
let testUserId: number;

const sample: Job = {
  jobId: 'pg-occ-test-001',
  status: 'rendering',
  stage: 'render',
  progress: 50,
  input: { url: 'https://example.com', intent: 'test', duration: 30 },
  fallbacks: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });

  // Create a dedicated test user for the FK constraint (unique email per run)
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (name, email) VALUES ('OCC Test', $1) RETURNING id`,
    [`occ-test-${Date.now()}@lumespec.test`],
  );
  testUserId = rows[0]!.id;

  await pool.query('DELETE FROM jobs WHERE id = $1', [sample.jobId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM jobs WHERE id = $1', [sample.jobId]);
  await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  await pool.end();
});

describe('jobStorePostgres — OCC patch', () => {
  it('applies patch when no expectedStatus provided (unconditional — backward compat)', async () => {
    const store = makePostgresJobStore({ pool, resolveUserId: async () => null });

    // Insert row directly for testing
    await pool.query(
      `INSERT INTO jobs (id, user_id, status, stage, input, fallbacks, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = $3`,
      [sample.jobId, testUserId, 'rendering', 'render', JSON.stringify(sample.input), JSON.stringify([])],
    );

    // patch without expectedStatus — must succeed regardless of current status
    await store.patch(sample.jobId, { status: 'done', progress: 100 }, Date.now());

    const r = await pool.query('SELECT status FROM jobs WHERE id = $1', [sample.jobId]);
    expect(r.rows[0].status).toBe('done');
  });

  it('applies patch when expectedStatus matches current DB status', async () => {
    // Reset to 'rendering'
    await pool.query('UPDATE jobs SET status = $1 WHERE id = $2', ['rendering', sample.jobId]);
    const store = makePostgresJobStore({ pool, resolveUserId: async () => null });

    await store.patch(sample.jobId, { status: 'done', progress: 100 }, Date.now(), 'rendering');

    const r = await pool.query('SELECT status FROM jobs WHERE id = $1', [sample.jobId]);
    expect(r.rows[0].status).toBe('done');
  });

  it('blocks patch and emits warn when expectedStatus does not match (OCC)', async () => {
    // Ensure row is in terminal 'done' state regardless of prior test
    await pool.query('UPDATE jobs SET status = $1 WHERE id = $2', ['done', sample.jobId]);
    const store = makePostgresJobStore({ pool, resolveUserId: async () => null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await store.patch(
      sample.jobId,
      { status: 'failed', error: { code: 'RENDER_FAILED', message: 'late', retryable: false } },
      Date.now(),
      'rendering', // wrong — DB is now 'done'
    );

    const r = await pool.query('SELECT status FROM jobs WHERE id = $1', [sample.jobId]);
    expect(r.rows[0].status).toBe('done'); // unchanged
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('OCC'),
      expect.objectContaining({ jobId: sample.jobId, expectedStatus: 'rendering' }),
    );
    warn.mockRestore();
  });
});

describe('upsert', () => {
  const baseJob = (overrides: Partial<Job> = {}): Job => ({
    jobId: `upsert-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'queued' as const,
    stage: null,
    progress: 0,
    input: { url: 'https://example.com', intent: 'test', duration: 30 as const },
    fallbacks: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  });

  it('inserts when row does not exist', async () => {
    const store = makePostgresJobStore({ pool, resolveUserId: async () => String(testUserId) });
    const job = baseJob();
    await store.upsert(job);
    const row = await store.get(job.jobId);
    expect(row?.status).toBe('queued');
    await pool.query('DELETE FROM jobs WHERE id = $1', [job.jobId]);
  });

  it('updates when row exists AND incoming updated_at is newer', async () => {
    const store = makePostgresJobStore({ pool, resolveUserId: async () => String(testUserId) });
    const job = baseJob();
    await store.create(job);
    const updated = { ...job, status: 'done' as const, updatedAt: job.updatedAt + 1000 };
    await store.upsert(updated);
    const row = await store.get(job.jobId);
    expect(row?.status).toBe('done');
    await pool.query('DELETE FROM jobs WHERE id = $1', [job.jobId]);
  });

  it('does NOT update when row exists AND incoming updated_at is older (OCC guard)', async () => {
    const store = makePostgresJobStore({ pool, resolveUserId: async () => String(testUserId) });
    const job = baseJob({ status: 'done' });
    await store.create(job);
    // Stale write attempt — older updated_at
    const stale = { ...job, status: 'queued' as const, updatedAt: job.updatedAt - 1000 };
    await store.upsert(stale);
    const row = await store.get(job.jobId);
    expect(row?.status).toBe('done');  // unchanged
    await pool.query('DELETE FROM jobs WHERE id = $1', [job.jobId]);
  });
});
