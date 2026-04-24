import { describe, it, expect } from 'vitest';
import { makeS3Resolver } from '../src/s3Resolver.js';

describe('makeS3Resolver', () => {
  it('maps s3://bucket/key → endpoint/bucket/key for path-style access', () => {
    const resolve = makeS3Resolver({ endpoint: 'http://localhost:9000', forcePathStyle: true });
    expect(resolve('s3://promptdemo-dev/jobs/j/hero.jpg')).toBe(
      'http://localhost:9000/promptdemo-dev/jobs/j/hero.jpg'
    );
  });

  it('maps s3://bucket/key → https://bucket.endpoint/key for virtual-host style', () => {
    const resolve = makeS3Resolver({ endpoint: 'https://s3.amazonaws.com', forcePathStyle: false });
    expect(resolve('s3://promptdemo-prod/x/y.jpg')).toBe(
      'https://promptdemo-prod.s3.amazonaws.com/x/y.jpg'
    );
  });

  it('passes through non-s3:// URLs unchanged', () => {
    const resolve = makeS3Resolver({ endpoint: 'http://localhost:9000', forcePathStyle: true });
    expect(resolve('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
  });

  it('returns undefined for undefined input', () => {
    const resolve = makeS3Resolver({ endpoint: 'http://localhost:9000', forcePathStyle: true });
    expect(resolve(undefined)).toBeUndefined();
  });
});
