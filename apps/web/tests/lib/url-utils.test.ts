import { describe, it, expect } from 'vitest';
import { normalizeHostname, hostnameOf, hostnameMatches } from '../../src/lib/url-utils';

describe('normalizeHostname', () => {
  it('lowercases', () => {
    expect(normalizeHostname('VERCEL.COM')).toBe('vercel.com');
  });

  it('strips a single leading www.', () => {
    expect(normalizeHostname('www.vercel.com')).toBe('vercel.com');
    expect(normalizeHostname('WWW.vercel.com')).toBe('vercel.com');
  });

  it('does not strip subdomain that merely starts with w', () => {
    expect(normalizeHostname('webhooks.stripe.com')).toBe('webhooks.stripe.com');
    expect(normalizeHostname('www2.example.com')).toBe('www2.example.com');
  });

  it('returns input as-is when blank', () => {
    expect(normalizeHostname('')).toBe('');
  });
});

describe('hostnameOf', () => {
  it('extracts hostname from a valid URL', () => {
    expect(hostnameOf('https://www.vercel.com/dashboard')).toBe('vercel.com');
    expect(hostnameOf('http://localhost:3000/foo')).toBe('localhost');
  });

  it('returns the input when not a parseable URL', () => {
    expect(hostnameOf('not-a-url')).toBe('not-a-url');
    expect(hostnameOf('')).toBe('');
  });
});

describe('hostnameMatches', () => {
  it('case-insensitive comparison after stripping www.', () => {
    expect(hostnameMatches('https://vercel.com', 'https://www.VERCEL.com')).toBe(true);
    expect(hostnameMatches('https://stripe.com', 'https://vercel.com')).toBe(false);
  });
});
