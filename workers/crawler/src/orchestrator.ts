import { CrawlResultSchema, PartnerLogoSchema, type CrawlResult, type S3Uri, type ExtractedReview, type PartnerLogo } from '@lumespec/schema';
import type { PlaywrightTrackResult } from './tracks/playwrightTrack.js';
import type { ScreenshotOneTrackResult } from './tracks/screenshotOneTrack.js';
import type { CheerioTrackResult } from './tracks/cheerioTrack.js';
import { isGoogleFontSupported } from './extractors/fontDetector.js';
import { isNeutral } from './extractors/colorSampler.js';
import { extractThemeColorFromHtml } from './extractors/themeColorFromHtml.js';
import { extractDominantColorFromImage } from './extractors/colorFromImage.js';
import type { ExtractedLogoCandidate } from './extractors/logoExtractor.js';
import type { ExtractedCodeSnippet } from './extractors/codeExtractor.js';

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
  logoSrcCandidates: ExtractedLogoCandidate[];
  codeSnippets: ExtractedCodeSnippet[];
}

type MutableFallback = { field: string; reason: string; replacedWith: string };

export async function runCrawl(input: CrawlRunnerInput): Promise<CrawlResult> {
  const fallbacks: MutableFallback[] = [];
  const intermediate = await pickTrack(input, fallbacks);

  if (intermediate.sourceTexts.length === 0) {
    throw new Error('tier-C: no source text extracted from any track');
  }

  // Hoist: download the brand logo up-front (used by both the brand-color
  // tier 2 chain below AND the existing logo upload step). Single download.
  // downloadLogo returns Promise<Buffer | null>; null means HTTP succeeded
  // but body was empty. Coerce null → undefined for cleaner downstream
  // checks. Network errors are caught and treated as null (non-fatal — tier 2
  // skips and falls through; logo-upload pushes its own fallback below).
  let logoBuf: Buffer | undefined;
  if (intermediate.logo) {
    try {
      const result = await input.downloadLogo(intermediate.logo.src);
      logoBuf = result ?? undefined;
    } catch {
      logoBuf = undefined;
    }
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

  // Brand color 3-tier fallback chain. Each tier stops the chain on first
  // hit. Per-tier source name is logged at the end for grep-able prod
  // observability — operators can answer "which tier produced this color
  // in prod?" by greping worker stdout for the jobId.
  let primaryColor: string | undefined = intermediate.colors.primary;
  let primarySource: string = primaryColor ? 'dom-sampling' : 'none';
  if (!primaryColor && intermediate.html) {
    const fromMeta = extractThemeColorFromHtml(intermediate.html);
    if (fromMeta) {
      primaryColor = fromMeta;
      primarySource = 'meta-theme-color';
    }
  }
  // Tier 2: runs when (a) no upstream color OR (b) upstream color is neutral.
  // Case (a) — primary signal path → 'logo-pixel-analysis'.
  // Case (b) — Tier 2 may OVERRIDE upstream IF it finds a non-neutral; else keep
  // upstream neutral (YAGNI: don't compare which neutral is "better"; covers
  // Duolingo-class brands whose green lives only in the logo SVG, not in any
  // element backgroundColor that DOM sampling can see).
  const upstreamWasNeutral = primaryColor !== undefined && isNeutral(primaryColor);
  if ((!primaryColor || upstreamWasNeutral) && logoBuf) {
    const fromImg = await extractDominantColorFromImage(logoBuf);
    if (fromImg) {
      if (!primaryColor) {
        primaryColor = fromImg;
        primarySource = 'logo-pixel-analysis';
      } else if (!isNeutral(fromImg)) {
        primaryColor = fromImg;
        primarySource = 'logo-pixel-override';
      }
      // else: tier 2 also neutral → keep upstream (no source change)
    }
  }
  if (!primaryColor) {
    primaryColor = DEFAULT_BRAND_COLOR;
    primarySource = 'default-fallback';
    fallbacks.push({
      field: 'primaryColor',
      reason: 'not detected by any tier (dom / meta / logo)',
      replacedWith: DEFAULT_BRAND_COLOR,
    });
  }
  brand.primaryColor = primaryColor;
  console.log(`[crawler] brand color tier=${primarySource} value=${primaryColor} jobId=${input.jobId}`);

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

  // Logo upload — uses the hoisted logoBuf instead of re-downloading.
  // Preserves the same 2 fallbacks.push semantics as pre-T4: download-failed
  // vs no-candidate are still distinguishable in fallback signal so the
  // storyboard worker's downstream consumers don't miss either signal.
  if (intermediate.logo) {
    if (logoBuf) {
      brand.logoUrl = await input.uploader(logoBuf, 'logo.img');
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

  const logos: PartnerLogo[] = [];
  for (const candidate of intermediate.logoSrcCandidates) {
    if (logos.length >= 12) break;
    const bytes = await input.downloadLogo(candidate.srcUrl);
    if (!bytes) continue;
    const ext = candidate.srcUrl.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'png';
    const s3Uri = await input.uploader(bytes, `logo-partner-${logos.length}.${ext}`);
    // Per-item safe-parse — a single bad logo (e.g. extractor mis-classified
    // a customer-photo section as logo cloud, alt text >100 chars) must NOT
    // cascade into total CrawlResultSchema rejection. logos is .default([])
    // in schema, so silently dropping invalid entries is the correct semantic.
    // Stripe regression 2026-04-28 (job i-GTw9pwtpmUhfXBLPw7e).
    const parsed = PartnerLogoSchema.safeParse({ name: candidate.name, s3Uri });
    if (!parsed.success) {
      console.warn(
        `[crawler] logo dropped (schema fail): ${parsed.error.issues[0]?.message ?? 'unknown'} jobId=${input.jobId} src=${candidate.srcUrl}`,
      );
      continue;
    }
    logos.push(parsed.data);
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
    logos,
    codeSnippets: intermediate.codeSnippets,
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
      logoSrcCandidates: pw.logoSrcCandidates,
      codeSnippets: pw.codeSnippets,
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
        logoSrcCandidates: so.logoSrcCandidates,
        codeSnippets: so.codeSnippets,
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
      // Brand color extraction now happens in runCrawl's tier chain via
      // extractThemeColorFromHtml(intermediate.html) — no per-track work.
      colors: {},
      trackUsed: 'cheerio',
      logoSrcCandidates: ch.logoSrcCandidates,
      codeSnippets: ch.codeSnippets,
    };
  }
  throw new Error(`all tracks failed: pw=${reasonOf(pw)}, so=disabled-or-err, ch=${reasonOf(ch)}`);
}

function reasonOf(r: { kind: string; reason?: string; message?: string }): string {
  if (r.kind === 'blocked') return `blocked:${r.reason}`;
  if (r.kind === 'error') return `error:${r.message}`;
  return r.kind;
}
