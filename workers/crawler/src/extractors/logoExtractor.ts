import { load, type CheerioAPI, type AnyNode } from 'cheerio';

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

function collectImgs(
  $: CheerioAPI,
  containerEl: AnyNode,
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
    const alt = $(img).attr('alt')?.trim() ?? '';
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
