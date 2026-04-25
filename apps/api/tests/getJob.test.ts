import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import RedisMock from 'ioredis-mock';
import { getJobRoute } from '../src/routes/getJob.js';
import { getStoryboardRoute } from '../src/routes/getStoryboard.js';
import { makeJobStore } from '../src/jobStore.js';
import type { Job } from '../src/model/job.js';
import { S3UriSchema } from '@lumespec/schema';

const sample: Job = {
  jobId: 'j1',
  status: 'queued',
  stage: null,
  progress: 0,
  input: { url: 'https://x.com', intent: 'x', duration: 30 },
  fallbacks: [],
  createdAt: 1000,
  updatedAt: 1000,
};

describe('GET /api/jobs/:id', () => {
  it('returns 200 with job body when present', async () => {
    const app = Fastify();
    const redis = new RedisMock();
    const store = makeJobStore(redis as any);
    await store.create(sample);
    app.register(getJobRoute, { store });
    const res = await app.inject({ method: 'GET', url: '/api/jobs/j1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().jobId).toBe('j1');
  });

  it('returns 404 when missing', async () => {
    const app = Fastify();
    const redis = new RedisMock();
    const store = makeJobStore(redis as any);
    app.register(getJobRoute, { store });
    const res = await app.inject({ method: 'GET', url: '/api/jobs/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/jobs/:id/storyboard', () => {
  it('returns 404 when storyboardUri absent', async () => {
    const app = Fastify();
    const redis = new RedisMock();
    const store = makeJobStore(redis as any);
    await store.create(sample);
    const fetchJson = vi.fn();
    app.register(getStoryboardRoute, { store, fetchJson });
    const res = await app.inject({ method: 'GET', url: '/api/jobs/j1/storyboard' });
    expect(res.statusCode).toBe(404);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('returns storyboard JSON when present', async () => {
    const app = Fastify();
    const redis = new RedisMock();
    const store = makeJobStore(redis as any);
    const storyboardUri = S3UriSchema.parse('s3://bucket/k/sb.json');
    await store.create({ ...sample, storyboardUri });
    const fetchJson = vi.fn().mockResolvedValue({ scenes: [] });
    app.register(getStoryboardRoute, { store, fetchJson });
    const res = await app.inject({ method: 'GET', url: '/api/jobs/j1/storyboard' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ scenes: [] });
    expect(fetchJson).toHaveBeenCalledWith(storyboardUri);
  });
});
