# Phase 2 VersusSplit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship VersusSplit scene per spec `2026-04-28-scene-versus-split-phase2-design.md` — single new scene type for side-by-side comparison (before-after, them-us, old-new, slow-fast).

**Architecture:** Coordinated change across 3 packages (schema → workers/storyboard → packages/remotion) following CLAUDE.md "新增 Remotion 場景的正確順序". Reuses v1.7 Phase 1 infrastructure entirely (no new validators, no new prompt blocks). 5 tasks, ~1.5–2 hr eng.

**Tech Stack:** TypeScript 5, Zod 3, Vitest 2, React 18 + Remotion 4. No new deps.

---

## File Structure Map

| Task | Files modified / created |
|---|---|
| T1 | `packages/schema/src/storyboard.ts`, `packages/schema/tests/storyboard.test.ts`, `packages/schema/DESIGN.md` |
| T2 | `workers/storyboard/src/validation/extractiveCheck.ts`, `workers/storyboard/tests/extractiveCheck.test.ts`, `workers/storyboard/DESIGN.md` |
| T3 | `workers/storyboard/src/prompts/sceneTypeCatalog.ts`, `workers/storyboard/DESIGN.md` |
| T4 | `packages/remotion/src/scenes/VersusSplit.tsx` (NEW), `packages/remotion/src/resolveScene.tsx`, `packages/remotion/DESIGN.md` |
| T5 | (no code) — workspace typecheck + manual smoke + cleanup |

---

## Task 1: Schema — VersusSplitSchema + SCENE_TYPES

**Files:**
- Modify: `packages/schema/src/storyboard.ts`
- Test: `packages/schema/tests/storyboard.test.ts`
- DESIGN sync: `packages/schema/DESIGN.md`

- [ ] **Step 1: Write failing tests**

Append to `packages/schema/tests/storyboard.test.ts` before the final closing `});`:

```ts
describe('VersusSplit scene (Phase 2)', () => {
  const validVS = {
    type: 'VersusSplit' as const,
    sceneId: 1,
    durationInFrames: 120,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: {
      compareFraming: 'before-after' as const,
      left: { label: 'Before', value: '3 days in Figma', iconHint: '🐌' },
      right: { label: 'After', value: '60 seconds with LumeSpec', iconHint: '⚡' },
    },
  };

  it('accepts a minimal VersusSplit (no headline, no iconHints)', () => {
    const r = SceneSchema.safeParse({
      ...validVS,
      props: {
        compareFraming: 'them-us',
        left: { label: 'Them', value: 'their value' },
        right: { label: 'Us', value: 'our value' },
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a full VersusSplit with headline + iconHints', () => {
    const r = SceneSchema.safeParse({
      ...validVS,
      props: { ...validVS.props, headline: 'Old way vs new way' },
    });
    expect(r.success).toBe(true);
  });

  it.each(['before-after', 'them-us', 'old-new', 'slow-fast'] as const)(
    'accepts compareFraming: %s',
    (framing) => {
      const r = SceneSchema.safeParse({
        ...validVS,
        props: { ...validVS.props, compareFraming: framing },
      });
      expect(r.success).toBe(true);
    },
  );

  it('rejects unknown compareFraming', () => {
    const r = SceneSchema.safeParse({
      ...validVS,
      props: { ...validVS.props, compareFraming: 'us-vs-them' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects headline shorter than 3 chars', () => {
    const r = SceneSchema.safeParse({
      ...validVS,
      props: { ...validVS.props, headline: 'hi' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects left.value longer than 80 chars', () => {
    const r = SceneSchema.safeParse({
      ...validVS,
      props: { ...validVS.props, left: { label: 'Before', value: 'x'.repeat(81) } },
    });
    expect(r.success).toBe(false);
  });

  it('SCENE_TYPES array includes "VersusSplit"', () => {
    expect(SCENE_TYPES).toContain('VersusSplit');
  });
});
```

- [ ] **Step 2: Run — verify failures**

```bash
pnpm --filter @lumespec/schema test -- storyboard
```

Expected: ~9 new tests fail (missing schema). All existing tests pass.

- [ ] **Step 3: Add VersusSplitSchema to storyboard.ts**

