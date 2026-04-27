# DeviceMockup Hero Opener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `DeviceMockup` Remotion scene as the new preferred hero opener — laptop-only, dark premium shell, two motions (`pushIn` / `pullOut`), graceful fallback to `HeroRealShot`.

**Architecture:** Pure additive scene type. Schema lives in `packages/schema`, component in `packages/remotion/src/scenes/`, dispatcher case in `packages/remotion/src/resolveScene.tsx`, AI prompting in `workers/storyboard/src/prompts/`. Zero changes to apps/api, apps/web, or any worker except the storyboard prompt.

**Tech Stack:** Zod 3 (schema), Remotion 4 (rendering), React 18, vitest (tests). All animation via `interpolate()` + `useCurrentFrame()` — no setTimeout, no external assets, no Node modules in `packages/remotion`.

**Reference spec:** [`docs/superpowers/specs/2026-04-27-device-mockup-hero-opener-design.md`](../specs/2026-04-27-device-mockup-hero-opener-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/schema/src/storyboard.ts` | Modify | Add `DeviceMockupSchema`, append to discriminated union, `SCENE_TYPES`, `V1_MVP_SCENE_TYPES` |
| `packages/schema/tests/storyboard.test.ts` | Modify | Add 4 Zod parse / reject tests for DeviceMockup |
| `packages/schema/DESIGN.md` | Modify | Document `DeviceMockup` in scene catalog mention |
| `packages/remotion/src/scenes/DeviceMockup.tsx` | Create | Component: dark laptop shell + screenshot + Pan/Zoom + headline-below |
| `packages/remotion/src/resolveScene.tsx` | Modify | Add `case 'DeviceMockup'` with HeroRealShot fallback for missing screenshot or `device='phone'` |
| `packages/remotion/tests/resolveScene.test.tsx` | Modify | Add 3 tests: happy laptop path, phone fallback, missing-screenshot fallback |
| `packages/remotion/tests/DeviceMockup.smoke.test.tsx` | Create | Smoke test — component renders without throwing for both motions |
| `packages/remotion/DESIGN.md` | Modify | Bump scene library count to 8; document headline-as-static-anchor convention |
| `packages/remotion/src/compositions/PromoComposition.tsx` | Modify | Replace opener slot with DeviceMockup so the marketing render demos the new scene |
| `workers/storyboard/src/prompts/sceneTypeCatalog.ts` | Modify | Add `DeviceMockup` catalog entry; append to `V1_IMPLEMENTED_SCENE_TYPES` |
| `workers/storyboard/src/prompts/systemPrompt.ts` | Modify | Add HARD RULE for `device='laptop'`; update opener guidance in CREATIVITY_DIRECTIVE |
| `workers/storyboard/tests/systemPrompt.test.ts` | Modify | Verify new rules appear in built prompt |
| `workers/storyboard/DESIGN.md` | Modify | Note the opener-preference policy in module responsibilities |

---

## Pre-commit Hook Awareness

The DESIGN.md sync hook ([`scripts/check-design-sync.mjs`](../../../scripts/check-design-sync.mjs)) **will fire** for tasks touching:
- `packages/schema/src/**` → requires `packages/schema/DESIGN.md` staged in same commit (Task 1)
- `packages/remotion/src/scenes/**` → requires `packages/remotion/DESIGN.md` (Task 2)
- `packages/remotion/src/resolveScene.tsx` → requires `packages/remotion/DESIGN.md` (Task 3)

The hook **will NOT fire** for `workers/storyboard/src/prompts/**` (not in trigger list), but per CLAUDE.md spirit Task 4 still updates `workers/storyboard/DESIGN.md` voluntarily.

If a commit fails the hook, the implementer must NOT use `--no-verify` — instead, stage the missing DESIGN.md edit and re-commit.

---

### Task 1: Schema — `DeviceMockupSchema` in `packages/schema`

**Files:**
- Modify: `packages/schema/src/storyboard.ts`
- Modify: `packages/schema/tests/storyboard.test.ts`
- Modify: `packages/schema/DESIGN.md` (hook-required for this commit)

- [ ] **Step 1: Read packages/schema/DESIGN.md**

CLAUDE.md mandates reading the module's DESIGN.md before modifying its code.

Run: `cat packages/schema/DESIGN.md`
Expected: prose document; note the responsibilities section for where to mention DeviceMockup.

- [ ] **Step 2: Write failing tests for the new schema**

Append to the bottom of `packages/schema/tests/storyboard.test.ts`:

```typescript
describe('DeviceMockupSchema (via SceneSchema)', () => {
  const validBase = {
    sceneId: 1,
    type: 'DeviceMockup' as const,
    durationInFrames: 150,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
  };
  const validProps = {
    headline: 'Ship demos in seconds',
    subtitle: 'Paste a URL, hit enter.',
    screenshotKey: 'viewport' as const,
    device: 'laptop' as const,
    motion: 'pushIn' as const,
  };

  it('accepts a valid DeviceMockup scene', () => {
    const parsed = SceneSchema.parse({ ...validBase, props: validProps });
    expect(parsed.type).toBe('DeviceMockup');
  });

  it('accepts a valid DeviceMockup with motion=pullOut and device=phone (schema-reserved)', () => {
    const parsed = SceneSchema.parse({
      ...validBase,
      props: { ...validProps, motion: 'pullOut', device: 'phone' },
    });
    expect(parsed.type).toBe('DeviceMockup');
  });

  it('rejects DeviceMockup with motion="lidOpen"', () => {
    expect(() =>
      SceneSchema.parse({ ...validBase, props: { ...validProps, motion: 'lidOpen' } }),
    ).toThrow();
  });

  it('rejects DeviceMockup with screenshotKey="fullPage"', () => {
    expect(() =>
      SceneSchema.parse({ ...validBase, props: { ...validProps, screenshotKey: 'fullPage' } }),
    ).toThrow();
  });

  it('rejects DeviceMockup without headline', () => {
    const { headline, ...withoutHeadline } = validProps;
    expect(() =>
      SceneSchema.parse({ ...validBase, props: withoutHeadline as typeof validProps }),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

Run: `pnpm --filter @lumespec/schema test storyboard.test`
Expected: 5 new failures referencing `DeviceMockup` (the type doesn't exist yet in the discriminated union).

- [ ] **Step 4: Add `DeviceMockupSchema` to `packages/schema/src/storyboard.ts`**

After the `CodeToUISchema` block (around line 202), insert:

```typescript
const DeviceMockupSchema = z.object({
  ...sceneBase,
  type: z.literal('DeviceMockup'),
  props: z.object({
    /** Hero headline. Must come from sourceTexts whitelist (extractive check). */
    headline: z.string().min(1).max(80),
    /** Optional supporting line below the headline. */
    subtitle: z.string().min(1).max(120).optional(),
    /** v1 only supports viewport — fullPage doesn't fit a laptop screen aspect ratio. */
    screenshotKey: z.literal('viewport'),
    /**
     * v1 only ships 'laptop'. The 'phone' option is reserved so future mobile-viewport
     * crawler capture can be added without a breaking change. resolveScene falls back to
     * HeroRealShot if AI emits 'phone' before phone-viewport capture exists.
     */
    device: z.enum(['laptop', 'phone']),
    /**
     * Cinematic motion. AI picks per video based on intent:
     *  - pushIn  : start wide, slowly zoom in (focus / hook energy)
     *  - pullOut : start tight on UI detail, pull back to reveal device (reveal / build)
     */
    motion: z.enum(['pushIn', 'pullOut']),
  }),
});
```

Append `DeviceMockupSchema` to the `SceneSchema.discriminatedUnion('type', [...])` array (after `CodeToUISchema`).

Append `'DeviceMockup'` to the `SCENE_TYPES` array (after `'CodeToUI'`).

Append `'DeviceMockup'` to the `V1_MVP_SCENE_TYPES` array.

- [ ] **Step 5: Run tests — verify they pass**

Run: `pnpm --filter @lumespec/schema test storyboard.test`
Expected: all tests pass (existing + 5 new).

- [ ] **Step 6: Run full schema typecheck**

Run: `pnpm --filter @lumespec/schema typecheck`
Expected: zero errors.

- [ ] **Step 7: Update `packages/schema/DESIGN.md` to mention DeviceMockup**

Find the responsibilities or scene-types section in `packages/schema/DESIGN.md` and add a one-line entry noting that `DeviceMockup` exists, e.g.:

```markdown
- **DeviceMockup** — hero-opener scene wrapping a viewport screenshot in a dark laptop shell with cinematic Pan/Zoom motion. Schema reserves `device: 'laptop' | 'phone'` for future phone-viewport crawler capture.
```

If the existing DESIGN.md has a scene-type list, insert in alphabetical order. If it doesn't list scenes individually, add a brief mention under the responsibilities section.

- [ ] **Step 8: Commit**

```bash
git add packages/schema/src/storyboard.ts packages/schema/tests/storyboard.test.ts packages/schema/DESIGN.md
git commit -m "$(cat <<'EOF'
feat(schema): add DeviceMockupSchema for hero-opener scene

