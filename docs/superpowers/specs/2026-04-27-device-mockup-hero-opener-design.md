# DeviceMockup — Hero Opener Scene · Design Document

**Date:** 2026-04-27
**Status:** Approved (brainstorming complete; ready for writing-plans)
**Owner:** chadcoco1444 + Claude (Opus 4.7)

---

## Goal

Add a new Remotion scene type **`DeviceMockup`** that wraps the crawled landing-page screenshot inside a premium dark laptop shell, animated with a cinematic Pan & Zoom — designed to serve as the **hero opener** of LumeSpec demo videos and replace `HeroRealShot` as the preferred opening shot.

---

## Background

Existing hero opener `HeroRealShot` floats the raw screenshot with a Ken Burns drift. It works but reads as "a screenshot with motion" — not premium enough to anchor a 60s product demo. `DeviceMockup` raises the perceived production value by framing the screenshot in a real-world device context, mirroring the visual language of Apple keynote launches.

Prior analysis ([scene-expansion-analysis.md:42-44](./2026-04-26-scene-expansion-analysis.md)) identified DeviceMockup as the highest-impact scene for "premium feel" but deferred it from Phase 3 as too complex. The brainstorming on 2026-04-27 narrowed the scope so v1 ships in ~3-4 days.

---

## Decisions Locked During Brainstorming

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Scene's narrative role | **Hero opener** — single device, cinematic | Maximises first-3-seconds hook impact |
| 2 | Form factor in v1 | **Laptop only**; schema reserves `device: 'laptop' \| 'phone'` for future | Existing crawler captures landscape 1280×800 only; landing pages are desktop-first; phone capture is a separate crawler initiative |
| 3 | Schema architecture | **Independent `DeviceMockupSchema`** (new scene type) | SRP — DeviceMockup props differ structurally from FeatureCallout's split-layout; avoids "God Object" variant explosion. Matches CLAUDE.md「新增場景的正確順序」 |
| 4 | Visual style of the shell | **Generic Premium dark MacBook-like** (neutral, no brand-color glow) | Shell is the frame, screenshot is the painting. Brand-coloured glow would compete with crawled brand colours inside the screen |
| 5 | Cinematic motion | **Two motions: `pushIn` + `pullOut`**, AI picks per `motion` enum | Push-In = focus / hook energy; Pull-Out = reveal / build energy. Two contrasting flavours give variety without the maintenance cost of three+ |
| 6 | Coexistence with `HeroRealShot` | **DeviceMockup preferred + HeroRealShot kept as fallback** | Graceful degradation — if DeviceMockup ever ships a regression, the prompt change to fall back is one-line |
| 7 | Headline placement | **Below the device** (text static while device animates) | Text becomes a stable visual anchor against the moving device, creating spatial tension; doesn't occlude the screenshot |

---

## Architecture

### Three-layer integration (per CLAUDE.md mandatory order)

```
1. packages/schema   →  DeviceMockupSchema + add to SceneSchema discriminated union
2. packages/remotion →  DeviceMockup component + resolveScene case
3. workers/storyboard →  sceneTypeCatalog entry + prompt rule for opener preference
```

No worker DB connection, no API changes — purely additive scene type.

### Data flow

```
Crawler                         Storyboard Worker             Remotion (render)
─────────                       ─────────────────             ────────────────
1280×800 viewport.jpg  ─►  S3                                 ↑
                            │                                  │
                            ▼                                  │
                       crawlResult.json                        │
                       { screenshots.viewport: s3://… }        │
                            │                                  │
                            ▼                                  │
                       Claude prompt + sceneTypeCatalog        │
                       generates storyboard.json with          │
                       a DeviceMockup scene as scene[0]        │
                            │                                  │
                            ▼                                  │
                       storyboard.json {                       │
                         scenes: [{                            │
                           type: 'DeviceMockup',               │
                           props: {                            │
                             headline, screenshotKey,          │
                             device: 'laptop',                 │
                             motion: 'pushIn'                  │
                           }                                   │
                         }, …]                                 │
                       }                                       │
                            │                                  │
                            └──── render queue ───────────────►│
                                                               ▼
                                                        DeviceMockup component
                                                        renders laptop shell +
                                                        screenshot inside +
                                                        Pan/Zoom + headline below
```

