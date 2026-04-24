import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJob, getJob, streamUrl } from '../../src/lib/api';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createJob', () => {
  it('routes through the /api/jobs/create proxy by default (same-origin)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ jobId: 'abc' }),
    }) as any;
    const res = await createJob(
      { url: 'https://x.com', intent: 'x', duration: 30 },
      'http://api',
    );
    expect(res).toEqual({ jobId: 'abc' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/jobs/create',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('bypasses the proxy when useProxy=false (testing-only escape hatch)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ jobId: 'abc' }),
    }) as any;
    await createJob(
      { url: 'https://x.com', intent: 'x', duration: 30 },
      'http://api',
      { useProxy: false },
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api/api/jobs',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws the server-provided message on non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 400,
      ok: false,
      json: async () => ({ message: 'bad input' }),
    }) as any;
    await expect(
      createJob({ url: 'https://x.com', intent: 'x', duration: 10 }, 'http://api')
    ).rejects.toThrow(/bad input/);
  });

  it('throws a friendly rate-limit message on 429', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      json: async () => ({ error: 'Too Many Requests' }),
    }) as any;
    await expect(
      createJob({ url: 'https://x.com', intent: 'x', duration: 10 }, 'http://api')
    ).rejects.toThrow(/too many video requests/i);
  });

  it('throws a friendly insufficient-credits message on 402', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 402,
      ok: false,
      json: async () => ({}),
    }) as any;
    await expect(
      createJob({ url: 'https://x.com', intent: 'x', duration: 10 }, 'http://api')
    ).rejects.toThrow(/out of render seconds/i);
  });
});

describe('getJob', () => {
  it('fetches and parses a Job', async () => {
    const job = {
      jobId: 'j',
      status: 'queued',
      stage: null,
      progress: 0,
      input: { url: 'https://x.com', intent: 'x', duration: 30 },
      fallbacks: [],
      createdAt: 1,
      updatedAt: 1,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => job,
    }) as any;
    const r = await getJob('j', 'http://api');
    expect(r.jobId).toBe('j');
  });

  it('throws on 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as any;
    await expect(getJob('j', 'http://api')).rejects.toThrow(/404/);
  });
});

describe('streamUrl', () => {
  it('builds a stream URL', () => {
    expect(streamUrl('j1', 'http://api')).toBe('http://api/api/jobs/j1/stream');
  });
});