In `packages/schema/src/storyboard.ts`, find `QuoteHeroSchema` (added in v1.7 Phase 1). Insert immediately after it:

```ts
// Phase 2 — side-by-side comparison scene (before/after, them/us, old/new,
// slow/fast). Both .value fields must be in sourceTexts (extractive enforces).
// .label is framing word (Before/After/etc.) — UI text, not extractive-checked.
const VersusSplitSchema = z.object({
  ...sceneBase,
  type: z.literal('VersusSplit'),
  props: z.object({
    headline: z.string().min(3).max(60).optional(),
    compareFraming: z.enum(['before-after', 'them-us', 'old-new', 'slow-fast']),
    left: z.object({
      label: z.string().min(2).max(30),
      value: z.string().min(1).max(80),
      iconHint: z.string().min(1).max(4).optional(),
    }),
    right: z.object({
      label: z.string().min(2).max(30),
      value: z.string().min(1).max(80),
      iconHint: z.string().min(1).max(4).optional(),
    }),
  }),
});
```

- [ ] **Step 4: Add to SceneSchema discriminated union**

Find `SceneSchema = z.discriminatedUnion('type', [...])`. Add `VersusSplitSchema` after `QuoteHeroSchema`:

```ts
export const SceneSchema = z.discriminatedUnion('type', [
  // ... existing ...
  TextPunchSchema,
  QuoteHeroSchema,
  VersusSplitSchema,    // ← NEW (Phase 2)
  CTASchema,
  // ... remaining ...
]);
```

DO NOT reorder existing entries.

- [ ] **Step 5: Add 'VersusSplit' to SCENE_TYPES**

Find `SCENE_TYPES = [...] as const`. Add `'VersusSplit'` after `'QuoteHero'`:

```ts
export const SCENE_TYPES = [
  // ... existing ...
  'TextPunch',
  'QuoteHero',
  'VersusSplit',    // ← NEW (Phase 2)
  'CTA',
  // ... remaining ...
] as const;
```

- [ ] **Step 6: Run schema tests — all pass**

```bash
pnpm --filter @lumespec/schema test
```

Expected: ~105 tests pass (was 96 + ~9 new).

- [ ] **Step 7: Schema-only typecheck clean**

```bash
pnpm --filter @lumespec/schema typecheck 2>&1 | tail -3
```

Expected: 0 errors.

- [ ] **Step 8: Update DESIGN.md (sync hook will block otherwise)**

In `packages/schema/DESIGN.md`, find the scene-type enumeration line (currently includes `QuoteHero` as last). Add `VersusSplit`:

```
目前支援：…、`DeviceMockup`、`QuoteHero`、`VersusSplit`
```

Add a new bullet alongside the existing v1.7 bullets:

```
- **`VersusSplitSchema`（Phase 2）** — 對比型 scene、`{ headline?, compareFraming: enum, left: {label, value, iconHint?}, right: {label, value, iconHint?} }`。雙邊 value 都必須 in sourceTexts（extractive check 強制）；label 是 framing word (Before/After/Them/Us…)、UI 用、不 extractive 檢查。`compareFraming` 4 值閉合：'before-after'|'them-us'|'old-new'|'slow-fast'。
```

- [ ] **Step 9: Commit**

```bash
git add packages/schema/src/storyboard.ts \
        packages/schema/tests/storyboard.test.ts \
        packages/schema/DESIGN.md
git commit -m "feat(schema): add VersusSplitSchema (Phase 2)"
```

---

## Task 2: Extractive check — case 'VersusSplit'

**Files:**
- Modify: `workers/storyboard/src/validation/extractiveCheck.ts`
- Test: `workers/storyboard/tests/extractiveCheck.test.ts`
- DESIGN sync: `workers/storyboard/DESIGN.md`

- [ ] **Step 1: Write failing tests**

Append to `workers/storyboard/tests/extractiveCheck.test.ts` before the final closing `});`. Use the existing `sb()` helper pattern (inspect file first to confirm — likely accepts scenes-only and constructs a Storyboard):

