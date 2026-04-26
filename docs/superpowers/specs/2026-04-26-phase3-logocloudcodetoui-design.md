# Phase 3 Scenes — LogoCloud + CodeToUI

**Date:** 2026-04-26
**Status:** Approved — ready for implementation planning
**Depends on:** Crawler Expansion (`logos` + `codeSnippets` fields in `CrawlResult`) — already shipped

---

## Problem

Two high-value scene types are blocked on structured crawler data that the completed crawler expansion now provides:

- **LogoCloud** needs `crawlResult.logos` — partner/integration logo arrays that `brand.logoUrl` (single product logo) cannot satisfy.
- **CodeToUI** needs `crawlResult.codeSnippets` + a product screenshot — to show real page code animating into the actual UI.

Both crawler fields are live. These two scenes close the loop.

---

## Guiding Principles

1. **Real data only.** LogoCloud pulls from `crawlResult.logos`. CodeToUI pulls verbatim code from `crawlResult.codeSnippets`. Neither scene allows invented content.
2. **Data gates, not hard crashes.** When required data is absent, the storyboard prompt instruction gates the scene out — exactly as ReviewMarquee gates on `reviews.length < 2`.
3. **Follow established Remotion patterns.** Extend the existing discriminated union, follow the `ReviewMarquee` marquee pattern for LogoCloud, follow the `HeroRealShot` screenshot pattern for CodeToUI.
4. **White card containers for logo safety.** All logo types (white, transparent, dark) must be visible regardless of the video background. White rounded-rect cards with subtle borders/shadows achieve this universally.

---

## Schema Changes (`packages/schema/src/storyboard.ts`)

### New scene schemas

```ts
const LogoCloudSchema = z.object({
  ...sceneBase,
  type: z.literal('LogoCloud'),
  props: z.object({
    logos: z
      .array(z.object({ name: z.string().min(1).max(100), s3Uri: S3UriSchema }))
      .min(2)
      .max(12),
    speed: z.enum(['slow', 'medium', 'fast']).default('medium'),
    label: z.string().max(60).optional(),
  }),
});

const CodeToUISchema = z.object({
  ...sceneBase,
  type: z.literal('CodeToUI'),
  props: z.object({
    code: z.string().min(10).max(800),
    language: z.string().max(50).optional(),
    label: z.string().max(100).optional(),
    screenshotKey: z.enum(['viewport', 'fullPage']).default('viewport'),
  }),
});
```

### Updated discriminated union

Add both to `SceneSchema` discriminated union and `SCENE_TYPES` array.

---

## `LogoCloud.tsx` (`packages/remotion/src/scenes/`)

### Layout

Full 1280×720 scene. Dark background (`#0a0a0a`). Centered vertically:
- If `label` prop present: render it above the strip (centered, `fontSize: 28`, `color: rgba(255,255,255,0.7)`, `fontWeight: 600`, `letterSpacing: 0.04em`)
- Logo strip: horizontally scrolling marquee, vertically centered

### Speed map

```ts
const SPEED_PX_PER_FRAME: Record<string, number> = { slow: 1.5, medium: 3, fast: 5 };
```

### Marquee mechanics (mirrors `ReviewMarquee`)

- Duplicate the logos 3× for seamless looping: `const items = [...logos, ...logos, ...logos]`
- Strip width: `items.length * SLOT_WIDTH` (no gap between slots — gap is inside each card)
- Scroll offset: `Math.min(frame * pxPerFrame, totalWidth - 1280)`
- Fade masks: `linear-gradient(to right, #0a0a0a 0%, transparent 14%, transparent 86%, #0a0a0a 100%)` over the strip, `zIndex: 2`
- Fade-in: `interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' })`

### Per-logo slot

`SLOT_WIDTH = 200` (fixed, not dynamic).

Each slot renders a white card container:

```tsx
<div style={{
  width: 168,
  height: 72,
  margin: '0 16px',       // (200 - 168) / 2 centering within slot
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 12,
  boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
}}>
  <Img
    src={resolvedUrl}
    style={{ maxWidth: 140, maxHeight: 48, objectFit: 'contain' }}
  />
</div>
```

`resolvedUrl` is passed in after the `resolver` function resolves the `s3Uri`.

### Props interface

```ts
export interface LogoCloudProps {
  logos: Array<{ name: string; resolvedUrl: string }>;
  speed: 'slow' | 'medium' | 'fast';
  label?: string;
  theme: BrandTheme;
  durationInFrames: number;
}
```

