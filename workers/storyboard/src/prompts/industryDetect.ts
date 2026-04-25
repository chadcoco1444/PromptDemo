import type { CrawlResult } from '@promptdemo/schema';

export type IndustryCategory =
  | 'developer_tool'
  | 'ecommerce'
  | 'saas_tool'
  | 'content_media'
  | 'default';

const DEVELOPER_KEYWORDS = [
  'api', 'sdk', 'cli', 'npm', 'github', 'webhook',
  'endpoint', 'open source', 'repository', 'package', 'library',
];

const ECOMMERCE_KEYWORDS = [
  'cart', 'checkout', 'buy now', 'add to bag', 'add to cart',
  'free shipping', 'discount', 'coupon',
];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function hasPrice(texts: string[]): boolean {
  return /\$\d/.test(texts.join(' '));
}

export function detectIndustry(crawlResult: CrawlResult): IndustryCategory {
  const featureTexts = crawlResult.features
    .map((f) => `${f.title} ${(f as { description?: string }).description ?? ''}`)
    .join(' ');
  const allText = [...crawlResult.sourceTexts, featureTexts].join(' ');

  if (containsAny(allText, DEVELOPER_KEYWORDS)) return 'developer_tool';

  const sourceText = crawlResult.sourceTexts.join(' ');
  if (hasPrice(crawlResult.sourceTexts) || containsAny(sourceText, ECOMMERCE_KEYWORDS)) {
    return 'ecommerce';
  }

  if (crawlResult.features.length >= 3) return 'saas_tool';

  const avgWords =
    crawlResult.sourceTexts.length > 0
      ? crawlResult.sourceTexts.reduce((sum, t) => sum + t.split(' ').length, 0) /
        crawlResult.sourceTexts.length
      : 0;
  if (crawlResult.features.length <= 1 && avgWords > 20) return 'content_media';

  return 'default';
}

export const STYLE_MODIFIERS: Record<IndustryCategory, string> = {
  developer_tool: `Be precise and concise — no marketing fluff. The audience is technical.
Lead with what this tool DOES, not what it "empowers" you to do.
CursorDemo is highly effective here — show the real workflow, not a screenshot tour.
FeatureCallout scenes should use left-aligned layout for readability.`,

  ecommerce: `Lead with visual impact and desire. Short, punchy copy only.
Use TextPunch for price or offer callouts.
SmoothScroll on the product page creates appetite — use it.
The CTA must be action-forward (Shop Now, Get Yours, etc.), not generic.`,

  saas_tool: `Emphasize efficiency, workflow integration, and team productivity.
Lead with the core value proposition — what pain does it eliminate?
BentoGrid is ideal for showing multiple features without scene bloat.
Open with the main dashboard or interface via HeroRealShot.`,

  content_media: `Open with a strong TextPunch headline to set editorial authority.
Use SmoothScroll to convey the volume and depth of content.
Tone should be authoritative and inviting — not sales-y.
Avoid CursorDemo (no interactive UI to demonstrate).`,

  default: '',
};