---

## Schema — `DeviceMockupSchema`

Add to `packages/schema/src/storyboard.ts`, then include in the `SceneSchema` discriminated union and the `V1_MVP_SCENE_TYPES` array.

```typescript
const DeviceMockupSchema = z.object({
  ...sceneBase,
  type: z.literal('DeviceMockup'),
  props: z.object({
    /** Main hero headline. Must come from crawlResult.sourceTexts whitelist (extractive check). */
    headline: z.string().min(1).max(80),

    /** Optional supporting line below the headline. */
    subtitle: z.string().min(1).max(120).optional(),

    /** v1 only supports viewport (landscape). fullPage doesn't fit a laptop screen aspect ratio. */
    screenshotKey: z.literal('viewport'),

    /**
     * v1 only ships 'laptop'. The 'phone' option is reserved in the schema so future
     * mobile-viewport capture can be added without a breaking change. resolveScene
     * falls back to HeroRealShot if AI somehow emits 'phone' before phone ships.
     */
    device: z.enum(['laptop', 'phone']),

    /**
     * Cinematic motion. AI picks per video based on intent:
     *  - pushIn  : start wide, slowly zoom in (focus / hook energy)
     *  - pullOut : start tight on UI detail, pull back to reveal device (reveal / build energy)
     */
    motion: z.enum(['pushIn', 'pullOut']),
  }),
});

// In SceneSchema.discriminatedUnion('type', [...]) — add DeviceMockupSchema
// In SCENE_TYPE_NAMES array — add 'DeviceMockup'
// V1_MVP_SCENE_TYPES — add 'DeviceMockup'
```

**Headline source-of-truth:** the existing **extractiveCheck** (Layer 5 of the 7-layer defense in `workers/storyboard/src/validation/extractiveCheck.ts`) will validate that `headline` and `subtitle` exist in `crawlResult.sourceTexts`. No prompt-level change needed — the existing validator already covers all `string` fields that pass through it.

---

## Component — `packages/remotion/src/scenes/DeviceMockup.tsx`

```typescript
interface DeviceMockupProps {
  headline: string;
  subtitle?: string;
  screenshotUrl: string;        // resolved S3 → presigned URL by render worker
  device: 'laptop' | 'phone';   // v1: only 'laptop' renders; 'phone' fallback handled in resolveScene
  motion: 'pushIn' | 'pullOut';
  durationInFrames: number;
  theme: BrandTheme;
}
```

### Visual layers (top → bottom in z-order)

```
┌─ Headline + subtitle (below device, static) ─────────────┐
│                                                           │
│       ┌─ Laptop shell (animates per `motion`) ─┐          │
│       │  ┌─ Bezel (gradient #27272a → #18181b)─┤          │
│       │  │  ┌─ Screen content (screenshot) ──┐ │          │
│       │  │  │  cropped to 16:10               │ │          │
│       │  │  │  + subtle gradient glare        │ │          │
│       │  │  └─────────────────────────────────┘ │          │
│       │  └────────────────────────────────────────┘        │
│       │  ┌─ Hinge / base (gradient #3f3f46 → #18181b) ┐    │
│       │  └──────────────────────────────────────────┘     │
│       └────────────────────────────────────────────┘      │
│                                                           │
│ ┌─ Background: radial-gradient(circle at 50% 30%,         │
│ │              #1f2937, #0a0a0a) ─────────────────────────┤
└───────────────────────────────────────────────────────────┘
```

All pure CSS — no SVG asset, no PNG. Aligns with `packages/remotion/DESIGN.md` rule «no Node.js modules / no external assets in the package».

### Shell CSS spec