New scene type with props: headline, subtitle?, screenshotKey='viewport',
device: 'laptop' | 'phone' (only laptop renders in v1 — phone reserved
for future mobile-viewport crawler capture), motion: 'pushIn' | 'pullOut'.

Added to SceneSchema discriminated union, SCENE_TYPES, V1_MVP_SCENE_TYPES.

Per spec: docs/superpowers/specs/2026-04-27-device-mockup-hero-opener-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook **passes** (`packages/schema/DESIGN.md` is staged alongside `src/`).

---

### Task 2: Component — `DeviceMockup.tsx` in `packages/remotion`

**Files:**
- Create: `packages/remotion/src/scenes/DeviceMockup.tsx`
- Create: `packages/remotion/tests/DeviceMockup.smoke.test.tsx`
- Modify: `packages/remotion/DESIGN.md` (hook-required for this commit)

- [ ] **Step 1: Read packages/remotion/DESIGN.md**

Run: `cat packages/remotion/DESIGN.md`
Expected: review the anti-patterns (no setTimeout, no Node modules, useMemo for expensive derivations). Note the section listing scene components for where to bump the count.

- [ ] **Step 2: Write failing smoke test**

Create `packages/remotion/tests/DeviceMockup.smoke.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DeviceMockup } from '../src/scenes/DeviceMockup';
import { deriveTheme } from '../src/utils/brandTheme';

const theme = deriveTheme('#4f46e5');

const baseProps = {
  headline: 'Ship demos in seconds',
  subtitle: 'Paste a URL, hit enter.',
  screenshotUrl: 'http://fake/viewport.jpg',
  device: 'laptop' as const,
  durationInFrames: 150,
  theme,
};

describe('DeviceMockup smoke', () => {
  it('renders for motion=pushIn without throwing', () => {
    const { container } = render(<DeviceMockup {...baseProps} motion="pushIn" />);
    expect(container.textContent).toContain('Ship demos in seconds');
    expect(container.textContent).toContain('Paste a URL');
  });

  it('renders for motion=pullOut without throwing', () => {
    const { container } = render(<DeviceMockup {...baseProps} motion="pullOut" />);
    expect(container.textContent).toContain('Ship demos in seconds');
  });

  it('omits subtitle gracefully when not provided', () => {
    const { subtitle, ...withoutSubtitle } = baseProps;
    const { container } = render(<DeviceMockup {...withoutSubtitle} motion="pushIn" />);
    expect(container.textContent).toContain('Ship demos in seconds');
    expect(container.textContent).not.toContain('Paste a URL');
  });
});
```