```ts
describe('VersusSplit scene (Phase 2)', () => {
  it('passes when headline + both values are in sourceTexts', () => {
    const board = sb([
      {
        type: 'VersusSplit',
        sceneId: 1,
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          headline: 'old way vs new way',
          compareFraming: 'before-after',
          left: { label: 'Before', value: '3 days in figma' },
          right: { label: 'After', value: '60 seconds with lumespec' },
        },
      },
    ]);
    board.assets.sourceTexts = [
      'old way vs new way',
      '3 days in figma',
      '60 seconds with lumespec',
    ];
    expect(extractiveCheck(board)).toEqual({ kind: 'ok' });
  });

  it('passes when headline absent and both values in pool', () => {
    const board = sb([
      {
        type: 'VersusSplit',
        sceneId: 1,
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          compareFraming: 'slow-fast',
          left: { label: 'Slow', value: 'manual setup' },
          right: { label: 'Fast', value: 'one-click deploy' },
        },
      },
    ]);
    board.assets.sourceTexts = ['manual setup', 'one-click deploy'];
    expect(extractiveCheck(board)).toEqual({ kind: 'ok' });
  });

  it('rejects when right.value is hallucinated', () => {
    const board = sb([
      {
        type: 'VersusSplit',
        sceneId: 1,
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          compareFraming: 'them-us',
          left: { label: 'Them', value: 'manual setup' },
          right: { label: 'Us', value: 'fabricated marketing claim' },
        },
      },
    ]);
    board.assets.sourceTexts = ['manual setup'];
    const r = extractiveCheck(board);
    expect(r.kind).toBe('error');
  });

  it('does NOT extractive-check label fields (Before/After/etc are UI framing)', () => {
    const board = sb([
      {
        type: 'VersusSplit',
        sceneId: 1,
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          compareFraming: 'before-after',
          // Labels not in sourceTexts — should still pass since labels are UI framing
          left: { label: 'Yesterday', value: 'manual setup' },
          right: { label: 'Today', value: 'one-click deploy' },
        },
      },
    ]);
    board.assets.sourceTexts = ['manual setup', 'one-click deploy'];
    expect(extractiveCheck(board)).toEqual({ kind: 'ok' });
  });
});
```

Adapt to actual `sb()` helper signature if different.

- [ ] **Step 2: Run — verify failures**

```bash
pnpm --filter @lumespec/worker-storyboard test -- extractiveCheck
```

Expected: 4 tests fail with `unhandled scene type VersusSplit` from `assertNever`.

- [ ] **Step 3: Add case in collectSceneTexts**

Open `workers/storyboard/src/validation/extractiveCheck.ts`. Find `collectSceneTexts` and the existing `case 'QuoteHero':` (added in v1.7). Insert AFTER it (and before the next case, likely `case 'CTA':`):

```ts
    case 'VersusSplit':
      return [
        ...(scene.props.headline ? [scene.props.headline] : []),
        scene.props.left.value,
        scene.props.right.value,
        // label fields are UI framing words (Before/After/etc.), not content;
        // intentionally NOT extractive-checked. Same approach as iconHint.
      ];
```

- [ ] **Step 4: Run — all pass**

```bash
pnpm --filter @lumespec/worker-storyboard test -- extractiveCheck
```

Expected: all 4 new tests pass + all existing tests still pass.

- [ ] **Step 5: Worker-storyboard typecheck**

```bash
pnpm --filter @lumespec/worker-storyboard typecheck 2>&1 | tail -5
```

Expected: 1 remaining error in `sceneTypeCatalog.ts` missing `'VersusSplit'` Record key (T3 scope, expected). NO assertNever errors.

- [ ] **Step 6: Update DESIGN.md**

In `workers/storyboard/DESIGN.md`, find the extractive section. Add:

```
- `collectSceneTexts` handles `case 'VersusSplit'` (Phase 2) — returns
  `[headline?, left.value, right.value]`. label fields are UI framing,
  intentionally not extractive-checked.
```

- [ ] **Step 7: Commit**

```bash
git add workers/storyboard/src/validation/extractiveCheck.ts \
        workers/storyboard/tests/extractiveCheck.test.ts \
        workers/storyboard/DESIGN.md
git commit -m "feat(extractive): add VersusSplit case (Phase 2)"
```

---

## Task 3: Prompt catalog — VersusSplit description + V1_IMPLEMENTED

**Files:**
- Modify: `workers/storyboard/src/prompts/sceneTypeCatalog.ts`
- DESIGN sync: `workers/storyboard/DESIGN.md`

