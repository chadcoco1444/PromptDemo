/// <reference lib="dom" />
import { chromium, type Browser } from 'playwright';
import { detectWafBlock } from '../wafDetect.js';
import { COOKIE_BANNER_SELECTORS } from '../cookieBanner.js';
import { extractSourceTexts } from '../extractors/textExtractor.js';
import { extractFeatures, type ExtractedFeature } from '../extractors/featureExtractor.js';
import { extractReviews, type ExtractedReview } from '../extractors/reviewExtractor.js';
import { pickPrimaryFontFamily } from '../extractors/fontDetector.js';
import { pickLogoCandidate, type LogoCandidate } from '../extractors/logoDetector.js';
import { pickDominantFromFrequencies, toHex, type DominantColors } from '../extractors/colorSampler.js';
import { normalizeText } from '@lumespec/schema';

export type PlaywrightTrackResult =
  | {
      kind: 'ok';
      html: string;
      sourceTexts: string[];
      features: ExtractedFeature[];
      reviews: ExtractedReview[];
      viewportScreenshot: Buffer;
      fullPageScreenshot: Buffer;
      logoCandidate: LogoCandidate | null;
      colors: DominantColors;
      fontFamily?: string;
    }
  | { kind: 'blocked'; reason: string }
  | { kind: 'error'; message: string };

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    // --disable-dev-shm-usage is critical in Cloud Run / Docker: /dev/shm defaults to 64MB
    // and chromium will crash under load without falling back to /tmp.
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }
  return sharedBrowser;
}

export async function closePlaywrightBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export async function runPlaywrightTrack(input: {
  url: string;
  timeoutMs: number;
}): Promise<PlaywrightTrackResult> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: input.timeoutMs });
    await page.waitForTimeout(800);

    // Cookie banner dismissal
    for (const sel of COOKIE_BANNER_SELECTORS) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.count() && await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(300);
          break;
        }
      } catch {
        // keep trying next
      }
    }

    const html = await page.content();
    const status = resp?.status() ?? 200;
    const waf = detectWafBlock({ status, html });
    if (waf.blocked) {
      return { kind: 'blocked', reason: waf.reason };
    }

    const sourceTexts = extractSourceTexts(html);
    const features = extractFeatures(html);
    const reviews = extractReviews(html);

    const viewportScreenshot = await page.screenshot({ type: 'jpeg', quality: 88, fullPage: false });
    const fullPageScreenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });

    // Font family from body computed style
    const bodyFontStack = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    const fontFamily = pickPrimaryFontFamily(bodyFontStack);

    // Color sampling: collect background-color of key elements
    const colorCounts = new Map<string, number>();
    const selectors = ['button', 'a[href]', 'header', '[class*="cta" i]', '[class*="primary" i]'];
    for (const sel of selectors) {
      const rgbs = await page.$$eval(sel, (els) =>
        els.map((el) => getComputedStyle(el).backgroundColor)
      );
      for (const rgb of rgbs) {
        const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m || !m[1] || !m[2] || !m[3]) continue;
        const hex = toHex(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
        colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
      }
    }
    const colors = pickDominantFromFrequencies(colorCounts);

    // Logo candidates: header imgs, alt-contains-logo, favicon
    const imgs = await page.$$eval('img', (els) =>
      els.map((el) => ({
        src: (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src,
        alt: (el as HTMLImageElement).alt ?? '',
        widthPx: (el as HTMLImageElement).naturalWidth || (el as HTMLImageElement).width || 0,
        inHeader: Boolean(el.closest('header')),
      }))
    );
    const favicon = await page.$eval('link[rel*="icon"]', (el) => (el as HTMLLinkElement).href).catch(() => '');

    const candidates: LogoCandidate[] = [];
    for (const img of imgs) {
      const altNorm = normalizeText(img.alt);
      if (altNorm.includes('logo')) {
        candidates.push({ src: img.src, alt: altNorm, widthPx: img.widthPx, source: 'img-alt' });
      } else if (img.inHeader) {
        candidates.push({ src: img.src, alt: altNorm, widthPx: img.widthPx, source: 'header-img' });
      }
    }
    if (favicon) candidates.push({ src: favicon, alt: '', widthPx: 32, source: 'favicon' });
    const logoCandidate = pickLogoCandidate(candidates);

    const ok: PlaywrightTrackResult = {
      kind: 'ok',
      html,
      sourceTexts,
      features,
      reviews,
      viewportScreenshot,
      fullPageScreenshot,
      logoCandidate,
      colors,
    };
    if (fontFamily) ok.fontFamily = fontFamily;
    return ok;
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  } finally {
    await ctx.close();
  }
}
