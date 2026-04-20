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
  out = out.replace(WHITESPACE, ' ').trim();
  out = out.toLowerCase();
  // Tighten CJK: drop any whitespace between adjacent CJK chars. Run twice to catch overlapping matches.
  out = out.replace(WS_BETWEEN_CJK, '$1$2').replace(WS_BETWEEN_CJK, '$1$2');
  return out;
}