No new tests — prompt content changes verified via T5 manual smoke.

- [ ] **Step 1: Add VersusSplit to SCENE_CATALOG**

Open `workers/storyboard/src/prompts/sceneTypeCatalog.ts`. Find the `QuoteHero:` entry. Insert immediately after for tidy diff:

```ts
  VersusSplit:
    'Side-by-side comparison scene — left vs right with strong visual contrast. Props: { headline? (centered above split, optional), compareFraming: "before-after"|"them-us"|"old-new"|"slow-fast", left: { label (UI framing word, e.g. "Before"), value (must be substring of sourceTexts), iconHint? (1 emoji) }, right: { label, value (must be substring of sourceTexts), iconHint? } }. Use when source contains a clear pair of comparable data points — performance numbers ("3 days" vs "60 seconds"), capability claims ("manual setup" vs "one-click"), market positioning. Strongest for hardsell + tech intents. Do NOT use if no genuine pair exists in sourceTexts — Claude must NOT fabricate a comparison just to use this scene.',
```

- [ ] **Step 2: Add 'VersusSplit' to V1_IMPLEMENTED_SCENE_TYPES**

In the same file, find `V1_IMPLEMENTED_SCENE_TYPES`. Add `'VersusSplit'` after `'QuoteHero'`:

```ts
export const V1_IMPLEMENTED_SCENE_TYPES = [
  // ... existing ...
  'TextPunch',
  'QuoteHero',
  'VersusSplit',    // ← NEW (Phase 2)
  'SmoothScroll',
  // ... remaining ...
] as const;
```

- [ ] **Step 3: Worker-storyboard typecheck CLEAN**

```bash
pnpm --filter @lumespec/worker-storyboard typecheck 2>&1 | tail -3
```

Expected: 0 errors. The `Record<(typeof SCENE_TYPES)[number], string>` constraint is now satisfied with VersusSplit added.

- [ ] **Step 4: Run full storyboard worker tests**

```bash
pnpm --filter @lumespec/worker-storyboard test
```

Expected: all tests pass (was 169 + 4 from T2 = 173).

- [ ] **Step 5: Update DESIGN.md**

In `workers/storyboard/DESIGN.md`, find the prompt section. Add:

```
- **`SCENE_CATALOG.VersusSplit` (Phase 2)** — describes the new scene with
  closed `compareFraming` enum (4 values), explicit data requirements
  (both .value fields from sourceTexts), and explicit anti-fabrication
  warning. `V1_IMPLEMENTED_SCENE_TYPES` extended to 14 entries.
```

- [ ] **Step 6: Commit**

```bash
git add workers/storyboard/src/prompts/sceneTypeCatalog.ts \
        workers/storyboard/DESIGN.md
git commit -m "feat(prompt): VersusSplit catalog entry + V1_IMPLEMENTED extension (Phase 2)"
```

---

## Task 4: Remotion — VersusSplit component + resolveScene case

**Files:**
- Create: `packages/remotion/src/scenes/VersusSplit.tsx`
- Modify: `packages/remotion/src/resolveScene.tsx`
- DESIGN sync: `packages/remotion/DESIGN.md`

- [ ] **Step 1: Create VersusSplit.tsx**

Create `packages/remotion/src/scenes/VersusSplit.tsx`:

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface VersusSplitProps {
  headline?: string;
  compareFraming: 'before-after' | 'them-us' | 'old-new' | 'slow-fast';
  left: { label: string; value: string; iconHint?: string };
  right: { label: string; value: string; iconHint?: string };
  theme: BrandTheme;
}

// Animation timing — diagonal-progression: left animates earlier than right
// to build anticipation for the right-side reveal (English reading direction).
// Total entry ~32 frames at 30fps. Assumes scene durationInFrames >= 90.
const HEADLINE_FADE_IN = [4, 12] as const;
const LEFT_LABEL_FADE_IN = [8, 18] as const;
const LEFT_ICON_FADE_IN = [12, 22] as const;
const LEFT_VALUE_FADE_IN = [16, 28] as const;
const RIGHT_LABEL_FADE_IN = [12, 22] as const;
const RIGHT_ICON_FADE_IN = [16, 26] as const;
const RIGHT_VALUE_FADE_IN = [20, 32] as const;

