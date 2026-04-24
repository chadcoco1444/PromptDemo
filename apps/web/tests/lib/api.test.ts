import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJob, getJob, streamUrl } from '../../src/lib/api';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createJob', () => {
  it('POSTs the input and returns jobId on 201', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ jobId: 'abc' }),
    }) as any;
    const res = await createJob(
      { url: 'https://x.com', intent: 'x', duration: 30 },
      'http://api'
    );
    expect(res).toEqual({ jobId: 'abc' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api/api/jobs',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws on non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 400,
      ok: false,
      json: async () => ({ error: 'bad' }),
    }) as any;
    await expect(
      createJob({ url: 'https://x.com', intent: 'x', duration: 10 }, 'http://api')
    ).rejects.toThrow(/400/);
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
