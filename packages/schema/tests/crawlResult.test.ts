import { describe, it, expect } from 'vitest';
import { CrawlResultSchema } from '../src/crawlResult.js';

const baseValid = {
  url: 'https://example.com',
  fetchedAt: 1_700_000_000_000,
  screenshots: {},
  brand: {},
  sourceTexts: ['hello world'],
  features: [],
  fallbacks: [],
  tier: 'B' as const,
  trackUsed: 'playwright' as const,
};

describe('CrawlResultSchema', () => {
  it('accepts a minimal Tier-B result', () => {
    const parsed = CrawlResultSchema.parse(baseValid);
    expect(parsed.tier).toBe('B');
  });

  it('accepts optional screenshots as s3 URIs', () => {
    const parsed = CrawlResultSchema.parse({
      ...baseValid,
      screenshots: {
        viewport: 's3://bucket/viewport.jpg',
        fullPage: 's3://bucket/full.jpg',
      },
    });
    expect(parsed.screenshots.viewport).toBe('s3://bucket/viewport.jpg');
  });

  it('rejects non-s3 screenshot URLs', () => {
    expect(() =>
      CrawlResultSchema.parse({
        ...baseValid,
        screenshots: { viewport: 'https://x/y.jpg' },
      })
    ).toThrow();
  });

  it('rejects unknown tier values', () => {
    expect(() => CrawlResultSchema.parse({ ...baseValid, tier: 'D' })).toThrow();
  });

  it('rejects unknown trackUsed values', () => {
    expect(() => CrawlResultSchema.parse({ ...baseValid, trackUsed: 'selenium' })).toThrow();
  });

  it('rejects non-hex primaryColor', () => {
    expect(() =>
      CrawlResultSchema.parse({
        ...baseValid,
        brand: { primaryColor: 'not-a-color' },
      })
    ).toThrow();
  });

  it('accepts valid 7-char hex color', () => {
    const parsed = CrawlResultSchema.parse({
      ...baseValid,
      brand: { primaryColor: '#1a2b3c' },
    });
    expect(parsed.brand.primaryColor).toBe('#1a2b3c');
  });

  it('requires sourceTexts to be non-empty array of strings', () => {
    expect(() => CrawlResultSchema.parse({ ...baseValid, sourceTexts: [] })).toThrow();
  });

  it('limits sourceTexts entries to 200 chars', () => {
    const long = 'x'.repeat(201);
    expect(() => CrawlResultSchema.parse({ ...baseValid, sourceTexts: [long] })).toThrow();
  });
});
