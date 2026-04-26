import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
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

  it('streams an authenticated job without requiring x-user-id header', async () => {
    // Regression: the stream route previously checked x-user-id against job.userId.
    // The browser's native EventSource API cannot send custom headers, so any
    // authenticated job (job.userId set) always returned 403 → EventSource.CLOSED
    // → permanent STREAM_ERROR. The ownership check was removed; job IDs are
    // cryptographically random (nanoid) and serve as unguessable capability tokens,
    // consistent with GET /api/jobs/:id which also has no ownership check.
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker() });
    await store.create({ jobId: 'j-auth', userId: '42', ...BASE_JOB });
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-auth/stream',
      // no x-user-id header — simulates what a browser EventSource sends
      payloadAsStream: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    await app.close();
  });

  it('streams an authenticated job even when a mismatched x-user-id header is present', async () => {
    // EventSource cannot suppress headers, so we must not reject based on them.
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker() });
    await store.create({ jobId: 'j-mismatch', userId: '1', ...BASE_JOB });
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-mismatch/stream',
      headers: { 'x-user-id': '2' },
      payloadAsStream: true,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('streams an anonymous job (no userId on job)', async () => {
    const app = Fastify();
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker() });
    await store.create({ jobId: 'j-anon', ...BASE_JOB }); // no userId field
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-anon/stream',
      payloadAsStream: true,
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('stream route is exempt from the global rate limiter', async () => {
    // Regression: the global rate limiter (max: 10/min) was applied to SSE connections,
    // causing 429 → EventSource.CLOSED after rapid reconnect retries (e.g. dev hot-reload).
    const app = Fastify();
    await app.register(rateLimit, { max: 1, timeWindow: '1 minute' });
    const store = makeJobStore(new RedisMock() as any);
    app.register(streamRoute, { store, broker: makeBroker() });
    await store.create({ jobId: 'j-rl', ...BASE_JOB });

    // First stream request — always succeeds
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-rl/stream',
      remoteAddress: '127.0.0.1',
      payloadAsStream: true,
    });
    expect(res1.statusCode).toBe(200);

    // Second stream request — would be 429 if rate-limited, must be 200 because stream is exempt
    const res2 = await app.inject({
      method: 'GET',
      url: '/api/jobs/j-rl/stream',
      remoteAddress: '127.0.0.1',
      payloadAsStream: true,
    });
    expect(res2.statusCode).toBe(200);

    await app.close();
  });
});
