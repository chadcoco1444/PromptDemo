import { describe, it, expect } from 'vitest';
import { runPlaywrightTrack } from '../src/tracks/playwrightTrack.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function makeTempHtml(html: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pwtest-'));
  const p = join(dir, 'index.html');
  writeFileSync(p, html, 'utf8');
  return pathToFileURL(p).toString();
}

describe('runPlaywrightTrack', () => {
  it('extracts text, color hint, screenshot buffer for a simple page', async () => {
    const url = makeTempHtml(`
      <html>
        <head>
          <title>Ship AI</title>
          <meta name="description" content="Build and ship">
          <style>
            body{font-family:'Inter',sans-serif;background:#fff;color:#333}
            button{background:#4f46e5;color:#fff;padding:8px 16px}
            header img{width:80px;height:24px}
          </style>
        </head>
        <body>
          <header><img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" alt="Acme logo"></header>
          <h1>Automate Your Stack</h1>
          <section><h2>Fast sync</h2><p>Connect sources</p></section>
          <button>Sign up</button>
        </body>
      </html>
    `);

    const result = await runPlaywrightTrack({ url, timeoutMs: 10_000 });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.sourceTexts).toContain('ship ai');
    expect(result.sourceTexts).toContain('automate your stack');
    expect(result.viewportScreenshot).toBeInstanceOf(Buffer);
    expect(result.fullPageScreenshot).toBeInstanceOf(Buffer);
    expect(result.logoCandidate?.alt).toBe('acme logo');
    expect(result.fontFamily).toBe('Inter');
  }, 30_000);

  it('returns blocked result on cloudflare challenge page', async () => {
    const url = makeTempHtml(`
      <html><head><title>Just a moment...</title></head><body></body></html>
    `);
    const result = await runPlaywrightTrack({ url, timeoutMs: 10_000 });
    expect(result.kind).toBe('blocked');
  }, 30_000);

  it('US-pinned context yields navigator.language === en-US and timezone === America/New_York (smoke against real chromium)', async () => {
    const { chromium } = await import('playwright');
    const { getUSPinnedContextOptions } = await import('../src/regionContext.js');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const ctx = await browser.newContext(getUSPinnedContextOptions());
      const page = await ctx.newPage();
      await page.goto('about:blank');
      const lang = await page.evaluate(() => navigator.language);
      const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
      expect(lang).toBe('en-US');
      expect(tz).toBe('America/New_York');
    } finally {
      await browser.close();
    }
  }, 30_000);
});
