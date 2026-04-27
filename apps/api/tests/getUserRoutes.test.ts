import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import RedisMock from 'ioredis-mock';
import { SignJWT } from 'jose';
import { build } from '../src/app.js';
import { makeJobStore } from '../src/jobStore.js';
import { makeBroker } from '../src/sse/broker.js';

const TEST_SECRET = 'b'.repeat(64);
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

function makeMockPgPool(overrides?: { jobRows?: unknown[]; creditRows?: unknown[] }) {
  return {
    async query(sql: string, params?: unknown[]) {
      void params;
      if (sql.includes('FROM jobs j')) {
        return { rows: overrides?.jobRows ?? [], rowCount: 0 };
      }
      if (sql.includes('FROM users u') && sql.includes('LEFT JOIN credits')) {
        return { rows: overrides?.creditRows ?? [{ balance: 120, tier: 'free', active_jobs: 0 }], rowCount: 1 };
      }
      if (sql.includes('FROM users u') && sql.includes('LEFT JOIN subscriptions')) {
        return { rows: [{ tier: 'free' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    connect: vi.fn(),
  } as never;
}

beforeAll(() => {
  process.env.INTERNAL_API_SECRET = TEST_SECRET;
});
afterAll(() => {
  delete process.env.INTERNAL_API_SECRET;
});

describe('GET /api/users/me/jobs', () => {
  it('returns 401 without a JWT', async () => {
    const app = await build({
      store: makeJobStore(new RedisMock() as never),
      crawlQueue: { add: vi.fn() } as never,
      storyboardQueue: { add: vi.fn() } as never,
      broker: makeBroker(),
      fetchJson: async () => null,
      creditPool: null,
      pgPool: makeMockPgPool(),
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/me/jobs' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 200 with jobs array for a valid JWT', async () => {
    const app = await build({
      store: makeJobStore(new RedisMock() as never),
      crawlQueue: { add: vi.fn() } as never,
      storyboardQueue: { add: vi.fn() } as never,
      broker: makeBroker(),
      fetchJson: async () => null,
      creditPool: null,
      pgPool: makeMockPgPool(),
      logger: false,
    });
    const auth = await bearerFor('42');
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me/jobs?limit=24',
      headers: { Authorization: auth },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ jobs: unknown[]; hasMore: boolean; tier: string }>();
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(typeof body.hasMore).toBe('boolean');
    expect(body.tier).toBe('free');
    await app.close();
  });

  it('returns 404 when pgPool is not configured', async () => {
    const app = await build({
      store: makeJobStore(new RedisMock() as never),
      crawlQueue: { add: vi.fn() } as never,
      storyboardQueue: { add: vi.fn() } as never,
      broker: makeBroker(),
      fetchJson: async () => null,
      creditPool: null,
      logger: false,
    });
    const auth = await bearerFor('42');
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me/jobs',
      headers: { Authorization: auth },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /api/users/me/credits', () => {
  it('returns 401 without a JWT', async () => {
    const app = await build({
      store: makeJobStore(new RedisMock() as never),
      crawlQueue: { add: vi.fn() } as never,
      storyboardQueue: { add: vi.fn() } as never,
      broker: makeBroker(),
      fetchJson: async () => null,
      creditPool: null,
      pgPool: makeMockPgPool(),
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/users/me/credits' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns credits snapshot for a valid JWT', async () => {
    const app = await build({
      store: makeJobStore(new RedisMock() as never),
      crawlQueue: { add: vi.fn() } as never,
      storyboardQueue: { add: vi.fn() } as never,
      broker: makeBroker(),
      fetchJson: async () => null,
      creditPool: null,
      pgPool: makeMockPgPool({ creditRows: [{ balance: 120, tier: 'free', active_jobs: 0 }] }),
      logger: false,
    });
    const auth = await bearerFor('42');
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me/credits',
      headers: { Authorization: auth },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ balance: number; tier: string; allowance: number }>();
    expect(body.balance).toBe(120);
    expect(body.tier).toBe('free');
    expect(body.allowance).toBe(30);
    await app.close();
  });
});