Note: `resolveScene.tsx` resolves `s3Uri → resolvedUrl` before passing to the component.

---

## `CodeToUI.tsx` (`packages/remotion/src/scenes/`)

### Layout

Full 1280×720. Dark background (`#0a0a0a`). Two-panel horizontal split:
- Left panel: **44%** width (563px) — code display
- Right panel: **56%** width (717px) — product screenshot

### Left panel — code typewriter

- Dark code area: `background: '#111827'`, `borderRadius: 12`, `padding: '32px 36px'`
- Optional `label` badge: pill above code area, brand color background, white text, `fontSize: 13`, `fontWeight: 600`
- Optional `language` badge: pill below label (or at top of code area), `background: rgba(255,255,255,0.08)`, `color: rgba(255,255,255,0.5)`, `fontSize: 12`
- Code text: `fontFamily: 'Courier New, monospace'`, `fontSize: 16`, `lineHeight: 1.6`, `color: '#e2e8f0'`
- Typewriter: frames 20–95 reveal the code character by character
  - `const charsToShow = Math.floor(interpolate(frame, [20, 95], [0, code.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))`
  - Render `code.slice(0, charsToShow)` followed by a blinking cursor `|` (`opacity: frame % 12 < 6 ? 1 : 0`)
  - After frame 95: hide cursor
- Fade-in of left panel: `interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })`

### Right panel — screenshot spring entry

- Screenshot entry starts at **frame 85** (10-frame overlap with typewriter — creates "compiled" energy)
- Spring: `spring({ frame: frame - 85, fps: 30, config: { stiffness: 120, damping: 22 } })`
- Entry animation: slide in from right (`translateX((1 - progress) * 80px)`) + opacity (0 → 1)
- `<Img src={resolvedUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />`
- Rounded left edge only: `borderRadius: '12px 0 0 12px'` (right edge is flush with frame)
- Fallback (no screenshot): right panel shows a gradient placeholder (`background: linear-gradient(135deg, ${theme.primary}20, ${theme.primary}05)`) with a centered product name text

### Props interface

```ts
export interface CodeToUIProps {
  code: string;
  language?: string;
  label?: string;
  screenshotUrl?: string;   // already resolved; undefined triggers fallback
  theme: BrandTheme;
  durationInFrames: number;
}
```

---

## `resolveScene.tsx` changes

### LogoCloud case

```ts
case 'LogoCloud': {
  const logos = scene.props.logos
    .map(({ name, s3Uri }) => ({ name, resolvedUrl: resolver(s3Uri) }))
    .filter((l): l is { name: string; resolvedUrl: string } => !!l.resolvedUrl);
  return (
    <LogoCloud
      logos={logos}
      speed={scene.props.speed}
      {...(scene.props.label ? { label: scene.props.label } : {})}
      theme={theme}
      durationInFrames={scene.durationInFrames}
    />
  );
}
```

### CodeToUI case

```ts
case 'CodeToUI': {
  const screenshotUri = assets.screenshots[scene.props.screenshotKey];
  const screenshotUrl = resolver(screenshotUri);
  return (
    <CodeToUI
      code={scene.props.code}
      {...(scene.props.language ? { language: scene.props.language } : {})}
      {...(scene.props.label ? { label: scene.props.label } : {})}
      {...(screenshotUrl ? { screenshotUrl } : {})}
      theme={theme}
      durationInFrames={scene.durationInFrames}
    />
  );
}
```

---

## Prompt Changes

### `sceneTypeCatalog.ts`

Add to `SCENE_CATALOG`:

```ts
LogoCloud:
  'Horizontally scrolling partner/integration logo strip. Props: { logos: [{name, s3Uri}] (2-12 items from crawlResult.logos), speed: "slow"|"medium"|"fast", label? (optional section heading, e.g. "Trusted by 1,000+ teams") }. ONLY use when crawlResult.logos contains at least 2 entries. Pull logos verbatim from crawlResult.logos.',

CodeToUI:
  'Split-screen: code typewriter on left, product screenshot reveal on right. Props: { code (verbatim from crawlResult.codeSnippets), language?, label?, screenshotKey: "viewport"|"fullPage" }. ONLY use when crawlResult.codeSnippets is non-empty AND assets.screenshots.viewport exists. Best for SaaS/dev-tool products.',
```

Add both to `V1_IMPLEMENTED_SCENE_TYPES`:

