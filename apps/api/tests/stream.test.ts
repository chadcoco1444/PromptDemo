import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import RedisMock from 'ioredis-mock';
import { makeJobStore } from '../src/jobStore.js';
import { makeBroker } from '../src/sse/broker.js';
import { streamRoute } from '../src/routes/stream.js';

const BASE_JOB = {
  status: 'queued' as const,
  stage: null,
  progress: 0,
  input: { url: 'https://x.com', intent: 'test', duration: 30 as const },
  fallbacks: [] as never[],
  createdAt: 1000,
  updatedAt: 1000,
};

describe('GET /api/jobs/:id/stream', () => {
  it('returns 404 for missing job', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    const broker = makeBroker();
    app.register(streamRoute, { store, broker });
    const res = await app.inject({ method: 'GET', url: '/api/jobs/missing/stream' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when x-user-id does not match job.userId', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker(), requireUserIdHeader: true });
    await store.create({ jobId: 'j-mismatch', userId: '1', ...BASE_JOB });
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-mismatch/stream',
      headers: { 'x-user-id': '2' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'forbidden' });
    await app.close();
  });

  it('starts SSE stream when x-user-id matches job.userId', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker(), requireUserIdHeader: true });
    await store.create({ jobId: 'j-match', userId: '42', ...BASE_JOB });
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-match/stream',
      headers: { 'x-user-id': '42' },
      payloadAsStream: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    await app.close();
  });

  it('bypasses ownership check when requireUserIdHeader=false', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker(), requireUserIdHeader: false });
    await store.create({ jobId: 'j-auth-off', userId: '1', ...BASE_JOB });
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-auth-off/stream',
      headers: { 'x-user-id': '999' }, // different user, but auth disabled
      payloadAsStream: true,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('allows any authenticated user to stream an anonymous job (no userId on job)', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker(), requireUserIdHeader: true });
    await store.create({ jobId: 'j-anon', ...BASE_JOB }); // no userId field
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-anon/stream',
      headers: { 'x-user-id': '99' },
      payloadAsStream: true,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
