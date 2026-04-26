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

  it('defaults reviews to empty array when omitted', () => {
    const parsed = CrawlResultSchema.parse(baseValid);
    expect(parsed.reviews).toEqual([]);
  });

  it('accepts valid reviews array', () => {
    const parsed = CrawlResultSchema.parse({
      ...baseValid,
      reviews: [
        { text: 'This product is amazing and saves us hours every week.', author: 'Jane Doe', role: 'CTO' },
        { text: 'Best tool we have ever used in the company workflow.' },
      ],
    });
    expect(parsed.reviews).toHaveLength(2);
    expect(parsed.reviews[0]!.author).toBe('Jane Doe');
    expect(parsed.reviews[1]!.author).toBeUndefined();
  });

  it('rejects reviews with text shorter than 10 chars', () => {
    expect(() =>
      CrawlResultSchema.parse({
        ...baseValid,
        reviews: [{ text: 'Short' }],
      })
    ).toThrow();
  });

  it('rejects reviews array exceeding 10 items', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ text: `Review ${i} is long enough to be valid.` }));
    expect(() => CrawlResultSchema.parse({ ...baseValid, reviews: many })).toThrow();
  });
});
