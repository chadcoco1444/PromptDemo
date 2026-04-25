import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import RedisMock from 'ioredis-mock';
import { SignJWT } from 'jose';
import { postJobRoute } from '../src/routes/postJob.js';
import { makeJobStore } from '../src/jobStore.js';

const TEST_SECRET = 'a'.repeat(64);
const enc = new TextEncoder();
async function bearerFor(userId: string): Promise<string> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('promptdemo-web')
    .setAudience('promptdemo-api')
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

function build(opts: { requireUserIdHeader?: boolean } = {}) {
  const app = Fastify();
  const redis = new RedisMock();
  const store = makeJobStore(redis as any);
  const crawl = { add: vi.fn().mockResolvedValue({ id: 'q1' }) };
  const storyboard = { add: vi.fn().mockResolvedValue({ id: 'q2' }) };
  app.register(postJobRoute, {
    store,
    crawlQueue: crawl as any,
    storyboardQueue: storyboard as any,
    requireUserIdHeader: opts.requireUserIdHeader ?? false,
    creditPool: null, // pricing disabled in these existing tests; F5 gate tested separately
    now: () => 1000,
    nanoid: () => 'abc123',
  });
  return { app, crawl, storyboard, store };
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
    expect(crawl.add).toHaveBeenCalledWith(
      'crawl',
      expect.objectContaining({ jobId: 'abc123' }),
      { jobId: 'abc123' },
    );
  });

  it('rejects invalid body with 400', async () => {
    const { app } = build();
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { url: 'nope' } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects parentJobId that does not exist with 404', async () => {
    const { app, crawl, storyboard } = build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'x', duration: 10, parentJobId: 'does-not-exist' },
    });
    expect(res.statusCode).toBe(404);
    expect(crawl.add).not.toHaveBeenCalled();
    expect(storyboard.add).not.toHaveBeenCalled();
  });

  it('rejects parentJobId whose crawl has not completed with 409', async () => {
    const { app, crawl, storyboard, store } = build();
    await store.create({
      jobId: 'parent',
      status: 'crawling',
      stage: 'crawl',
      progress: 50,
      input: { url: 'https://x.com', intent: 'x', duration: 30 },
      fallbacks: [],
      createdAt: 1,
      updatedAt: 1,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'x', duration: 10, parentJobId: 'parent' },
    });
    expect(res.statusCode).toBe(409);
    expect(crawl.add).not.toHaveBeenCalled();
    expect(storyboard.add).not.toHaveBeenCalled();
  });

  it('skip-crawl path when parent has a complete crawlResultUri', async () => {
    const { app, crawl, storyboard, store } = build();
    await store.create({
      jobId: 'parent',
      status: 'done',
      stage: 'render',
      progress: 100,
      input: { url: 'https://x.com', intent: 'x', duration: 30 },
      crawlResultUri: 's3://bucket/crawl.json' as any,
      fallbacks: [],
      createdAt: 1,
      updatedAt: 1,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'faster pace', duration: 10, parentJobId: 'parent', hint: 'faster' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ jobId: 'abc123', skippedCrawl: true });
    expect(crawl.add).not.toHaveBeenCalled();
    expect(storyboard.add).toHaveBeenCalledWith(
      'generate',
      expect.objectContaining({
        jobId: 'abc123',
        crawlResultUri: 's3://bucket/crawl.json',
        intent: 'faster pace',
        duration: 10,
        hint: 'faster',
      }),
      { jobId: 'abc123' },
    );
    const persisted = await store.get('abc123');
    expect(persisted?.status).toBe('generating');
    expect(persisted?.stage).toBe('storyboard');
    expect(persisted?.crawlResultUri).toBe('s3://bucket/crawl.json');
  });

  it('SECURITY: even if the client tries to pass crawlResultUri in payload it is ignored', async () => {
    // parentJobId lookup is server-authoritative; client-side fields beyond
    // the JobInput schema are already stripped by Zod's parse, but this
    // regression guard asserts that behavior holds.
    const { app, crawl, storyboard, store } = build();
    await store.create({
      jobId: 'parent',
      status: 'done',
      stage: 'render',
      progress: 100,
      input: { url: 'https://x.com', intent: 'x', duration: 30 },
      crawlResultUri: 's3://legit/crawl.json' as any,
      fallbacks: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        url: 'https://x.com',
        intent: 'regen',
        duration: 10,
        parentJobId: 'parent',
        // Malicious: try to inject a different crawl result URI
        crawlResultUri: 's3://attacker-owned/evil.json',
      } as any,
    });
    // Verify the enqueued job used the server-looked-up URI, not the malicious payload
    expect(storyboard.add).toHaveBeenCalledWith(
      'generate',
      expect.objectContaining({ crawlResultUri: 's3://legit/crawl.json' }),
      expect.any(Object),
    );
  });

  it('requires Authorization Bearer JWT when requireUserIdHeader=true', async () => {
    const { app } = build({ requireUserIdHeader: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'x', duration: 10 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid JWT and attaches the sub claim as userId on the stored job', async () => {
    const { app, store } = build({ requireUserIdHeader: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'x', duration: 10 },
      headers: { Authorization: await bearerFor('user-42') },
    });
    expect(res.statusCode).toBe(201);
    const persisted = await store.get('abc123');
    expect((persisted as { userId?: string } | null)?.userId).toBe('user-42');
  });

  it('rejects a plaintext X-User-Id (legacy spoofing vector)', async () => {
    const { app } = build({ requireUserIdHeader: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'x', duration: 10 },
      headers: { 'X-User-Id': 'user-attacker' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a JWT signed with the wrong secret', async () => {
    const { app } = build({ requireUserIdHeader: true });
    const badToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('user-evil')
      .setIssuedAt()
      .setIssuer('promptdemo-web')
      .setAudience('promptdemo-api')
      .setExpirationTime('60s')
      .sign(enc.encode('b'.repeat(64)));
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { url: 'https://x.com', intent: 'x', duration: 10 },
      headers: { Authorization: `Bearer ${badToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
