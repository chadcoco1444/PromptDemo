import type { BrowserContextOptions } from 'playwright';

/**
 * US-pinned BrowserContext options. Forces Playwright to look "American" to
 * websites that route by browser language / timezone / geolocation —
 * eliminates the gateway-page trap on global ecommerce (Patagonia, Nike,
 * Adidas, Apple Store, IKEA, etc.) where non-US visitors get a regional
 * splash with no real content.
 *
 * Combines two layers:
 *   L1 — BrowserContext params (locale, timezoneId, geolocation,
 *        permissions) for client-side detection (navigator.language,
 *        Intl.DateTimeFormat, geolocation API)
 *   L2 — extraHTTPHeaders.Accept-Language for server-side detection
 *        (CDN edge workers, request-header geo-routing)
 *
 * Future expansion: rename to getRegionPinnedContextOptions(region) when we
 * need to crawl non-US versions of sites — pure rename + add arg, no refactor.
 *
 * Viewport is included so callers don't need to merge — pass the returned
 * object directly to browser.newContext().
 */
export function getUSPinnedContextOptions(): BrowserContextOptions {
  return {
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 40.7128, longitude: -74.006 },
    permissions: ['geolocation'],
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  };
}
