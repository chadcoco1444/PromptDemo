/**
 * Detect whether a corpus of text strings is predominantly Chinese (CJK).
 * Used to decide whether to inject a Chinese locale directive into the
 * storyboard system prompt so Claude outputs scene text in the same language
 * as the source website.
 *
 * We count the ratio of CJK code points across all texts; >= 30% of non-space
 * characters being CJK is a strong signal that the site is Chinese-language.
 * This threshold is intentionally conservative to avoid false positives on
 * English sites that quote Chinese proper nouns.
 */

const CJK_RANGE = /[　-鿿豈-﫿︰-﹏]/;

export type Locale = 'zh' | 'en';

/**
 * Returns 'zh' if the corpus has ≥30% CJK characters, otherwise 'en'.
 * Strips whitespace before counting to avoid inflating the denominator.
 */
export function detectLocale(texts: string[]): Locale {
  if (texts.length === 0) return 'en';

  const joined = texts.join(' ');
  const noSpace = joined.replace(/\s+/g, '');
  if (noSpace.length === 0) return 'en';

  let cjkCount = 0;
  for (const ch of noSpace) {
    if (CJK_RANGE.test(ch)) cjkCount++;
  }

  return cjkCount / noSpace.length >= 0.3 ? 'zh' : 'en';
}
