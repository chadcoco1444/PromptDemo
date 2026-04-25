import { load } from 'cheerio';
import { normalizeText } from '@lumespec/schema';

const SELECTORS = ['title', 'meta[name="description"]', 'h1', 'h2', 'h3', 'strong', 'li'];

function truncate(s: string, max = 200): string {
  return s.length <= max ? s : s.slice(0, max);
}

export function extractSourceTexts(html: string): string[] {
  const $ = load(html);
  const out = new Set<string>();

  for (const sel of SELECTORS) {
    $(sel).each((_i, el) => {
      let raw = '';
      if (sel === 'meta[name="description"]') {
        raw = $(el).attr('content') ?? '';
      } else {
        raw = $(el).text();
      }
      const n = normalizeText(raw);
      if (n && n.length >= 2) out.add(truncate(n));
    });
  }

  return [...out];
}
