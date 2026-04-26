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
    // Row is now 'done' (terminal) — simulate stale render:failed arriving late
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
