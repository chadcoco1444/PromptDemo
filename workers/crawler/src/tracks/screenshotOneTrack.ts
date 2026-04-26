import { extractSourceTexts } from '../extractors/textExtractor.js';
import { extractFeatures, type ExtractedFeature } from '../extractors/featureExtractor.js';
import { extractReviews, type ExtractedReview } from '../extractors/reviewExtractor.js';

export type ScreenshotOneTrackResult =
  | {
      kind: 'ok';
      html: string;
      sourceTexts: string[];
      features: ExtractedFeature[];
      reviews: ExtractedReview[];
      viewportScreenshot: Buffer;
      fullPageScreenshot: Buffer;
    }
  | { kind: 'error'; message: string };

export interface ScreenshotOneAdapter {
  fetchScreenshot(params: { url: string; accessKey: string; fullPage: boolean }): Promise<Buffer>;
  fetchHtml(params: { url: string; accessKey: string }): Promise<string>;
}

export const defaultScreenshotOneAdapter: ScreenshotOneAdapter = {
  async fetchScreenshot({ url, accessKey, fullPage }) {
    const params = new URLSearchParams({
      access_key: accessKey,
      url,
      format: 'jpg',
      image_quality: '85',
      viewport_width: '1280',
      viewport_height: '800',
      full_page: fullPage ? 'true' : 'false',
      block_ads: 'true',
      block_cookie_banners: 'true',
    });
    const res = await fetch(`https://api.screenshotone.com/take?${params}`);
    if (!res.ok) throw new Error(`screenshotone ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
  async fetchHtml({ url, accessKey }) {
    const params = new URLSearchParams({ access_key: accessKey, url });
    const res = await fetch(`https://api.screenshotone.com/dom?${params}`);
    if (!res.ok) throw new Error(`screenshotone dom ${res.status}`);
    return await res.text();
  },
};

export async function runScreenshotOneTrack(input: {
  url: string;
  accessKey: string;
  adapter?: ScreenshotOneAdapter;
}): Promise<ScreenshotOneTrackResult> {
  const adapter = input.adapter ?? defaultScreenshotOneAdapter;
  try {
    const [viewport, fullPage, html] = await Promise.all([
      adapter.fetchScreenshot({ url: input.url, accessKey: input.accessKey, fullPage: false }),
      adapter.fetchScreenshot({ url: input.url, accessKey: input.accessKey, fullPage: true }),
      adapter.fetchHtml({ url: input.url, accessKey: input.accessKey }),
    ]);
    return {
      kind: 'ok',
      html,
      sourceTexts: extractSourceTexts(html),
      features: extractFeatures(html),
      reviews: extractReviews(html),
      viewportScreenshot: viewport,
      fullPageScreenshot: fullPage,
    };
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }
}
