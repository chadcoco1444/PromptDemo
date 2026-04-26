import { describe, it, expect, beforeEach } from 'vitest';
import Redis from 'ioredis-mock';
import {
  checkCircuit,
  recordFailure,
  recordSuccess,
  type CircuitState,
} from '../src/domainCircuit.js';

const HOST = 'example.com';

// ioredis-mock shares an in-memory store across instances; flush before each test.
const sharedRedis = new Redis() as any;

beforeEach(async () => {
  await sharedRedis.flushall();
});

function makeRedis() {
  return sharedRedis;
}

describe('checkCircuit', () => {
  it('returns closed when healthy key is present', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:healthy`, '1', 'EX', 60);
    const state = await checkCircuit(redis, HOST);
    expect(state).toBe<CircuitState>('closed');
  });

  it('returns open when open key is present', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:open`, '1', 'EX', 1800);
    const state = await checkCircuit(redis, HOST);
    expect(state).toBe<CircuitState>('open');
  });

  it('returns half-open-probe-claimed when no keys exist (claims probe)', async () => {
    const redis = makeRedis();
    const state = await checkCircuit(redis, HOST);
    expect(state).toBe<CircuitState>('half-open-probe-claimed');
    // Probe key should now be set
    const probe = await redis.get(`circuit:${HOST}:probe`);
    expect(probe).toBe('1');
  });

  it('returns half-open-probe-in-flight when probe key already exists', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:probe`, '1', 'EX', 120);
    const state = await checkCircuit(redis, HOST);
    expect(state).toBe<CircuitState>('half-open-probe-in-flight');
  });
});

describe('recordFailure', () => {
  it('accumulates strikes below threshold without opening circuit', async () => {
    const redis = makeRedis();
    await recordFailure(redis, HOST);
    await recordFailure(redis, HOST);
    const strikes = await redis.get(`circuit:${HOST}:strikes`);
    const open = await redis.get(`circuit:${HOST}:open`);
    expect(Number(strikes)).toBe(2);
    expect(open).toBeNull();
  });

  it('opens circuit after 3 consecutive failures and clears strikes', async () => {
    const redis = makeRedis();
    await recordFailure(redis, HOST);
    await recordFailure(redis, HOST);
    await recordFailure(redis, HOST);
    const open = await redis.get(`circuit:${HOST}:open`);
    const strikes = await redis.get(`circuit:${HOST}:strikes`);
    expect(open).toBe('1');
    expect(strikes).toBeNull();
  });

  it('re-opens circuit immediately on probe failure and clears probe key', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:probe`, '1', 'EX', 120);
    await recordFailure(redis, HOST);
    const open = await redis.get(`circuit:${HOST}:open`);
    const probe = await redis.get(`circuit:${HOST}:probe`);
    expect(open).toBe('1');
    expect(probe).toBeNull();
  });
});

describe('recordSuccess', () => {
  it('sets healthy key and clears all other circuit keys', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:open`, '1', 'EX', 1800);
    await redis.set(`circuit:${HOST}:probe`, '1', 'EX', 120);
    await redis.set(`circuit:${HOST}:strikes`, '2');
    await recordSuccess(redis, HOST);
    expect(await redis.get(`circuit:${HOST}:healthy`)).toBe('1');
    expect(await redis.get(`circuit:${HOST}:open`)).toBeNull();
    expect(await redis.get(`circuit:${HOST}:probe`)).toBeNull();
    expect(await redis.get(`circuit:${HOST}:strikes`)).toBeNull();
  });
});
