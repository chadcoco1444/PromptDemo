# Crawler Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `LogoExtractor` and `CodeSnippetExtractor` to the crawler, plumb them through all three tracks, run a logo download+S3 upload loop in the orchestrator, and expose `logos` / `codeSnippets` on `CrawlResult`.

**Architecture:** Two new Cheerio-based pure-function extractors follow the exact pattern of `reviewExtractor.ts`. Tracks call the extractors and carry raw results in their ok types. The orchestrator's `pickTrack` copies the raw data into `IntermediateState`; the main `runCrawl` function runs a download loop for logos (same pattern as `brand.logoUrl`), sets `Content-Type: image/svg+xml` for `.svg` files in the worker's uploader closure, and includes both new fields in the final `CrawlResultSchema.parse(raw)` call.

**Tech Stack:** TypeScript, Cheerio 1.0, Zod 3, Vitest; existing `putObject` in `s3Client.ts` already accepts a `contentType` string.

---

## File Map

| Action | Path |
|---|---|
| Modify | `packages/schema/src/crawlResult.ts` |
| Modify | `packages/schema/src/index.ts` |
| Modify | `packages/schema/tests/crawlResult.test.ts` |
| Create | `workers/crawler/src/extractors/logoExtractor.ts` |
| Create | `workers/crawler/tests/logoExtractor.test.ts` |
| Create | `workers/crawler/src/extractors/codeExtractor.ts` |
| Create | `workers/crawler/tests/codeExtractor.test.ts` |
| Modify | `workers/crawler/src/tracks/playwrightTrack.ts` |
| Modify | `workers/crawler/src/tracks/cheerioTrack.ts` |
| Modify | `workers/crawler/src/tracks/screenshotOneTrack.ts` |
| Modify | `workers/crawler/src/orchestrator.ts` |
| Modify | `workers/crawler/src/index.ts` |
| Modify | `workers/crawler/tests/orchestrator.test.ts` |

---

## Task 1: Schema Additions + Schema Tests

**Files:**
- Modify: `packages/schema/src/crawlResult.ts`
- Modify: `packages/schema/src/index.ts`
- Modify: `packages/schema/tests/crawlResult.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Add these 6 tests at the bottom of `packages/schema/tests/crawlResult.test.ts`, inside the `describe('CrawlResultSchema', ...)` block:

```ts
  it('defaults logos to empty array when omitted', () => {
    const parsed = CrawlResultSchema.parse(baseValid);
    expect(parsed.logos).toEqual([]);
  });

  it('defaults codeSnippets to empty array when omitted', () => {
    const parsed = CrawlResultSchema.parse(baseValid);
    expect(parsed.codeSnippets).toEqual([]);
  });

  it('accepts valid logos with s3 URIs', () => {
    const parsed = CrawlResultSchema.parse({
      ...baseValid,
      logos: [{ name: 'Stripe', s3Uri: 's3://bucket/jobs/j/logo-partner-0.svg' }],
    });
    expect(parsed.logos).toHaveLength(1);
    expect(parsed.logos[0]!.name).toBe('Stripe');
  });

  it('rejects logos with plain HTTP URL in s3Uri', () => {
    expect(() =>
      CrawlResultSchema.parse({
        ...baseValid,
        logos: [{ name: 'Stripe', s3Uri: 'https://cdn.stripe.com/logo.svg' }],
      })
    ).toThrow();
  });

  it('accepts valid codeSnippets', () => {
    const parsed = CrawlResultSchema.parse({
      ...baseValid,
      codeSnippets: [{ code: 'console.log("hello world")', language: 'javascript', label: 'Quick Start' }],
    });
    expect(parsed.codeSnippets).toHaveLength(1);
    expect(parsed.codeSnippets[0]!.language).toBe('javascript');
  });

  it('rejects codeSnippets array exceeding 5 items', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ code: `console.log("snippet ${i} is long enough");` }));
    expect(() => CrawlResultSchema.parse({ ...baseValid, codeSnippets: many })).toThrow();
  });
