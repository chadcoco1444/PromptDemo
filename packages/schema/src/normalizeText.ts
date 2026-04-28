const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const cp = parseInt(code.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    if (code.startsWith('#')) {
      const cp = parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? match;
  });
}

const ZERO_WIDTH_OR_BOM = /[\u200B-\u200D\uFEFF]/g;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const WHITESPACE = /\s+/g;
// Typographic quotes → ASCII straight quotes. Crawled HTML often contains
// curly quotes (U+2018, U+2019, U+201C, U+201D) while LLM output frequently
// uses ASCII straight quotes, or vice versa. NFKC alone does NOT fold these
// — they are typographically distinct under Unicode compatibility rules.
// Without this step, "world's" (curly U+2019) != "world's" (ASCII U+0027)
// for extractive-check comparisons, causing flaky storyboard failures
// (incident 2026-04-27 with duolingo emotional intent: first attempt failed
// extractive check, retry succeeded only because LLM picked different text).
const SMART_SINGLE_QUOTES = /[‘’‚‛]/g;
const SMART_DOUBLE_QUOTES = /[“”„‟]/g;

// Unified CJK range: CJK Unified Ideographs + Hiragana + Katakana + Hangul Syllables + common compat.
const CJK_CHAR = '[\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF]';
// Whitespace (ASCII or ideographic \u3000) between two CJK chars — drop it (no word boundaries in CJK).
const WS_BETWEEN_CJK = new RegExp(`(${CJK_CHAR})[\\s\\u3000]+(${CJK_CHAR})`, 'g');

export function normalizeText(input: string): string {
  if (!input) return '';
  let out = input;
  out = decodeEntities(out);
  out = out.normalize('NFKC');
  out = out.replace(ZERO_WIDTH_OR_BOM, '');
  out = out.replace(CONTROL_CHARS, '');
  out = out.replace(SMART_SINGLE_QUOTES, "'");
  out = out.replace(SMART_DOUBLE_QUOTES, '"');
  out = out.replace(WHITESPACE, ' ').trim();
  out = out.toLowerCase();
  // Fold "&" to "and" — Claude routinely rewrites ampersands as "and" when
  // extracting phrases from source pages (e.g., source "Boots & Bindings"
  // → output "boots and bindings"). Without this fold, downstream extractive
  // check sees the strings as different. Applied symmetrically to source pool
  // and scene texts, so legitimate brand names like "AT&T" → "at and t" on
  // both sides remain consistent.
  out = out.replace(/\s*&\s*/g, ' and ');
  out = out.replace(WHITESPACE, ' ').trim();
  // Tighten CJK: drop any whitespace between adjacent CJK chars. Run twice to catch overlapping matches.
  out = out.replace(WS_BETWEEN_CJK, '$1$2').replace(WS_BETWEEN_CJK, '$1$2');
  return out;
}
