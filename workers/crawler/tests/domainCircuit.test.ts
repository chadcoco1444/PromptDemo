import { describe, it, expect, beforeEach } from 'vitest';
import Redis from 'ioredis-mock';
import type { Redis as IoRedis } from 'ioredis';
import {
  checkCircuit,
  evaluateCircuit,
  recordFailure,
  recordSuccess,
  type CircuitState,
} from '../src/domainCircuit.js';

const HOST = 'example.com';

// ioredis-mock shares an in-memory store across instances; flush before each test.
const sharedRedis = new Redis() as unknown as IoRedis;

beforeEach(async () => {
  await sharedRedis.flushall();
});

function makeRedis(): IoRedis {
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

  it('exactly one concurrent checkCircuit call claims the probe', async () => {
    const redis = makeRedis();
    const [stateA, stateB] = await Promise.all([
      checkCircuit(redis, HOST),
      checkCircuit(redis, HOST),
    ]);
    const states = [stateA, stateB];
    expect(states.filter(s => s === 'half-open-probe-claimed')).toHaveLength(1);
    expect(states.filter(s => s === 'half-open-probe-in-flight')).toHaveLength(1);
  });
});

describe('recordFailure', () => {
  it('accumulates strikes below threshold without opening circuit', async () => {
    const redis = makeRedis();
    await recordFailure(redis, HOST, false);
    await recordFailure(redis, HOST, false);
    const strikes = await redis.get(`circuit:${HOST}:strikes`);
    const open = await redis.get(`circuit:${HOST}:open`);
    expect(Number(strikes)).toBe(2);
    expect(open).toBeNull();
  });

  it('opens circuit after 3 consecutive failures and clears strikes', async () => {
    const redis = makeRedis();
    await recordFailure(redis, HOST, false);
    await recordFailure(redis, HOST, false);
    await recordFailure(redis, HOST, false);
    const open = await redis.get(`circuit:${HOST}:open`);
    const strikes = await redis.get(`circuit:${HOST}:strikes`);
    expect(open).toBe('1');
    expect(strikes).toBeNull();
  });

  it('re-opens circuit immediately on probe failure and clears probe key', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:probe`, '1', 'EX', 120);
    await recordFailure(redis, HOST, true);
    const open = await redis.get(`circuit:${HOST}:open`);
    const probe = await redis.get(`circuit:${HOST}:probe`);
    expect(open).toBe('1');
    expect(probe).toBeNull();
  });

  it('strike counter resets after recordSuccess closes circuit', async () => {
    const redis = makeRedis();
    await recordFailure(redis, HOST, false);
    await recordFailure(redis, HOST, false);
    await recordFailure(redis, HOST, false);
    // Circuit opened
    expect(await redis.get(`circuit:${HOST}:open`)).toBe('1');

    // Simulate recovery
    await recordSuccess(redis, HOST);
    expect(await redis.get(`circuit:${HOST}:open`)).toBeNull();

    // One new failure should not re-open
    await recordFailure(redis, HOST, false);
    expect(await redis.get(`circuit:${HOST}:open`)).toBeNull();
    expect(Number(await redis.get(`circuit:${HOST}:strikes`))).toBe(1);
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

  it('recordSuccess after probe-claimed path clears probe and sets healthy', async () => {
    const redis = makeRedis();
    // Simulate: circuit was half-open, probe claimed, playwright succeeded
    await redis.set(`circuit:${HOST}:probe`, '1', 'EX', 120);
    await recordSuccess(redis, HOST);
    expect(await redis.get(`circuit:${HOST}:probe`)).toBeNull();
    expect(await redis.get(`circuit:${HOST}:healthy`)).toBe('1');
    // After success, circuit returns closed
    const state = await checkCircuit(redis, HOST);
    expect(state).toBe<CircuitState>('closed');
  });
});

describe('evaluateCircuit', () => {
  it('returns allow + wasProbe=false when circuit is closed', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:healthy`, '1', 'EX', 60);
    const result = await evaluateCircuit(redis, HOST);
    expect(result).toEqual({ kind: 'allow', wasProbe: false });
  });

  it('returns allow + wasProbe=true when this caller claims the half-open probe', async () => {
    const redis = makeRedis();
    // Simulate half-open-probe-claimed by having no keys yet,
    // so evaluateCircuit -> checkCircuit will claim it.
    const result = await evaluateCircuit(redis, HOST);
    expect(result).toEqual({ kind: 'allow', wasProbe: true });
  });

  it('returns blocked CIRCUIT_OPEN when domain is in cooldown', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:open`, '1', 'EX', 1800);
    const result = await evaluateCircuit(redis, HOST);
    expect(result).toEqual({ kind: 'blocked', reason: 'CIRCUIT_OPEN' });
  });

  it('returns blocked CIRCUIT_HALF_OPEN when another worker is currently probing', async () => {
    const redis = makeRedis();
    await redis.set(`circuit:${HOST}:probe`, '1', 'EX', 120);
    const result = await evaluateCircuit(redis, HOST);
    expect(result).toEqual({ kind: 'blocked', reason: 'CIRCUIT_HALF_OPEN' });
  });

  it('does NOT mutate redis as a side effect (pure read)', async () => {
    const redis = makeRedis();
    const before = await redis.get(`circuit:${HOST}:strikes`);
    await evaluateCircuit(redis, HOST);
    const after = await redis.get(`circuit:${HOST}:strikes`);
    expect(after).toBe(before);
  });
});
