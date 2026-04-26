import { CrawlResultSchema, type CrawlResult, type S3Uri, type ExtractedReview } from '@lumespec/schema';
import type { PlaywrightTrackResult } from './tracks/playwrightTrack.js';
import type { ScreenshotOneTrackResult } from './tracks/screenshotOneTrack.js';
import type { CheerioTrackResult } from './tracks/cheerioTrack.js';
import { isGoogleFontSupported } from './extractors/fontDetector.js';

const DEFAULT_BRAND_COLOR = '#1a1a1a';

export interface CrawlRunnerInput {
  url: string;
  jobId: string;
  rescueEnabled: boolean;
  runPlaywright: (url: string) => Promise<PlaywrightTrackResult>;
  runScreenshotOne: (url: string) => Promise<ScreenshotOneTrackResult>;
  runCheerio: (url: string) => Promise<CheerioTrackResult>;
  uploader: (buf: Buffer, filename: string) => Promise<S3Uri>;
  downloadLogo: (src: string) => Promise<Buffer | null>;
}

interface IntermediateState {
  html: string;
  sourceTexts: string[];
  features: Array<{ title: string; description?: string; iconHint?: string }>;
  reviews: ExtractedReview[];
  viewportBuf?: Buffer;
  fullPageBuf?: Buffer;
  colors: { primary?: string; secondary?: string };
  fontFamily?: string;
  logo?: { src: string; alt?: string };
  trackUsed: 'playwright' | 'screenshot-saas' | 'cheerio';
}

type MutableFallback = { field: string; reason: string; replacedWith: string };

export async function runCrawl(input: CrawlRunnerInput): Promise<CrawlResult> {
  const fallbacks: MutableFallback[] = [];
  const intermediate = await pickTrack(input, fallbacks);

  if (intermediate.sourceTexts.length === 0) {
    throw new Error('tier-C: no source text extracted from any track');
  }

  const screenshots: { viewport?: S3Uri; fullPage?: S3Uri } = {};
  if (intermediate.viewportBuf) {
    screenshots.viewport = await input.uploader(intermediate.viewportBuf, 'viewport.jpg');
  }
  if (intermediate.fullPageBuf) {
    screenshots.fullPage = await input.uploader(intermediate.fullPageBuf, 'fullpage.jpg');
  }
  if (!screenshots.viewport && !screenshots.fullPage) {
    fallbacks.push({
      field: 'screenshots',
      reason: 'not available from track',
      replacedWith: 'RealShot scenes downgrade to Stylized',
    });
  }

  const brand: {
    primaryColor?: string;
    secondaryColor?: string;
    logoUrl?: S3Uri;
    fontFamily?: string;
    fontFamilySupported?: boolean;
  } = {};
  if (intermediate.colors.primary) {
    brand.primaryColor = intermediate.colors.primary;
  } else {
    brand.primaryColor = DEFAULT_BRAND_COLOR;
    fallbacks.push({
      field: 'primaryColor',
      reason: 'not detected',
      replacedWith: DEFAULT_BRAND_COLOR,
    });
  }
  if (intermediate.colors.secondary) brand.secondaryColor = intermediate.colors.secondary;
  if (intermediate.fontFamily) {
    brand.fontFamily = intermediate.fontFamily;
    brand.fontFamilySupported = isGoogleFontSupported(intermediate.fontFamily);
    if (!brand.fontFamilySupported) {
      fallbacks.push({
        field: 'fontFamily',
        reason: `${intermediate.fontFamily} not in @remotion/google-fonts whitelist`,
        replacedWith: 'Inter (default)',
      });
    }
  } else {
    fallbacks.push({ field: 'fontFamily', reason: 'not detected', replacedWith: 'Inter (default)' });
  }
  if (intermediate.logo) {
    const bytes = await input.downloadLogo(intermediate.logo.src);
    if (bytes) {
      brand.logoUrl = await input.uploader(bytes, 'logo.img');
    } else {
      fallbacks.push({
        field: 'logoUrl',
        reason: 'download failed or empty',
        replacedWith: 'domain-initial generated logo at render time',
      });
    }
  } else {
    fallbacks.push({
      field: 'logoUrl',
      reason: 'no logo candidate found',
      replacedWith: 'domain-initial generated logo at render time',
    });
  }

  const tier: CrawlResult['tier'] = fallbacks.length === 0 ? 'A' : 'B';

  const raw = {
    url: input.url,
    fetchedAt: Date.now(),
    screenshots,
    brand,
    sourceTexts: intermediate.sourceTexts,
    features: intermediate.features,
    reviews: intermediate.reviews,
    fallbacks,
    tier,
    trackUsed: intermediate.trackUsed,
  };

  return CrawlResultSchema.parse(raw);
}

async function pickTrack(
  input: CrawlRunnerInput,
  fallbacks: MutableFallback[]
): Promise<IntermediateState> {
  const pw = await input.runPlaywright(input.url);
  if (pw.kind === 'ok') {
    const s: IntermediateState = {
      html: pw.html,
      sourceTexts: pw.sourceTexts,
      features: pw.features,
      reviews: pw.reviews,
      viewportBuf: pw.viewportScreenshot,
      fullPageBuf: pw.fullPageScreenshot,
      colors: pw.colors,
      trackUsed: 'playwright',
    };
    if (pw.fontFamily) s.fontFamily = pw.fontFamily;
    if (pw.logoCandidate) s.logo = { src: pw.logoCandidate.src, alt: pw.logoCandidate.alt };
    return s;
  }
  fallbacks.push({ field: 'track:playwright', reason: reasonOf(pw), replacedWith: 'trying next track' });

  if (input.rescueEnabled) {
    const so = await input.runScreenshotOne(input.url);
    if (so.kind === 'ok') {
      return {
        html: so.html,
        sourceTexts: so.sourceTexts,
        features: so.features,
        reviews: so.reviews,
        viewportBuf: so.viewportScreenshot,
        fullPageBuf: so.fullPageScreenshot,
        colors: {},
        trackUsed: 'screenshot-saas',
      };
    }
    fallbacks.push({
      field: 'track:screenshot-saas',
      reason: reasonOf(so),
      replacedWith: 'trying next track',
    });
  } else {
    fallbacks.push({
      field: 'track:screenshot-saas',
      reason: 'rescue disabled',
      replacedWith: 'skipped',
    });
  }

  const ch = await input.runCheerio(input.url);
  if (ch.kind === 'ok') {
    return {
      html: ch.html,
      sourceTexts: ch.sourceTexts,
      features: ch.features,
      reviews: ch.reviews,
      colors: ch.colors,
      trackUsed: 'cheerio',
    };
  }
  throw new Error(`all tracks failed: pw=${reasonOf(pw)}, so=disabled-or-err, ch=${reasonOf(ch)}`);
}

function reasonOf(r: { kind: string; reason?: string; message?: string }): string {
  if (r.kind === 'blocked') return `blocked:${r.reason}`;
  if (r.kind === 'error') return `error:${r.message}`;
  return r.kind;
}
