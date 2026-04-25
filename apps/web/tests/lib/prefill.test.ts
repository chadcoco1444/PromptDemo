import { describe, it, expect } from 'vitest';
import { encodePrefill, decodePrefill, signInRedirectFor } from '../../src/lib/prefill';

describe('encodePrefill / decodePrefill', () => {
  it('round-trips url + intent + duration through base64', () => {
    const input = { url: 'https://x.com', intent: 'show pricing', duration: 30 } as const;
    const encoded = encodePrefill(input);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/); // url-safe base64
    const decoded = decodePrefill(encoded);
    expect(decoded).toEqual(input);
  });

  it('handles unicode intent (Chinese) without corruption', () => {
    const input = { url: 'https://x.com', intent: '行銷影片：強調速度', duration: 60 } as const;
    expect(decodePrefill(encodePrefill(input))).toEqual(input);
  });

  it('decodePrefill returns null on malformed input', () => {
    expect(decodePrefill('not-base64!!!')).toBeNull();
    expect(decodePrefill('')).toBeNull();
    expect(decodePrefill('aGVsbG8')).toBeNull(); // valid base64 but not our shape
  });

  it('decodePrefill returns null on missing required fields', () => {
    const partial = btoa(JSON.stringify({ url: 'https://x.com' }));
    expect(decodePrefill(partial)).toBeNull();
  });
});

describe('signInRedirectFor', () => {
  it('builds a NextAuth signin URL with the prefill carried via callbackUrl', () => {
    const url = signInRedirectFor({
      url: 'https://x.com',
      intent: 'show pricing',
      duration: 30,
    });
    expect(url).toMatch(/^\/api\/auth\/signin\?callbackUrl=/);
    const params = new URLSearchParams(url.split('?')[1]);
    const callback = params.get('callbackUrl');
    expect(callback).toBeTruthy();
    expect(callback).toMatch(/^\/create\?prefill=/);
    const prefill = new URL(callback!, 'http://x').searchParams.get('prefill');
    expect(prefill).toBeTruthy();
    expect(decodePrefill(prefill!)).toEqual({
      url: 'https://x.com',
      intent: 'show pricing',
      duration: 30,
    });
  });
});
