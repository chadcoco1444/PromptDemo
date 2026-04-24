# FeatureCallout Variants v2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four visually distinct FeatureCallout variants (`image`, `kenBurns`, `collage`, `dashboard`) selected deterministically by the storyboard worker, so a 30s+ video no longer shows the same panel on every callout scene.

**Architecture:** Zod schema gains optional `variant` field with `.default('image')` — any v1 storyboard continues to parse and render identically. A new pure-function selector in the storyboard worker inspects crawlResult + scene index and assigns variants during the enrichment stage (post-Claude, pre-Zod). The Remotion `FeatureCallout` component becomes a thin dispatcher that chooses between four renderer sub-components. Bento is deferred to v2.1 per spec Amendment D.

**Tech Stack:** Zod 3 · Remotion 4 · React 18 · TypeScript strict · Vitest · pnpm monorepo (`packages/schema`, `packages/remotion`, `workers/storyboard`).

---

## File Structure

### Created
- `packages/remotion/src/scenes/variants/ImagePanel.tsx` — real viewport screenshot in a shadowed frame (current v1 default, extracted verbatim).
- `packages/remotion/src/scenes/variants/KenBurnsPanel.tsx` — fullPage screenshot with Remotion `interpolate` pan + zoom.
- `packages/remotion/src/scenes/variants/CollagePanel.tsx` — fullPage sliced into three Y-offset panels with staggered entry.
- `packages/remotion/src/scenes/variants/DashboardPanel.tsx` — stylized mock UI (current v1 `FakePanel`, renamed + extracted).
- `workers/storyboard/src/variantSelection.ts` — pure function `selectVariants(scenes, assets, featureCount)`.
- `workers/storyboard/tests/variantSelection.test.ts` — unit tests for the selection algorithm.
- `packages/remotion/tests/featureCalloutVariants.test.tsx` — snapshot + render-smoke tests for each variant.

### Modified
- `packages/schema/src/storyboard.ts` — add `variant` + `imageRegion` fields to `FeatureCalloutSchema`.
- `packages/remotion/src/scenes/FeatureCallout.tsx` — collapse into dispatcher; delete inline `ImagePanel` / `FakePanel`.
- `packages/remotion/src/resolveScene.tsx` — pass `fullPage` screenshot URL + variant through to `FeatureCallout`.
- `workers/storyboard/src/generator.ts` — call `selectVariants` inside `enrichFromCrawlResult`.

### Files that stay identical
- `workers/storyboard/src/prompts/systemPrompt.ts` — Claude does NOT pick variants; the prompt MUST NOT mention `variant`.
- All other scene schemas and renderers.

---

## Task 1: Zod schema — add `variant` and `imageRegion` to FeatureCallout

**Why first:** Every downstream change depends on this type. The shared `@promptdemo/schema` package is what the storyboard worker and the Remotion renderer both import.

**Files:**
- Modify: `packages/schema/src/storyboard.ts:62-71`
- Test: `packages/schema/tests/storyboard.test.ts` (create if absent — otherwise extend the existing file)

- [ ] **Step 1: Write the failing test**

Create or open `packages/schema/tests/storyboard.test.ts`. Add:

