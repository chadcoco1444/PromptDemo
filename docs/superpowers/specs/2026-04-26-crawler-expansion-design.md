# Crawler Expansion — LogoExtractor + CodeSnippetExtractor

**Date:** 2026-04-26
**Status:** Approved — ready for implementation planning
**Risks addressed:** Crawler data poverty for Phase 3 scenes (LogoCloud, CodeToUI)

---

## Problem

The current `CrawlResult` carries enough data to feed the 9 implemented v1 scenes, but two high-value Phase 3 scenes are blocked waiting for structured crawler input:

- **LogoCloud** needs partner/integration logos from "Trusted By" sections — multi-image arrays that `brand.logoUrl` (a single product-own logo) cannot satisfy.
- **CodeToUI** needs representative code snippets extracted directly from the page — not AI-invented, Hard-Rule-#3-compliant source material.

Both extractors can be implemented now, before their Remotion scenes exist. The storyboard prompt will not reference these fields until the scenes are built; the crawler just gathers the data.

---

## Design

### Guiding Principles

1. **Crawler-First, Prompt-Later.** Extract everything structurally available; filtering belongs in the storyboard prompt layer, not the crawler.
2. **Deterministic rendering.** All logos are downloaded and uploaded to S3 at crawl time — not at render time. This eliminates CORS issues and CDN cache misses in Remotion.
3. **Same extractor pattern.** New extractors follow the identical shape as `reviewExtractor.ts`: a standalone `extract*(html: string)` function, Cheerio-based, no I/O, independently testable with HTML fixtures.
4. **Orchestrator owns I/O.** Tracks return raw in-memory data (including source URLs for logos). The orchestrator performs all network I/O (downloads, S3 uploads), consistent with how `brand.logoUrl` works today.

---

## Schema Changes (`packages/schema/src/crawlResult.ts`)

### New types

```ts
export const PartnerLogoSchema = z.object({
  name:  z.string().min(1).max(100),  // alt text or filename-derived
  s3Uri: S3UriSchema,                  // always an S3 URI — never an external URL
});
export type PartnerLogo = z.infer<typeof PartnerLogoSchema>;

export const CodeSnippetSchema = z.object({
  code:     z.string().min(10).max(800), // ~15 lines at 50 chars/line
  language: z.string().max(50).optional(), // "javascript", "python", "bash", etc.
  label:    z.string().max(100).optional(), // nearest heading above the block
});
export type CodeSnippet = z.infer<typeof CodeSnippetSchema>;
```

### Added to `CrawlResultSchema`

```ts
logos:        z.array(PartnerLogoSchema).max(12).default([]),
codeSnippets: z.array(CodeSnippetSchema).max(5).default([]),
```

Both fields default to `[]` — zero results is valid and common.

### `packages/schema/src/index.ts` — new exports

```ts
export {
  CrawlResultSchema, ReviewSchema, PartnerLogoSchema, CodeSnippetSchema,
  type CrawlResult, type ExtractedReview, type PartnerLogo, type CodeSnippet,
} from './crawlResult';
```

---

## `logoExtractor.ts` (`workers/crawler/src/extractors/`)

**Output type:**

```ts
export interface ExtractedLogoCandidate {
  name: string;   // alt text or src-filename fallback
  srcUrl: string; // absolute URL — orchestrator downloads this
}
```

**Section detection — two-tier:**

*Tier 1 — class signals (high precision):*
```
[class*="trusted" i], [class*="partner" i], [class*="integration" i],
[class*="logo-cloud" i], [class*="clients" i], [class*="sponsor" i],
[class*="customer" i]
```

*Tier 2 — heading proximity (wider recall):*  
Any `<section>` or `<div>` whose direct `h2/h3` text (normalised, lowercased) contains one of:  
`"trusted by"`, `"works with"`, `"integrates with"`, `"partners"`, `"customers"`, `"used by"`, `"powered by"`

**Within matched containers:**

