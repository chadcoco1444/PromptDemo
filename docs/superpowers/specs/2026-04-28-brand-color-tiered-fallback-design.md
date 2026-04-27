# Bug #1: Brand Color Tiered Fallback — Design

**Risk:** P2 — visual quality / PLG impression
**Date:** 2026-04-28
**Status:** Approved — ready for implementation planning

---

## Problem

The intent-spectrum evaluation on 2026-04-27 (see `docs/dev-notes/intent-spectrum-2026-04-27.md`) revealed that **9/9 generated storyboards fell back to the default LumeSpec indigo `#4f46e5` for `videoConfig.brandColor`**, regardless of source brand. Vercel (black/white), Duolingo (bright green), and Patagonia (orange/black) all produced identically-coloured videos. End-users would notice immediately — generated demos look LumeSpec-branded rather than source-brand-branded, undercutting the core PLG value of "your product, our pixels."

Diagnostic investigation surfaced **three independent root causes** that compound to produce the universal fallback:

### Root Cause #1 — Architectural: cheerio's `<meta theme-color>` extraction is dead code in the happy path

`workers/crawler/src/orchestrator.ts:pickTrack()` is a fallback chain, not a merge. When playwright succeeds (the happy path for ~all sites), `intermediate.colors` is taken **wholesale** from `pw.colors` and `cheerio` never runs. The `cheerio.colors.primary` extraction at `workers/crawler/src/tracks/cheerioTrack.ts:51-52` only fires if both playwright AND screenshotone tracks fail. In practice this means meta-tag-based colour signal is structurally inaccessible.

### Root Cause #2 — Algorithmic: `isNeutral` filter mismatches minimalist brands

`workers/crawler/src/extractors/colorSampler.ts:pickDominantFromFrequencies` filters out colors whose luminance is `> 0.92` (white-ish) or `< 0.08` (black-ish) before frequency ranking. Vercel's actual brand IS `#000` and `#FAFAFA` — both filtered out. Empirically verified: vercel.com's `<meta name="theme-color">` returns `#FAFAFA` and `#000`, both of which the algorithm would reject even if accessible. The algorithm carries the implicit assumption "all brands are colorful," which is false for the entire minimalist design category (Vercel, Stripe, Apple, Linear, etc.).

### Root Cause #3 — Coverage: DOM-only sampling misses brands whose color lives only in image assets

Duolingo's primary brand colour (#58cc02 green) lives in their owl logo SVG, not necessarily in DOM `background-color` of the elements playwrightTrack samples (`button`, `a[href]`, `header`, `[class*="cta" i]`, `[class*="primary" i]`). If their CTAs use gradients (which return `rgba(0,0,0,0)` from `getComputedStyle().backgroundColor`), are client-rendered after `domcontentloaded`, or use class names the regex doesn't catch, the DOM sampler returns nothing and brand color is lost despite being visually obvious in the logo.

Patagonia's failure is downstream of Bug #2 (regional splash page); not in scope for this design.

---

## Approaches Considered

| Approach | Pros | Cons |
|---|---|---|
| **A) Soft-neutral fallback in DOM sampler** | Solves Vercel-style minimalist brands directly. One-line algorithm change; no new deps. | Doesn't solve Duolingo (no non-neutral DOM signal to find). |
| **B) Add Web App Manifest `theme_color` extraction** | Modern progressive web apps universally publish this. | Many marketing sites don't ship a manifest; doesn't solve Vercel (manifest also neutral) or Duolingo. |
| **C) Logo pixel analysis via Sharp** | Solves Duolingo and any brand whose color is concentrated in the logo. Zero new I/O — logo already downloaded. Uses Sharp's mature C++ HSV-based dominant-color implementation. | Requires Sharp dep in `workers/crawler`. Doesn't solve Vercel (logo is also black/white). |
| **D) VLM (Claude Haiku / Gemini Flash) on viewport screenshot** ❌ | Universal — works on any site with a visible brand element. | Adds latency + per-job API cost. Doesn't solve Vercel either (VLM will correctly report black/white). Over-engineering until A+C are proven insufficient. |

