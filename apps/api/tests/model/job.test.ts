import { describe, it, expect } from 'vitest';
import { JobSchema, JobStatus, JobInputSchema } from '../../src/model/job.js';

describe('JobInputSchema', () => {
  it('accepts minimal valid input', () => {
    const r = JobInputSchema.safeParse({
      url: 'https://example.com',
      intent: 'show features',
      duration: 30,
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid duration', () => {
    const r = JobInputSchema.safeParse({ url: 'https://x.com', intent: 'x', duration: 45 });
    expect(r.success).toBe(false);
  });

  it('accepts optional parentJobId + hint', () => {
    const r = JobInputSchema.safeParse({
      url: 'https://x.com',
      intent: 'x',
      duration: 10,
      parentJobId: 'abc123',
      hint: 'faster pace',
    });
    expect(r.success).toBe(true);
  });
});

describe('JobSchema', () => {
  it('accepts a fresh queued job', () => {
    const r = JobSchema.safeParse({
      jobId: 'j1',
      status: 'queued' satisfies JobStatus,
      stage: null,
      progress: 0,
      input: { url: 'https://x.com', intent: 'x', duration: 30 },
      fallbacks: [],
      createdAt: 1,
      updatedAt: 1,
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown status', () => {
    const r = JobSchema.safeParse({
      jobId: 'j1',
      status: 'weird',
      stage: null,
      progress: 0,
      input: { url: 'https://x.com', intent: 'x', duration: 30 },
      fallbacks: [],
      createdAt: 1,
      updatedAt: 1,
    });
    expect(r.success).toBe(false);
  });
});