```ts
export const V1_IMPLEMENTED_SCENE_TYPES = [
  'HeroRealShot', 'FeatureCallout', 'TextPunch', 'SmoothScroll', 'CTA',
  'BentoGrid', 'CursorDemo', 'StatsCounter', 'ReviewMarquee',
  'LogoCloud', 'CodeToUI',
] as const;
```

### `userMessage.ts`

**Gate logic (in the restrictions block):**

```ts
const logos = input.crawlResult.logos ?? [];
if (logos.length < 2) {
  restrictions.push(
    'LogoCloud — fewer than 2 partner logos available in crawlResult.logos. MUST NOT use this scene.'
  );
} else {
  blocks.push(
    `## Available partner logos (use verbatim for LogoCloud)\n${JSON.stringify(logos, null, 2)}`
  );
}

const snippets = input.crawlResult.codeSnippets ?? [];
const hasViewport = !!input.crawlResult.screenshots.viewport;
if (snippets.length < 1 || !hasViewport) {
  const reasons: string[] = [];
  if (snippets.length < 1) reasons.push('no code snippets in crawlResult.codeSnippets');
  if (!hasViewport) reasons.push('no viewport screenshot available');
  restrictions.push(`CodeToUI — ${reasons.join(' and ')}. MUST NOT use this scene.`);
} else {
  blocks.push(
    `## Available code snippets (use verbatim for CodeToUI)\n${JSON.stringify(snippets, null, 2)}`
  );
}
```

---

## Testing

### `packages/schema/tests/storyboard.test.ts` (extend existing)

| Test | Fixture |
|---|---|
| LogoCloud schema accepts valid logos (2-12 items) | `{ logos: [{name:'Stripe', s3Uri:'s3://...'}, ...] }` |
| LogoCloud schema rejects fewer than 2 logos | `{ logos: [{name:'Stripe', s3Uri:'s3://...'}] }` |
| LogoCloud schema rejects plain HTTP URL in logos.s3Uri | `{ s3Uri: 'https://cdn.stripe.com/logo.svg' }` |
| CodeToUI schema accepts valid snippet | `{ code: 'const x = 1;...', screenshotKey: 'viewport' }` |
| CodeToUI schema rejects code shorter than 10 chars | `{ code: 'short' }` |
| CodeToUI schema rejects code longer than 800 chars | 801-char string |

### `packages/remotion/tests/LogoCloud.test.tsx` (new)

| Test |
|---|
| Renders without throwing with 2 logos |
| Renders without throwing with 12 logos |
| Renders optional label when provided |
| Renders without label when omitted |
| Speed prop accepted (slow / medium / fast) |

### `packages/remotion/tests/CodeToUI.test.tsx` (new)

| Test |
|---|
| Renders without throwing with screenshotUrl |
| Renders without throwing without screenshotUrl (fallback) |
| Renders language badge when language provided |
| Renders label badge when label provided |

### `packages/remotion/tests/resolveScene.test.tsx` (extend)

| Test |
|---|
| resolves a LogoCloud scene |
| resolves a CodeToUI scene with screenshotKey viewport |
| resolves a CodeToUI scene — graceful when screenshot asset missing (screenshotUrl undefined) |

### `workers/storyboard/tests/userMessage.test.ts` (extend)

| Test |
|---|
| Injects Available partner logos block when logos.length >= 2 |
| Adds LogoCloud restriction when logos.length < 2 |
| Injects Available code snippets block when snippets present + viewport screenshot present |
| Adds CodeToUI restriction when snippets empty |
| Adds CodeToUI restriction when viewport screenshot absent |
| CodeToUI restriction message names the missing item (snippets vs screenshot) |

---

## Non-Goals

- **DeviceMockup scene** — excluded (too complex for this phase).
- **LogoCloud animation beyond marquee scroll** — no entrance bounce, no staggered fade-in per logo.
- **Syntax highlighting** — code is rendered as plain monospace text, not parsed/tokenized. Colors would require a bundled highlight library.
- **CodeToUI without screenshot** — the right-panel fallback renders a gradient placeholder; it still validates that `assets.screenshots.viewport` exists before the prompt allows the scene.
- **SVG logo inline rendering** — logos are rendered via `<Img>` with the resolved S3 URL; no inline SVG injection.
- **Multi-snippet CodeToUI** — one code snippet per scene. If the user wants to show multiple snippets, they use multiple CodeToUI scenes.
