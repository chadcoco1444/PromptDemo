import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../../src/auth', () => ({
  isAuthEnabled: () => true,
  auth: vi.fn().mockResolvedValue({ user: { id: '42' } }),
}));

vi.mock('../../src/lib/internalToken', () => ({
  signInternalToken: vi.fn().mockResolvedValue('fake-jwt-token'),
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_BASE = 'http://api.test';
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_BASE;
});

describe('GET /api/users/me/jobs (BFF JWT proxy)', () => {
  it('forwards request to apps/api with a Bearer JWT and returns upstream body', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ jobs: [], hasMore: false, tier: 'pro' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { GET } = await import('../../src/app/api/users/me/jobs/route');
    const req = new Request('http://localhost/api/users/me/jobs?limit=24');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tier?: string };
    expect(body.tier).toBe('pro');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://api.test/api/users/me/jobs?limit=24');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fake-jwt-token');

    fetchMock.mockRestore();
  });

  it('returns 401 when not signed in', async () => {
    const authMod = await import('../../src/auth');
    vi.mocked(authMod.auth!).mockResolvedValueOnce(null as never);

    const { GET } = await import('../../src/app/api/users/me/jobs/route');
    const req = new Request('http://localhost/api/users/me/jobs');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
