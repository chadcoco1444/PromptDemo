# Brand Color Tiered Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the universal default-color fallback with a 3-tier brand-color extraction chain so generated videos visually match the source brand.

**Architecture:** `pickDominantFromFrequencies` → `extractThemeColorFromHtml` → `extractDominantColorFromImage` → hard-coded default, composed by orchestrator. Each tier is independently tested. Soft-neutral preference replaces the current hard-reject of `#000`/`#FFF`-class colors.

**Tech Stack:** Sharp 0.34 (new dep in workers/crawler, matching workers/render's pinned version), Cheerio (already), Vitest (already).

---

## Spec Coverage Map

This plan implements `docs/superpowers/specs/2026-04-28-brand-color-tiered-fallback-design.md`. Each Component Spec maps to one task:

| Spec section | Task |
|---|---|
| Component Spec 1 (soft-neutral) | T1 |
| Component Spec 2 (themeColorFromHtml extractor) | T2 |
| Component Spec 3 (colorFromImage extractor + Sharp dep + fixtures) | T3 |
| Component Spec 4 (orchestrator 3-tier composition + DESIGN.md) | T4 |

**Shippable per task**: T1 alone fixes Vercel-style minimalist brands (DOM tier still authoritative). T2/T3 ship dead code (extractor exists, not yet wired) — safe but no end-user effect until T4. T4 is the moment the full chain goes live.

---

## File Structure

| File | Status | Owner Task |
|---|---|---|
| `workers/crawler/src/extractors/colorSampler.ts` | Modify | T1 |
| `workers/crawler/tests/colorSampler.test.ts` | Modify (extend) | T1 |
| `workers/crawler/src/extractors/themeColorFromHtml.ts` | Create | T2 |
| `workers/crawler/tests/themeColorFromHtml.test.ts` | Create | T2 |
| `workers/crawler/package.json` | Modify (add sharp dep) | T3 |
| `workers/crawler/src/extractors/colorFromImage.ts` | Create | T3 |
| `workers/crawler/tests/colorFromImage.test.ts` | Create | T3 |
| `workers/crawler/tests/fixtures/colors/generate.mjs` | Create | T3 |
| `workers/crawler/tests/fixtures/colors/*.png` | Create (3 fixtures) | T3 |
| `workers/crawler/src/orchestrator.ts` | Modify (hoist logo + insert chain) | T4 |
| `workers/crawler/src/tracks/cheerioTrack.ts` | Modify (remove theme-color extraction) | T4 |
| `workers/crawler/tests/orchestrator.test.ts` | Modify (extend with tier tests) | T4 |
| `workers/crawler/DESIGN.md` | Modify (document tier chain) | T4 |

---

## Task 1: Soft-Neutral Preference in colorSampler

**Goal:** Stop hard-rejecting neutral colors. Make non-neutral preferred but neutral acceptable as a last resort. After T1, Vercel-style minimalist brands (theme color is `#000`/`#FAFAFA`) get a real answer instead of falling through to default.

**Files:**
- Modify: `workers/crawler/src/extractors/colorSampler.ts:26-35`
- Modify: `workers/crawler/tests/colorSampler.test.ts` (extend with 2 new tests)

- [ ] **Step 1: Read the current implementation**

Run: `cat workers/crawler/src/extractors/colorSampler.ts`

Expected: confirm the function body matches what's quoted below in Step 4. If it has drifted, stop and report back — the plan was written against a specific snapshot.

- [ ] **Step 2: Write the failing tests**

Open `workers/crawler/tests/colorSampler.test.ts`. The existing file imports `pickDominantFromFrequencies` and uses `vitest`'s `describe`/`it`/`expect`. Add these two tests at the end of the existing `describe` block:

```ts
it('prefers non-neutral over neutral even when neutral has higher frequency', () => {
  // Vercel pattern: site has many black headers (high freq) but a single
  // colored brand accent (low freq). The accent should still win.
  const counts = new Map<string, number>([
    ['#000000', 50],   // neutral, very common
    ['#58cc02', 1],    // non-neutral, rare
  ]);
  const result = pickDominantFromFrequencies(counts);
  expect(result.primary).toBe('#58cc02');
});

it('accepts pure neutral when no non-neutral candidates exist (regression: minimalist brands)', () => {
  // Regression: previously this returned {} because isNeutral filter rejected
  // all candidates. Now neutral is acceptable as a last resort so minimalist
  // brands (Vercel, Stripe, Linear, etc.) get a real answer.
  const counts = new Map<string, number>([
    ['#000000', 12],
    ['#fafafa', 5],
  ]);
  const result = pickDominantFromFrequencies(counts);
  expect(result.primary).toBe('#000000');
  expect(result.secondary).toBe('#fafafa');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @lumespec/worker-crawler test colorSampler`

Expected: 2 new tests FAIL. The first because `pickDominantFromFrequencies` returns `{}` (after isNeutral filter strips both inputs in the test where neutral is filtered) or returns `#000000` (wrong). The second because the function returns `{}` (no candidates after filter).

- [ ] **Step 4: Apply the soft-neutral preference change**

In `workers/crawler/src/extractors/colorSampler.ts`, replace the `pickDominantFromFrequencies` body (lines 26-35) with:

```ts
export function pickDominantFromFrequencies(counts: Map<string, number>): DominantColors {
  const ranked = [...counts.entries()]
    .filter(([hex]) => /^#[0-9a-f]{6}$/i.test(hex))
    .sort((a, b) => {
      // Non-neutral wins over neutral. Preserves "Duolingo green > black"
      // preference for sites with a colorful brand, while still letting
      // minimalist brands (Vercel-style) get a real answer when their
      // entire palette is neutral. Within same neutral-ness, higher
      // frequency wins.
      const an = isNeutral(a[0]);
      const bn = isNeutral(b[0]);
      if (an !== bn) return an ? 1 : -1;
      return b[1] - a[1];
    })
    .map(([hex]) => hex);
  const out: DominantColors = {};
  if (ranked[0]) out.primary = ranked[0];
  if (ranked[1]) out.secondary = ranked[1];
  return out;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @lumespec/worker-crawler test colorSampler`

Expected: all 7 tests pass (5 existing + 2 new). If existing tests fail, the change broke a behavior — re-read existing tests and adjust your understanding before making further changes.

- [ ] **Step 6: Commit**

The DESIGN.md sync hook does NOT trigger for `workers/crawler/src/extractors/**` paths (only `index.ts`, `circuitBreaker.ts`, or `package.json` trigger it). Plain commit:

```bash
git add workers/crawler/src/extractors/colorSampler.ts workers/crawler/tests/colorSampler.test.ts
git commit -m "$(cat <<'EOF'
fix(crawler): soft-neutral preference in pickDominantFromFrequencies

Replaces the hard isNeutral filter with a soft preference: non-neutral
wins over neutral, but neutral is acceptable when no non-neutral
candidates exist. Solves the "minimalist brand" failure mode where
sites whose entire palette is black/white (Vercel, Stripe, Linear,
Apple, etc.) used to fall through to the default LumeSpec indigo
because every sampled background got filtered out.

For colorful brands (Duolingo green, Slack purple, etc.) the priority
is unchanged — non-neutral still wins even when neutral has higher
frequency.

Component Spec 1 of docs/superpowers/specs/2026-04-28-brand-color-
tiered-fallback-design.md.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: New themeColorFromHtml Extractor

**Goal:** Add a standalone module that extracts `<meta name="theme-color">` from any HTML string. Will be wired into the orchestrator in T4. After T2, the function exists and is tested but isn't called from anywhere yet — safe to ship.

**Files:**
- Create: `workers/crawler/src/extractors/themeColorFromHtml.ts`
- Create: `workers/crawler/tests/themeColorFromHtml.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `workers/crawler/tests/themeColorFromHtml.test.ts` with this exact content:

```ts
import { describe, it, expect } from 'vitest';
import { extractThemeColorFromHtml } from '../src/extractors/themeColorFromHtml.js';

describe('extractThemeColorFromHtml', () => {
  it('extracts a bare meta theme-color', () => {
    const html = '<html><head><meta name="theme-color" content="#58cc02"></head></html>';
    expect(extractThemeColorFromHtml(html)).toBe('#58cc02');
  });

  it('prefers bare over media-attributed when both present (Vercel pattern)', () => {
    const html = `
      <html><head>
        <meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
        <meta name="theme-color" content="#abcdef">
      </head></html>
    `;
    expect(extractThemeColorFromHtml(html)).toBe('#abcdef');
  });

  it('falls back to first media-attributed when bare absent', () => {
    const html = `
      <html><head>
        <meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
      </head></html>
    `;
    expect(extractThemeColorFromHtml(html)).toBe('#fafafa');
  });

  it('returns undefined when no theme-color meta exists', () => {
    const html = '<html><head><title>Test</title></head></html>';
    expect(extractThemeColorFromHtml(html)).toBeUndefined();
  });

  it('returns undefined for invalid hex values', () => {
    const html1 = '<html><head><meta name="theme-color" content="red"></head></html>';
    const html2 = '<html><head><meta name="theme-color" content="#fff"></head></html>'; // 3-digit
    const html3 = '<html><head><meta name="theme-color" content="transparent"></head></html>';
    expect(extractThemeColorFromHtml(html1)).toBeUndefined();
    expect(extractThemeColorFromHtml(html2)).toBeUndefined();
    expect(extractThemeColorFromHtml(html3)).toBeUndefined();
  });

  it('lowercases the output for downstream comparison stability', () => {
    const html = '<html><head><meta name="theme-color" content="#ABCDEF"></head></html>';
    expect(extractThemeColorFromHtml(html)).toBe('#abcdef');
  });
});
```

- [ ] **Step 2: Run test to verify all 6 fail with "module not found"**

Run: `pnpm --filter @lumespec/worker-crawler test themeColorFromHtml`

Expected: tests fail because `../src/extractors/themeColorFromHtml.js` does not exist yet.

- [ ] **Step 3: Implement the extractor**

Create `workers/crawler/src/extractors/themeColorFromHtml.ts` with this exact content:

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

- [ ] **Step 4: Run tests to verify all 6 pass**

Run: `pnpm --filter @lumespec/worker-crawler test themeColorFromHtml`

Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/extractors/themeColorFromHtml.ts workers/crawler/tests/themeColorFromHtml.test.ts
git commit -m "$(cat <<'EOF'
feat(crawler): add themeColorFromHtml extractor (Tier 1)

Standalone module that extracts <meta name="theme-color"> from any HTML
string. Prefers media-less tags; falls back to media-attributed
(light/dark variants). Does no semantic filtering — caller decides
whether the returned color is acceptable.

Not yet wired into the orchestrator pipeline (T4 does that). Ships
unused for now to keep PRs reviewable in small steps.

Component Spec 2 of docs/superpowers/specs/2026-04-28-brand-color-
tiered-fallback-design.md.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: New colorFromImage Extractor + Sharp Dep + Fixtures

**Goal:** Add a standalone module that extracts the dominant color from any image buffer using Sharp's `.stats().dominant`. Add Sharp as a dependency and commit reproducible PNG test fixtures. After T3, the function exists and is tested with real PNGs but isn't called from anywhere.

**Files:**
- Modify: `workers/crawler/package.json` (add sharp dep)
- Create: `workers/crawler/src/extractors/colorFromImage.ts`
- Create: `workers/crawler/tests/colorFromImage.test.ts`
- Create: `workers/crawler/tests/fixtures/colors/generate.mjs`
- Create: `workers/crawler/tests/fixtures/colors/solid-green.png`
- Create: `workers/crawler/tests/fixtures/colors/mostly-green.png`
- Create: `workers/crawler/tests/fixtures/colors/solid-black.png`

- [ ] **Step 1: Add Sharp dep to workers/crawler/package.json**

Open `workers/crawler/package.json`. In the `dependencies` block, add the `sharp` line in alphabetical order (after `playwright`, before `zod`). Pin to the same version as `workers/render`'s lockfile entry — `^0.34.5`.

After editing, run from repo root:

```bash
pnpm install --filter @lumespec/worker-crawler
```

Expected: pnpm resolves and writes to `pnpm-lock.yaml`. Sharp's native binary is fetched. Verify Sharp loads:

```bash
node -e "const s = require('./workers/crawler/node_modules/sharp'); console.log('sharp version:', s.versions.sharp);"
```

Expected output: `sharp version: 0.34.x`.

- [ ] **Step 2: Write the fixture generator script**

Create `workers/crawler/tests/fixtures/colors/generate.mjs` with this exact content:

```js
#!/usr/bin/env node
/**
 * Regenerate the brand-color test fixtures. NOT run in CI — invoke
 * manually if you need to add or change a fixture:
 *
 *   node workers/crawler/tests/fixtures/colors/generate.mjs
 *
 * Each fixture is a small (64x64) PNG with a known dominant color so
 * the test assertions can be exact. Sharp's HSV-based dominant
 * detection should return the dominant region's color (or very close
 * to it within a small tolerance).
 */
import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function solid(hexR, hexG, hexB, name) {
  const buf = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: hexR, g: hexG, b: hexB } },
  }).png().toBuffer();
  const out = resolve(__dirname, `${name}.png`);
  await sharp(buf).toFile(out);
  console.log(`wrote ${out}`);
}

// 80% green region + 20% black region — proves Sharp correctly identifies
// the DOMINANT region rather than averaging.
async function mostlyGreen() {
  const green = await sharp({
    create: { width: 64, height: 51, channels: 3, background: { r: 88, g: 204, b: 2 } }, // #58cc02
  }).png().toBuffer();
  const black = await sharp({
    create: { width: 64, height: 13, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png().toBuffer();
  const composite = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: green, top: 0, left: 0 },
      { input: black, top: 51, left: 0 },
    ])
    .png()
    .toBuffer();
  const out = resolve(__dirname, 'mostly-green.png');
  await sharp(composite).toFile(out);
  console.log(`wrote ${out}`);
}

await solid(88, 204, 2, 'solid-green');   // #58cc02 — Duolingo green
await solid(0, 0, 0, 'solid-black');      // #000000 — Vercel black
await mostlyGreen();
```

- [ ] **Step 3: Run the generator to produce the fixture PNGs**

Run from repo root:

```bash
node workers/crawler/tests/fixtures/colors/generate.mjs
```

Expected output:
```
wrote .../workers/crawler/tests/fixtures/colors/solid-green.png
wrote .../workers/crawler/tests/fixtures/colors/solid-black.png
wrote .../workers/crawler/tests/fixtures/colors/mostly-green.png
```

Verify each file is < 5KB:

```bash
ls -lh workers/crawler/tests/fixtures/colors/
```

- [ ] **Step 4: Write the failing tests**

Create `workers/crawler/tests/colorFromImage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDominantColorFromImage } from '../src/extractors/colorFromImage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(resolve(__dirname, 'fixtures/colors', name));

// Sharp's HSV clustering is deterministic but not pixel-exact — allow ±2 on
// each channel to absorb minor rounding from PNG encoding + the clustering
// step itself. (For these synthesized fixtures it's typically dead-on, but
// we don't want this test to flake on a Sharp version bump.)
function approxEqHex(actual: string, expected: string, tolerance = 2): boolean {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(actual);
  const [er, eg, eb] = parse(expected);
  return Math.abs(ar - er) <= tolerance
      && Math.abs(ag - eg) <= tolerance
      && Math.abs(ab - eb) <= tolerance;
}

describe('extractDominantColorFromImage', () => {
  it('extracts green from a solid-green PNG fixture', async () => {
    const result = await extractDominantColorFromImage(fixture('solid-green.png'));
    expect(result).toBeDefined();
    expect(approxEqHex(result!, '#58cc02')).toBe(true);
  });

  it('extracts the dominant region from a multi-color fixture (80% green / 20% black)', async () => {
    const result = await extractDominantColorFromImage(fixture('mostly-green.png'));
    expect(result).toBeDefined();
    expect(approxEqHex(result!, '#58cc02')).toBe(true);
  });

  it('extracts black from a solid-black PNG fixture (regression: minimalist logos)', async () => {
    // Vercel-style: logo IS black. Sharp must return it; orchestrator's
    // soft-neutral preference will only demote it if a non-neutral exists.
    const result = await extractDominantColorFromImage(fixture('solid-black.png'));
    expect(result).toBeDefined();
    expect(approxEqHex(result!, '#000000')).toBe(true);
  });

  it('returns undefined for invalid buffer', async () => {
    const result = await extractDominantColorFromImage(Buffer.from('not an image'));
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty buffer', async () => {
    const result = await extractDominantColorFromImage(Buffer.alloc(0));
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run test to verify all 5 fail with "module not found"**

Run: `pnpm --filter @lumespec/worker-crawler test colorFromImage`

Expected: tests fail because `../src/extractors/colorFromImage.js` does not exist yet.

- [ ] **Step 6: Implement the extractor**

Create `workers/crawler/src/extractors/colorFromImage.ts`:

```ts
import sharp from 'sharp';
import { toHex } from './colorSampler.js';

/**
 * Extract the dominant color from an image buffer using Sharp's built-in
 * HSV-based color quantization. Sharp's `.stats()` returns
 * `dominant: {r,g,b}` computed via histogram + clustering — well-suited to
 * logos which have limited palettes (typically 2-5 colors).
 *
 * Returns undefined if Sharp fails to parse the buffer (corrupt image,
 * unsupported format, etc.) — caller should fall through to the next tier.
 *
 * Cost: ~50ms for a 1000x1000 image (Sharp is native C++).
 *
 * Caveat: for purely-neutral logos (e.g., Vercel's black-on-white wordmark),
 * Sharp will correctly return a neutral hex. The caller (orchestrator)
 * applies no further filtering — neutral IS the right answer for those
 * brands, per the soft-neutral philosophy in colorSampler.ts.
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

- [ ] **Step 7: Run tests to verify all 5 pass**

Run: `pnpm --filter @lumespec/worker-crawler test colorFromImage`

Expected: 5/5 pass.

- [ ] **Step 8: Run full crawler test suite to confirm no regression**

Run: `pnpm --filter @lumespec/worker-crawler test`

Expected: all crawler tests pass (existing + 6 new from T2 + 5 new from T3 + 2 new from T1 = previous count + 13).

- [ ] **Step 9: Commit (use --no-verify with reason)**

The DESIGN.md sync hook DOES trigger for `workers/crawler/package.json`. Per CLAUDE.md「何時可以略過」, this is a dep addition for a utility not yet wired into the architecture (T4 does the integration with full DESIGN.md update). Bypass with `--no-verify` and document the reason in the commit body.

```bash
git add workers/crawler/package.json workers/crawler/src/extractors/colorFromImage.ts workers/crawler/tests/colorFromImage.test.ts workers/crawler/tests/fixtures/colors/ pnpm-lock.yaml
git commit --no-verify -m "$(cat <<'EOF'
feat(crawler): add colorFromImage extractor + sharp dep + fixtures (Tier 2)

Standalone extractor wrapping sharp's .stats().dominant. Used by the
orchestrator's tier-2 fallback (wired in T4) to recover brand color
from the logo buffer when DOM sampling and meta theme-color both
return nothing.

Fixtures (64x64 PNGs, < 5KB each) generated by the committed
generate.mjs script — re-runnable when fixtures need to change.
Generator is NOT in the test runner; manual invocation only.

Bypassing DESIGN.md sync hook: this commit adds the sharp dep and a
new utility module not yet integrated into the crawler architecture.
T4 wires it into the orchestrator pipeline and updates
workers/crawler/DESIGN.md with the full tier-chain documentation in
one atomic change.

Component Spec 3 of docs/superpowers/specs/2026-04-28-brand-color-
tiered-fallback-design.md.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Orchestrator 3-Tier Composition + cheerio Cleanup + DESIGN.md

**Goal:** Wire all three tiers into the orchestrator's brand-color flow. Hoist logo download so tier 2 can consume it. Remove the now-redundant theme-color extraction from cheerioTrack. Add per-tier observability log. Update DESIGN.md to document the new architecture. After T4, the full feature is live.

**Files:**
- Modify: `workers/crawler/src/orchestrator.ts` (hoist logo + insert tier chain)
- Modify: `workers/crawler/src/tracks/cheerioTrack.ts` (remove theme-color extraction)
- Modify: `workers/crawler/tests/orchestrator.test.ts` (extend with 5 tier-priority tests)
- Modify: `workers/crawler/DESIGN.md` (document tier chain in Responsibilities + new section)

- [ ] **Step 1: Read the current orchestrator brand block + logo block**

Run: `sed -n '60,100p' workers/crawler/src/orchestrator.ts`

Expected: see the `brand` declaration around line 62, the brand-color assignment around lines 69-78, and the logo download around lines 93-95. Note the exact line numbers — they will be the basis for the edits below. If the structure has drifted significantly, stop and re-read the spec's Component Spec 4 section before continuing.

- [ ] **Step 2: Write the failing orchestrator tier tests**

Open `workers/crawler/tests/orchestrator.test.ts`. The existing file mocks the input shape `{ runPlaywright, runScreenshotOne, runCheerio, downloadLogo, uploader, ... }`. Add a new `describe` block at the end of the file (before the final `});` of the outer scope, or as a sibling describe — match the existing pattern):

```ts
describe('brand color tier chain', () => {
  // Build a base intermediate. Individual tests override fields.
  function makeOpts(overrides: {
    domColor?: string;
    html?: string;
    logoBuf?: Buffer;
  } = {}) {
    return {
      url: 'https://example.com',
      jobId: 'test-job-1',
      runPlaywright: async () => ({
        kind: 'ok' as const,
        html: overrides.html ?? '<html></html>',
        sourceTexts: ['hello'],
        features: [],
        reviews: [],
        viewportScreenshot: Buffer.from('viewport'),
        fullPageScreenshot: Buffer.from('full'),
        logoSrcCandidates: [],
        codeSnippets: [],
        colors: overrides.domColor ? { primary: overrides.domColor } : {},
        logoCandidate: overrides.logoBuf ? { src: 'https://example.com/logo.png', alt: 'logo', widthPx: 100, source: 'img-alt' as const } : undefined,
      }),
      runScreenshotOne: async () => ({ kind: 'error' as const, message: 'not used' }),
      runCheerio: async () => ({ kind: 'error' as const, message: 'not used' }),
      downloadLogo: async () => overrides.logoBuf ?? Buffer.alloc(0),
      uploader: async () => 's3://bucket/key' as any,
      rescueEnabled: false,
    };
  }

  it('tier 0 wins when DOM sampler returns a color', async () => {
    const opts = makeOpts({ domColor: '#58cc02' });
    const result = await runCrawl(opts);
    expect(result.brand.primaryColor).toBe('#58cc02');
  });

  it('tier 1 wins when DOM is empty and HTML has meta theme-color', async () => {
    const html = '<html><head><meta name="theme-color" content="#abcdef"></head></html>';
    const opts = makeOpts({ html });
    const result = await runCrawl(opts);
    expect(result.brand.primaryColor).toBe('#abcdef');
  });

  it('tier 2 wins when DOM and meta are empty but logo provides a color', async () => {
    // 64x64 solid green PNG (Sharp will return ~#58cc02)
    const sharp = (await import('sharp')).default;
    const logoBuf = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 88, g: 204, b: 2 } },
    }).png().toBuffer();
    const opts = makeOpts({ html: '<html></html>', logoBuf });
    const result = await runCrawl(opts);
    expect(result.brand.primaryColor).toBeDefined();
    // Sharp returns ~#58cc02 within ±2 per channel.
    const r = parseInt(result.brand.primaryColor!.slice(1, 3), 16);
    const g = parseInt(result.brand.primaryColor!.slice(3, 5), 16);
    const b = parseInt(result.brand.primaryColor!.slice(5, 7), 16);
    expect(Math.abs(r - 88)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - 204)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - 2)).toBeLessThanOrEqual(2);
  });

  it('tier 3 (default) wins when all upstream tiers return nothing', async () => {
    const opts = makeOpts({ html: '<html></html>' }); // no DOM color, no theme-color, no logo
    const result = await runCrawl(opts);
    expect(result.brand.primaryColor).toBe('#4f46e5'); // DEFAULT_BRAND_COLOR
    // The fallback should also be recorded.
    expect(result.fallbacks.some((f) => f.field === 'primaryColor')).toBe(true);
  });

  it('vercel-style minimalist brand returns neutral via tier 0 (regression for soft-neutral)', async () => {
    // Soft-neutral preference means a single neutral candidate is now valid.
    // Combined with the tier chain, vercel-style sites should get #000 from
    // tier 0 (or tier 1 / tier 2 if DOM sampler somehow misses it).
    const opts = makeOpts({ domColor: '#000000' });
    const result = await runCrawl(opts);
    expect(result.brand.primaryColor).toBe('#000000');
    expect(result.brand.primaryColor).not.toBe('#4f46e5'); // explicitly NOT default
  });
});
```

- [ ] **Step 3: Run tests to verify all 5 fail**

Run: `pnpm --filter @lumespec/worker-crawler test orchestrator`

Expected: at least 4 of the 5 new tests fail (tier 0 may pass since DOM source already wins). Specifically tier 1 + tier 2 fail because the orchestrator doesn't yet call the new extractors; tier 3 may pass already (existing default-fallback path); the vercel regression test passes if T1 already merged the soft-neutral change (which it should have — T1 ships before T4).

- [ ] **Step 4: Hoist logo download + insert tier chain in orchestrator.ts**

In `workers/crawler/src/orchestrator.ts`, two structural changes:

**4a. Add the new imports** at the top of the file (after the existing imports):

```ts
import { extractThemeColorFromHtml } from './extractors/themeColorFromHtml.js';
import { extractDominantColorFromImage } from './extractors/colorFromImage.js';
```

**4b. Hoist the logo download to BEFORE the brand block.** Find the current logo block (around lines 93-95):

```ts
if (intermediate.logo) {
  const bytes = await input.downloadLogo(intermediate.logo.src);
  // ... existing logo upload logic
```

Move the `const bytes = await input.downloadLogo(...)` portion to BEFORE the `const brand = { ... }` declaration. Capture the buffer in a top-level scope variable (let `logoBuf: Buffer | undefined`) so both the brand block and the existing logo upload block can use it.

The structure should become:

```ts
// 1. Pick a track (existing)
const intermediate = await pickTrack(input, fallbacks);

// 2. Hoisted: download logo buffer up-front (used by brand color tier 2 + by
//    the existing logo upload block below). downloadLogo returns
//    Promise<Buffer | null>; null means HTTP succeeded but body was empty.
//    Coerce null to undefined for cleaner downstream checks.
let logoBuf: Buffer | undefined;
if (intermediate.logo) {
  try {
    const result = await input.downloadLogo(intermediate.logo.src);
    logoBuf = result ?? undefined;
  } catch {
    // Network / unexpected error — non-fatal. Tier 2 skips and falls through.
    logoBuf = undefined;
  }
}

// 3. Screenshots upload (existing — unchanged)
// ...

// 4. NEW: brand-color 3-tier fallback chain
const brand: { primaryColor?: string; secondaryColor?: string; logoUrl?: S3Uri; fontFamily?: string; fontFamilySupported?: boolean } = {};
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

// Tier 2: logo image dominant color
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

// Per-tier observability — grep-able from worker stdout by jobId.
console.log(`[crawler] brand color tier=${primarySource} value=${primaryColor} jobId=${input.jobId}`);

if (intermediate.colors.secondary) brand.secondaryColor = intermediate.colors.secondary;
// ... rest of the brand block (font, etc.) unchanged

// 5. Existing logo upload block — modified to use the hoisted logoBuf instead
//    of re-downloading. PRESERVE the existing fallback push semantics: the
//    pre-T4 code pushes specific fallback entries for "download failed",
//    "no logo candidate", etc. Those entries must still be pushed at the
//    same logical decision points after refactoring.
if (intermediate.logo) {
  if (logoBuf) {
    brand.logoUrl = await input.uploader(logoBuf, 'logo.img');
  } else {
    fallbacks.push({
      field: 'logoUrl',
      reason: 'download failed or empty',
      replacedWith: 'domain-initial generated logo at render time',
    });
  }
} else {
  fallbacks.push({
    field: 'logoUrl',
    reason: 'no logo candidate found',
    replacedWith: 'domain-initial generated logo at render time',
  });
}
```

**Verification step before commit**: diff the orchestrator's pre-T4 fallbacks-push behavior against post-T4 — the SAME 2 fallback messages for logoUrl must still appear at the same logical conditions. The only structural difference should be that download is now upstream of brand-color extraction. If you accidentally drop a fallbacks.push, the orchestrator's downstream consumers (storyboard worker fallback handling) will silently miss the signal.

**Important**: this is a structural rewrite of the brand-and-logo region of the orchestrator. Read the entire current function body carefully before editing — preserve all behaviors not explicitly mentioned (font handling, secondary color, fallbacks tracking for logo, etc.).

- [ ] **Step 5: Remove theme-color extraction from cheerioTrack**

In `workers/crawler/src/tracks/cheerioTrack.ts`, remove the now-redundant theme-color extraction at lines 51-52:

```ts
// DELETE these two lines:
const themeColor = $('meta[name="theme-color"]').attr('content');
const primary = themeColor && /^#[0-9a-f]{6}$/i.test(themeColor) ? themeColor : undefined;
```

And update the result construction at line 62 to remove the `colors` field (it now always returns empty — the orchestrator's tier 1 handles theme-color regardless of which track produced the HTML):

```ts
// BEFORE:
colors: primary ? { primary } : {},

// AFTER (delete the line entirely — colors field is no longer set by cheerio):
```

Update the `CheerioTrackResult` type (lines 9-23) to remove the `colors` field from the success variant, OR leave the field but make it optional and always empty — your choice based on type-system ergonomics. Either is correct.

- [ ] **Step 6: Run all crawler tests to verify everything still works**

Run: `pnpm --filter @lumespec/worker-crawler test`

Expected: all crawler tests pass, including the 5 new tier tests from Step 2. If the cheerioTrack tests fail because they were asserting on the removed `colors` field, update those assertions — the field is intentionally gone.

Also run typecheck:

```bash
pnpm --filter @lumespec/worker-crawler typecheck
```

Expected: clean. If `CheerioTrackResult` consumers complain about the removed field, those callers also need updating — but since nothing besides the orchestrator consumed it, only one place should need a touch.

- [ ] **Step 7: Update workers/crawler/DESIGN.md**

Read the current DESIGN.md to find the right insertion point:

```bash
grep -n "## 模組職責\|^### " workers/crawler/DESIGN.md
```

In the Responsibilities (`## 模組職責`) section, find the bullet about brand color extraction (if any) and update it to reflect the new tier chain. If no such bullet exists, add one. Use this exact text:

> - **Brand color tier chain** — primary brand color is resolved by a 3-tier fallback in `orchestrator.ts`: (Tier 0) DOM `background-color` sampling via `colorSampler.pickDominantFromFrequencies` with soft-neutral preference; (Tier 1) `<meta name="theme-color">` extraction via `extractThemeColorFromHtml` on whichever track produced the HTML; (Tier 2) Sharp `.stats().dominant` on the downloaded logo buffer via `extractDominantColorFromImage`; (Tier 3) `DEFAULT_BRAND_COLOR` constant. Per-tier source is logged to worker stdout for observability.

Then add a new section under `## 🚫 反模式 (Anti-Patterns)` documenting why we're NOT doing certain things:

> ### N. 在 track 層做跨 track 共通的 brand-color 推導
> Tracks (`playwrightTrack`, `cheerioTrack`, `screenshotOneTrack`) should produce raw observations from one data source each. Cross-cutting "synthesize a brand color from any signal" logic belongs in the orchestrator, where the tier chain composes them. Putting `<meta theme-color>` extraction in cheerioTrack (the pre-2026-04-28 design) made it dead code on the happy path because pickTrack is a fallback chain, not a merge — playwright always wins, cheerio never runs. The orchestrator-level chain runs against `intermediate.html` regardless of which track produced it.

(Replace `N.` with the next available anti-pattern number — check the existing list and increment.)

- [ ] **Step 8: Run typecheck once more after DESIGN.md update**

DESIGN.md changes don't affect typecheck, but it's worth confirming nothing else slipped:

```bash
pnpm typecheck
```

Expected: clean across all packages.

- [ ] **Step 9: Commit**

The DESIGN.md sync hook does NOT trigger for `workers/crawler/src/orchestrator.ts` or `workers/crawler/src/tracks/cheerioTrack.ts` (only `index.ts`, `circuitBreaker.ts`, or `package.json` trigger). However, since this commit DOES update DESIGN.md (correctly, voluntarily), the hook would just verify and pass. Plain commit:

```bash
git add workers/crawler/src/orchestrator.ts workers/crawler/src/tracks/cheerioTrack.ts workers/crawler/tests/orchestrator.test.ts workers/crawler/DESIGN.md
git commit -m "$(cat <<'EOF'
feat(crawler): wire 3-tier brand color fallback in orchestrator (Bug #1)

Composes the three extractors built in T1-T3 into a tier chain:
  tier 0  DOM background-color sampling (soft-neutral, T1)
  tier 1  <meta name=theme-color>       (themeColorFromHtml, T2)
  tier 2  logo image dominant color      (colorFromImage, T3)
  tier 3  DEFAULT_BRAND_COLOR             (existing constant)

Hoists logo download to before the brand block so tier 2 can consume
the buffer (single download, used by both brand color extraction AND
the existing logo upload).

Removes the now-redundant <meta theme-color> extraction from
cheerioTrack — that path was dead code on the happy path because
pickTrack is fallback, not merge. The orchestrator-level tier 1
runs against intermediate.html regardless of which track produced
it, so theme-color signal is now actually used.

Per-tier observability: each crawl logs `[crawler] brand color
tier=... value=... jobId=...` to worker stdout. After deploy, grep
prod logs to verify which tiers are firing — tier=default-fallback
indicates a remaining gap; tier=dom-sampling vs logo-pixel-analysis
distribution shows where the value is coming from.

Updates workers/crawler/DESIGN.md with the new Responsibility entry
and a new anti-pattern documenting why per-track theme-color
extraction was wrong.

Closes Bug #1 from docs/dev-notes/intent-spectrum-2026-04-27.md.
Component Spec 4 of docs/superpowers/specs/2026-04-28-brand-color-
tiered-fallback-design.md.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Push all 4 task commits to origin**

```bash
git push origin main
```

Expected: 4 commits land on origin/main (T1 colorSampler, T2 themeColorFromHtml, T3 colorFromImage + sharp dep, T4 orchestrator wiring).

---

## Post-Merge Verification (NOT a TDD task — operator action)

After all 4 tasks merge, re-run the intent-spectrum diagnostic against the original 3 URLs to confirm the fix works end-to-end:

```bash
DOGFOOD_USER_ID=28 INCLUDE_CELLS=vercel:hardsell,vercel:tech,vercel:emotional,duolingo:hardsell,duolingo:tech,duolingo:emotional node scripts/intent-spectrum-eval.mjs
```

(Skip patagonia — its failure is downstream of Bug #2.)

Expected outcomes:
- **Vercel**: brandColor = a neutral hex (`#000000` or `#fafafa` or similar) via tier 0 (soft-neutral) or tier 1 (meta theme-color)
- **Duolingo**: brandColor = a green hex close to `#58cc02` via tier 2 (logo pixel analysis), since their DOM sampling didn't catch it pre-fix

Worker stdout should show per-tier observability lines for each job. If any job logs `tier=default-fallback`, that's a Bug #1 gap to investigate (likely needs a follow-up: VLM tier 4, or specific extractor bug).

---

## Self-Review

Spec coverage: T1 maps to Component Spec 1 (soft-neutral). T2 maps to Component Spec 2 (themeColorFromHtml). T3 maps to Component Spec 3 (colorFromImage + Sharp + fixtures). T4 maps to Component Spec 4 (orchestrator wiring + DESIGN.md). The "Out of Scope" deferrals (Bug #2, Bug #3, VLM, Manifest, secondary refinement) are acknowledged in the spec and not implemented here — correct.

Placeholder scan: searched for "TBD", "TODO", "implement later", "appropriate", "fill in" — none present. Every code block is concrete.

Type consistency: `extractThemeColorFromHtml(html: string): string | undefined` is consistent across T2 (definition) and T4 (call site). `extractDominantColorFromImage(buf: Buffer): Promise<string | undefined>` is consistent across T3 (definition) and T4 (call site). `pickDominantFromFrequencies` keeps its signature in T1 (only body changes). The `CheerioTrackResult` `colors` field removal is consistently called out in T4 step 5 + step 6 (consumer update note).

External-facing things checked: Sharp `.stats().dominant` returns `{ r, g, b }` on the `DominantPaletteColors`-like shape — confirmed via Sharp docs and the existing usage pattern in workers/render. Vitest `import('sharp')` for the dynamic import in the orchestrator test works under Vitest's ESM mode (apps/* and workers/* all use `"type": "module"`). The `jobId` field on the orchestrator's `input` parameter — verified it exists by checking the `CrawlRunnerInput` shape during planning (it's used by the existing logo download codepath).
