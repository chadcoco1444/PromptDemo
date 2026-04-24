import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import RedisMock from 'ioredis-mock';
import { makeJobStore } from '../src/jobStore.js';
import { makeBroker } from '../src/sse/broker.js';
import { streamRoute } from '../src/routes/stream.js';

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
});
