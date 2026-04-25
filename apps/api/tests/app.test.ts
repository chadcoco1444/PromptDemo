import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import RedisMock from 'ioredis-mock';
import { SignJWT } from 'jose';
import { build } from '../src/app.js';
import { makeJobStore } from '../src/jobStore.js';
import { makeBroker } from '../src/sse/broker.js';

const TEST_SECRET = 'a'.repeat(64);
const enc = new TextEncoder();
async function bearerFor(userId: string): Promise<string> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('lumespec-web')
    .setAudience('lumespec-api')
    .setExpirationTime('60s')
    .sign(enc.encode(TEST_SECRET));
  return `Bearer ${token}`;
}

beforeAll(() => {
  process.env.INTERNAL_API_SECRET = TEST_SECRET;
});
afterAll(() => {
  delete process.env.INTERNAL_API_SECRET;
});

describe('api app', () => {
  it('POST /api/jobs then GET /api/jobs/:id round-trips', async () => {
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    const crawl = { add: vi.fn().mockResolvedValue({ id: 'q' }) } as any;
    const storyboard = { add: vi.fn().mockResolvedValue({ id: 'q2' }) } as any;
    const app = await build({
      store,
      crawlQueue: crawl,
      storyboardQueue: storyboard,
      broker,
      fetchJson: async () => null,
      creditPool: null,
      logger: false,
    });

    const postRes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'x', duration: 30 },
      remoteAddress: '127.0.0.1',
    });
    expect(postRes.statusCode).toBe(201);
    const { jobId } = postRes.json();

    const getRes = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().status).toBe('queued');

    await app.close();
  });

  it('enforces rate limit on POST /api/jobs', async () => {
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    const crawl = { add: vi.fn().mockResolvedValue({ id: 'q' }) } as any;
    const storyboard = { add: vi.fn().mockResolvedValue({ id: 'q2' }) } as any;
    const app = await build({
      store,
      crawlQueue: crawl,
      storyboardQueue: storyboard,
      broker,
      fetchJson: async () => null,
      creditPool: null,
      rateLimitPerMinute: 2,
      logger: false,
    });

    const post = () =>
      app.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: { url: 'https://x.com', intent: 'x', duration: 30 },
        remoteAddress: '127.0.0.1',
      });
    const a = await post();
    const b = await post();
    const c = await post();
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(c.statusCode).toBe(429);
    await app.close();
  });

  it('rate-limit buckets per-user when JWT present (defense in depth)', async () => {
    // Two different signed users from the SAME IP get independent quotas;
    // both should be allowed within their respective limits while a third
    // request from either user trips 429.
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    const crawl = { add: vi.fn().mockResolvedValue({ id: 'q' }) } as any;
    const storyboard = { add: vi.fn().mockResolvedValue({ id: 'q2' }) } as any;
    const app = await build({
      store,
      crawlQueue: crawl,
      storyboardQueue: storyboard,
      broker,
      fetchJson: async () => null,
      creditPool: null,
      requireUserIdHeader: true,
      rateLimitPerMinute: 2,
      logger: false,
    });

    const aliceAuth = await bearerFor('alice');
    const bobAuth = await bearerFor('bob');
    const post = (auth: string) =>
      app.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: { url: 'https://x.com', intent: 'x', duration: 30 },
        remoteAddress: '127.0.0.1',
        headers: { Authorization: auth },
      });

    expect((await post(aliceAuth)).statusCode).toBe(201);
    expect((await post(aliceAuth)).statusCode).toBe(201);
    // Alice exhausted quota
    expect((await post(aliceAuth)).statusCode).toBe(429);
    // Bob (same IP) has independent quota — should still work
    expect((await post(bobAuth)).statusCode).toBe(201);
    await app.close();
  });

  it('healthz returns ok', async () => {
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    const crawl = { add: vi.fn().mockResolvedValue({ id: 'q' }) } as any;
    const storyboard = { add: vi.fn().mockResolvedValue({ id: 'q2' }) } as any;
    const app = await build({
      store,
      crawlQueue: crawl,
      storyboardQueue: storyboard,
      broker,
      fetchJson: async () => null,
      creditPool: null,
      logger: false,
    });
    const r = await app.inject({ method: 'GET', url: '/healthz' });
    expect(r.json()).toEqual({ ok: true });
    await app.close();
  });
});
