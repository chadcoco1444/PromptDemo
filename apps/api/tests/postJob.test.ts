import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import RedisMock from 'ioredis-mock';
import { postJobRoute } from '../src/routes/postJob.js';
import { makeJobStore } from '../src/jobStore.js';

function build() {
  const app = Fastify();
  const redis = new RedisMock();
  const store = makeJobStore(redis as any);
  const crawl = { add: vi.fn().mockResolvedValue({ id: 'q1' }) };
  app.register(postJobRoute, { store, crawlQueue: crawl as any, now: () => 1000, nanoid: () => 'abc123' });
  return { app, crawl, store };
}

describe('POST /api/jobs', () => {
  it('creates a queued job and enqueues crawl', async () => {
    const { app, crawl, store } = build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'show it', duration: 30 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ jobId: 'abc123' });
    const persisted = await store.get('abc123');
    expect(persisted?.status).toBe('queued');
    expect(crawl.add).toHaveBeenCalledWith('crawl', expect.objectContaining({ jobId: 'abc123' }));
  });

  it('rejects invalid body with 400', async () => {
    const { app } = build();
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { url: 'nope' } });
    expect(res.statusCode).toBe(400);
  });

  it('honors parentJobId + hint in payload', async () => {
    const { app, crawl } = build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'x', duration: 10, parentJobId: 'parent', hint: 'faster' },
    });
    expect(res.statusCode).toBe(201);
    expect(crawl.add).toHaveBeenCalledWith('crawl', expect.objectContaining({ jobId: 'abc123', url: 'https://x.com' }));
  });
});
