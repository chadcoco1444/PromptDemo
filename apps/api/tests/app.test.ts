import { describe, it, expect, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import { build } from '../src/app.js';
import { makeJobStore } from '../src/jobStore.js';
import { makeBroker } from '../src/sse/broker.js';

describe('api app', () => {
  it('POST /api/jobs then GET /api/jobs/:id round-trips', async () => {
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    const crawl = { add: vi.fn().mockResolvedValue({ id: 'q' }) } as any;
    const app = await build({
      store,
      crawlQueue: crawl,
      broker,
      fetchJson: async () => null,
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
    const app = await build({
      store,
      crawlQueue: crawl,
      broker,
      fetchJson: async () => null,
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

  it('healthz returns ok', async () => {
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    const crawl = { add: vi.fn().mockResolvedValue({ id: 'q' }) } as any;
    const app = await build({
      store,
      crawlQueue: crawl,
      broker,
      fetchJson: async () => null,
      logger: false,
    });
    const r = await app.inject({ method: 'GET', url: '/healthz' });
    expect(r.json()).toEqual({ ok: true });
    await app.close();
  });
});