```css
/* Bezel + screen frame */
.shell-bezel {
  background: linear-gradient(180deg, #27272a 0%, #18181b 100%);
  border: 1px solid #3f3f46;
  border-radius: 14px 14px 4px 4px;
  padding: 18px 14px;
  aspect-ratio: 16 / 10;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55),
              inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
/* Screen-glare overlay (subtle, top-left highlight) */
.shell-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(125deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%);
  pointer-events: none;
}
/* Hinge / base bar */
.shell-hinge {
  background: linear-gradient(180deg, #3f3f46 0%, #18181b 100%);
  height: 8px;
  border-radius: 0 0 18px 18px;
  margin: 0 -14px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.45);
}
```

### Motion implementation (Remotion `interpolate` / `spring` only — no setTimeout, per DESIGN.md anti-pattern #2)

| `motion`  | Frame 0 transform               | Frame N (durationInFrames - 1)  | Easing               |
|-----------|---------------------------------|---------------------------------|----------------------|
| `pushIn`  | `scale(1.0) translateY(0)`      | `scale(1.18) translateY(-2%)`   | `easeOut` (cubic)    |
| `pullOut` | `scale(1.25) translateY(-3%)`   | `scale(1.0) translateY(0)`      | `easeInOut` (cubic)  |

The headline + subtitle stay 100% static (zero transform), creating visual contrast against the moving device — this is Q7's "spatial tension" anchoring.

### Headline typography (Q7 placement)

```
Vertical layout (centered in 1280×720 frame):
  Top 8%  : empty
  ↓
  Top 8% → 62%  : Device shell (animates)
  ↓
  62% → 70% : empty gap (breathing room)
  ↓
  70% → 90% : Headline (static, 64px bold) + Subtitle (24px secondary)
  ↓
  Bottom 10% : empty
```

Use the existing `theme.foreground` colour for headline, `theme.foreground` at 0.65 opacity for subtitle. No drop shadow — the dark background carries the contrast.

---

## Integration — `resolveScene.tsx`

Add a new case before the deferred-scene-types fallback block:

```typescript
case 'DeviceMockup': {
  // v1 only ships 'laptop'. If AI somehow emits 'phone' before phone-viewport
  // crawling is available, fall back to HeroRealShot — Q6's graceful-degradation
  // policy. This same fallback fires when the viewport screenshot is missing.
  const screenshotUrl = resolver(assets.screenshots.viewport);
  if (scene.props.device !== 'laptop' || !screenshotUrl) {
    return (
      <HeroRealShot
        title={scene.props.headline}
        {...(scene.props.subtitle ? { subtitle: scene.props.subtitle } : {})}
        screenshotUrl={screenshotUrl ?? ''}  // HeroRealShot guards its own missing-URL case
        url={url}
        theme={theme}
      />
    );
  }
  return (
    <DeviceMockup
      headline={scene.props.headline}
      {...(scene.props.subtitle ? { subtitle: scene.props.subtitle } : {})}
      screenshotUrl={screenshotUrl}
      device={scene.props.device}
      motion={scene.props.motion}
      durationInFrames={scene.durationInFrames}
      theme={theme}
    />
  );
}
```

---

## Storyboard prompt — `sceneTypeCatalog.ts`

Add new catalog entry teaching AI when to pick `DeviceMockup`:

```typescript
DeviceMockup: {
  description: `Premium dark laptop shell wrapping a hero screenshot, with cinematic
    Pan/Zoom motion and a static headline below. Use as the OPENING SCENE of the video
    (sceneId 1) for SaaS / dashboard / web-app products. Conveys "production-grade,
    well-designed product" energy. Default choice for opener — only fall back to
    HeroRealShot when the viewport screenshot is unusable (e.g. mostly white,
    mostly text, no visual hierarchy).`,
  positionHint: 'opener',  // soft hint to position as scenes[0]
  requires: ['screenshots.viewport'],
  forbiddenWhen: [
    'no viewport screenshot in crawl result',
    'product is a CLI tool with no visual UI',
  ],
  exampleProps: {
    headline: '<short, punchy headline from sourceTexts>',
    subtitle: '<optional supporting line from sourceTexts>',
    screenshotKey: 'viewport',
    device: 'laptop',
    motion: '<pushIn for energy/focus | pullOut for reveal/storytelling>',
  },
}
```

