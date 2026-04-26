import { load, type CheerioAPI } from 'cheerio';

export interface ExtractedCodeSnippet {
  code: string;
  language?: string;
  label?: string;
}

const MAX_SNIPPETS = 5;
const MAX_CODE_LENGTH = 800;
const MIN_MINIFIED_LENGTH = 200;

// Priority: explicit language class → plain pre>code → custom wrappers → alternate patterns
const SELECTORS = [
  'pre > code[class*="language-"]',
  'pre > code',
  '[class*="code-block" i] code',
  '[class*="highlight" i] pre',
];

function detectLanguage(className: string): string | undefined {
  const match = className.match(/(?:language-|lang-)(\w+)/i);
  return match ? match[1]!.toLowerCase() : undefined;
}

function truncateAtNewline(code: string, max: number): string {
  if (code.length <= max) return code;
  const cut = code.lastIndexOf('\n', max - 1);
  return cut > 0 ? code.slice(0, cut + 1) : code.slice(0, max);
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function findLabel($: CheerioAPI, el: any): string | undefined {
  let curr = $(el);
  for (let depth = 0; depth < 3; depth++) {
    const tagName = (curr.prop('tagName') as string | undefined ?? '').toLowerCase();
    if (tagName === 'section') break;
    const heading = curr.prevAll('h2, h3, h4').first();
    if (heading.length) {
      const text = heading.text().trim();
      if (text && text.length <= 100) return text;
    }
    const parent = curr.parent();
    if (!parent.length) break;
    curr = parent;
  }
  return undefined;
}

export function extractCodeSnippets(html: string): ExtractedCodeSnippet[] {
  const $ = load(html);
  const seen = new Set<string>();
  const out: ExtractedCodeSnippet[] = [];

  for (const selector of SELECTORS) {
    if (out.length >= MAX_SNIPPETS) break;

    $(selector).each((_i, el) => {
      if (out.length >= MAX_SNIPPETS) return;

      const rawCode = $(el).text();
      if (!rawCode) return;

      if (!rawCode.includes('\n') && rawCode.length > MIN_MINIFIED_LENGTH) return;

      const code = truncateAtNewline(rawCode, MAX_CODE_LENGTH);

      const dedupeKey = normalizeWs(code).slice(0, 40);
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const snippet: ExtractedCodeSnippet = { code };

      const lang = detectLanguage($(el).attr('class') ?? '');
      if (lang) snippet.language = lang;

      const label = findLabel($, el);
      if (label) snippet.label = label;

      out.push(snippet);
    });
  }

  return out;
}
