import { describe, it, expect } from 'vitest';
import { buildKey } from '../src/s3/s3Client.js';

describe('buildKey', () => {
  it('prefixes with jobs/<jobId>/ and sanitizes filename', () => {
    expect(buildKey('abc123', 'viewport.jpg')).toBe('jobs/abc123/viewport.jpg');
  });

  it('strips path separators from filename', () => {
    expect(buildKey('abc', '../../etc/passwd')).toBe('jobs/abc/passwd');
  });
});
