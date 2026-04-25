import { describe, it, expect, vi } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../src/lib/pg', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../../src/auth', () => ({
  isAuthEnabled: () => true,
  auth: vi.fn().mockResolvedValue({ user: { id: '42' } }),
}));

import { GET } from '../../src/app/api/users/me/jobs/route';

describe('GET /api/users/me/jobs', () => {
  it('includes tier in response', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ tier: 'pro' }] })   // tier query
      .mockResolvedValueOnce({ rows: [] });                   // jobs query
    const req = new Request('http://localhost/api/users/me/jobs');
    const res = await GET(req);
    const body = await res.json() as { tier?: string };
    expect(body.tier).toBe('pro');
  });

  it('defaults tier to free when no subscription row', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // tier query returns empty
      .mockResolvedValueOnce({ rows: [] });  // jobs query
    const req = new Request('http://localhost/api/users/me/jobs');
    const res = await GET(req);
    const body = await res.json() as { tier?: string };
    expect(body.tier).toBe('free');
  });
});
