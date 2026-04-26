import { describe, it, expect } from 'vitest';
import { JOB_DEFAULTS } from '../src/queues.js';

describe('queue job defaults', () => {
  it('retries 3 times with exponential backoff', () => {
    expect(JOB_DEFAULTS.attempts).toBe(3);
    expect(JOB_DEFAULTS.backoff.type).toBe('exponential');
    expect(JOB_DEFAULTS.backoff.delay).toBe(5_000);
  });

  it('caps completed and failed job history to prevent unbounded Redis growth', () => {
    expect(JOB_DEFAULTS.removeOnComplete).toMatchObject({ count: 100 });
    expect(JOB_DEFAULTS.removeOnFail).toMatchObject({ count: 50 });
  });
});
