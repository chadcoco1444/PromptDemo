import { load } from 'cheerio';
import { normalizeText } from '@lumespec/schema';

export interface ExtractedFeature {
  title: string;
  description?: string;
  iconHint?: string;
}

export function extractFeatures(html: string): ExtractedFeature[] {
  const $ = load(html);
  const out: ExtractedFeature[] = [];

  $('section').each((_i, section) => {
    const heading = $(section).find('h2, h3').first().text();
    const title = normalizeText(heading);
    if (!title) return;

    const description = normalizeText($(section).find('p').first().text()) || undefined;
    const rawIconHint = normalizeText($(section).find('img').first().attr('alt') ?? '');
    const iconHint = rawIconHint && rawIconHint.length <= 100 ? rawIconHint : undefined;

    const entry: ExtractedFeature = { title };
    if (description) entry.description = description;
    if (iconHint) entry.iconHint = iconHint;
    out.push(entry);
  });

  return out;
}
