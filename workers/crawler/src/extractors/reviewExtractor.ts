import { load } from 'cheerio';
import { normalizeText } from '@lumespec/schema';
import type { ExtractedReview } from '@lumespec/schema';

export type { ExtractedReview };

const MAX_REVIEWS = 10;
const MIN_TEXT_LEN = 10;

// Selector priority: schema.org structured data > semantic HTML > class conventions.
// Each entry is tried in order; we stop once we have MAX_REVIEWS unique hits.
const CONTAINER_SELECTORS = [
  '[itemtype*="Review"]',
  '[itemprop="reviewBody"]',
  'blockquote',
  '[class*="testimonial" i]',
  '[class*="review" i]',
  '[class*="quote" i]',
];

// Within a matched container, try these in order to find the quote text.
const TEXT_CANDIDATES = [
  '[itemprop="reviewBody"]',
  'p',
  'blockquote',
];

// Within a matched container, try these in order to find the author name.
const AUTHOR_CANDIDATES = [
  '[itemprop="author"]',
  'cite',
  '[class*="author" i]',
  '[class*="name" i]',
  'strong',
];

// Within a matched container, try these for the author's role / company.
const ROLE_CANDIDATES = [
  '[class*="role" i]',
  '[class*="position" i]',
  '[class*="title" i]',
  '[class*="company" i]',
];

function firstText($container: ReturnType<ReturnType<typeof load>>, selectors: string[]): string {
  for (const sel of selectors) {
    const text = normalizeText($container.find(sel).first().text());
    if (text) return text;
  }
  return '';
}

export function extractReviews(html: string): ExtractedReview[] {
  const $ = load(html);
  const seen = new Set<string>();
  const out: ExtractedReview[] = [];

  for (const sel of CONTAINER_SELECTORS) {
    if (out.length >= MAX_REVIEWS) break;

    $(sel).each((_i, el) => {
      if (out.length >= MAX_REVIEWS) return;

      const $el = $(el);

      // Extract the quote text.
      let text = firstText($el, TEXT_CANDIDATES);
      if (!text) text = normalizeText($el.text());
      if (!text || text.length < MIN_TEXT_LEN) return;
      // Truncate to schema limit.
      if (text.length > 500) text = text.slice(0, 500);

      // Deduplicate by exact text.
      if (seen.has(text)) return;
      seen.add(text);

      const review: ExtractedReview = { text };

      const author = firstText($el, AUTHOR_CANDIDATES);
      if (author && author.length <= 100) review.author = author;

      const role = firstText($el, ROLE_CANDIDATES);
      if (role && role.length <= 100) review.role = role;

      out.push(review);
    });
  }

  return out;
}