```

- [ ] **Step 2: Run schema tests to verify they fail**

```
pnpm --filter @lumespec/schema test
```

Expected: 6 new tests FAIL (logos/codeSnippets not yet on the schema).

- [ ] **Step 3: Add PartnerLogoSchema and CodeSnippetSchema to crawlResult.ts**

In `packages/schema/src/crawlResult.ts`, insert after the `ReviewSchema` block and before `CrawlResultSchema`:

```ts
export const PartnerLogoSchema = z.object({
  name:  z.string().min(1).max(100),
  s3Uri: S3UriSchema,
});
export type PartnerLogo = z.infer<typeof PartnerLogoSchema>;

export const CodeSnippetSchema = z.object({
  code:     z.string().min(10).max(800),
  language: z.string().max(50).optional(),
  label:    z.string().max(100).optional(),
});
export type CodeSnippet = z.infer<typeof CodeSnippetSchema>;
```

Then add two fields to `CrawlResultSchema` after the `reviews` line:

```ts
  logos:        z.array(PartnerLogoSchema).max(12).default([]),
  codeSnippets: z.array(CodeSnippetSchema).max(5).default([]),
```

- [ ] **Step 4: Export new types from packages/schema/src/index.ts**

Replace the existing `crawlResult` export line with:

```ts
export {
  CrawlResultSchema, ReviewSchema, PartnerLogoSchema, CodeSnippetSchema,
  type CrawlResult, type ExtractedReview, type PartnerLogo, type CodeSnippet,
} from './crawlResult';
```

- [ ] **Step 5: Run schema tests to verify they pass**

```
pnpm --filter @lumespec/schema test
```

Expected: All 19 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/crawlResult.ts packages/schema/src/index.ts packages/schema/tests/crawlResult.test.ts
git commit -m "feat(schema): add PartnerLogoSchema and CodeSnippetSchema to CrawlResult"
```

---

## Task 2: logoExtractor.ts + Unit Tests

**Files:**
- Create: `workers/crawler/src/extractors/logoExtractor.ts`
- Create: `workers/crawler/tests/logoExtractor.test.ts`

- [ ] **Step 1: Write the failing logo extractor tests**

