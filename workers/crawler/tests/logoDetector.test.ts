import { describe, it, expect } from 'vitest';
import { pickLogoCandidate } from '../src/extractors/logoDetector.js';

describe('pickLogoCandidate', () => {
  it('prefers explicit logo-alt', () => {
    const candidates = [
      { src: '/a.png', alt: 'hero photo', widthPx: 800, source: 'body' as const },
      { src: '/logo.svg', alt: 'ACME logo', widthPx: 120, source: 'img-alt' as const },
    ];
    expect(pickLogoCandidate(candidates)?.src).toBe('/logo.svg');
  });

  it('falls back to header img', () => {
    const candidates = [
      { src: '/banner.png', alt: '', widthPx: 1200, source: 'body' as const },
      { src: '/brand.svg', alt: '', widthPx: 80, source: 'header-img' as const },
    ];
    expect(pickLogoCandidate(candidates)?.src).toBe('/brand.svg');
  });

  it('falls back to favicon', () => {
    const candidates = [{ src: '/favicon.ico', alt: '', widthPx: 32, source: 'favicon' as const }];
    expect(pickLogoCandidate(candidates)?.src).toBe('/favicon.ico');
  });

  it('returns null when no candidates', () => {
    expect(pickLogoCandidate([])).toBeNull();
  });
});