export const VersusSplit: React.FC<VersusSplitProps> = ({
  headline,
  left,
  right,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const bgScale = interpolate(frame, [0, durationInFrames], [1.0, 1.02], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const headlineOpacity = interpolate(frame, [...HEADLINE_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const leftLabelOpacity = interpolate(frame, [...LEFT_LABEL_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const leftIconOpacity = interpolate(frame, [...LEFT_ICON_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const leftValueOpacity = interpolate(frame, [...LEFT_VALUE_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const leftValueY = interpolate(frame, [...LEFT_VALUE_FADE_IN], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const rightLabelOpacity = interpolate(frame, [...RIGHT_LABEL_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rightIconOpacity = interpolate(frame, [...RIGHT_ICON_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rightValueOpacity = interpolate(frame, [...RIGHT_VALUE_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rightValueY = interpolate(frame, [...RIGHT_VALUE_FADE_IN], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: '#0d0d1a', transform: `scale(${bgScale})` }}>
      {/* Optional headline at top center */}
      {headline && (
        <div
          style={{
            position: 'absolute',
            top: 90,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 32,
            fontWeight: 600,
            color: '#fff',
            opacity: headlineOpacity * 0.6,
            letterSpacing: 1,
          }}
        >
          {headline}
        </div>
      )}

      {/* Left half */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          right: '50%',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 200,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 600,
            color: '#9ca3af',
            opacity: leftLabelOpacity,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {left.label}
        </div>
        {left.iconHint && (
          <div
            style={{
              position: 'absolute',
              top: '40%',
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 100,
              opacity: leftIconOpacity * 0.6,
              filter: 'grayscale(1)',
            }}
          >
            {left.iconHint}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top: '70%',
            left: 40,
            right: 40,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 56,
            fontWeight: 700,
            color: '#fff',
            opacity: leftValueOpacity,
            transform: `translateY(${leftValueY}px)`,
            lineHeight: 1.15,
          }}
        >
          {left.value}
        </div>
      </div>

      {/* Vertical divider */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 'calc(50% - 2px)',
          width: 4,
          background: theme.primary,
          opacity: 0.7,
        }}
      />

      {/* Right half */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          left: '50%',
          background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark} 100%)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 200,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 600,
            color: theme.textOn,
            opacity: rightLabelOpacity,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {right.label}
        </div>
        {right.iconHint && (
          <div
            style={{
              position: 'absolute',
              top: '40%',
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 100,
              color: theme.textOn,
              opacity: rightIconOpacity * 0.8,
            }}
          >
            {right.iconHint}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top: '70%',
            left: 40,
            right: 40,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 56,
            fontWeight: 700,
            color: theme.textOn,
            opacity: rightValueOpacity,
            transform: `translateY(${rightValueY}px)`,
            lineHeight: 1.15,
          }}
        >
          {right.value}
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Add VersusSplit case to resolveScene**

Open `packages/remotion/src/resolveScene.tsx`. Add to imports:

```ts
import { VersusSplit } from './scenes/VersusSplit';
```

Find the switch. Add a new case after `case 'QuoteHero':` block:

```ts
    case 'VersusSplit':
      return (
        <VersusSplit
          {...(scene.props.headline ? { headline: scene.props.headline } : {})}
          compareFraming={scene.props.compareFraming}
          left={scene.props.left}
          right={scene.props.right}
          theme={theme}
        />
      );
```

(No screenshot needed — VersusSplit is gradient + icon-only, doesn't touch `assets.screenshots`.)

- [ ] **Step 3: Remotion typecheck CLEAN**

```bash
pnpm --filter @lumespec/remotion typecheck 2>&1 | tail -3
```

Expected: 0 errors. The exhaustive switch in resolveScene is now satisfied for VersusSplit.

- [ ] **Step 4: Workspace typecheck CLEAN**

```bash
pnpm typecheck 2>&1 | grep -E "error|Done|Tasks" | tail -10
```

Expected: 0 errors across all 9 packages.

- [ ] **Step 5: Run remotion tests**

```bash
pnpm --filter @lumespec/remotion test 2>&1 | grep -E "Tests |passed|failed" | tail -3
```

Expected: 78 tests still pass.

- [ ] **Step 6: Update DESIGN.md**

In `packages/remotion/DESIGN.md`, find the scenes section (already has v1.7 TextPunch + QuoteHero bullets). Add:

```
- **`VersusSplit` (Phase 2)** — 對比型 scene、左右分屏展示。Left 側 desaturated dark
  gray gradient + 灰色 label/icon/value；right 側 brand-color gradient + theme.textOn
  label/icon/value。Center 4px brand-color vertical divider 70% opacity。
  Diagonal-progression 入場：left 比 right 早 4 frames 動畫，呼應 LTR 閱讀預期。
  整體 Ken Burns 1.0→1.02 cinematic settle。Optional headline 90px from top centered。
  Icon 是 single emoji（schema 4 字元上限）— left 加 grayscale filter，right 全色。
  不使用 screenshots — `resolveScene` 不呼叫 resolver。
```

- [ ] **Step 7: Commit**

```bash
git add packages/remotion/src/scenes/VersusSplit.tsx \
        packages/remotion/src/resolveScene.tsx \
        packages/remotion/DESIGN.md
git commit -m "feat(remotion): VersusSplit scene component (Phase 2)"
```

---

## Task 5: Workspace verify + manual smoke

**Files:** No code changes (verification only).

- [ ] **Step 1: Workspace typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "error|Done" | tail -10
```

Expected: 0 errors.

- [ ] **Step 2: Full workspace test**

```bash
pnpm test 2>&1 | grep -E "Test Files|^      Tests" | tail -20
```

Expected: ~847 tests passing (was 837 + ~10 new). 0 failures.

- [ ] **Step 3: Restart workers (pick up new schema + prompt)**

```bash
pnpm lume stop && pnpm lume start
pnpm lume status
```

Expected: all 5 services UP.

- [ ] **Step 4: Manual smoke render — vercel hardsell (best chance for VersusSplit)**

```bash
node scripts/render-showcase-videos.mjs https://vercel.com vercel-phase2-smoke
```

Wait for completion (should be cache-hit fast, <2 min total). DO NOT commit these MP4s — they're throwaway smoke artifacts.

- [ ] **Step 5: Inspect storyboards for VersusSplit usage**

Get the smoke job IDs from postgres:

```bash
docker exec -i lumespec-postgres-1 psql -U lumespec -d lumespec -t -c "SELECT id FROM jobs WHERE created_at > NOW() - INTERVAL '5 minutes' AND status='done' ORDER BY created_at;"
```

For each, check storyboard scene types:

```bash
for jobId in <id1> <id2> <id3>; do
  echo "=== $jobId ==="
  curl -s "http://localhost:9000/lumespec-dev/jobs/$jobId/storyboard.json" | python3 -c "
import sys, json
sb = json.load(sys.stdin)
types = [s['type'] for s in sb['scenes']]
vs = [s for s in sb['scenes'] if s['type']=='VersusSplit']
print(f'  types: {types}')
if vs:
    for v in vs:
        p = v['props']
        print(f'  VS framing={p[\"compareFraming\"]} left={p[\"left\"][\"value\"]!r} right={p[\"right\"][\"value\"]!r}')
"
done
```

**Acceptance:** if VersusSplit appears in ANY of 3 vercel storyboards — Phase 2 fully demonstrated. If 0 trigger, that's still acceptable (acknowledged risk in spec §6 — Claude won't fabricate). Schema + extractive + renderer are all wired and pass typecheck regardless.

- [ ] **Step 6: Clean up smoke artifacts**

```bash
rm apps/landing/public/showcase/vercel-phase2-smoke-*.mp4
```

- [ ] **Step 7: Confirm git status clean**

```bash
git status
```

Expected: clean. No leftover untracked files.

---

## Self-Review

**1. Spec coverage:** Each spec section maps to a task — schema (T1), extractive (T2), prompt (T3), renderer (T4), smoke (T5). ✓

**2. Placeholder scan:** No "TBD" / "TODO". One acknowledged variable name (`<id1>`/`<id2>` in Step 5) is genuinely unknowable until smoke runs. ✓

**3. Type consistency:** `VersusSplit` literal used identically across schema (T1), extractive (T2), prompt catalog (T3), renderer prop (T4), smoke check (T5). `compareFraming` enum values match across schema + prompt + tests. ✓
