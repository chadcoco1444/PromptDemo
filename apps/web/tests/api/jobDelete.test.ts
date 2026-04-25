import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockClient = { query: mockQuery, release: mockRelease };

vi.mock('../../src/lib/pg', () => ({
  getPool: () => ({ connect: vi.fn().mockResolvedValue(mockClient) }),
}));

vi.mock('../../src/auth', () => ({
  isAuthEnabled: () => true,
  auth: vi.fn().mockResolvedValue({ user: { id: '42' } }),
}));

import { DELETE } from '../../src/app/api/jobs/[jobId]/route';
import { auth } from '../../src/auth';

describe('DELETE /api/jobs/[jobId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    expect(res.status).toBe(401);
  });

  it('returns 404 when job not found or not owned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT (not found)
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const res = await DELETE(new Request('http://localhost/api/jobs/xyz', { method: 'DELETE' }), { params: { jobId: 'xyz' } });
    expect(res.status).toBe(404);
  });

  it('deletes a done job without touching credits', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'done', duration: 30 }] }); // SELECT
    mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE parent_job_id = NULL
    mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE
    mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT
    const res = await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    expect(res.status).toBe(204);
    const queries = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(queries.some((q) => q.includes('UPDATE credits'))).toBe(false);
  });

  it('refunds credits and deletes an in-flight job', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'generating', duration: 30 }] }); // SELECT
    mockQuery.mockResolvedValueOnce({ rows: [{ balance: 100 }] }); // UPDATE credits RETURNING balance
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT credit_transactions
    mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE parent_job_id = NULL
    mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE
    mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT
    const res = await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    expect(res.status).toBe(204);
    const queries = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(queries.some((q) => q.includes('UPDATE credits'))).toBe(true);
    expect(queries.some((q) => q.includes('credit_transactions'))).toBe(true);
  });

  it('orphans child jobs before deleting parent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'done', duration: 30 }] }); // SELECT
    mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE parent_job_id = NULL
    mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE
    mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT
    await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    const queries = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(queries.some((q) => q.includes('parent_job_id = NULL'))).toBe(true);
  });

  it('returns 500 and rolls back on DB error', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockRejectedValueOnce(new Error('db down')); // SELECT throws
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const res = await DELETE(new Request('http://localhost/api/jobs/abc', { method: 'DELETE' }), { params: { jobId: 'abc' } });
    expect(res.status).toBe(500);
  });
});
