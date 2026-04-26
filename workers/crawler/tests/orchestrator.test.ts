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
});
