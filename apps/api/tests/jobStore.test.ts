import { describe, it, expect } from 'vitest';
import RedisMock from 'ioredis-mock';
import { makeJobStore } from '../src/jobStore.js';
import type { Job } from '../src/model/job.js';

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

describe('jobStore', () => {
  it('creates + reads a job', async () => {
    const redis = new RedisMock();
    const store = makeJobStore(redis as any);
    await store.create(sample);
    const got = await store.get('j1');
    expect(got?.jobId).toBe('j1');
  });

  it('patches a job with updatedAt bump', async () => {
    const redis = new RedisMock();
    const store = makeJobStore(redis as any);
    await store.create(sample);
    await store.patch('j1', { status: 'crawling', stage: 'crawl', progress: 10 }, 2000);
    const got = await store.get('j1');
    expect(got?.status).toBe('crawling');
    expect(got?.stage).toBe('crawl');
    expect(got?.progress).toBe(10);
    expect(got?.updatedAt).toBe(2000);
  });

  it('returns null for missing job', async () => {
    const redis = new RedisMock();
    const store = makeJobStore(redis as any);
    expect(await store.get('missing')).toBeNull();
  });

  it('sets 7-day TTL on create', async () => {
    const redis = new RedisMock();
    const store = makeJobStore(redis as any);
    await store.create(sample);
    const ttl = await redis.ttl('job:j1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(7 * 24 * 3600);
  });
});