The existing prompt scaffolding picks up the catalog automatically via `buildSystemPrompt`. Two prompt-level rules to add:

1. **Opener preference rule** — append to system prompt:
   > *"For the opening scene (sceneId 1), prefer `DeviceMockup` when the product is web-based and the viewport screenshot is visually rich. Fall back to `HeroRealShot` only when the screenshot is unsuitable for device framing."*

2. **`device` field constraint** — append:
   > *"For `DeviceMockup`, the `device` field MUST be `'laptop'` in this version. Do not emit `'phone'`."*

---

## Defense / fallback summary

| Failure mode | Mitigation |
|---|---|
| `viewport` screenshot missing from crawl result | resolveScene falls back to HeroRealShot (existing component, well-tested) |
| AI emits `device: 'phone'` despite prompt instruction | resolveScene falls back to HeroRealShot |
| AI emits an unknown `motion` value | Zod validation rejects → storyboard worker retries (max 3 attempts per existing retry config) |
| Headline / subtitle not in `sourceTexts` | extractiveCheck (Layer 5) rejects → retry |
| DeviceMockup component throws at render time | The `try { return resolveScene(input); } catch (...)` wrapper in render worker catches and substitutes TextPunch ("Scene unavailable" placeholder), per the [S-B Pipeline Reliability fallback pattern](./2026-04-26-sb-pipeline-reliability-design.md) already shipped at `resolveScene.tsx:137-145` |

---

## Files Changed

| File | Change |
|---|---|
| `packages/schema/src/storyboard.ts` | Add `DeviceMockupSchema`; include in `SceneSchema` union, `SCENE_TYPE_NAMES`, `V1_MVP_SCENE_TYPES` |
| `packages/schema/tests/storyboard.test.ts` | Add Zod validation tests for valid + invalid `DeviceMockup` payloads |
| `packages/remotion/src/scenes/DeviceMockup.tsx` | **New file** — component implementation (shell CSS + motion + headline) |
| `packages/remotion/src/resolveScene.tsx` | Add `case 'DeviceMockup'` with HeroRealShot fallback |
| `packages/remotion/tests/resolveScene.test.tsx` | Add tests: happy-path renders DeviceMockup; phone fallback returns HeroRealShot; missing screenshot returns HeroRealShot |
| `packages/remotion/DESIGN.md` | Update Responsibilities section ("8 場景元件庫"); document headline-as-static anchor convention |
| `workers/storyboard/src/prompts/sceneTypeCatalog.ts` | Add `DeviceMockup` entry with description + opener hint + device='laptop' constraint |
| `workers/storyboard/src/prompts/systemPrompt.ts` | Add opener-preference rule + device-field constraint |
| `workers/storyboard/tests/systemPrompt.test.ts` | Snapshot test for new rules in prompt output |
| `workers/storyboard/tests/sceneTypeCatalog.test.ts` (if exists, else create) | Verify DeviceMockup catalog entry serializes correctly into prompt |
| `apps/api/DESIGN.md` | **No change** — no API surface affected |
| `workers/storyboard/DESIGN.md` | Update scene catalog count + brief mention of opener policy |

**Pre-commit hook coverage:**
- ✅ Hook **will fire** for `packages/remotion/src/scenes/DeviceMockup.tsx` and `packages/remotion/src/resolveScene.tsx` → requires `packages/remotion/DESIGN.md` to be staged in the same commit.
- ⚠️ Hook **will NOT fire** for `workers/storyboard/src/prompts/*.ts` (not in current trigger list at [scripts/check-design-sync.mjs](../../../scripts/check-design-sync.mjs)). The `workers/storyboard/DESIGN.md` update is a voluntarily-honoured CLAUDE.md requirement, not hook-enforced. Worth raising as a follow-up to expand the trigger list, but out of scope for this spec.

---

## Testing strategy

### Unit (deterministic, fast)

