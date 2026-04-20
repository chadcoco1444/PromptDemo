import { describe, it, expect } from 'vitest';
import { S3UriSchema, parseS3Uri, toS3Uri } from '../src/s3Uri.js';

describe('S3UriSchema', () => {
  it('accepts valid s3 URI', () => {
    expect(S3UriSchema.parse('s3://my-bucket/key/path.jpg')).toBe('s3://my-bucket/key/path.jpg');
  });

  it('rejects http URLs', () => {
    expect(() => S3UriSchema.parse('https://x.s3.amazonaws.com/k')).toThrow();
  });

  it('rejects missing bucket', () => {
    expect(() => S3UriSchema.parse('s3:///key')).toThrow();
  });

  it('rejects missing key', () => {
    expect(() => S3UriSchema.parse('s3://bucket')).toThrow();
  });
});

describe('parseS3Uri', () => {
  it('splits bucket and key', () => {
    expect(parseS3Uri('s3://my-bucket/a/b/c.jpg')).toEqual({ bucket: 'my-bucket', key: 'a/b/c.jpg' });
  });
});

describe('toS3Uri', () => {
  it('assembles bucket and key', () => {
    expect(toS3Uri('bucket', 'a/b.jpg')).toBe('s3://bucket/a/b.jpg');
  });
});
