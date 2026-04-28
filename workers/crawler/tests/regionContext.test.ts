import { describe, it, expect } from 'vitest';
import { getUSPinnedContextOptions } from '../src/regionContext.js';

describe('getUSPinnedContextOptions', () => {
  it('returns L1 context params: locale, timezoneId, geolocation, permissions', () => {
    const opts = getUSPinnedContextOptions();
    expect(opts).toMatchObject({
      locale: 'en-US',
      timezoneId: 'America/New_York',
      geolocation: { latitude: 40.7128, longitude: -74.006 },
      permissions: ['geolocation'],
    });
  });

  it('returns L2 HTTP header: Accept-Language en-US', () => {
    const opts = getUSPinnedContextOptions();
    expect(opts.extraHTTPHeaders).toEqual({
      'Accept-Language': 'en-US,en;q=0.9',
    });
  });

  it('preserves the existing 1280x800 viewport (regression guard against accidentally dropping the original config)', () => {
    const opts = getUSPinnedContextOptions();
    expect(opts.viewport).toEqual({ width: 1280, height: 800 });
  });
});