```typescript
// packages/schema/tests/storyboard.test.ts
it('accepts a valid DeviceMockup payload', () => {
  expect(DeviceMockupSchema.safeParse(validPayload).success).toBe(true);
});
it('rejects DeviceMockup with device="tablet"', () => { ... });
it('rejects DeviceMockup with motion="lidOpen"', () => { ... });
it('rejects DeviceMockup with screenshotKey="fullPage"', () => { ... });
```

```typescript
// packages/remotion/tests/resolveScene.test.tsx
it('renders DeviceMockup for valid laptop scene', () => {
  const el = resolveScene({ scene: deviceMockupLaptop, ... });
  expect(el.type.name).toBe('DeviceMockup');
});

it('falls back to HeroRealShot when device="phone"', () => {
  const el = resolveScene({ scene: deviceMockupPhone, ... });
  expect(el.type.name).toBe('HeroRealShot');
});

it('falls back to HeroRealShot when viewport screenshot missing', () => {
  const el = resolveScene({
    scene: deviceMockupLaptop,
    assets: { screenshots: { /* no viewport */ } },
    ...
  });
  expect(el.type.name).toBe('HeroRealShot');
});
```

### Integration (slower, optional but high-value)

```typescript
// packages/remotion/tests/DeviceMockup.smoke.test.tsx (new file)
it('renders headline + screenshot + shell elements without throwing', () => {
  const { container } = render(<DeviceMockup {...sampleProps} />);
  expect(container.querySelector('[data-testid=device-shell]')).toBeTruthy();
  expect(container.textContent).toContain('Sample Headline');
});
```

### Visual regression — out of scope for v1

We don't currently have visual-regression tooling (Percy/Chromatic). For v1, manual QA via `pnpm lume render:promo` (with PromoComposition extended to include a DeviceMockup scene) is acceptable. Add visual regression only if we ship to many concurrent video styles.

---

## Non-Goals (explicit out-of-scope for v1)

- **Phone form factor** — schema reserves the field but only `'laptop'` renders. Mobile crawler capture is a separate initiative.
- **Lid-open animation** — CSS `perspective` in Remotion headless Chromium has known fidelity issues; reconsider only when WebGL (`@remotion/three`) is brought in.
- **Brand-coloured glow / glassmorphic shell** — explicitly rejected in Q4 to keep the shell as a neutral frame.
- **Multi-device showcase** (laptop + phone in one shot) — explicitly rejected in Q1.
- **Variant-based DeviceMockup** (hero / spotlight / multi variants) — explicitly rejected in Q1.
- **Visual-regression test harness** — out of scope; manual `render:promo` QA suffices for v1.

---

## Future expansions (post-v1, not committed)

| Feature | When to revisit |
|---|---|
| Phone form factor | When at least one customer has a mobile-first product worth showcasing AND mobile crawler capture is built |
| Lid-open animation | When `@remotion/three` is added to the package (separate WebGL initiative) |
| Slow-Drift motion (Q5 option C) | If user feedback indicates Push-In + Pull-Out feels too kinetic for some industries |
| Dynamic brand colour ambient | If product analytics show videos look too uniform; can be added without breaking schema |
| Auto-generated device chrome (browser tab, URL bar) | Adjacent feature; could share infrastructure with DeviceMockup |

---

## Rollout safety

All changes are additive:
- New schema type → existing storyboards unaffected (Zod discriminated union just adds a branch)
- New component → only rendered when AI emits `DeviceMockup`
- Prompt rule changes → AI gradually starts using DeviceMockup; HeroRealShot remains the fallback path
- If a regression surfaces, prompt rule can be reverted in one line to push AI back to `HeroRealShot` for openers

---

## Open questions deferred to writing-plans phase

- Exact frame keyframes for `pushIn` / `pullOut` (above table is the spec; tuning happens during implementation)
- Theme integration — does the headline use `theme.foreground` directly, or should there be a separate `theme.heroForeground`? (Default: reuse `theme.foreground` unless contrast issues arise during dogfood)
- PromoComposition update — add a DeviceMockup scene to the marketing video so the team has a canonical reference render

These are implementation details and don't affect spec approval.
