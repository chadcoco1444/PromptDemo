import { describe, it, expect } from 'vitest';
import { COOKIE_BANNER_SELECTORS, matchBannerSelector } from '../src/cookieBanner.js';

describe('cookieBanner selectors', () => {
  it('includes OneTrust accept button selector', () => {
    expect(COOKIE_BANNER_SELECTORS.some((s) => s.includes('onetrust'))).toBe(true);
  });

  it('includes Cookiebot selector', () => {
    expect(COOKIE_BANNER_SELECTORS.some((s) => s.toLowerCase().includes('cookiebot'))).toBe(true);
  });

  it('matchBannerSelector returns first matching selector', () => {
    const matcher = (sel: string) => sel === '#onetrust-accept-btn-handler';
    expect(matchBannerSelector(matcher)).toBe('#onetrust-accept-btn-handler');
  });

  it('matchBannerSelector returns null when none match', () => {
    expect(matchBannerSelector(() => false)).toBeNull();
  });
});