- [ ] **Step 3: Run smoke test — verify it fails**

Run: `pnpm --filter @lumespec/remotion test DeviceMockup.smoke`
Expected: failures referencing `Cannot find module '../src/scenes/DeviceMockup'`.

- [ ] **Step 4: Implement `DeviceMockup.tsx`**

Create `packages/remotion/src/scenes/DeviceMockup.tsx`:

```typescript
import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';

export interface DeviceMockupProps {
  headline: string;
  subtitle?: string;
  /** Already resolved from s3:// to a presigned http(s):// URL by the render worker. */
  screenshotUrl: string;
  /** v1 only renders 'laptop'; resolveScene falls back to HeroRealShot for 'phone'. */
  device: 'laptop' | 'phone';
  motion: 'pushIn' | 'pullOut';
  durationInFrames: number;
  theme: BrandTheme;
}

/** Cinematic Pan/Zoom keyframes per Q5 design spec. */
function computeTransform(motion: 'pushIn' | 'pullOut', frame: number, total: number) {
  // ease-out for pushIn, ease-in-out for pullOut. Remotion's interpolate
  // accepts an easing config but we keep cubic-bezier flat to avoid
  // depending on @remotion/transitions easings; linear interpolation over
  // the cubic-distorted key range is visually equivalent at 30fps for these
  // small ranges.
  const t = total > 1 ? frame / (total - 1) : 0;
  const eased = motion === 'pushIn'
    ? 1 - Math.pow(1 - t, 3) // easeOutCubic
    : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
  if (motion === 'pushIn') {
    const scale = interpolate(eased, [0, 1], [1.0, 1.18]);
    const translateY = interpolate(eased, [0, 1], [0, -2]); // percent of frame
    return { scale, translateY };
  }
  // pullOut
  const scale = interpolate(eased, [0, 1], [1.25, 1.0]);
  const translateY = interpolate(eased, [0, 1], [-3, 0]);
  return { scale, translateY };
}

export const DeviceMockup: React.FC<DeviceMockupProps> = ({
  headline,
  subtitle,
  screenshotUrl,
  motion,
  durationInFrames,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { scale, translateY } = computeTransform(motion, frame, durationInFrames);

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 50% 30%, #1f2937 0%, #0a0a0a 100%)',
        color: theme.textOn,
      }}
    >
      {/* Device shell — animates per `motion` */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '8%',
          width: '70%',
          transform: `translateX(-50%) translateY(${translateY}%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Bezel + screen */}
        <div
          style={{
            background: 'linear-gradient(180deg, #27272a 0%, #18181b 100%)',
            border: '1px solid #3f3f46',
            borderRadius: '14px 14px 4px 4px',
            padding: '18px 14px',
            aspectRatio: '16 / 10',
            boxShadow:
              '0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
            position: 'relative',
          }}
        >
          {/* Screen content */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 4,
              overflow: 'hidden',
              position: 'relative',
              background: '#000',
            }}
          >
            <Img
              src={screenshotUrl}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Subtle screen-glare overlay (top-left highlight) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(125deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
        {/* Hinge / base bar */}
        <div
          style={{
            background: 'linear-gradient(180deg, #3f3f46 0%, #18181b 100%)',
            height: 8,
            borderRadius: '0 0 18px 18px',
            margin: '0 -14px',
            boxShadow: '0 8px 16px rgba(0,0,0,0.45)',
          }}
        />
      </div>

      {/* Headline + subtitle — STATIC anchor below the device (Q7) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '70%',
          textAlign: 'center',
          padding: '0 60px',
          color: '#ffffff',
        }}
      >
        <AnimatedText
          text={headline}
          style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}
        />
        {subtitle ? (
          <div style={{ marginTop: 16 }}>
            <AnimatedText
              text={subtitle}
              delayFrames={15}
              style={{ fontSize: 24, opacity: 0.65 }}
            />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 5: Run smoke test — verify it passes**

Run: `pnpm --filter @lumespec/remotion test DeviceMockup.smoke`
Expected: 3 tests pass.

- [ ] **Step 6: Run remotion typecheck**

Run: `pnpm --filter @lumespec/remotion typecheck`
Expected: zero errors.

- [ ] **Step 7: Update `packages/remotion/DESIGN.md`**

In the responsibilities section, find the line listing scene components — currently mentions 7 scene types — and update to 8, adding `DeviceMockup` to the list. For example, change:

```markdown
- **場景元件庫（7 種）** — `FeatureCallout`(...), `HeroRealShot`(...), `BentoGrid`(...), `StatsCounter`(...), `ReviewMarquee`(...), `LogoCloud`(...), `CodeToUI`(...)
```

to:

```markdown
- **場景元件庫（8 種）** — `FeatureCallout`(...), `HeroRealShot`(...), `BentoGrid`(...), `StatsCounter`(...), `ReviewMarquee`(...), `LogoCloud`(...), `CodeToUI`(...), `DeviceMockup`（hero opener — laptop shell + Pan/Zoom + static headline anchor）
```

If the existing line uses different formatting, match its style.

- [ ] **Step 8: Commit**

```bash
git add packages/remotion/src/scenes/DeviceMockup.tsx packages/remotion/tests/DeviceMockup.smoke.test.tsx packages/remotion/DESIGN.md
git commit -m "$(cat <<'EOF'
feat(remotion): DeviceMockup hero-opener scene component

Pure-CSS dark laptop shell wrapping the viewport screenshot, with two
cinematic motions (pushIn 1.0→1.18 easeOutCubic; pullOut 1.25→1.0
easeInOutCubic) driven by useCurrentFrame() — no setTimeout, no external
assets, complies with packages/remotion/DESIGN.md anti-patterns.

Headline + subtitle are STATIC below the device, creating spatial tension
against the moving shell (Q7 of the brainstorm).

Per spec: docs/superpowers/specs/2026-04-27-device-mockup-hero-opener-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook **passes** (`packages/remotion/DESIGN.md` is staged alongside `src/scenes/DeviceMockup.tsx`).

---

### Task 3: `resolveScene` integration with HeroRealShot fallback

**Files:**
- Modify: `packages/remotion/src/resolveScene.tsx`
- Modify: `packages/remotion/tests/resolveScene.test.tsx`
- Modify: `packages/remotion/DESIGN.md` (hook-required for this commit; small additive edit)

- [ ] **Step 1: Re-read resolveScene.tsx for current structure**

Run: `cat packages/remotion/src/resolveScene.tsx`
Expected: confirm the discriminated-union switch pattern; note where the deferred-scene-type fallback (HeroStylized / UseCaseStory / StatsBand) lives so the new case goes BEFORE it.

- [ ] **Step 2: Write 3 failing tests**

Append to `packages/remotion/tests/resolveScene.test.tsx`:

```typescript
describe('resolveScene — DeviceMockup', () => {
  const baseScene = {
    sceneId: 1,
    type: 'DeviceMockup' as const,
    durationInFrames: 150,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
  };
  const baseProps = {
    headline: 'Ship demos',
    screenshotKey: 'viewport' as const,
    device: 'laptop' as const,
    motion: 'pushIn' as const,
  };

  it('renders DeviceMockup for valid laptop scene', () => {
    const scene = { ...baseScene, props: baseProps } as unknown as Scene;
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
    // Component name check works because Vitest preserves React displayName
    expect((el.type as { displayName?: string; name?: string }).displayName ?? (el.type as { name?: string }).name).toBe('DeviceMockup');
  });

  it('falls back to HeroRealShot when device="phone"', () => {
    const scene = { ...baseScene, props: { ...baseProps, device: 'phone' as const } } as unknown as Scene;
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
    expect((el.type as { displayName?: string; name?: string }).displayName ?? (el.type as { name?: string }).name).toBe('HeroRealShot');
  });

  it('falls back to HeroRealShot when viewport screenshot is missing', () => {
    const scene = { ...baseScene, props: baseProps } as unknown as Scene;
    const emptyAssets = { screenshots: {} } as unknown as typeof assets;
    const el = resolveScene({ scene, assets: emptyAssets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
    expect((el.type as { displayName?: string; name?: string }).displayName ?? (el.type as { name?: string }).name).toBe('HeroRealShot');
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

Run: `pnpm --filter @lumespec/remotion test resolveScene`
Expected: 3 new failures referencing the missing `'DeviceMockup'` case in the switch.

- [ ] **Step 4: Add `case 'DeviceMockup'` to `resolveScene.tsx`**

Add the import at the top of the file (with the other scene imports):

```typescript
import { DeviceMockup } from './scenes/DeviceMockup';
```

Insert the case BEFORE the `case 'HeroStylized' | 'UseCaseStory' | 'StatsBand'` deferred-fallback block. Use this exact code:

```typescript
    case 'DeviceMockup': {
      // v1 only ships 'laptop'. If AI emits 'phone' before mobile-viewport
      // crawling is built, fall back to HeroRealShot — Q6 graceful-degradation
      // policy. Same fallback fires when the viewport screenshot is missing.
      const screenshotUrl = resolver(assets.screenshots.viewport);
      if (scene.props.device !== 'laptop' || !screenshotUrl) {
        return (
          <HeroRealShot
            title={scene.props.headline}
            {...(scene.props.subtitle ? { subtitle: scene.props.subtitle } : {})}
            screenshotUrl={screenshotUrl ?? ''}
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

- [ ] **Step 5: Run tests — verify they pass**

Run: `pnpm --filter @lumespec/remotion test resolveScene`
Expected: all tests pass (existing + 3 new).

- [ ] **Step 6: Run full remotion test suite (regression check)**

Run: `pnpm --filter @lumespec/remotion test`
Expected: 65+ tests pass (62 baseline + 3 new from this task + 3 from Task 2 smoke). 1 skip remains (renderReal.test.ts).

- [ ] **Step 7: Update `packages/remotion/DESIGN.md` — add "headline-as-static-anchor" anti-pattern**

In the anti-patterns section, add a new entry (number it appropriately):

```markdown
### N. 把 hero scene 的標題塞進動畫元素裡
若 hero opener 的 headline 跟著裝置/截圖一起做 Pan/Zoom，文字會在運鏡中模糊或偏離可讀區。**Hero opener 的 headline + subtitle 必須是靜止 anchor**，唯有裝置/截圖層做 transform。這樣文字反而成為穩定的視覺重力中心，跟動態元素產生空間張力。範例：`DeviceMockup` 把 headline 放在 70% Y 軸位置、不帶 transform。
```

- [ ] **Step 8: Commit**

```bash
git add packages/remotion/src/resolveScene.tsx packages/remotion/tests/resolveScene.test.tsx packages/remotion/DESIGN.md
git commit -m "$(cat <<'EOF'
feat(remotion): wire DeviceMockup case into resolveScene with HeroRealShot fallback

resolveScene now dispatches type='DeviceMockup' to the new component, with
graceful-degradation fallback to HeroRealShot when:
  - props.device === 'phone' (reserved schema field; not yet implemented)
  - assets.screenshots.viewport is missing

DESIGN.md anti-pattern added: hero-opener headlines must be static anchors,
not part of the device transform — codifies Q7 of the DeviceMockup brainstorm.

Per spec: docs/superpowers/specs/2026-04-27-device-mockup-hero-opener-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook **passes** (`packages/remotion/DESIGN.md` is staged).

---

### Task 4: Storyboard prompt — catalog entry + opener preference + device constraint

**Files:**
- Modify: `workers/storyboard/src/prompts/sceneTypeCatalog.ts`
- Modify: `workers/storyboard/src/prompts/systemPrompt.ts`
- Modify: `workers/storyboard/tests/systemPrompt.test.ts`
- Modify: `workers/storyboard/DESIGN.md` (voluntary — hook does NOT fire)

- [ ] **Step 1: Read workers/storyboard/DESIGN.md**

Run: `cat workers/storyboard/DESIGN.md`
Expected: review module responsibilities; note where to add the opener policy mention.

- [ ] **Step 2: Add failing test in systemPrompt test file**

Append to `workers/storyboard/tests/systemPrompt.test.ts`:

```typescript
describe('systemPrompt — DeviceMockup integration', () => {
  it('mentions DeviceMockup as the preferred opener', () => {
    const prompt = buildSystemPrompt({
      profile: { /* whatever PacingProfile shape your test fixture uses */ } as never,
      locale: 'en',
      industry: 'developer_tool',
    });
    expect(prompt).toContain('DeviceMockup');
    // Opener-preference language (any of these substrings is acceptable):
    expect(prompt).toMatch(/prefer\s+DeviceMockup|DeviceMockup.*opener|opener.*DeviceMockup/i);
  });

  it('contains HARD RULE forbidding device="phone" in v1', () => {
    const prompt = buildSystemPrompt({
      profile: {} as never,
      locale: 'en',
      industry: 'developer_tool',
    });
    // The constraint must literally name the field and the only allowed value
    expect(prompt).toMatch(/device.*['"`]?laptop['"`]?/i);
    expect(prompt).toMatch(/(do\s+not|must\s+not|MUST\s+be).*['"`]?phone['"`]?|['"`]?laptop['"`]?.*only/i);
  });
});
```

(Adjust the `buildSystemPrompt` argument shape to match the actual exported signature. Read the function signature in `systemPrompt.ts` first if unsure.)

- [ ] **Step 3: Run tests — verify they fail**

Run: `pnpm --filter @lumespec/worker-storyboard test systemPrompt`
Expected: 2 new failures (no `DeviceMockup` mention; no laptop constraint).

- [ ] **Step 4: Add `DeviceMockup` to `sceneTypeCatalog.ts`**

In `workers/storyboard/src/prompts/sceneTypeCatalog.ts`, add a new entry to the `SCENE_CATALOG` object (insert between any two existing entries — order doesn't affect prompt output, but keeping near `HeroRealShot` is logical):

```typescript
  DeviceMockup:
    'Premium dark laptop shell wrapping a hero screenshot with cinematic Pan/Zoom motion and a STATIC headline below. PREFERRED OPENER for SaaS / web-app products — use as scenes[0] whenever assets.screenshots.viewport is non-empty. Props: { headline, subtitle?, screenshotKey: "viewport" (only), device: "laptop" (only — "phone" exists in schema but is NOT yet rendered), motion: "pushIn" (focus / hook energy) | "pullOut" (reveal / build energy) }. Fall back to HeroRealShot only when the viewport screenshot is unsuitable (mostly white, no visual hierarchy, or absent).',