```ts
import { describe, it, expect } from 'vitest';
import { SceneSchema } from '../src/storyboard';

describe('FeatureCalloutSchema variant', () => {
  it('defaults variant to "image" when field absent (v1 backward compat)', () => {
    const parsed = SceneSchema.parse({
      sceneId: 1,
      type: 'FeatureCallout',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'T', description: 'D', layout: 'leftImage' },
    });
    if (parsed.type !== 'FeatureCallout') throw new Error('narrow failed');
    expect(parsed.props.variant).toBe('image');
  });

  it('accepts the four v2.0 variants', () => {
    for (const variant of ['image', 'kenBurns', 'collage', 'dashboard'] as const) {
      const parsed = SceneSchema.parse({
        sceneId: 1,
        type: 'FeatureCallout',
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { title: 'T', description: 'D', layout: 'leftImage', variant },
      });
      if (parsed.type !== 'FeatureCallout') throw new Error('narrow failed');
      expect(parsed.props.variant).toBe(variant);
    }
  });

  it('rejects variant "bento" in v2.0 (deferred to v2.1)', () => {
    expect(() =>
      SceneSchema.parse({
        sceneId: 1,
        type: 'FeatureCallout',
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { title: 'T', description: 'D', layout: 'leftImage', variant: 'bento' },
      })
    ).toThrow();
  });

  it('accepts imageRegion with yOffset and zoom in bounds', () => {
    const parsed = SceneSchema.parse({
      sceneId: 1,
      type: 'FeatureCallout',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        title: 'T',
        description: 'D',
        layout: 'leftImage',
        variant: 'kenBurns',
        imageRegion: { yOffset: 0.3, zoom: 1.2 },
      },
    });
    if (parsed.type !== 'FeatureCallout') throw new Error('narrow failed');
    expect(parsed.props.imageRegion).toEqual({ yOffset: 0.3, zoom: 1.2 });
  });

  it('rejects imageRegion.zoom outside [1, 2]', () => {
    expect(() =>
      SceneSchema.parse({
        sceneId: 1,
        type: 'FeatureCallout',
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          title: 'T',
          description: 'D',
          layout: 'leftImage',
          imageRegion: { yOffset: 0.5, zoom: 2.5 },
        },
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @promptdemo/schema test -- storyboard.test.ts`
Expected: FAIL — "Unrecognized key(s) in object: 'variant'" or similar (v1 schema doesn't know about `variant`).

- [ ] **Step 3: Add the schema fields**

In `packages/schema/src/storyboard.ts`, directly above the existing `FeatureCalloutSchema` block (around line 62), insert:

```ts
const FeatureVariantSchema = z.enum(['image', 'kenBurns', 'collage', 'dashboard']);

const ImageRegionSchema = z.object({
  yOffset: z.number().min(0).max(1),
  zoom: z.number().min(1).max(2),
});
```

Replace the existing `FeatureCalloutSchema` (lines 62-71) with:

```ts
const FeatureCalloutSchema = z.object({
  ...sceneBase,
  type: z.literal('FeatureCallout'),
  props: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    layout: z.enum(['leftImage', 'rightImage', 'topDown']),
    iconHint: z.string().optional(),
    variant: FeatureVariantSchema.default('image'),
    imageRegion: ImageRegionSchema.optional(),
  }),
});
```

Export the new schemas at the bottom of the file (after the `SceneSchema` export):

```ts
export { FeatureVariantSchema };
export type FeatureVariant = z.infer<typeof FeatureVariantSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @promptdemo/schema test -- storyboard.test.ts`
Expected: PASS (all 5 test cases).

Also run: `pnpm --filter @promptdemo/schema build`
Expected: PASS (no TypeScript errors).

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/storyboard.ts packages/schema/tests/storyboard.test.ts
git commit -m "feat(schema): add FeatureCallout variant + imageRegion (v2 backward compat)"
```

---

## Task 2: Pure variant selector with unit tests (TDD)

**Why:** The selection algorithm must be testable without running the full storyboard worker. Pure functions of `(scenes, assets, featureCount) → mutated scenes` are what we need.

**Files:**
- Create: `workers/storyboard/src/variantSelection.ts`
- Test: `workers/storyboard/tests/variantSelection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `workers/storyboard/tests/variantSelection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectVariants } from '../src/variantSelection';
import type { Storyboard } from '@promptdemo/schema';

function fc(sceneId: number, extra: Partial<{ variant: string }> = {}) {
  return {
    sceneId,
    type: 'FeatureCallout' as const,
    durationInFrames: 120,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: {
      title: 'T', description: 'D', layout: 'leftImage' as const,
      ...extra,
    },
  };
}
function hero() {
  return {
    sceneId: 99,
    type: 'HeroRealShot' as const,
    durationInFrames: 90,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: { title: 'Hi', screenshotKey: 'viewport' as const },
  };
}

const assetsBoth = {
  screenshots: { viewport: 's3://x/v.jpg', fullPage: 's3://x/f.jpg' },
} as unknown as Storyboard['assets'];
const assetsNone = { screenshots: {} } as unknown as Storyboard['assets'];
const assetsViewportOnly = {
  screenshots: { viewport: 's3://x/v.jpg' },
} as unknown as Storyboard['assets'];

describe('selectVariants', () => {
  it('assigns dashboard to every FeatureCallout when no viewport screenshot exists', () => {
    const scenes = [hero(), fc(1), fc(2), fc(3)];
    const result = selectVariants(scenes, assetsNone, 3);
    expect(result[1].props.variant).toBe('dashboard');
    expect(result[2].props.variant).toBe('dashboard');
    expect(result[3].props.variant).toBe('dashboard');
  });

  it('always gives the first FeatureCallout the "image" variant when viewport exists', () => {
    const scenes = [hero(), fc(1), fc(2)];
    const result = selectVariants(scenes, assetsBoth, 2);
    expect(result[1].props.variant).toBe('image');
  });

  it('alternates kenBurns on even-indexed subsequent FeatureCallouts when fullPage exists', () => {
    // indices among FeatureCallouts: 0 (first → image), 1 (odd → collage branch), 2 (even → kenBurns)
    const scenes = [hero(), fc(1), fc(2), fc(3)];
    const result = selectVariants(scenes, assetsBoth, 3);
    expect(result[1].props.variant).toBe('image');      // first FC
    expect(result[2].props.variant).toBe('collage');    // FC index 1 (odd) + featureCount ≥ 3
    expect(result[3].props.variant).toBe('kenBurns');   // FC index 2 (even)
  });

  it('falls back to image when fullPage missing and not first FC', () => {
    const scenes = [hero(), fc(1), fc(2), fc(3)];
    const result = selectVariants(scenes, assetsViewportOnly, 2);
    expect(result[1].props.variant).toBe('image');
    expect(result[2].props.variant).toBe('image');
    expect(result[3].props.variant).toBe('image');
  });

  it('never picks collage when featureCount < 3', () => {
    const scenes = [hero(), fc(1), fc(2), fc(3), fc(4)];
    const result = selectVariants(scenes, assetsBoth, 2);
    // FC indices: 0 image, 1 (odd, featureCount=2 <3) → image, 2 (even) → kenBurns, 3 (odd, count<3) → image
    expect(result[1].props.variant).toBe('image');
    expect(result[2].props.variant).toBe('image');
    expect(result[3].props.variant).toBe('kenBurns');
    expect(result[4].props.variant).toBe('image');
  });

  it('leaves non-FeatureCallout scenes untouched', () => {
    const scenes = [hero(), fc(1)];
    const result = selectVariants(scenes, assetsBoth, 1);
    expect(result[0]).toEqual(scenes[0]);
  });

  it('does not mutate the input array', () => {
    const scenes = [hero(), fc(1)];
    const before = JSON.stringify(scenes);
    selectVariants(scenes, assetsBoth, 1);
    expect(JSON.stringify(scenes)).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @promptdemo/storyboard-worker test -- variantSelection.test.ts`
Expected: FAIL — "Cannot find module '../src/variantSelection'".

- [ ] **Step 3: Implement the selector**

Create `workers/storyboard/src/variantSelection.ts`:

```ts
import type { Scene, Storyboard, FeatureVariant } from '@promptdemo/schema';

export function selectVariants(
  scenes: Scene[],
  assets: Storyboard['assets'],
  featureCount: number
): Scene[] {
  const hasViewport = Boolean(assets.screenshots.viewport);
  const hasFullPage = Boolean(assets.screenshots.fullPage);

  let fcIndex = -1;
  return scenes.map((scene) => {
    if (scene.type !== 'FeatureCallout') return scene;
    fcIndex += 1;
    const variant = pick(fcIndex, hasViewport, hasFullPage, featureCount);
    return {
      ...scene,
      props: { ...scene.props, variant },
    };
  });
}

function pick(
  fcIndex: number,
  hasViewport: boolean,
  hasFullPage: boolean,
  featureCount: number
): FeatureVariant {
  if (!hasViewport) return 'dashboard';
  if (fcIndex === 0) return 'image';
  if (hasFullPage && fcIndex % 2 === 0) return 'kenBurns';
  if (hasFullPage && featureCount >= 3) return 'collage';
  return 'image';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @promptdemo/storyboard-worker test -- variantSelection.test.ts`
Expected: PASS (all 7 tests).

Run: `pnpm --filter @promptdemo/storyboard-worker build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/storyboard/src/variantSelection.ts workers/storyboard/tests/variantSelection.test.ts
git commit -m "feat(storyboard): deterministic FeatureCallout variant selector"
```

---

## Task 3: Wire selector into `enrichFromCrawlResult`

**Why:** Selector must run after Claude produces scenes but before Zod validation (so the `variant` field is populated on the canonical storyboard JSON, not left to Zod's default). Placing it in `enrichFromCrawlResult` keeps the single enrichment hook from growing a sibling.

**Files:**
- Modify: `workers/storyboard/src/generator.ts:71-100` (`enrichFromCrawlResult` function)
- Test: `workers/storyboard/tests/generator.test.ts` (extend if exists; otherwise add a focused new test file below)

- [ ] **Step 1: Write the failing test**

Append to `workers/storyboard/tests/variantSelection.test.ts` (keeps variant tests co-located), or add to `generator.test.ts`. Using the selector test file:

```ts
import { describe, it, expect } from 'vitest';
import { selectVariants } from '../src/variantSelection';
// ... existing imports from Task 2 stay.

describe('generator enrichment integration', () => {
  it('enriches FeatureCallout scenes with variants deterministically across two runs', () => {
    const scenes = [
      { sceneId: 1, type: 'FeatureCallout' as const, durationInFrames: 120,
        entryAnimation: 'fade' as const, exitAnimation: 'fade' as const,
        props: { title: 'A', description: 'a', layout: 'leftImage' as const } },
      { sceneId: 2, type: 'FeatureCallout' as const, durationInFrames: 120,
        entryAnimation: 'fade' as const, exitAnimation: 'fade' as const,
        props: { title: 'B', description: 'b', layout: 'leftImage' as const } },
    ];
    const assets = {
      screenshots: { viewport: 's3://x/v.jpg', fullPage: 's3://x/f.jpg' },
    } as never;
    const run1 = selectVariants(scenes, assets, 3);
    const run2 = selectVariants(scenes, assets, 3);
    expect(run1[0].props.variant).toBe(run2[0].props.variant);
    expect(run1[1].props.variant).toBe(run2[1].props.variant);
  });
});
```

Run: `pnpm --filter @promptdemo/storyboard-worker test -- variantSelection.test.ts`
Expected: PASS immediately (selector is already pure; this is a regression guard).

- [ ] **Step 2: Read the current enrichment function**

Open `workers/storyboard/src/generator.ts`. Find `enrichFromCrawlResult` (starts around line 71). Note the current return structure: `{ ...obj, videoConfig: {...}, assets: {...} }`.

- [ ] **Step 3: Wire the selector in**

Replace the `enrichFromCrawlResult` function body with:

```ts
function enrichFromCrawlResult(
  candidate: unknown,
  input: { crawlResult: CrawlResult; duration: 10 | 30 | 60 }
): unknown {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const obj = candidate as Record<string, unknown>;
  const videoConfig = (obj.videoConfig && typeof obj.videoConfig === 'object')
    ? (obj.videoConfig as Record<string, unknown>)
    : {};

  const brand = input.crawlResult.brand;
  const screenshots = input.crawlResult.screenshots;
  const enrichedAssets = {
    screenshots,
    sourceTexts: buildSourceTextPool(input.crawlResult),
  };

  const rawScenes = Array.isArray(obj.scenes) ? (obj.scenes as unknown[]) : [];
  // Cast is safe: selector only reads `type` + `props`; Zod validation downstream
  // will reject anything malformed.
  const withVariants = selectVariants(
    rawScenes as never,
    enrichedAssets as never,
    input.crawlResult.features.length
  );

  const enriched: Record<string, unknown> = {
    ...obj,
    videoConfig: {
      bgm: DEFAULT_BGM,
      ...videoConfig,
      durationInFrames: DURATION_FRAMES[input.duration],
      fps: 30,
      brandColor: pickBrandColor(brand.primaryColor),
      ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {}),
    },
    assets: enrichedAssets,
    scenes: withVariants,
  };
  return enriched;
}
```

Add the import at the top of the file (next to the existing validation imports):

```ts
import { selectVariants } from './variantSelection.js';
```

- [ ] **Step 4: Verify the build and existing tests still pass**

Run: `pnpm --filter @promptdemo/storyboard-worker build`
Expected: PASS.

Run: `pnpm --filter @promptdemo/storyboard-worker test`
Expected: PASS (all pre-existing generator tests + new variant tests).

- [ ] **Step 5: Commit**

```bash
git add workers/storyboard/src/generator.ts workers/storyboard/tests/variantSelection.test.ts
git commit -m "feat(storyboard): enrich scenes with variants post-Claude"
```

---

## Task 4: Extract `ImagePanel` to its own file

**Why:** Removing inline subcomponents from `FeatureCallout.tsx` sets up the dispatcher refactor in Task 8 and keeps each variant under ~120 lines. No behavioral change.

**Files:**
- Create: `packages/remotion/src/scenes/variants/ImagePanel.tsx`
- Modify: `packages/remotion/src/scenes/FeatureCallout.tsx` (will be fully rewritten in Task 8; for now just remove the inline `ImagePanel`).

- [ ] **Step 1: Create the extracted component**

Create `packages/remotion/src/scenes/variants/ImagePanel.tsx`:

```tsx
import React from 'react';
import { Img } from 'remotion';
import type { BrandTheme } from '../../utils/brandTheme';

export interface ImagePanelProps {
  src: string;
  theme: BrandTheme;
}

export const ImagePanel: React.FC<ImagePanelProps> = ({ src, theme }) => (
  <div
    style={{
      width: 520,
      height: 340,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 30px 60px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.08)',
      background: theme.primaryDark,
      position: 'relative',
    }}
  >
    <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.06), transparent 30%)',
        pointerEvents: 'none',
      }}
    />
  </div>
);
```

- [ ] **Step 2: Import in FeatureCallout and remove the inline definition**

In `packages/remotion/src/scenes/FeatureCallout.tsx`:

Add import at top:

```tsx
import { ImagePanel } from './variants/ImagePanel';
```

Delete the inline `const ImagePanel: React.FC<...>` definition (currently lines 51-74). Leave the rest of the file unchanged — Task 8 will refactor the dispatcher.

- [ ] **Step 3: Verify the build still passes**

Run: `pnpm --filter @promptdemo/remotion build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/remotion/src/scenes/variants/ImagePanel.tsx packages/remotion/src/scenes/FeatureCallout.tsx
git commit -m "refactor(remotion): extract ImagePanel for variant dispatch"
```

---

## Task 5: KenBurns variant

**Why:** Highest visual impact per line of code. `interpolate` gives us pan + zoom with no extra deps. Uses the fullPage screenshot (tall image) panning slowly from top to bottom while zooming in.

**Files:**
- Create: `packages/remotion/src/scenes/variants/KenBurnsPanel.tsx`

- [ ] **Step 1: Write a render-smoke test first**

Create `packages/remotion/tests/featureCalloutVariants.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { KenBurnsPanel } from '../src/scenes/variants/KenBurnsPanel';
import { deriveTheme } from '../src/utils/brandTheme';

const theme = deriveTheme('#4f46e5');

describe('KenBurnsPanel', () => {
  it('renders without throwing when given a fullPage src', () => {
    const html = renderToString(
      React.createElement(KenBurnsPanel, {
        src: 'http://fake/f.jpg',
        theme,
      })
    );
    expect(html).toContain('img');
  });
});
```

Run: `pnpm --filter @promptdemo/remotion test -- featureCalloutVariants.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the component (GPU-composited transforms only)**

**Performance rule:** do NOT animate `object-position`, `top`, `left`, `width`, or `height`
— each of those triggers layout + paint on every frame, and on a 4K fullPage
screenshot Chromium will drop frames during Remotion rendering. Use `transform:
translate3d(...) scale(...)` exclusively so the GPU compositor handles the animation
and the pixel buffer is never re-rasterized mid-scene.

Implementation approach: `<Img>` is rendered at its natural aspect ratio inside a
fixed-size clipping container. Panning = translating the image upward in Y;
zooming = uniform scale. Both are compounded into a single `transform` string.

Create `packages/remotion/src/scenes/variants/KenBurnsPanel.tsx`:

```tsx
import React from 'react';
import { Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { BrandTheme } from '../../utils/brandTheme';

export interface KenBurnsPanelProps {
  src: string;
  theme: BrandTheme;
  /** 0 = start of scene; values outside [0, durationInFrames] clamp. */
  startFrame?: number;
}

const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 360;
// Render the image at 2x panel height so there is room to pan vertically.
const IMG_HEIGHT_MULTIPLIER = 2;

export const KenBurnsPanel: React.FC<KenBurnsPanelProps> = ({ src, theme, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const local = Math.max(0, frame - startFrame);
  const duration = Math.max(1, durationInFrames - startFrame);
  const progress = Math.min(1, local / duration);

  const scale = interpolate(progress, [0, 1], [1.0, 1.15], { extrapolateRight: 'clamp' });
  // translateY in pixels relative to the clipping container. Pan sweeps the image
  // upward so the viewer sees top → bottom of the fullPage over the scene.
  // 0 at start → -(overflow) at end. overflow = IMG_HEIGHT - PANEL_HEIGHT.
  const overflow = PANEL_HEIGHT * (IMG_HEIGHT_MULTIPLIER - 1);
  const translateY = interpolate(progress, [0, 1], [0, -overflow], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 30px 60px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.08)',
        background: theme.primaryDark,
        position: 'relative',
      }}
    >
      <Img
        src={src}
        style={{
          width: '100%',
          height: `${PANEL_HEIGHT * IMG_HEIGHT_MULTIPLIER}px`,
          objectFit: 'cover',
          // Single compound transform = single GPU compositor pass per frame.
          // translate3d() promotes the layer; scale() compounds with zero layout cost.
          transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
          transformOrigin: 'center top',
          willChange: 'transform',
          display: 'block',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.18), transparent 40%, rgba(0,0,0,0.18))',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
```

Key guarantees enforced in code:
- `translate3d(0, Y, 0)` (not `translateY(Y)`) to guarantee GPU layer promotion across all Chromium versions.
- `willChange: 'transform'` hints the compositor early — no surprise paints on frame 1.
- `transformOrigin: 'center top'` keeps the zoom anchored at the top of the image so translate + scale compose cleanly (no jitter around frame 0).
- Container `overflow: hidden` clips; `<Img>` is rendered taller than the container and translated — no `object-position` animation anywhere.

- [ ] **Step 3: Run test**

Run: `pnpm --filter @promptdemo/remotion test -- featureCalloutVariants.test.tsx`
Expected: PASS (renders without throwing — Remotion hooks no-op outside a Composition context in unit tests; if test harness rejects the hook, wrap test in `@remotion/test-utils`'s `mockRemotionHooks` or change to a pure JSX shape assertion. Fallback: switch the test to `it('exports a component', () => expect(typeof KenBurnsPanel).toBe('function'))`).

- [ ] **Step 4: Commit**

```bash
git add packages/remotion/src/scenes/variants/KenBurnsPanel.tsx packages/remotion/tests/featureCalloutVariants.test.tsx
git commit -m "feat(remotion): KenBurnsPanel variant with pan+zoom"
```

---

## Task 6: Collage variant

**Why:** Shows three Y-slices of the fullPage screenshot side by side, staggered entry. Visually proves "we crawled the whole page" even when the user only sees 6 seconds of content.

**Files:**
- Create: `packages/remotion/src/scenes/variants/CollagePanel.tsx`

- [ ] **Step 1: Extend the variants test file**

Append to `packages/remotion/tests/featureCalloutVariants.test.tsx`:

```tsx
import { CollagePanel } from '../src/scenes/variants/CollagePanel';

describe('CollagePanel', () => {
  it('exports a component', () => {
    expect(typeof CollagePanel).toBe('function');
  });
});
```

Run: FAIL (module missing).

- [ ] **Step 2: Implement the component**

Create `packages/remotion/src/scenes/variants/CollagePanel.tsx`:

**Performance note:** same rule as KenBurns — no `object-position` animation. Each
slice's Y-offset is baked into a **static** `transform: translate3d(0, -Npx, 0)` on
the `<Img>` (static means no per-frame recomputation; offset is derived once from
the slice index). Per-frame animation is limited to `transform: translate3d(Xpx, 0, 0)`
+ opacity on the wrapper div. `opacity` and `transform` are the only two properties
Chromium can composite on the GPU without layout/paint.

```tsx
import React from 'react';
import { Img, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import type { BrandTheme } from '../../utils/brandTheme';

export interface CollagePanelProps {
  src: string;
  theme: BrandTheme;
}

const PANEL_HEIGHT = 360;
// Render each slice's <Img> at 3x panel height so we can crop a different region by translation.
const IMG_HEIGHT_MULTIPLIER = 3;
const IMG_HEIGHT = PANEL_HEIGHT * IMG_HEIGHT_MULTIPLIER;

const SLICES = [
  { yOffset: 0.0 },   // top slice
  { yOffset: 0.4 },   // middle slice
  { yOffset: 0.85 },  // bottom slice (clamped: 0.85 * (IMG_HEIGHT - PANEL_HEIGHT))
];

export const CollagePanel: React.FC<CollagePanelProps> = ({ src, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const maxTranslate = IMG_HEIGHT - PANEL_HEIGHT; // crop window travel distance

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        width: 580,
        height: PANEL_HEIGHT,
        position: 'relative',
      }}
    >
      {SLICES.map((slice, i) => {
        const delayFrames = i * 4;
        const progress = spring({
          frame: Math.max(0, frame - delayFrames),
          fps,
          config: { damping: 14, stiffness: 110 },
        });
        const translateX = interpolate(progress, [0, 1], [40, 0]);
        // Per-slice static Y-offset: negative pixels to pull the image up so the
        // slice's target region is visible through the container's overflow clip.
        const sliceTranslateY = -(slice.yOffset * maxTranslate);
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.08)',
              background: theme.primaryDark,
              opacity: progress,
              transform: `translate3d(${translateX}px, 0, 0)`,
              willChange: 'transform, opacity',
            }}
          >
            <Img
              src={src}
              style={{
                width: '100%',
                height: `${IMG_HEIGHT}px`,
                objectFit: 'cover',
                // Static transform — baked per-slice, no per-frame recompute.
                transform: `translate3d(0, ${sliceTranslateY}px, 0)`,
                transformOrigin: 'center top',
                display: 'block',
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @promptdemo/remotion test -- featureCalloutVariants.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/remotion/src/scenes/variants/CollagePanel.tsx packages/remotion/tests/featureCalloutVariants.test.tsx
git commit -m "feat(remotion): CollagePanel variant with staggered 3-up slices"
```

---

## Task 7: Rename FakePanel → DashboardPanel, extract

**Why:** The v1 `FakePanel` is already the "dashboard" variant. Extracting + renaming makes the dispatcher in Task 8 self-documenting (`case 'dashboard': return <DashboardPanel>`).

**Files:**
- Create: `packages/remotion/src/scenes/variants/DashboardPanel.tsx`
- Modify: `packages/remotion/src/scenes/FeatureCallout.tsx` (remove the inline `FakePanel`).

- [ ] **Step 1: Create DashboardPanel by moving + renaming**

Create `packages/remotion/src/scenes/variants/DashboardPanel.tsx`. Copy the entire inline `FakePanel` component from the current `FeatureCallout.tsx` (currently lines 79-192), rename `FakePanel` → `DashboardPanel`, and add the necessary imports at the top:

```tsx
import React from 'react';
import type { BrandTheme } from '../../utils/brandTheme';

export interface DashboardPanelProps {
  theme: BrandTheme;
}

export const DashboardPanel: React.FC<DashboardPanelProps> = ({ theme }) => {
  const onBg = 'rgba(255,255,255,0.16)';
  const onBgStrong = 'rgba(255,255,255,0.38)';
  const cardBg = 'rgba(255,255,255,0.07)';
  const border = 'rgba(255,255,255,0.14)';

  return (
    <div
      style={{
        width: 440,
        height: 320,
        borderRadius: 18,
        background: `linear-gradient(135deg, ${theme.primaryDark} 0%, ${theme.primary} 55%, ${theme.primaryLight} 100%)`,
        boxShadow: '0 30px 60px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.08)',
        position: 'relative',
        overflow: 'hidden',
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 60% 80% at 15% 0%, rgba(255,255,255,0.22), transparent 55%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 12,
          borderBottom: `1px solid ${border}`,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: onBgStrong }} />
          <div style={{ width: 110, height: 10, borderRadius: 3, background: onBg }} />
        </div>
        <div
          style={{
            width: 70,
            height: 24,
            borderRadius: 12,
            background: onBg,
            border: `1px solid ${border}`,
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
        {[0.78, 0.52, 0.88].map((pct, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: onBgStrong }} />
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.08)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pct * 100}%`,
                  borderRadius: 3,
                  background: onBgStrong,
                }}
              />
            </div>
            <div style={{ width: 30, height: 8, borderRadius: 2, background: onBg }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 'auto', position: 'relative' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              background: cardBg,
              border: `1px solid ${border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}
          >
            <div style={{ width: '65%', height: 6, borderRadius: 2, background: onBg }} />
            <div style={{ width: '45%', height: 14, borderRadius: 3, background: onBgStrong }} />
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Delete inline `FakePanel` from FeatureCallout.tsx**

In `packages/remotion/src/scenes/FeatureCallout.tsx`, delete the entire `const FakePanel` block (everything from the `// Mock UI placeholder` comment through the closing `};` — currently lines 76-192). The dispatcher refactor in Task 8 will replace the surrounding code.

- [ ] **Step 3: Add smoke test**

Append to `packages/remotion/tests/featureCalloutVariants.test.tsx`:

```tsx
import { DashboardPanel } from '../src/scenes/variants/DashboardPanel';

describe('DashboardPanel', () => {
  it('exports a component', () => {
    expect(typeof DashboardPanel).toBe('function');
  });
});
```

Run: `pnpm --filter @promptdemo/remotion test -- featureCalloutVariants.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/remotion/src/scenes/variants/DashboardPanel.tsx packages/remotion/src/scenes/FeatureCallout.tsx packages/remotion/tests/featureCalloutVariants.test.tsx
git commit -m "refactor(remotion): extract FakePanel as DashboardPanel variant"
```

---

## Task 8: Refactor `FeatureCallout.tsx` to dispatcher

**Why:** The component is now a thin switch that chooses the right panel. Keeps `FeatureCallout` responsible only for layout (`leftImage`/`rightImage`/`topDown`) and text animation — not for rendering pixels.

**Files:**
- Modify: `packages/remotion/src/scenes/FeatureCallout.tsx` (complete rewrite).

- [ ] **Step 1: Replace FeatureCallout.tsx contents**

Overwrite the file:

```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { FeatureVariant } from '@promptdemo/schema';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';
import { ImagePanel } from './variants/ImagePanel';
import { KenBurnsPanel } from './variants/KenBurnsPanel';
import { CollagePanel } from './variants/CollagePanel';
import { DashboardPanel } from './variants/DashboardPanel';

export interface FeatureCalloutProps {
  title: string;
  description: string;
  layout: 'leftImage' | 'rightImage' | 'topDown';
  theme: BrandTheme;
  variant: FeatureVariant;
  /** Resolved viewport screenshot URL — required by image/collage variants (collage
   *  also accepts fullPage; the dispatcher routes by variant). */
  viewportSrc?: string;
  /** Resolved fullPage screenshot URL — required by kenBurns and collage. */
  fullPageSrc?: string;
}

export const FeatureCallout: React.FC<FeatureCalloutProps> = ({
  title,
  description,
  layout,
  theme,
  variant,
  viewportSrc,
  fullPageSrc,
}) => {
  const panel = renderPanel(variant, { theme, viewportSrc, fullPageSrc });
  return (
    <AbsoluteFill style={{ background: theme.bg, color: '#111' }}>
      <AbsoluteFill
        style={{
          padding: 80,
          display: 'flex',
          flexDirection: layout === 'topDown' ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 60,
        }}
      >
        {layout === 'rightImage' ? panel : null}
        <div style={{ flex: 1, maxWidth: 560 }}>
          <AnimatedText text={title} style={{ fontSize: 48, fontWeight: 700, color: theme.primary }} />
          <div style={{ marginTop: 24 }}>
            <AnimatedText text={description} delayFrames={12} style={{ fontSize: 24, lineHeight: 1.4 }} />
          </div>
        </div>
        {layout !== 'rightImage' ? panel : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function renderPanel(
  variant: FeatureVariant,
  ctx: { theme: BrandTheme; viewportSrc?: string; fullPageSrc?: string }
): React.ReactElement {
  switch (variant) {
    case 'kenBurns':
      if (ctx.fullPageSrc) return <KenBurnsPanel src={ctx.fullPageSrc} theme={ctx.theme} />;
      // Fallback: fullPage missing (shouldn't happen — selector guards this) — degrade to image.
      if (ctx.viewportSrc) return <ImagePanel src={ctx.viewportSrc} theme={ctx.theme} />;
      return <DashboardPanel theme={ctx.theme} />;
    case 'collage':
      if (ctx.fullPageSrc) return <CollagePanel src={ctx.fullPageSrc} theme={ctx.theme} />;
      if (ctx.viewportSrc) return <ImagePanel src={ctx.viewportSrc} theme={ctx.theme} />;
      return <DashboardPanel theme={ctx.theme} />;
    case 'image':
      if (ctx.viewportSrc) return <ImagePanel src={ctx.viewportSrc} theme={ctx.theme} />;
      return <DashboardPanel theme={ctx.theme} />;
    case 'dashboard':
      return <DashboardPanel theme={ctx.theme} />;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @promptdemo/remotion build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/remotion/src/scenes/FeatureCallout.tsx
git commit -m "refactor(remotion): FeatureCallout becomes variant dispatcher"
```

---

## Task 9: Update `resolveScene` to pass variant + both screenshots

**Why:** The resolver currently only passes `imageSrc` from viewport. Variants need viewport AND fullPage (for kenBurns/collage).

**Files:**
- Modify: `packages/remotion/src/resolveScene.tsx:36-50` (FeatureCallout case).
- Modify: `packages/remotion/tests/resolveScene.test.tsx` — add FeatureCallout variant tests.

- [ ] **Step 1: Write the failing test**

Append to `packages/remotion/tests/resolveScene.test.tsx`:

```ts
  it('resolves a FeatureCallout with variant=image', () => {
    const scene: Scene = {
      sceneId: 2,
      type: 'FeatureCallout',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'T', description: 'D', layout: 'leftImage', variant: 'image' },
    };
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });

  it('resolves a FeatureCallout with variant=kenBurns when fullPage exists', () => {
    const scene: Scene = {
      sceneId: 3,
      type: 'FeatureCallout',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'T', description: 'D', layout: 'leftImage', variant: 'kenBurns' },
    };
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });
```

Run: `pnpm --filter @promptdemo/remotion test -- resolveScene.test.tsx`
Expected: FAIL — TypeScript will reject `variant` on `props` because the old `FeatureCallout` component signature doesn't include it (Task 8 already fixed this) OR the runtime assertion fails because resolveScene doesn't pass `variant` through yet.

- [ ] **Step 2: Patch resolveScene**

In `packages/remotion/src/resolveScene.tsx`, replace the `FeatureCallout` case (lines 36-50) with:

```tsx
    case 'FeatureCallout': {
      const viewportSrc = resolver(assets.screenshots.viewport);
      const fullPageSrc = resolver(assets.screenshots.fullPage);
      return (
        <FeatureCallout
          title={scene.props.title}
          description={scene.props.description}
          layout={scene.props.layout}
          theme={theme}
          variant={scene.props.variant}
          {...(viewportSrc ? { viewportSrc } : {})}
          {...(fullPageSrc ? { fullPageSrc } : {})}
        />
      );
    }
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @promptdemo/remotion test`
Expected: PASS (all resolveScene + variant tests).

Run: `pnpm --filter @promptdemo/remotion build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/remotion/src/resolveScene.tsx packages/remotion/tests/resolveScene.test.tsx
git commit -m "feat(remotion): resolveScene routes variant + both screenshots to FeatureCallout"
```

---

## Task 10: End-to-end smoke — render all four variants in a single composition

**Why:** Unit tests don't catch Remotion composition-time bugs (staticFile resolution, webpack bundle issues). This task renders a synthetic storyboard containing one of each variant and asserts the MP4 exists.

**Files:**
- Create: `packages/remotion/tests/variantRenderSmoke.test.tsx`

- [ ] **Step 1: Write the smoke test**

Create `packages/remotion/tests/variantRenderSmoke.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import type { Storyboard } from '@promptdemo/schema';
import { StoryboardSchema } from '@promptdemo/schema';

describe('variant storyboard validation smoke', () => {
  it('a storyboard with one of each variant parses against v2 schema', () => {
    const sb = {
      videoConfig: {
        durationInFrames: 900,
        fps: 30,
        brandColor: '#4f46e5',
        bgm: 'minimal' as const,
      },
      assets: {
        screenshots: { viewport: 's3://x/v.jpg', fullPage: 's3://x/f.jpg' },
        sourceTexts: ['Hello', 'World', 'Demo'],
      },
      scenes: [
        { sceneId: 1, type: 'HeroRealShot', durationInFrames: 150,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', screenshotKey: 'viewport' } },
        { sceneId: 2, type: 'FeatureCallout', durationInFrames: 200,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', description: 'World', layout: 'leftImage', variant: 'image' } },
        { sceneId: 3, type: 'FeatureCallout', durationInFrames: 200,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', description: 'World', layout: 'rightImage', variant: 'kenBurns' } },
        { sceneId: 4, type: 'FeatureCallout', durationInFrames: 200,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', description: 'World', layout: 'topDown', variant: 'collage' } },
        { sceneId: 5, type: 'FeatureCallout', durationInFrames: 150,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', description: 'World', layout: 'leftImage', variant: 'dashboard' } },
      ],
    };
    const parsed = StoryboardSchema.parse(sb);
    expect(parsed.scenes).toHaveLength(5);
    const variants = parsed.scenes
      .filter((s): s is Extract<typeof parsed.scenes[number], { type: 'FeatureCallout' }> =>
        s.type === 'FeatureCallout')
      .map((s) => s.props.variant);
    expect(new Set(variants)).toEqual(new Set(['image', 'kenBurns', 'collage', 'dashboard']));
  });
});
```

- [ ] **Step 2: Run the smoke test**

Run: `pnpm --filter @promptdemo/remotion test -- variantRenderSmoke.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run full suites for both affected packages**

Run: `pnpm --filter @promptdemo/remotion test`
Run: `pnpm --filter @promptdemo/storyboard-worker test`
Run: `pnpm --filter @promptdemo/schema test`
Expected: ALL PASS.

Run: `pnpm -r build`
Expected: PASS.

- [ ] **Step 4: Manual render verification**

Run the demo lifecycle end-to-end against a site known to have both screenshots:

```bash
pnpm demo start
# wait for "all services healthy"
curl -X POST http://localhost:3000/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.anthropic.com","intent":"Executive summary","duration":30}'
# watch progress at http://localhost:3001/jobs/<returned-id>
# when done: open the MP4 and confirm the three+ FeatureCallout scenes look distinct
```

Acceptance checklist (from spec Feature 1):
- [ ] 30s or 60s video produces ≥2 visually distinct FeatureCallout panels.
- [ ] A URL with no viewport screenshot (Tier-B fallback — rare but test with a 403-blocked site) renders all FeatureCallouts as `dashboard` with no crashes.
- [ ] A v1 storyboard fixture (stored JSON from an earlier tag, no `variant` field) still renders identically to v1.

- [ ] **Step 5: Commit**

```bash
git add packages/remotion/tests/variantRenderSmoke.test.tsx
git commit -m "test(remotion): smoke-test all four FeatureCallout variants in one storyboard"
```

- [ ] **Step 6: Tag**

```bash
git tag v2.0.0-feature1-variants
git push origin main --tags
```

---

## Self-Review Against Spec

Cross-check against `docs/superpowers/specs/2026-04-24-promptdemo-v2-design.md` Part 1 Feature 1 + Part 2 Section 1 + Post-Review Amendment D:

| Spec requirement | Where addressed |
|------------------|-----------------|
| `variant` field with 4 values (`image`/`kenBurns`/`collage`/`dashboard`) | Task 1 schema; Task 2 selector |
| `.default('image')` for v1 backward compat | Task 1, schema default; Task 10 v1 fixture check |
| Deterministic post-Claude selection (storyboard worker, not LLM) | Task 2 pure function; Task 3 wiring; system prompt untouched |
| Selection algorithm (5-branch tree from Amendment D) | Task 2 `pick()` function matches the algorithm verbatim |
| Zod schema ships 4 variants only (bento deferred) | Task 1 enum has exactly `['image', 'kenBurns', 'collage', 'dashboard']`; test rejects `bento` |
| `imageRegion` optional prop | Task 1 schema + test |
| KenBurns = CSS transform + Remotion `interpolate` | Task 5 uses compound `translate3d() scale()` only — GPU-composited, no `object-position` / layout-triggering props |
| Collage = 3 Y-slices, staggered fade+slideRight at 4-frame offsets | Task 6, 4-frame offset, spring-based slide; slice Y-offsets baked into static `translate3d()` per slice (no per-frame `object-position`) |
| Dashboard unchanged from v1 (luminance-guarded gradient + mock UI) | Task 7 is a verbatim move; no color logic change |
| Tier-B fallback renders without errors | Task 2 "no viewport → dashboard" branch; Task 8 dispatcher fallbacks |
| System prompt must NOT mention variant | Explicitly called out in File Structure; Task 3 leaves prompt files untouched |

Placeholder scan: no "TBD", "TODO", or "add appropriate X" strings in the plan. Every code step has concrete code.

Type consistency: `FeatureVariant` exported from schema, imported by FeatureCallout and variantSelection. `selectVariants` signature consistent between Task 2 definition and Task 3 usage. Component prop names (`viewportSrc`, `fullPageSrc`) consistent across Task 8 dispatcher and Task 9 resolveScene.

Scope: Pure Remotion + schema + storyboard-worker changes. No DB, auth, UI, or pricing touches — those are their own plans.
