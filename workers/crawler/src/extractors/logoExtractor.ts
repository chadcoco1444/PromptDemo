import { load, type CheerioAPI } from 'cheerio';

export interface ExtractedLogoCandidate {
  name: string;
  srcUrl: string;
}

const CLASS_SIGNALS = [
  '[class*="trusted" i]',
  '[class*="partner" i]',
  '[class*="integration" i]',
  '[class*="logo-cloud" i]',
  '[class*="clients" i]',
  '[class*="sponsor" i]',
  '[class*="customer" i]',
].join(', ');

const HEADING_KEYWORDS = [
  'trusted by',
  'works with',
  'integrates with',
  'partners',
  'customers',
  'used by',
  'powered by',
];

const MAX_LOGOS = 12;

function resolveUrl(src: string, baseUrl: string): string | null {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

function nameFromSrc(src: string): string {
  try {
    const path = new URL(src).pathname;
    const base = (path.split('/').pop() ?? '').replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
    return base || 'logo';
  } catch {
    return 'logo';
  }
}

/** AnyNode extracted from cheerio's load() parameter signature without a direct domhandler import. */
type CheerioAnyNode = Exclude<Parameters<typeof load>[0], string | Buffer | null | undefined>;
type CheerioNode = CheerioAnyNode extends (infer E)[] ? E : CheerioAnyNode;

function collectImgs(
  $: CheerioAPI,
  containerEl: CheerioNode,
  baseUrl: string,
  seen: Set<string>,
  out: ExtractedLogoCandidate[]
): void {
  $(containerEl).find('img').each((_i, img) => {
    if (out.length >= MAX_LOGOS) return;
    const rawSrc = $(img).attr('src')?.trim() ?? '';
    if (!rawSrc) return;
    const srcUrl = resolveUrl(rawSrc, baseUrl);
    if (!srcUrl) return;
    // PartnerLogoSchema enforces name.max(100). Discard alt that exceeds
    // the limit (typically a11y descriptions in customer-stories sections that
    // got mis-classified as logo cloud — Stripe regression 2026-04-28). Falls
    // through to nameFromSrc, which derives a short name from the filename.
    const altRaw = $(img).attr('alt')?.trim() ?? '';
    const alt = altRaw.length <= 100 ? altRaw : '';
    const name = alt || nameFromSrc(srcUrl);
    const nameKey = name.toLowerCase();
    if (seen.has(srcUrl) || seen.has(nameKey)) return;
    seen.add(srcUrl);
    seen.add(nameKey);
    out.push({ name, srcUrl });
  });
}

export function extractLogos(html: string, baseUrl: string): ExtractedLogoCandidate[] {
  const $ = load(html);
  const seen = new Set<string>();
  const out: ExtractedLogoCandidate[] = [];

  // Tier 1: class signals (high precision)
  $(CLASS_SIGNALS).each((_i, el) => {
    if (out.length >= MAX_LOGOS) return;
    collectImgs($, el, baseUrl, seen, out);
  });

  if (out.length >= MAX_LOGOS) return out;

  // Tier 2: heading proximity (wider recall)
  $('section, div').each((_i, el) => {
    if (out.length >= MAX_LOGOS) return;
    const headingText = $(el).children('h2, h3').first().text().toLowerCase().trim();
    if (HEADING_KEYWORDS.some((kw) => headingText.includes(kw))) {
      collectImgs($, el, baseUrl, seen, out);
    }
  });

  return out;
}