```

Append `'DeviceMockup'` to the `V1_IMPLEMENTED_SCENE_TYPES` array (after `'CodeToUI'`).

- [ ] **Step 5: Add HARD RULE + opener guidance to `systemPrompt.ts`**

In `workers/storyboard/src/prompts/systemPrompt.ts`, find the `HARD_RULES` template literal (around line 5–16). Add a new numbered rule:

```typescript
9. For DeviceMockup scenes, props.device MUST be "laptop". The "phone" value is reserved in the schema for future versions but is not yet rendered. Emitting "phone" will be silently downgraded to HeroRealShot — do not use it.
```

Then in the `CREATIVITY_DIRECTIVE` block, **replace** this existing line:

```
- VARY your openers. HeroRealShot is the safe choice — rely on it only when the product's visual design is the story.
```

with:

```
- DEFAULT to DeviceMockup as the opener — it wraps the viewport screenshot in a premium laptop shell with cinematic Pan/Zoom (motion: "pushIn" for focus, "pullOut" for reveal). Fall back to HeroRealShot only when the viewport screenshot is visually weak (mostly text, no hierarchy) or missing.
```

- [ ] **Step 6: Run tests — verify they pass**

Run: `pnpm --filter @lumespec/worker-storyboard test systemPrompt`
Expected: all tests pass (existing + 2 new).

- [ ] **Step 7: Run full storyboard test suite**

Run: `pnpm --filter @lumespec/worker-storyboard test`
Expected: 152+ tests pass (150 baseline + 2 new). No regressions.

- [ ] **Step 8: Update `workers/storyboard/DESIGN.md`**

Add a sentence to the responsibilities section noting the opener policy:

```markdown
- **Opener-preference policy** — system prompt teaches AI to default to `DeviceMockup` for the first scene when `viewport` screenshot exists; `HeroRealShot` becomes the fallback. Encoded in `sceneTypeCatalog.ts` (catalog description) + `systemPrompt.ts` (CREATIVITY_DIRECTIVE bullet + HARD RULE #9 forbidding `device='phone'` in v1).
```

- [ ] **Step 9: Commit**

```bash
git add workers/storyboard/src/prompts/sceneTypeCatalog.ts workers/storyboard/src/prompts/systemPrompt.ts workers/storyboard/tests/systemPrompt.test.ts workers/storyboard/DESIGN.md
git commit -m "$(cat <<'EOF'
feat(storyboard): teach Claude to prefer DeviceMockup as the opener

Adds:
- DeviceMockup catalog entry (sceneTypeCatalog.ts)
- HARD RULE #9: device must be 'laptop' (phone reserved but not rendered)
- CREATIVITY_DIRECTIVE: replace "VARY openers" line with DeviceMockup default

DESIGN.md updated voluntarily — hook does not fire for prompts/* (gap to be
addressed in a separate hook-coverage follow-up).

Per spec: docs/superpowers/specs/2026-04-27-device-mockup-hero-opener-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook does NOT fire for `workers/storyboard/src/prompts/`. Commit succeeds.

---

### Task 5: PromoComposition demo + final regression sweep

**Files:**
- Modify: `packages/remotion/src/compositions/PromoComposition.tsx`

The PromoComposition is the marketing video used by `pnpm lume render:promo`. Adding a DeviceMockup scene at the start gives the team a canonical visual reference and validates the scene end-to-end through real Remotion rendering.

- [ ] **Step 1: Read the current PromoComposition**

Run: `cat packages/remotion/src/compositions/PromoComposition.tsx`
Expected: identify the scenes array (or equivalent structure) — find where the opener / first scene is defined.

- [ ] **Step 2: Replace the opener with a DeviceMockup scene**

Edit `packages/remotion/src/compositions/PromoComposition.tsx`. Find the existing opener (likely a `HeroRealShot` or `TextPunch`) and replace it with a `DeviceMockup` invocation. Use a stable demo screenshot URL that already exists in the PromoComposition's asset references — most likely `assets.screenshots.viewport` is already wired from a fixture.

The replacement should look approximately like (adjust to match the file's actual JSX style — direct `<DeviceMockup .../>` if scenes are inline JSX, or a storyboard scene object if scenes are data-driven):

```typescript
<DeviceMockup
  headline="Turn any URL into a demo video"
  subtitle="Paste, hit enter, ship in 60 seconds"
  screenshotUrl={demoScreenshotUrl}
  device="laptop"
  motion="pushIn"
  durationInFrames={150}
  theme={theme}
/>
```

If PromoComposition uses a scene-data array passed through MainComposition, instead add a scene object:

```typescript
{
  sceneId: 1,
  type: 'DeviceMockup',
  durationInFrames: 150,
  entryAnimation: 'fade',
  exitAnimation: 'fade',
  props: {
    headline: 'Turn any URL into a demo video',
    subtitle: 'Paste, hit enter, ship in 60 seconds',
    screenshotKey: 'viewport',
    device: 'laptop',
    motion: 'pushIn',
  },
}
```

Add the `import { DeviceMockup } from '../scenes/DeviceMockup';` if the file uses inline JSX.

- [ ] **Step 3: Run remotion typecheck**

Run: `pnpm --filter @lumespec/remotion typecheck`
Expected: zero errors.

- [ ] **Step 4: Manual visual render (optional but recommended)**

Run: `pnpm lume render:promo`
Expected: outputs `docs/readme/demo-30s.mp4` and `docs/readme/demo-60s.mp4`. Open the MP4 and visually confirm the laptop shell renders, the screenshot fills the screen, the headline sits below, and the Push-In motion is smooth.

If the manual render reveals visual issues (clipping, broken scale, off-center headline), iterate on `DeviceMockup.tsx` until the render looks correct, then re-commit Task 2's component file.

- [ ] **Step 5: Run full monorepo test suite**

Run: `pnpm test`
Expected: all packages pass (apps/web 188+, apps/api 147+, workers/storyboard 152+, packages/remotion 65+, etc.). The earlier baseline was **740 passed / 3 skipped** (commit `3eaea1b`); after this task the count should be approximately **752 passed / 3 skipped** (added: 5 schema + 3 smoke + 3 resolveScene + 2 systemPrompt = 13).

- [ ] **Step 6: Commit**

```bash
git add packages/remotion/src/compositions/PromoComposition.tsx
git commit -m "$(cat <<'EOF'
feat(remotion): swap PromoComposition opener to DeviceMockup

The marketing/promo render now leads with the new DeviceMockup hero,
giving the team a canonical reference render and validating the scene
end-to-end through real Remotion encoding.

Per spec: docs/superpowers/specs/2026-04-27-device-mockup-hero-opener-design.md
Final regression sweep: pnpm test all green.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: hook does NOT fire (`packages/remotion/src/compositions/PromoComposition.tsx` is not in trigger list — only `Composition.tsx` at root and `scenes/**` are). Commit succeeds.

---

## Verification Checklist (after Task 5)

Before considering the feature shipped, verify each row:

| Check | Command / Action | Expected |
|---|---|---|
| Schema accepts new type | `pnpm --filter @lumespec/schema test storyboard.test` | DeviceMockup tests pass |
| Component renders both motions | `pnpm --filter @lumespec/remotion test DeviceMockup.smoke` | 3 tests pass |
| resolveScene dispatches correctly | `pnpm --filter @lumespec/remotion test resolveScene` | DeviceMockup case + both fallbacks pass |
| Prompt teaches AI to use it | `pnpm --filter @lumespec/worker-storyboard test systemPrompt` | DeviceMockup mention + HARD RULE present |
| Full monorepo green | `pnpm test` | ~752 passed / 3 skipped |
| Visual end-to-end | `pnpm lume render:promo` then open `docs/readme/demo-30s.mp4` | Laptop shell visible, screenshot fills screen, headline static below, smooth Pan/Zoom |
| All 5 commits land cleanly | `git log --oneline -5` | 5 new commits, all signed-off, none used `--no-verify` |

---

## Rollback

If any task uncovers a fundamental issue with the spec, the safe rollback for any landed commit is `git revert <sha>` — the changes are purely additive, so reverting Task 5 first then 4, 3, 2, 1 (reverse order) cleanly removes the feature without touching unrelated code paths.

If only PromoComposition (Task 5) needs reverting (e.g., a visual issue you want to fix later), that's a single-commit revert that leaves the schema/component/prompt infrastructure in place.