Create `workers/crawler/tests/logoExtractor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractLogos } from '../src/extractors/logoExtractor.js';

const BASE = 'https://example.com';

describe('extractLogos', () => {
  it('returns [] when no logo-section found', () => {
    const html = '<html><body><h1>Product</h1><p>Our great product.</p></body></html>';
    expect(extractLogos(html, BASE)).toEqual([]);
  });

  it('extracts from [class*="trusted"] container', () => {
    const html = `<html><body>
      <div class="trusted-by-section">
        <img src="https://cdn.stripe.com/logo.svg" alt="Stripe">
        <img src="https://cdn.github.com/logo.png" alt="GitHub">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('Stripe');
    expect(result[0]!.srcUrl).toBe('https://cdn.stripe.com/logo.svg');
    expect(result[1]!.name).toBe('GitHub');
  });

  it('extracts from heading proximity ("Trusted by our customers")', () => {
    const html = `<html><body>
      <section>
        <h2>Trusted by our customers</h2>
        <img src="https://cdn.acme.com/logo.png" alt="Acme">
      </section>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Acme');
  });

  it('resolves relative src to absolute URL using baseUrl', () => {
    const html = `<html><body>
      <div class="partner-logos">
        <img src="/logos/stripe.svg" alt="Stripe">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
    expect(result[0]!.srcUrl).toBe('https://example.com/logos/stripe.svg');
  });

  it('deduplicates by name (case-insensitive)', () => {
    const html = `<html><body>
      <div class="clients-section">
        <img src="https://a.com/1.svg" alt="Stripe">
        <img src="https://b.com/2.svg" alt="stripe">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
  });

  it('caps at 12 candidates', () => {
    const imgs = Array.from(
      { length: 20 },
      (_, i) => `<img src="https://cdn${i}.com/logo.svg" alt="Partner ${i}">`
    ).join('');
    const html = `<html><body><div class="trusted-logos">${imgs}</div></body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(12);
  });

  it('skips images with empty src', () => {
    const html = `<html><body>
      <div class="sponsor-area">
        <img src="" alt="Broken">
        <img src="https://cdn.stripe.com/logo.svg" alt="Stripe">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Stripe');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm --filter @lumespec/worker-crawler test -- logoExtractor
```

Expected: FAIL with "Cannot find module '../src/extractors/logoExtractor.js'".

- [ ] **Step 3: Implement logoExtractor.ts**

Create `workers/crawler/src/extractors/logoExtractor.ts`:

```ts
import { load, type CheerioAPI } from 'cheerio';

export interface ExtractedLogoCandidate {
  name: string;
  srcUrl: string;
}

const CLASS_SIGNALS = [
  '[class*="trusted" i]',
  '[class*="partner" i]',
  '[class*="integration" i]',
  '[class*="logo-cloud" i]',
  '[class*="clients" i]',
  '[class*="sponsor" i]',
  '[class*="customer" i]',
].join(', ');

const HEADING_KEYWORDS = [
  'trusted by',
  'works with',
  'integrates with',
  'partners',
  'customers',
  'used by',
  'powered by',
];

const MAX_LOGOS = 12;

function resolveUrl(src: string, baseUrl: string): string | null {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

function nameFromSrc(src: string): string {
  try {
    const path = new URL(src).pathname;
    const base = (path.split('/').pop() ?? '').replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
    return base || 'logo';
  } catch {
    return 'logo';
  }
}

function collectImgs(
  $: CheerioAPI,
  containerEl: any,
  baseUrl: string,
  seen: Set<string>,
  out: ExtractedLogoCandidate[]
): void {
  $(containerEl).find('img').each((_i, img) => {
    if (out.length >= MAX_LOGOS) return;
    const rawSrc = $(img).attr('src')?.trim() ?? '';
    if (!rawSrc) return;
    const srcUrl = resolveUrl(rawSrc, baseUrl);
    if (!srcUrl) return;
    const alt = $(img).attr('alt')?.trim() ?? '';
    const name = alt || nameFromSrc(srcUrl);
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, srcUrl });
  });
}

export function extractLogos(html: string, baseUrl: string): ExtractedLogoCandidate[] {
  const $ = load(html);
  const seen = new Set<string>();
  const out: ExtractedLogoCandidate[] = [];

  // Tier 1: class signals (high precision)
  $(CLASS_SIGNALS).each((_i, el) => {
    if (out.length >= MAX_LOGOS) return;
    collectImgs($, el, baseUrl, seen, out);
  });

  if (out.length >= MAX_LOGOS) return out;

  // Tier 2: heading proximity (wider recall)
  $('section, div').each((_i, el) => {
    if (out.length >= MAX_LOGOS) return;
    const headingText = $(el).children('h2, h3').first().text().toLowerCase().trim();
    if (HEADING_KEYWORDS.some((kw) => headingText.includes(kw))) {
      collectImgs($, el, baseUrl, seen, out);
    }
  });

  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter @lumespec/worker-crawler test -- logoExtractor
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/extractors/logoExtractor.ts workers/crawler/tests/logoExtractor.test.ts
git commit -m "feat(crawler): add logoExtractor with two-tier logo section detection"
```

---

## Task 3: codeExtractor.ts + Unit Tests

**Files:**
- Create: `workers/crawler/src/extractors/codeExtractor.ts`
- Create: `workers/crawler/tests/codeExtractor.test.ts`

- [ ] **Step 1: Write the failing code extractor tests**

Create `workers/crawler/tests/codeExtractor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractCodeSnippets } from '../src/extractors/codeExtractor.js';

describe('extractCodeSnippets', () => {
  it('returns [] when no pre > code found', () => {
    const html = '<html><body><h1>Marketing page</h1><p>No code here.</p></body></html>';
    expect(extractCodeSnippets(html)).toEqual([]);
  });

  it('extracts language from class="language-javascript"', () => {
    const html = `<html><body>
      <pre><code class="language-javascript">const x = 1;\nconst y = 2;\nreturn x + y;</code></pre>
    </body></html>`;
    const result = extractCodeSnippets(html);
    expect(result).toHaveLength(1);
    expect(result[0]!.language).toBe('javascript');
    expect(result[0]!.code).toContain('const x = 1;');
  });

  it('handles lang-python prefix variant', () => {
    const html = `<html><body>
      <pre><code class="lang-python">import os\nprint(os.getcwd())\nresult = True</code></pre>
    </body></html>`;
    const result = extractCodeSnippets(html);
    expect(result).toHaveLength(1);
    expect(result[0]!.language).toBe('python');
  });

  it('extracts label from nearest h3 above the block', () => {
    const html = `<html><body>
      <h3>Quick Start</h3>
      <pre><code class="language-bash">npm install lumespec\nnpm run dev</code></pre>
    </body></html>`;
    const result = extractCodeSnippets(html);
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('Quick Start');
  });

  it('skips minified code (no newlines, >200 chars)', () => {
    const minified = 'x'.repeat(201);
    const html = `<html><body><pre><code>${minified}</code></pre></body></html>`;
    expect(extractCodeSnippets(html)).toEqual([]);
  });

  it('does not skip short single-line code (<=200 chars)', () => {
    const html = `<html><body><pre><code>const x = 1;</code></pre></body></html>`;
    const result = extractCodeSnippets(html);
    expect(result).toHaveLength(1);
  });

  it('truncates at 800 chars on a newline boundary', () => {
    const line = 'a'.repeat(79) + '\n'; // 80 chars per line
    const longCode = line.repeat(15); // 1200 chars total
    const html = `<html><body><pre><code>${longCode}</code></pre></body></html>`;
    const result = extractCodeSnippets(html);
    expect(result[0]!.code.length).toBeLessThanOrEqual(800);
    expect(result[0]!.code).not.toEndWith('a'); // cut on newline boundary
  });

  it('deduplicates by first 40 chars of normalized code', () => {
    const snippet = 'const apiKey = process.env.API_KEY;\nconsole.log(apiKey);';
    const html = `<html><body>
      <pre><code>${snippet}</code></pre>
      <pre><code>${snippet}</code></pre>
    </body></html>`;
    expect(extractCodeSnippets(html)).toHaveLength(1);
  });

  it('caps at 5 snippets', () => {
    const block = '<pre><code>const a = 1;\nconst b = 2;\nreturn a + b;</code></pre>';
    const snippets = Array.from({ length: 8 }, (_, i) =>
      `<pre><code>const unique_${i} = ${i};\nconst val = unique_${i} * 2;\nreturn val;</code></pre>`
    ).join('');
    const html = `<html><body>${snippets}</body></html>`;
    expect(extractCodeSnippets(html)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm --filter @lumespec/worker-crawler test -- codeExtractor
```

Expected: FAIL with "Cannot find module '../src/extractors/codeExtractor.js'".

- [ ] **Step 3: Implement codeExtractor.ts**

Create `workers/crawler/src/extractors/codeExtractor.ts`:

```ts
import { load, type CheerioAPI } from 'cheerio';

export interface ExtractedCodeSnippet {
  code: string;
  language?: string;
  label?: string;
}

const MAX_SNIPPETS = 5;
const MAX_CODE_LENGTH = 800;
const MIN_MINIFIED_LENGTH = 200;

// Tried in order; stop once we have MAX_SNIPPETS.
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
  const cut = code.lastIndexOf('\n', max);
  return cut > 0 ? code.slice(0, cut) : code.slice(0, max);
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

      // Skip minified bundles: no newline and exceeds min length.
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
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter @lumespec/worker-crawler test -- codeExtractor
```

Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/extractors/codeExtractor.ts workers/crawler/tests/codeExtractor.test.ts
git commit -m "feat(crawler): add codeExtractor with Prism.js priority and minification filter"
```

---

## Task 4: Track Modifications

**Files:**
- Modify: `workers/crawler/src/tracks/playwrightTrack.ts`
- Modify: `workers/crawler/src/tracks/cheerioTrack.ts`
- Modify: `workers/crawler/src/tracks/screenshotOneTrack.ts`
- Modify: `workers/crawler/tests/orchestrator.test.ts` (fix existing fixture)

- [ ] **Step 1: Update playwrightTrack.ts**

Add two imports after the `extractReviews` import line:

```ts
import { extractLogos, type ExtractedLogoCandidate } from '../extractors/logoExtractor.js';
import { extractCodeSnippets, type ExtractedCodeSnippet } from '../extractors/codeExtractor.js';
```

In `PlaywrightTrackResult`, add two fields to the `kind: 'ok'` branch:

```ts
      logoSrcCandidates: ExtractedLogoCandidate[];
      codeSnippets: ExtractedCodeSnippet[];
```

In the function body, after `const reviews = extractReviews(html);`, add:

```ts
    const logoSrcCandidates = extractLogos(html, input.url);
    const codeSnippets = extractCodeSnippets(html);
```

In the `ok` object construction (around line 132), add both fields:

```ts
    const ok: PlaywrightTrackResult = {
      kind: 'ok',
      html,
      sourceTexts,
      features,
      reviews,
      logoSrcCandidates,
      codeSnippets,
      viewportScreenshot,
      fullPageScreenshot,
      logoCandidate,
      colors,
    };
```

- [ ] **Step 2: Update cheerioTrack.ts**

Add two imports after the `extractReviews` import:

```ts
import { extractLogos, type ExtractedLogoCandidate } from '../extractors/logoExtractor.js';
import { extractCodeSnippets, type ExtractedCodeSnippet } from '../extractors/codeExtractor.js';
```

In `CheerioTrackResult`, add two fields to the `kind: 'ok'` branch:

```ts
      logoSrcCandidates: ExtractedLogoCandidate[];
      codeSnippets: ExtractedCodeSnippet[];
```

In `runCheerioTrack`, replace the `result` construction block with:

```ts
    const result: CheerioTrackResult = {
      kind: 'ok',
      html,
      sourceTexts: extractSourceTexts(html),
      features: extractFeatures(html),
      reviews: extractReviews(html),
      logoSrcCandidates: extractLogos(html, input.url),
      codeSnippets: extractCodeSnippets(html),
      colors: primary ? { primary } : {},
    };
```

- [ ] **Step 3: Update screenshotOneTrack.ts**

Add two imports after the `extractReviews` import:

```ts
import { extractLogos, type ExtractedLogoCandidate } from '../extractors/logoExtractor.js';
import { extractCodeSnippets, type ExtractedCodeSnippet } from '../extractors/codeExtractor.js';
```

In `ScreenshotOneTrackResult`, add two fields to the `kind: 'ok'` branch:

```ts
      logoSrcCandidates: ExtractedLogoCandidate[];
      codeSnippets: ExtractedCodeSnippet[];
```

In `runScreenshotOneTrack`, update the return statement:

```ts
    return {
      kind: 'ok',
      html,
      sourceTexts: extractSourceTexts(html),
      features: extractFeatures(html),
      reviews: extractReviews(html),
      logoSrcCandidates: extractLogos(html, input.url),
      codeSnippets: extractCodeSnippets(html),
      viewportScreenshot: viewport,
      fullPageScreenshot: fullPage,
    };
```

- [ ] **Step 4: Fix orchestrator test fixtures to satisfy new required fields**

All `kind: 'ok'` inline track result objects in `workers/crawler/tests/orchestrator.test.ts` need the two new fields. Apply each change below.

**Test 1 — typed `pw: PlaywrightTrackResult`:**

```ts
    const pw: PlaywrightTrackResult = {
      kind: 'ok',
      html: '<html></html>',
      sourceTexts: ['hello world'],
      features: [{ title: 'f' }],
      reviews: [],
      viewportScreenshot: Buffer.from([1]),
      fullPageScreenshot: Buffer.from([2]),
      logoCandidate: { src: 'https://x/logo.svg', alt: 'acme logo', widthPx: 120, source: 'img-alt' },
      colors: { primary: '#4f46e5', secondary: '#a78bfa' },
      fontFamily: 'Inter',
      logoSrcCandidates: [],
      codeSnippets: [],
    };
```

**Test 2 — inline ScreenshotOne ok result:**

```ts
      runScreenshotOne: async () => ({
        kind: 'ok',
        html: '<title>Hi</title><body><h1>Hello</h1></body>',
        sourceTexts: ['hi', 'hello'],
        features: [],
        reviews: [],
        logoSrcCandidates: [],
        codeSnippets: [],
        viewportScreenshot: Buffer.from([1]),
        fullPageScreenshot: Buffer.from([2]),
      }),
```

**Test 3 — inline Cheerio ok result:**

```ts
      runCheerio: async () => ({
        kind: 'ok',
        html: '<title>Docs</title><body><h1>Quick</h1></body>',
        sourceTexts: ['docs', 'quick'],
        features: [],
        reviews: [],
        logoSrcCandidates: [],
        codeSnippets: [],
        colors: {},
      }),
```

**Test 5 — inline Cheerio ok result (tier-C test):**

```ts
      runCheerio: async () => ({
        kind: 'ok', html: '', sourceTexts: [], features: [], reviews: [],
        logoSrcCandidates: [], codeSnippets: [], colors: {},
      }),
```

- [ ] **Step 5: Run crawler tests to verify tracks compile and tests pass**

```
pnpm --filter @lumespec/worker-crawler test
```

Expected: All crawler tests PASS (existing + new extractor tests). The new track fields are populated but not yet plumbed into the orchestrator, so orchestrator tests still pass with empty arrays.

- [ ] **Step 6: Commit**

```bash
git add workers/crawler/src/tracks/playwrightTrack.ts workers/crawler/src/tracks/cheerioTrack.ts workers/crawler/src/tracks/screenshotOneTrack.ts workers/crawler/tests/orchestrator.test.ts
git commit -m "feat(crawler): wire logoExtractor and codeExtractor into all three tracks"
```

---

## Task 5: Orchestrator Assembly + SVG Content-Type + Integration Test

**Files:**
- Modify: `workers/crawler/src/orchestrator.ts`
- Modify: `workers/crawler/src/index.ts`
- Modify: `workers/crawler/tests/orchestrator.test.ts`

- [ ] **Step 1: Write the failing orchestrator integration test**

In `workers/crawler/tests/orchestrator.test.ts`, add this test inside `describe('runCrawl', ...)`:

```ts
  it('downloads partner logos and stores them as s3 URIs', async () => {
    const uploadedFilenames: string[] = [];
    const uploader = async (buf: Buffer, filename: string): Promise<S3Uri> => {
      uploadedFilenames.push(filename);
      return toS3Uri('fake', `jobs/j/${filename}`);
    };

    const pw: PlaywrightTrackResult = {
      kind: 'ok',
      html: '<html></html>',
      sourceTexts: ['hello world'],
      features: [],
      reviews: [],
      viewportScreenshot: Buffer.from([1]),
      fullPageScreenshot: Buffer.from([2]),
      logoCandidate: null,
      colors: {},
      logoSrcCandidates: [{ name: 'Stripe', srcUrl: 'https://cdn.stripe.com/logo.svg' }],
      codeSnippets: [],
    };

    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: true,
      runPlaywright: async () => pw,
      runScreenshotOne: async () => ({ kind: 'error', message: 'unused' }) as ScreenshotOneTrackResult,
      runCheerio: async () => ({ kind: 'error', message: 'unused' }) as CheerioTrackResult,
      uploader,
      downloadLogo: async () => Buffer.from([42]),
    });

    expect(result.logos).toHaveLength(1);
    expect(result.logos[0]!.name).toBe('Stripe');
    expect(result.logos[0]!.s3Uri).toMatch(/^s3:\/\//);
    expect(uploadedFilenames).toContain('logo-partner-0.svg');
  });
```

- [ ] **Step 2: Run the new test to verify it fails**

```
pnpm --filter @lumespec/worker-crawler test -- orchestrator
```

Expected: New test FAILS — `result.logos` is undefined or empty (field not yet on CrawlResult from orchestrator).

- [ ] **Step 3: Update IntermediateState and imports in orchestrator.ts**

In `workers/crawler/src/orchestrator.ts`, add two imports at the top:

```ts
import type { ExtractedLogoCandidate } from './extractors/logoExtractor.js';
import type { ExtractedCodeSnippet } from './extractors/codeExtractor.js';
```

Update the import from `@lumespec/schema` to include `PartnerLogo`:

```ts
import { CrawlResultSchema, type CrawlResult, type S3Uri, type ExtractedReview, type PartnerLogo } from '@lumespec/schema';
```

Add two fields to `IntermediateState`:

```ts
interface IntermediateState {
  html: string;
  sourceTexts: string[];
  features: Array<{ title: string; description?: string; iconHint?: string }>;
  reviews: ExtractedReview[];
  logoSrcCandidates: ExtractedLogoCandidate[];
  codeSnippets: ExtractedCodeSnippet[];
  viewportBuf?: Buffer;
  fullPageBuf?: Buffer;
  colors: { primary?: string; secondary?: string };
  fontFamily?: string;
  logo?: { src: string; alt?: string };
  trackUsed: 'playwright' | 'screenshot-saas' | 'cheerio';
}
```

- [ ] **Step 4: Plumb new fields through pickTrack**

In `pickTrack`, update the playwright branch — replace the `const s: IntermediateState` block with:

```ts
    const s: IntermediateState = {
      html: pw.html,
      sourceTexts: pw.sourceTexts,
      features: pw.features,
      reviews: pw.reviews,
      logoSrcCandidates: pw.logoSrcCandidates,
      codeSnippets: pw.codeSnippets,
      viewportBuf: pw.viewportScreenshot,
      fullPageBuf: pw.fullPageScreenshot,
      colors: pw.colors,
      trackUsed: 'playwright',
    };
```

Update the screenshotone branch return object to include both new fields:

```ts
      return {
        html: so.html,
        sourceTexts: so.sourceTexts,
        features: so.features,
        reviews: so.reviews,
        logoSrcCandidates: so.logoSrcCandidates,
        codeSnippets: so.codeSnippets,
        viewportBuf: so.viewportScreenshot,
        fullPageBuf: so.fullPageScreenshot,
        colors: {},
        trackUsed: 'screenshot-saas',
      };
```

Update the cheerio branch return object:

```ts
    return {
      html: ch.html,
      sourceTexts: ch.sourceTexts,
      features: ch.features,
      reviews: ch.reviews,
      logoSrcCandidates: ch.logoSrcCandidates,
      codeSnippets: ch.codeSnippets,
      colors: ch.colors,
      trackUsed: 'cheerio',
    };
```

- [ ] **Step 5: Add logo download loop and update final assembly in runCrawl**

In `runCrawl`, after the `brand.logoUrl` upload block (after the `else` block for "no logo candidate found"), add the logo download loop:

```ts
  const logos: PartnerLogo[] = [];
  for (const candidate of intermediate.logoSrcCandidates) {
    if (logos.length >= 12) break;
    const bytes = await input.downloadLogo(candidate.srcUrl);
    if (!bytes) continue;
    const ext = candidate.srcUrl.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'img';
    const s3Uri = await input.uploader(bytes, `logo-partner-${logos.length}.${ext}`);
    logos.push({ name: candidate.name, s3Uri });
  }
```

Update the `raw` object to include `logos` and `codeSnippets`:

```ts
  const raw = {
    url: input.url,
    fetchedAt: Date.now(),
    screenshots,
    brand,
    sourceTexts: intermediate.sourceTexts,
    features: intermediate.features,
    reviews: intermediate.reviews,
    logos,
    codeSnippets: intermediate.codeSnippets,
    fallbacks,
    tier,
    trackUsed: intermediate.trackUsed,
  };
```

- [ ] **Step 6: Update uploader in workers/crawler/src/index.ts for SVG Content-Type**

Replace the `uploader` closure with a version that handles SVG, PNG, and WebP:

```ts
    const uploader = async (buf: Buffer, filename: string): Promise<S3Uri> => {
      const key = buildKey(payload.jobId, filename);
      const lower = filename.toLowerCase();
      const contentType = lower.endsWith('.jpg')  ? 'image/jpeg'
                        : lower.endsWith('.svg')  ? 'image/svg+xml'
                        : lower.endsWith('.png')  ? 'image/png'
                        : lower.endsWith('.webp') ? 'image/webp'
                        : 'application/octet-stream';
      return putObject(s3, s3Cfg.bucket, key, buf, contentType);
    };
```

- [ ] **Step 7: Run orchestrator tests to verify all pass**

```
pnpm --filter @lumespec/worker-crawler test -- orchestrator
```

Expected: All 6 orchestrator tests PASS (5 existing + 1 new logo test).

- [ ] **Step 8: Commit**

```bash
git add workers/crawler/src/orchestrator.ts workers/crawler/src/index.ts workers/crawler/tests/orchestrator.test.ts
git commit -m "feat(crawler): orchestrator logo download loop + SVG Content-Type + codeSnippets assembly"
```

---

## Task 6: Workspace Typecheck + Full Test Suite

**Files:** No new files — verification only.

- [ ] **Step 1: Run full workspace typecheck**

```
pnpm -r run typecheck
```

Expected: 0 errors across all packages.

- [ ] **Step 2: Run full workspace test suite**

```
pnpm test
```

Expected: All tests pass. The count will have grown by the new extractor tests + schema tests + orchestrator integration test.

- [ ] **Step 3: Commit (if any typecheck-driven fixes were needed)**

If step 1 or 2 required fixes, commit them:

```bash
git add -p
git commit -m "fix(crawler): typecheck clean-up for crawler expansion"
```

If both steps passed clean, no commit needed here — the feature is already committed incrementally across Tasks 1–5.
