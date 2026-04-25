import { load } from 'cheerio';
import { detectWafBlock } from '../wafDetect.js';
import { extractSourceTexts } from '../extractors/textExtractor.js';
import { extractFeatures, type ExtractedFeature } from '../extractors/featureExtractor.js';

export type CheerioTrackResult =
  | {
      kind: 'ok';
      html: string;
      sourceTexts: string[];
      features: ExtractedFeature[];
      colors: { primary?: string };
      ogImageUrl?: string;
      faviconUrl?: string;
    }
  | { kind: 'blocked'; reason: string }
  | { kind: 'error'; message: string };

export interface HttpFetcher {
  (url: string): Promise<{ status: number; html: string }>;
}

export const defaultFetcher: HttpFetcher = async (url) => {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; LumeSpecBot/0.1; +https://github.com/chadcoco1444/LumeSpec)',
      accept: 'text/html,*/*;q=0.8',
    },
  });
  const html = await res.text();
  return { status: res.status, html };
};

export async function runCheerioTrack(input: {
  url: string;
  fetcher?: HttpFetcher;
}): Promise<CheerioTrackResult> {
  const fetcher = input.fetcher ?? defaultFetcher;
  try {
    const { status, html } = await fetcher(input.url);
    const waf = detectWafBlock({ status, html });
    if (waf.blocked) return { kind: 'blocked', reason: waf.reason };

    const $ = load(html);
    const themeColor = $('meta[name="theme-color"]').attr('content');
    const primary = themeColor && /^#[0-9a-f]{6}$/i.test(themeColor) ? themeColor : undefined;

    const result: CheerioTrackResult = {
      kind: 'ok',
      html,
      sourceTexts: extractSourceTexts(html),
      features: extractFeatures(html),
      colors: primary ? { primary } : {},
    };
    const ogImg = $('meta[property="og:image"]').attr('content');
    if (ogImg) result.ogImageUrl = ogImg;
    const favicon = $('link[rel*="icon"]').attr('href');
    if (favicon) result.faviconUrl = favicon;
    return result;
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }
}