Each `<img>` is kept if:
- `src` is non-empty and resolves to an absolute URL
- `alt` or filename gives a usable `name` (fallback: derive from URL path)
- Deduplicated by `name` (case-insensitive)
- Skipped if `src` already seen in `brand.logoUrl` candidates (avoid collecting the product's own logo again)

**Limits:** max 12 candidates returned. First-come (DOM order) within priority tier.

**No downloads.** `extractLogos(html, baseUrl)` returns `ExtractedLogoCandidate[]`. URL resolution (relative → absolute) requires `baseUrl`, passed as second argument.

---

## `codeExtractor.ts` (`workers/crawler/src/extractors/`)

**Output type:**

```ts
export interface ExtractedCodeSnippet {
  code:     string;
  language?: string;
  label?:   string;
}
```

**Selector priority (Cheerio, tried in order, stop at 5 results):**

```
1. pre > code[class*="language-"]   — Prism.js / highlight.js (most precise)
2. pre > code                        — plain semantic HTML
3. [class*="code-block" i] code      — custom wrappers
4. [class*="highlight" i] pre        — alternate patterns
```

**Per-snippet logic:**

1. Extract raw text via `.text()`.
2. Detect `language` from class: `language-javascript` → `"javascript"`, `lang-python` → `"python"`, etc. Case-insensitive, strip `language-` / `lang-` prefix.
3. Walk up the DOM (up to 3 ancestor levels) for the nearest `h2`, `h3`, or `h4` → use as `label`. Stop at `<section>` boundary.
4. **Minification filter:** if the entire snippet has no `\n` and length > 200 chars, skip it (minified bundle, not readable code).
5. **Length cap:** truncate at 800 chars, cutting at the last `\n` before the limit (preserves line integrity).
6. Deduplicate by first 40 chars of `code` (normalised whitespace).

**Applies to all industries** — filtering is the storyboard prompt's job.

**Limits:** max 5 snippets, first in DOM order.

---

## Track Changes

Both new extractors are called from both tracks (Playwright and Cheerio), exactly like `extractReviews`.

### `playwrightTrack.ts`

`PlaywrightTrackResult` (ok branch) gains:
```ts
logoSrcCandidates: ExtractedLogoCandidate[];
codeSnippets: ExtractedCodeSnippet[];
```

Added to the track body (after `reviews`):
```ts
const logoSrcCandidates = extractLogos(html, input.url);
const codeSnippets = extractCodeSnippets(html);
```

### `cheerioTrack.ts`

`CheerioTrackResult` (ok branch) gains the same two fields. Same two calls added to `runCheerioTrack`.

---

## Orchestrator Changes (`orchestrator.ts`)

### `IntermediateState` additions

```ts
logoSrcCandidates: ExtractedLogoCandidate[];
codeSnippets: ExtractedCodeSnippet[];
```

### Logo download loop (after existing `brand.logoUrl` upload block)

```ts
const logos: PartnerLogo[] = [];
for (const candidate of intermediate.logoSrcCandidates) {
  if (logos.length >= 12) break;
  const bytes = await input.downloadLogo(candidate.srcUrl);
  if (!bytes) continue;
  const ext = candidate.srcUrl.split('.').pop()?.split('?')[0] ?? 'img';
  const s3Uri = await input.uploader(bytes, `logo-partner-${logos.length}.${ext}`);
  logos.push({ name: candidate.name, s3Uri });
}
```

### Final assembly

```ts
const raw = {
  // ... existing fields ...
  logos,
  codeSnippets: intermediate.codeSnippets,
};
```

---

## Testing

Each new extractor gets its own test file mirroring `reviewExtractor.test.ts`:

### `logoExtractor.test.ts`

| Test | HTML fixture |
|---|---|
| Returns `[]` when no logo-section found | Generic product page |
| Extracts from `[class*="trusted"]` container | `<div class="trusted-by-section"><img src="…" alt="Stripe">` |
| Extracts from heading proximity ("Trusted by our customers") | `<section><h2>Trusted by our customers</h2><img …>` |
| Resolves relative `src` to absolute URL using `baseUrl` | `src="/logos/stripe.svg"` + `baseUrl="https://example.com"` |
| Deduplicates by name (case-insensitive) | Two `<img alt="stripe">` |
| Caps at 12 candidates | 20-logo fixture |
| Skips images with empty `src` | `<img src="" alt="Broken">` |

### `codeExtractor.test.ts`

| Test | HTML fixture |
|---|---|
| Returns `[]` when no `pre > code` found | Generic marketing page |
| Extracts language from `class="language-javascript"` | Prism.js pattern |
| Extracts `label` from nearest h3 above the block | `<h3>Quick Start</h3><pre><code>…` |
| Skips minified code (no newlines, >200 chars) | Long minified line |
| Truncates at 800 chars on a `\n` boundary | 1200-char fixture |
| Deduplicates by first 40 chars | Two identical snippets |
| Caps at 5 snippets | 8-snippet fixture |
| Handles `lang-python` prefix variant | `class="lang-python"` |

### Orchestrator integration test

Extend the existing `orchestrator.test.ts` with one new test covering the logo download + upload loop:

- Playwright track returns `logoSrcCandidates: [{ name: 'stripe', srcUrl: 'https://…' }]`
- `downloadLogo` returns a buffer
- Asserts `result.logos[0].s3Uri` starts with `s3://`
- Asserts `result.logos[0].name === 'stripe'`

### Schema test (`packages/schema/tests/crawlResult.test.ts`)

Extend the existing crawl result fixtures test with `logos` and `codeSnippets` fields — verify both accept empty arrays and valid data, and that `s3Uri` in `PartnerLogoSchema` rejects plain HTTP URLs.

---

## Non-Goals

- **LogoCloud and CodeToUI Remotion scenes** — separate Phase 3 spec.
- **Storyboard prompt changes** — `crawlResult.logos` and `crawlResult.codeSnippets` are not referenced in the Claude prompt until the scenes ship.
- **SVG-specific processing** — logos are stored as-is (SVG, PNG, WebP). No rasterisation or re-encoding at crawl time.
- **Per-logo aspect-ratio filtering** — excluded to keep the extractor simple; the LogoCloud Remotion component will handle varied aspect ratios at render time.
- **Code syntax validation** — extracted text is stored verbatim; no AST parsing or language verification.