**Decision: A + C (combined), plus a separate fix for Root Cause #1 architecture.** Approach D (VLM) is explicitly deferred — A+C should solve ~80% of cases empirically observable from the intent-spectrum sample, and Vercel's "brand IS neutral" case is unsolvable by VLM anyway.

---

## Architecture

A **three-tier fallback pipeline** in the orchestrator, replacing the current single-source-wins behavior:

```
                                    pickTrack() (existing)
                                          │
                                          ▼
                            intermediate.colors.primary?
                                          │
                ┌─────────────────────────┼─────────────────────────┐
                ▼ yes                                                ▼ no (Tier 1)
       use playwright DOM color                          extractThemeColorFromHtml(html)
                                                                    │
                                                  ┌─────────────────┼──────────────┐
                                                  ▼ found                          ▼ none (Tier 2)
                                          use meta theme-color           extractDominantColorFromImage(logoBuf)
                                                                                   │
                                                                ┌──────────────────┼────────────┐
                                                                ▼ found                         ▼ none
                                                       use Sharp dominant              DEFAULT_BRAND_COLOR
                                                                                       (#4f46e5)
```

- **Tier 0 (existing, fixed)**: Playwright DOM `background-color` sampling, with the `isNeutral` filter changed to a soft preference (see Component Spec 1).
- **Tier 1 (new — fixes Root Cause #1)**: HTML `<meta name="theme-color">` lookup, run from orchestrator on the `intermediate.html` regardless of which track produced it.
- **Tier 2 (new — fixes Root Cause #3)**: Sharp's `.stats().dominant` on the logo buffer the orchestrator already downloads.
- **Tier 3 (existing)**: `DEFAULT_BRAND_COLOR` constant.

Each tier is independently unit-testable and stops the chain on first hit. The orchestrator owns the chain composition; tracks and extractors return raw observations only.

---

## Component Specs

### Component Spec 1: `colorSampler.ts` — soft-neutral preference (fixes Root Cause #2)

`pickDominantFromFrequencies` currently HARD-FILTERS neutral colors. Change to soft preference: non-neutral wins over neutral, but neutral is acceptable as a last resort.

**Before** (`workers/crawler/src/extractors/colorSampler.ts:26-35`):
```ts
export function pickDominantFromFrequencies(counts: Map<string, number>): DominantColors {
  const ranked = [...counts.entries()]
    .filter(([hex]) => /^#[0-9a-f]{6}$/i.test(hex) && !isNeutral(hex))  // ← rejects neutrals
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
  // ...
}
```

**After**:
```ts
export function pickDominantFromFrequencies(counts: Map<string, number>): DominantColors {
  const ranked = [...counts.entries()]
    .filter(([hex]) => /^#[0-9a-f]{6}$/i.test(hex))
    .sort((a, b) => {
      // Non-neutral wins over neutral (preserves "Duolingo green > black" preference
      // for sites that DO have a colorful brand). Neutral colors are still ranked but
      // demoted, so minimalist brands (Vercel-style) still get a real answer.
      const an = isNeutral(a[0]);
      const bn = isNeutral(b[0]);
      if (an !== bn) return an ? 1 : -1;
      // Within same neutral-ness, higher frequency wins.
      return b[1] - a[1];
    })
    .map(([hex]) => hex);
  // ... rest unchanged
}
```

**Test additions** (`workers/crawler/tests/colorSampler.test.ts`):
- `prefers non-neutral over neutral even when neutral has higher frequency`
- `accepts pure neutral when no non-neutral candidates exist (regression: minimalist brands)`
- `existing tests for ordering by frequency still pass`

### Component Spec 2: `extractors/themeColorFromHtml.ts` — Tier 1 module (fixes Root Cause #1)

New file. Extracts `<meta name="theme-color">` from raw HTML. Handles both bare and `media`-attributed forms (e.g., Vercel publishes both light + dark variants — pick the first valid hex):

```ts
import { load } from 'cheerio';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Extract a hex color from <meta name="theme-color"> in the given HTML.
 * Prefers the first bare (no `media` attribute) tag; falls back to the first
 * `media`-attributed tag (typically a light/dark variant).
 *
 * Returns undefined if no valid hex is found. Note that the *caller* decides
 * whether the returned color is acceptable (e.g., neutral) — this function
 * does no semantic filtering, only syntactic validation.
 */
export function extractThemeColorFromHtml(html: string): string | undefined {
  const $ = load(html);
  const tags = $('meta[name="theme-color"]').toArray();
  // Prefer media-less first.
  for (const t of tags) {
    if (!$(t).attr('media')) {
      const c = $(t).attr('content');
      if (c && HEX_RE.test(c)) return c.toLowerCase();
    }
  }
  // Fallback: first media-attributed tag.
  for (const t of tags) {
    const c = $(t).attr('content');
    if (c && HEX_RE.test(c)) return c.toLowerCase();
  }
  return undefined;
}
```

**Why move it out of `cheerioTrack.ts`**: tracks should produce raw observations from one data source each. Cross-cutting "synthesize a brand color from any signal" logic belongs in the orchestrator. This split also kills the duplicate cheerio-load when playwright already has the HTML.

**Test additions** (`workers/crawler/tests/themeColorFromHtml.test.ts`):
- `extracts bare meta theme-color`
- `prefers bare over media-attributed when both present (Vercel pattern)`
- `falls back to media-attributed when bare absent`
- `returns undefined for missing tag`
- `returns undefined for invalid hex` (e.g., `red`, `#fff`, `transparent`)
- `lowercases the output for downstream comparison stability`

### Component Spec 3: `extractors/colorFromImage.ts` — Tier 2 module (fixes Root Cause #3)

New file. Uses Sharp's built-in `.stats().dominant` to extract the dominant color from a buffer (typically the logo PNG/SVG-rasterized).

```ts
import sharp from 'sharp';
import { toHex } from './colorSampler.js';

/**
 * Extract the dominant color from an image buffer using Sharp's built-in
 * HSV-based color quantization. Sharp's `.stats()` returns `dominant: {r,g,b}`
 * computed via histogram + clustering — well-suited to logos which have
 * limited palettes (typically 2-5 colors).
 *
 * Returns undefined if Sharp fails to parse the buffer (corrupt image,
 * unsupported format, etc.) — caller should fall through to the next tier.
 *
 * Cost: ~50ms for a 1000x1000 image (Sharp is native C++).
 *
 * Caveat: for purely-neutral logos (e.g., Vercel's black-on-white wordmark),
 * Sharp will correctly return a neutral hex. The caller (orchestrator)
 * applies no further filtering — neutral IS the right answer for those
 * brands, per the soft-neutral philosophy in Component Spec 1.
 */
export async function extractDominantColorFromImage(buf: Buffer): Promise<string | undefined> {
  try {
    const { dominant } = await sharp(buf).stats();
    return toHex(dominant.r, dominant.g, dominant.b);
  } catch {
    return undefined;
  }
}
```

**Test additions** (`workers/crawler/tests/colorFromImage.test.ts`):
- `extracts green from a 64x64 solid-green PNG fixture` (asserts hex matches input within tolerance)
- `extracts the dominant color from a multi-color logo fixture` (e.g., 80% green + 20% black → returns green-ish hex)
- `returns undefined for invalid buffer` (e.g., empty, garbage bytes)

Test fixtures: 2-3 small PNGs (< 5KB each) committed under `workers/crawler/tests/fixtures/colors/`. The generator that produced them is committed alongside as `workers/crawler/tests/fixtures/colors/generate.mjs` — a small node script using Sharp to synthesize predictable solid + multi-color images. The generator is NOT in any test runner; it's run manually if fixtures need regeneration. Reasoning: keep the recipe alongside the artifact so future contributors don't have to reverse-engineer how the fixtures were made.

**Dependency addition**: `sharp@^0.34.5` (matching `workers/render`'s pinned version) added to `workers/crawler/package.json` dependencies. No new sub-dependency surface — Sharp is already in the pnpm lockfile.

### Component Spec 4: `orchestrator.ts` — three-tier composition (fixes Root Cause #1 architecture)

The orchestrator gains the cross-cutting fallback chain. The change is scoped to the `brand` block currently at lines 62-78.

**Before** (`workers/crawler/src/orchestrator.ts:69-78`):
```ts
if (intermediate.colors.primary) {
  brand.primaryColor = intermediate.colors.primary;
} else {
  brand.primaryColor = DEFAULT_BRAND_COLOR;
  fallbacks.push({
    field: 'primaryColor',
    reason: 'not detected',
    replacedWith: DEFAULT_BRAND_COLOR,
  });
}
```

**After**:
```ts
// Tier 0: Playwright DOM sampling (existing, modified by Component Spec 1)
let primaryColor: string | undefined = intermediate.colors.primary;
let primarySource: string = primaryColor ? 'dom-sampling' : 'none';

// Tier 1: HTML meta theme-color
if (!primaryColor && intermediate.html) {
  const fromMeta = extractThemeColorFromHtml(intermediate.html);
  if (fromMeta) {
    primaryColor = fromMeta;
    primarySource = 'meta-theme-color';
  }
}

// Tier 2: Logo image dominant color (only if logo was downloaded above)
// NOTE: this requires reordering — logo download currently happens AFTER the
// brand block. The implementation will hoist the logo download before this
// fallback runs. See "Files Changed" for details.
if (!primaryColor && logoBuf) {
  const fromImg = await extractDominantColorFromImage(logoBuf);
  if (fromImg) {
    primaryColor = fromImg;
    primarySource = 'logo-pixel-analysis';
  }
}

// Tier 3: hard-coded default
if (!primaryColor) {
  primaryColor = DEFAULT_BRAND_COLOR;
  primarySource = 'default-fallback';
  fallbacks.push({
    field: 'primaryColor',
    reason: 'not detected by any tier (dom / meta / logo)',
    replacedWith: DEFAULT_BRAND_COLOR,
  });
}
brand.primaryColor = primaryColor;

// Per-tier observability — these end up in worker stdout, queryable by jobId.
console.log(`[crawler] brand color tier=${primarySource} value=${primaryColor} jobId=${input.jobId}`);
```

**Reordering note**: `logoBuf` is currently produced at lines 93-95 by `input.downloadLogo(intermediate.logo.src)`. The implementation must hoist this download to BEFORE the brand block so Tier 2 can consume it. If `intermediate.logo` is undefined (no logo found), Tier 2 silently skips and the chain continues to Tier 3.

**Test additions** (`workers/crawler/tests/orchestrator.test.ts` — new tests in existing file or new `orchestratorBrandColor.test.ts`):
- `tier 0 wins when DOM sampler returns a color`
- `tier 1 wins when DOM is empty and HTML has meta theme-color`
- `tier 2 wins when DOM and meta are empty but logo provides a color`
- `tier 3 (default) wins when all upstream tiers return nothing`
- `vercel-style: minimalist brand returns neutral hex via tier 0 (regression for soft-neutral)`

---

## Files Changed

| File | Change |
|---|---|
| `workers/crawler/src/extractors/colorSampler.ts` | Modify `pickDominantFromFrequencies` to soft-neutral ranking (Component Spec 1) |
| `workers/crawler/src/extractors/themeColorFromHtml.ts` | **New** — Tier 1 extractor (Component Spec 2) |
| `workers/crawler/src/extractors/colorFromImage.ts` | **New** — Tier 2 extractor (Component Spec 3) |
| `workers/crawler/src/tracks/cheerioTrack.ts` | **Remove** the `themeColor` extraction (lines 51-52) and `colors` field from result type — moved to orchestrator's Tier 1 |
| `workers/crawler/src/orchestrator.ts` | Hoist logo download before brand block; insert three-tier fallback chain (Component Spec 4) |
| `workers/crawler/package.json` | Add `"sharp": "^0.34.5"` to dependencies |
| `workers/crawler/tests/colorSampler.test.ts` | Add 2 soft-neutral preference tests (Component Spec 1) |
| `workers/crawler/tests/themeColorFromHtml.test.ts` | **New** — 6 tests covering bare/media/missing/invalid (Component Spec 2) |
| `workers/crawler/tests/colorFromImage.test.ts` | **New** — 3 tests with PNG fixtures (Component Spec 3) |
| `workers/crawler/tests/fixtures/colors/*.png` | **New** — 2-3 small synthesis-reproducible test fixtures |
| `workers/crawler/tests/fixtures/colors/generate.mjs` | **New** — fixture generator script (manual-run, not in CI) |
| `workers/crawler/tests/orchestrator.test.ts` | Add 5 new tier-priority tests (Component Spec 4) |
| `workers/crawler/DESIGN.md` | Update Responsibilities + add new section "Brand Color Tier Chain" documenting the 3-tier fallback architecture |

---

## Out of Scope (Explicitly Deferred)

These were considered during brainstorming and are deferred to future specs:

- **Bug #2 — Crawler region pinning** (locale / timezone / geolocation override; cookie injection; US-region proxy). Patagonia's brand-color failure was downstream of this — solving Bug #1 won't help patagonia.com because the crawler hits a regional splash page with no real content. Tracked separately; needs its own brainstorm given the Build vs. Buy / SaaS-cost decisions.
- **Bug #3 — Anti-bot fallback orchestration** (auto-fallback from playwright to ScreenshotOne on Cloudflare 403 / circuit-open). The ScreenshotOne track exists but its trigger policy isn't wired. Tracked separately.
- **VLM-based Tier 3** (Claude Haiku / Gemini Flash on viewport screenshot). Deferred until A+C ship and we observe in production what % of jobs still fall to default. Vercel-style minimalist brands are unsolvable by VLM anyway, so the marginal value is uncertain.
- **Web App Manifest `theme_color` extraction**. Empirically rare among the marketing sites we've sampled; would only add coverage for modern PWAs which are a small slice of typical LumeSpec input. Add later if metrics show it's worth it.
- **Brand secondary color refinement**. The current `secondary` field comes only from DOM sampling. The new tiers don't populate secondary. Acceptable for now — secondary is only used for accent details in a few scene types, and an inaccurate secondary is no worse than an inaccurate primary.

---

## Testing Strategy

- **Unit tests** for each extractor in isolation (Component Specs 1, 2, 3) — fast, deterministic, no network.
- **Orchestrator tests** with mocked tracks asserting tier priority ordering (Component Spec 4) — also fast, deterministic.
- **No new e2e or integration tests required**. The intent-spectrum eval (`scripts/intent-spectrum-eval.mjs`) becomes the regression-validation tool: after merge, re-run the 9-cell matrix with `--include-cells` filter on the 3 URLs from the original report. Expected outcome: at least 2 of 3 URLs return a non-default brandColor (vercel returns neutral via tier 0 soft-fallback; duolingo returns green via tier 2; patagonia still defaults due to Bug #2 — flagged in the verification log, not a Bug #1 failure).
- **Per-tier observability** (the `console.log [crawler] brand color tier=...` line in Component Spec 4) makes it grep-able from worker stdout which tier produced the answer. This is the "did the fix work in production" signal.

---

## Migration / Rollout

No migration needed — this is purely additive on the read path. Existing storyboards in S3 are not regenerated. New jobs benefit from the new fallback chain immediately on deploy.

Risk: a job mid-flight when the worker is restarted will use the new code, which is fine — `videoConfig.brandColor` is recomputed from scratch each crawl.

Rollback: revert the orchestrator change and the new extractor imports. The `colorSampler` change is independently revertable. The new Sharp dependency stays (no harm in keeping it).
