import { describe, it, expect } from 'vitest';
import { detectWafBlock } from '../src/wafDetect.js';

describe('detectWafBlock', () => {
  it('detects Cloudflare challenge by title', () => {
    const html = '<html><head><title>Just a moment...</title></head><body></body></html>';
    expect(detectWafBlock({ status: 200, html })).toEqual({ blocked: true, reason: 'cloudflare-challenge' });
  });

  it('detects 403 status', () => {
    expect(detectWafBlock({ status: 403, html: '' })).toEqual({ blocked: true, reason: 'http-403' });
  });

  it('detects 429 status', () => {
    expect(detectWafBlock({ status: 429, html: '' })).toEqual({ blocked: true, reason: 'http-429' });
  });

  it('detects Turnstile iframe in html', () => {
    const html = '<iframe src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/..."></iframe>';
    expect(detectWafBlock({ status: 200, html })).toEqual({ blocked: true, reason: 'turnstile' });
  });

  it('returns not blocked for clean 200 html', () => {
    expect(detectWafBlock({ status: 200, html: '<html><body>hello</body></html>' })).toEqual({ blocked: false });
  });
});
