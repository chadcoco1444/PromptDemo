import { describe, it, expect } from 'vitest';
import { runCrawl } from '../src/orchestrator.js';
import { toS3Uri, type S3Uri } from '@lumespec/schema';
import type { PlaywrightTrackResult } from '../src/tracks/playwrightTrack.js';
import type { ScreenshotOneTrackResult } from '../src/tracks/screenshotOneTrack.js';
import type { CheerioTrackResult } from '../src/tracks/cheerioTrack.js';

function fakeUploader() {
  const store: string[] = [];
  return {
    async upload(buf: Buffer, filename: string): Promise<S3Uri> {
      store.push(filename);
      return toS3Uri('fake', `jobs/j/${filename}`);
    },
    store,
  };
}

describe('runCrawl', () => {
  it('uses playwright ok result → tier A when all fields populated', async () => {
    const pw: PlaywrightTrackResult = {
      kind: 'ok',
      html: '<html></html>',
      sourceTexts: ['hello world'],
      features: [{ title: 'f' }],
      reviews: [],
      logoSrcCandidates: [],
      codeSnippets: [],
      viewportScreenshot: Buffer.from([1]),
      fullPageScreenshot: Buffer.from([2]),
      logoCandidate: { src: 'https://x/logo.svg', alt: 'acme logo', widthPx: 120, source: 'img-alt' },
      colors: { primary: '#4f46e5', secondary: '#a78bfa' },
      fontFamily: 'Inter',
    };
    const up = fakeUploader();
    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: true,
      runPlaywright: async () => pw,
      runScreenshotOne: async () => ({ kind: 'error', message: 'unused' }) as ScreenshotOneTrackResult,
      runCheerio: async () => ({ kind: 'error', message: 'unused' }) as CheerioTrackResult,
      uploader: up.upload,
      downloadLogo: async () => Buffer.from([9]),
    });
    expect(result.tier).toBe('A');
    expect(result.trackUsed).toBe('playwright');
    expect(result.brand.primaryColor).toBe('#4f46e5');
    expect(result.brand.logoUrl).toMatch(/^s3:\/\//);
  });

  it('falls through playwright blocked → screenshotone ok → tier B with substitutions', async () => {
    const up = fakeUploader();
    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: true,
      runPlaywright: async () => ({ kind: 'blocked', reason: 'http-403' }),
      runScreenshotOne: async () => ({
        kind: 'ok',
        html: '<title>Hi</title><body><h1>Hello</h1></body>',
        sourceTexts: ['hi', 'hello'],
        features: [],
        reviews: [],
        logoSrcCandidates: [],
        codeSnippets: [],
        viewportScreenshot: Buffer.from([1]),
        fullPageScreenshot: Buffer.from([2]),
      }),
      runCheerio: async () => ({ kind: 'error', message: 'unused' }),
      uploader: up.upload,
      downloadLogo: async () => null,
    });
    expect(result.trackUsed).toBe('screenshot-saas');
    expect(result.tier).toBe('B');
    expect(result.brand.primaryColor).toBe('#1a1a1a'); // substituted
    expect(result.fallbacks.find((f) => f.field === 'primaryColor')).toBeDefined();
  });

  it('falls through playwright blocked → screenshotone disabled → cheerio ok → tier B (no screenshots)', async () => {
    const up = fakeUploader();
    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: false,
      runPlaywright: async () => ({ kind: 'blocked', reason: 'http-429' }),
      runScreenshotOne: async () => ({ kind: 'error', message: 'disabled' }),
      runCheerio: async () => ({
        kind: 'ok',
        html: '<title>Docs</title><body><h1>Quick</h1></body>',
        sourceTexts: ['docs', 'quick'],
        features: [],
        reviews: [],
        logoSrcCandidates: [],
        codeSnippets: [],
        colors: {},
      }),
      uploader: up.upload,
      downloadLogo: async () => null,
    });
    expect(result.trackUsed).toBe('cheerio');
    expect(result.screenshots.viewport).toBeUndefined();
    expect(result.fallbacks.find((f) => f.field === 'screenshots')).toBeDefined();
  });

  it('throws when all three tracks fail', async () => {
    await expect(
      runCrawl({
        url: 'https://x.com',
        jobId: 'j',
        rescueEnabled: true,
        runPlaywright: async () => ({ kind: 'error', message: 'pw' }),
        runScreenshotOne: async () => ({ kind: 'error', message: 'so' }),
        runCheerio: async () => ({ kind: 'error', message: 'ch' }),
        uploader: fakeUploader().upload,
        downloadLogo: async () => null,
      })
    ).rejects.toThrow(/all tracks failed/i);
  });

  it('throws when sourceTexts empty (tier-C in spec, MVP fails)', async () => {
    await expect(
      runCrawl({
        url: 'https://x.com',
        jobId: 'j',
        rescueEnabled: true,
        runPlaywright: async () => ({ kind: 'error', message: 'x' }),
        runScreenshotOne: async () => ({ kind: 'error', message: 'x' }),
        runCheerio: async () => ({ kind: 'ok', html: '', sourceTexts: [], features: [], reviews: [], logoSrcCandidates: [], codeSnippets: [], colors: {} }),
        uploader: fakeUploader().upload,
        downloadLogo: async () => null,
      })
    ).rejects.toThrow(/tier.?c/i);
  });

  it('downloads partner logos and stores them as s3 URIs', async () => {
    const uploadedFilenames: string[] = [];
    const uploader = async (buf: Buffer, filename: string): Promise<S3Uri> => {
      uploadedFilenames.push(filename);
      return toS3Uri('fake', `jobs/j/${filename}`);
    };

    const pw: PlaywrightTrackResult = {
      kind: 'ok',
      html: '<html></html>',
      sourceTexts: ['hello world'],
      features: [],
      reviews: [],
      viewportScreenshot: Buffer.from([1]),
      fullPageScreenshot: Buffer.from([2]),
      logoCandidate: null,
      colors: {},
      logoSrcCandidates: [{ name: 'Stripe', srcUrl: 'https://cdn.stripe.com/logo.svg' }],
      codeSnippets: [],
    };

    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: true,
      runPlaywright: async () => pw,
      runScreenshotOne: async () => ({ kind: 'error', message: 'unused' }) as ScreenshotOneTrackResult,
      runCheerio: async () => ({ kind: 'error', message: 'unused' }) as CheerioTrackResult,
      uploader,
      downloadLogo: async () => Buffer.from([42]),
    });

    expect(result.logos).toHaveLength(1);
    expect(result.logos[0]!.name).toBe('Stripe');
    expect(result.logos[0]!.s3Uri).toMatch(/^s3:\/\//);
    expect(uploadedFilenames).toContain('logo-partner-0.svg');
  });

  // Regression: 2026-04-28 stripe.com job i-GTw9pwtpmUhfXBLPw7e — Stripe's
  // customer-stories section had 4 imgs with descriptive alt text >100 chars,
  // which propagated through extractLogos → orchestrator → CrawlResultSchema
  // .parse() and rejected the ENTIRE crawl with 4 too_big errors. Architectural
  // fix: orchestrator validates each logo per PartnerLogoSchema before pushing,
  // silently drops invalid ones (graceful — partial-failure should NOT cascade
  // to total-failure when the field is .default([]) anyway).
  it('drops logos that fail PartnerLogoSchema validation (does not crash whole crawl)', async () => {
    const longName =
      'Aerial view of a street intersection where the crosswalks form a slanted parallelogram, imitating the Stripe logo.';
    expect(longName.length).toBeGreaterThan(100);

    const pw: PlaywrightTrackResult = {
      kind: 'ok',
      html: '<html></html>',
      sourceTexts: ['hello world'],
      features: [],
      reviews: [],
      viewportScreenshot: Buffer.from([1]),
      fullPageScreenshot: Buffer.from([2]),
      logoCandidate: null,
      colors: {},
      logoSrcCandidates: [
        { name: longName, srcUrl: 'https://example.com/photo1.jpg' },
        { name: longName + ' B', srcUrl: 'https://example.com/photo2.jpg' },
        { name: longName + ' C', srcUrl: 'https://example.com/photo3.jpg' },
        { name: longName + ' D', srcUrl: 'https://example.com/photo4.jpg' },
      ],
      codeSnippets: [],
    };

    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: true,
      runPlaywright: async () => pw,
      runScreenshotOne: async () => ({ kind: 'error', message: 'unused' }) as ScreenshotOneTrackResult,
      runCheerio: async () => ({ kind: 'error', message: 'unused' }) as CheerioTrackResult,
      uploader: async (_buf, filename) => toS3Uri('fake', `jobs/j/${filename}`),
      downloadLogo: async () => Buffer.from([42]),
    });

    expect(result.logos).toEqual([]);
    expect(result.sourceTexts).toEqual(['hello world']); // other crawl data intact
  });

  it('keeps valid logos and drops invalid ones (mixed batch)', async () => {
    const longName = 'x'.repeat(150);
    const pw: PlaywrightTrackResult = {
      kind: 'ok',
      html: '<html></html>',
      sourceTexts: ['hello world'],
      features: [],
      reviews: [],
      viewportScreenshot: Buffer.from([1]),
      fullPageScreenshot: Buffer.from([2]),
      logoCandidate: null,
      colors: {},
      logoSrcCandidates: [
        { name: 'GoodOne', srcUrl: 'https://example.com/good1.svg' },
        { name: longName, srcUrl: 'https://example.com/bad1.jpg' },
        { name: 'GoodTwo', srcUrl: 'https://example.com/good2.svg' },
      ],
      codeSnippets: [],
    };

    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: true,
      runPlaywright: async () => pw,
      runScreenshotOne: async () => ({ kind: 'error', message: 'unused' }) as ScreenshotOneTrackResult,
      runCheerio: async () => ({ kind: 'error', message: 'unused' }) as CheerioTrackResult,
      uploader: async (_buf, filename) => toS3Uri('fake', `jobs/j/${filename}`),
      downloadLogo: async () => Buffer.from([42]),
    });

    expect(result.logos).toHaveLength(2);
    expect(result.logos.map((l) => l.name)).toEqual(['GoodOne', 'GoodTwo']);
  });

  describe('brand color tier chain', () => {
    function makeOpts(overrides: {
      domColor?: string;
      html?: string;
      logoBuf?: Buffer;
    } = {}) {
      const pw: PlaywrightTrackResult = {
        kind: 'ok',
        html: overrides.html ?? '<html></html>',
        sourceTexts: ['hello'],
        features: [],
        reviews: [],
        viewportScreenshot: Buffer.from('viewport'),
        fullPageScreenshot: Buffer.from('full'),
        logoSrcCandidates: [],
        codeSnippets: [],
        colors: overrides.domColor ? { primary: overrides.domColor } : {},
        logoCandidate: overrides.logoBuf
          ? { src: 'https://example.com/logo.png', alt: 'logo', widthPx: 100, source: 'img-alt' }
          : null,
      };
      const up = fakeUploader();
      return {
        url: 'https://example.com',
        jobId: 'tier-test',
        rescueEnabled: false,
        runPlaywright: async () => pw,
        runScreenshotOne: async () => ({ kind: 'error' as const, message: 'unused' }) as ScreenshotOneTrackResult,
        runCheerio: async () => ({ kind: 'error' as const, message: 'unused' }) as CheerioTrackResult,
        downloadLogo: async () => overrides.logoBuf ?? null,
        uploader: up.upload,
      };
    }

    it('tier 0 wins when DOM sampler returns a color', async () => {
      const result = await runCrawl(makeOpts({ domColor: '#58cc02' }));
      expect(result.brand.primaryColor).toBe('#58cc02');
    });

    it('tier 1 wins when DOM is empty and HTML has meta theme-color', async () => {
      const html = '<html><head><meta name="theme-color" content="#abcdef"></head></html>';
      const result = await runCrawl(makeOpts({ html }));
      expect(result.brand.primaryColor).toBe('#abcdef');
    });

    it('tier 2 wins when DOM and meta are empty but logo provides a color', async () => {
      const sharp = (await import('sharp')).default;
      const logoBuf = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 88, g: 204, b: 2 } },
      }).png().toBuffer();
      const result = await runCrawl(makeOpts({ html: '<html></html>', logoBuf }));
      expect(result.brand.primaryColor).toBeDefined();
      // Sharp returns ~#58cc02 within ±8 per channel on synthesized PNGs
      const r = parseInt(result.brand.primaryColor!.slice(1, 3), 16);
      const g = parseInt(result.brand.primaryColor!.slice(3, 5), 16);
      const b = parseInt(result.brand.primaryColor!.slice(5, 7), 16);
      expect(Math.abs(r - 88)).toBeLessThanOrEqual(8);
      expect(Math.abs(g - 204)).toBeLessThanOrEqual(8);
      expect(Math.abs(b - 2)).toBeLessThanOrEqual(8);
    });

    it('tier 3 (default) wins when all upstream tiers return nothing', async () => {
      const result = await runCrawl(makeOpts({ html: '<html></html>' }));
      expect(result.brand.primaryColor).toBe('#1a1a1a'); // DEFAULT_BRAND_COLOR
      expect(result.fallbacks.some((f) => f.field === 'primaryColor')).toBe(true);
    });

    it('vercel-style minimalist brand returns neutral via tier 0 (regression for soft-neutral)', async () => {
      const result = await runCrawl(makeOpts({ domColor: '#000000' }));
      expect(result.brand.primaryColor).toBe('#000000');
      expect(result.brand.primaryColor).not.toBe('#1a1a1a');
    });

    it('tier 2 OVERRIDES when DOM returns neutral and logo has non-neutral (logo-pixel-override)', async () => {
      // Duolingo case: DOM sampling returns black (gradient CTAs return rgba(0,0,0,0)
      // so soft-neutral preference picks up neutral header/nav). Logo SVG is green.
      // Override should kick in: tier 2 wins, source = logo-pixel-override.
      const sharp = (await import('sharp')).default;
      const greenLogo = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 88, g: 204, b: 2 } },
      }).png().toBuffer();
      const result = await runCrawl(makeOpts({ domColor: '#000000', logoBuf: greenLogo }));
      expect(result.brand.primaryColor).toBeDefined();
      // Sharp returns ~#58cc02 within ±8; should NOT be the input #000000
      expect(result.brand.primaryColor).not.toBe('#000000');
      const r = parseInt(result.brand.primaryColor!.slice(1, 3), 16);
      const g = parseInt(result.brand.primaryColor!.slice(3, 5), 16);
      expect(g).toBeGreaterThan(r); // green > red dominant
    });

    it('tier 2 escalation keeps upstream neutral when logo is also neutral (YAGNI guard for black-logo brands)', async () => {
      // Vercel-equivalent extreme case: DOM returned black, logo is also black.
      // No non-neutral signal anywhere — keep the upstream neutral, do NOT
      // override with tier 2's neutral (no value in swapping one neutral for another).
      const sharp = (await import('sharp')).default;
      const blackLogo = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } },
      }).png().toBuffer();
      const result = await runCrawl(makeOpts({ domColor: '#171717', logoBuf: blackLogo }));
      expect(result.brand.primaryColor).toBe('#171717'); // upstream preserved
    });
  });
});
