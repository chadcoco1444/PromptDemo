import { describe, it, expect } from 'vitest';
import { JobInputSchema, JobSchema, type Job } from '../../src/lib/types';

describe('JobInputSchema', () => {
  it('accepts 10/30/60 duration', () => {
    for (const d of [10, 30, 60] as const) {
      expect(JobInputSchema.safeParse({ url: 'https://x.com', intent: 'x', duration: d }).success).toBe(true);
    }
  });

  it('rejects bad URL', () => {
    expect(JobInputSchema.safeParse({ url: 'not a url', intent: 'x', duration: 10 }).success).toBe(false);
  });

  it('rejects empty intent', () => {
    expect(JobInputSchema.safeParse({ url: 'https://x.com', intent: '', duration: 10 }).success).toBe(false);
  });

  it('accepts optional parentJobId + hint', () => {
    const r = JobInputSchema.safeParse({
      url: 'https://x.com',
      intent: 'x',
      duration: 10,
      parentJobId: 'j1',
      hint: 'faster',
    });
    expect(r.success).toBe(true);
  });
});

describe('JobSchema', () => {
  const base = {
    jobId: 'j1',
    status: 'queued',
    stage: null,
    progress: 0,
    input: { url: 'https://x.com', intent: 'x', duration: 30 },
    fallbacks: [],
    createdAt: 1,
    updatedAt: 1,
  };

  it('accepts queued job', () => {
    expect(JobSchema.safeParse(base).success).toBe(true);
  });

  it('accepts done with videoUrl', () => {
    const r = JobSchema.safeParse({
      ...base,
      status: 'done',
      progress: 100,
      videoUrl: 's3://bucket/v.mp4',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(JobSchema.safeParse({ ...base, status: 'weird' }).success).toBe(false);
  });
});
