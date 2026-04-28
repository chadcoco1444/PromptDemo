# Scene Library v1.7 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the visual-diversity intervention from spec `2026-04-28-scene-library-v1.7-design.md`: 1 new scene (QuoteHero), 2 TextPunch variants (photoBackdrop + slideBlock), prompt+telemetry constraints, plus a deferred extractive-check fix (joinedPool fast-path).

**Architecture:** Coordinated changes across 3 packages (schema → remotion → storyboard) following CLAUDE.md's "新增 Remotion 場景的正確順序". Schema changes are backward-compatible (new optional `variant` field defaults to existing behavior). Soft validator emits structured logs; never rejects. Screenshot URL for photoBackdrop variant flows through the existing `assets.screenshots` + `s3Resolver` pipeline that HeroRealShot already uses.

**Tech Stack:** TypeScript 5, Zod 3, Vitest 2, React 18 + Remotion 4, BullMQ + Pino-style logger, pnpm workspaces.

---

## Pre-flight (before Task 1)

- [ ] **Confirm working tree clean**

```bash
git status
```
Expected: `nothing to commit, working tree clean` OR only known untracked files unrelated to this work. If dirty, stash or commit those first — this plan assumes a clean baseline.

- [ ] **Confirm tests pass on baseline**

```bash
pnpm test 2>&1 | grep -E "Tests |failed"
```
Expected: 817 tests passed, 0 failed (apps/api occasionally flakes on `pg 42P18 simulated` — re-run if so).

---

## File Structure Map

This decomposition maps each spec section to concrete file changes per task:

| Task | Files modified / created | Spec section |
|---|---|---|
| T1 | `workers/storyboard/src/validation/extractiveCheck.ts`, `workers/storyboard/tests/extractiveCheck.test.ts`, `workers/storyboard/DESIGN.md` | §3.1 joinedPool fast-path |
| T2 | `packages/schema/src/storyboard.ts`, `packages/schema/tests/storyboard.test.ts`, `packages/schema/DESIGN.md` | §3.1 + §3.2 (schema only) |
| T3 | `workers/storyboard/src/validation/extractiveCheck.ts`, `workers/storyboard/tests/extractiveCheck.test.ts`, `workers/storyboard/DESIGN.md` | §3.1 (extractive integration) |
| T4 | `workers/storyboard/src/validation/textPunchDiscipline.ts` (NEW), `workers/storyboard/tests/textPunchDiscipline.test.ts` (NEW), `workers/storyboard/src/index.ts`, `workers/storyboard/DESIGN.md` | §3.5 |
| T5 | `workers/storyboard/src/prompts/sceneTypeCatalog.ts`, `workers/storyboard/src/prompts/systemPrompt.ts`, `workers/storyboard/DESIGN.md` | §3.4 |
| T6 | `packages/remotion/src/scenes/TextPunch.tsx`, `packages/remotion/src/resolveScene.tsx`, `packages/remotion/DESIGN.md` | §3.2 + §3.3 (renderer) |
| T7 | `packages/remotion/src/scenes/QuoteHero.tsx` (NEW), `packages/remotion/src/resolveScene.tsx`, `packages/remotion/DESIGN.md` | §3.1 (renderer) |
| T8 | full workspace typecheck + manual render smoke + final commit if any DESIGN.md missed | §9 acceptance criteria |

---

## Task 1: Extractive check `joinedPool` fast-path

**Why first:** Independent of all other v1.7 work. Resolves the deferred "Claude joins phrases across sourceTexts entries" bug class from this morning's `save up to 40% off` Burton incident. Solving this first unblocks QuoteHero's reliability later. Small (~10 LOC + tests).

**Files:**
- Modify: `workers/storyboard/src/validation/extractiveCheck.ts`
- Test: `workers/storyboard/tests/extractiveCheck.test.ts`
- DESIGN sync: `workers/storyboard/DESIGN.md`

- [ ] **Step 1: Write the failing test**

Add at the END of `workers/storyboard/tests/extractiveCheck.test.ts` (just before the final `});` closing the outermost `describe`). Open the file, find the last `});` of the outermost describe, insert before it:

```ts
  // Regression: 2026-04-28 Burton tech intent — Claude legitimately joined
  // promo phrases that lived in separate sourceTexts entries. Substring
  // against any single pool entry failed; fuzzy distance was over threshold
  // because the joined string was much longer than any individual entry.
  // Fix: also try substring inclusion against the full pool joined with " ".
  it('matches phrases that span multiple sourceTexts entries (joinedPool fast-path)', () => {
    const sb: Storyboard = makeStoryboard({
      sourceTexts: ['Save up to 40% off', 'select boards, boots, outerwear, and more'],
      scenes: [
        textPunch(1, 'save up to 40% off select boards, boots, outerwear, and more'),
      ],
    });
    expect(extractiveCheck(sb)).toEqual({ kind: 'ok' });
  });
```

This assumes `makeStoryboard` and `textPunch` test helpers exist in the file. Verify by running:

```bash
grep -n "makeStoryboard\|function textPunch\|const textPunch" workers/storyboard/tests/extractiveCheck.test.ts | head -5
```

If those helpers don't exist with those exact names, find the equivalent (every existing test in this file uses some helper to construct a storyboard + scene). Adapt the test code to use whatever helper exists. The semantics (test name, source pool with 2 entries that concat to match the scene text, expect `{kind:'ok'}`) MUST stay the same.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lumespec/worker-storyboard test -- extractiveCheck
```

Expected: 1 test fails with `kind: 'error', violations: [...]` (the new joinedPool test). All other extractive tests still pass.

- [ ] **Step 3: Implement the joinedPool fast-path**

Open `workers/storyboard/src/validation/extractiveCheck.ts`. Find the function `extractiveCheck` near the bottom (around line 149). Inside it, locate where `cjkPoolJoined` is computed:

```ts
  const cjkPoolJoined = pool.join(' | ');
```

Add a new constant right after it:

```ts
  const joinedPool = pool.join(' ');
```

Then in the `phraseMatches` function (around line 93), find the existing substring check:

```ts
  if (pool.some((p) => p.includes(n))) return true;
```

We need to pass `joinedPool` into `phraseMatches` and check it too. Update the function signature and add the joinedPool check. The whole change to `phraseMatches`:

```ts
function phraseMatches(
  n: string,
  pool: string[],
  cjkPoolJoined: string,
  joinedPool: string,
  fuse: Fuse<string>
): boolean {
  if (!n) return true;
  if (isCjk(n)) {
    if (cjkPoolJoined.includes(n)) return true;
    if (n.length >= 3) {
      for (let i = 0; i <= n.length - 3; i++) {
        if (cjkPoolJoined.includes(n.slice(i, i + 3))) return true;
      }
    }
    return false;
  }
  // Substring inclusion fast-path against single pool entries.
  if (pool.some((p) => p.includes(n))) return true;
  // joinedPool fast-path — catches phrases that legitimately span multiple
  // sourceTexts entries (Claude joins testimonial header + body + author,
  // or promo headline + product list, etc.). Symmetric for all scene types.
  // Regression source: 2026-04-28 Burton tech "save up to 40% off select boards..."
  if (joinedPool.includes(n)) return true;
  const best = fuse.search(n)[0];
  return !!best && best.score !== undefined && best.score <= FUSE_THRESHOLD;
}
```

Then update every call to `phraseMatches` and `allSegmentsMatch` to thread the new `joinedPool` argument. There are 5 call sites in this file:
- 1 inside `allSegmentsMatch` itself (must add `joinedPool` to `allSegmentsMatch` signature too)
- 4 inside `extractiveCheck`'s 4-pass loop (Pass 1 + Pass 2 + Pass 3 + Pass 4)

Update `allSegmentsMatch` signature similarly:

```ts
function allSegmentsMatch(
  n: string,
  separator: RegExp,
  pool: string[],
  cjkPoolJoined: string,
  joinedPool: string,
  fuse: Fuse<string>
): boolean {
  const segments = n
    .split(separator)
    .map(normalizeSegment)
    .filter((s) => s.length >= MIN_SEGMENT_LEN);
  if (segments.length < 2) return false;
  return segments.every((seg) => phraseMatches(seg, pool, cjkPoolJoined, joinedPool, fuse));
}
```

And in `extractiveCheck` body, update each call to pass `joinedPool` as the new argument:

```ts
      let matched = phraseMatches(n, pool, cjkPoolJoined, joinedPool, fuse);
      if (!matched && STRONG_SEPARATORS.test(n)) {
        matched = allSegmentsMatch(n, STRONG_SEPARATORS, pool, cjkPoolJoined, joinedPool, fuse);
      }
      if (!matched && COMMA_SEPARATOR.test(n)) {
        matched = allSegmentsMatch(n, COMMA_SEPARATOR, pool, cjkPoolJoined, joinedPool, fuse);
      }
      if (!matched && SENTENCE_SEPARATOR.test(n)) {
        matched = allSegmentsMatch(n, SENTENCE_SEPARATOR, pool, cjkPoolJoined, joinedPool, fuse);
      }
```

- [ ] **Step 4: Run extractive tests — all pass**

```bash
pnpm --filter @lumespec/worker-storyboard test -- extractiveCheck
```

Expected: all extractive tests pass, including the new joinedPool one.

- [ ] **Step 5: Run full storyboard worker test suite**

```bash
pnpm --filter @lumespec/worker-storyboard test
```

Expected: 0 failed (was 155 passing before T1; now ~156).

- [ ] **Step 6: Update DESIGN.md (sync hook will block commit otherwise)**

Open `workers/storyboard/DESIGN.md`. Find the section that documents `extractiveCheck` validation passes (search for "extractive" or "Pass 1"). Add a one-line note describing the new joinedPool behavior:

```
- Pass 1 also checks substring inclusion against `joinedPool = pool.join(' ')`,
  catching phrases that span multiple `sourceTexts` entries (e.g., Claude joins
  testimonial header + body, or promo headline + product list). Symmetric across
  all scene types. Added 2026-04-28 (Burton tech "save up to 40% off select
  boards..." regression).
```

If no specific extractive section exists, add it under the validation/extractive subsection (find it via `grep -n "extractive" workers/storyboard/DESIGN.md`). If no such subsection at all, append a new H3 `### Extractive check passes` near the end of the validation discussion.

- [ ] **Step 7: Commit**

```bash
git add workers/storyboard/src/validation/extractiveCheck.ts \
        workers/storyboard/tests/extractiveCheck.test.ts \
        workers/storyboard/DESIGN.md
git commit -m "fix(extractive): add joinedPool fast-path for cross-entry quote matching"
```

Pre-commit DESIGN.md sync hook should pass (modified worker validation file + synced DESIGN.md). If hook fails, do NOT use `--no-verify` — read the hook output and fix.

---

## Task 2: Schema — TextPunch `variant` field + QuoteHero schema

**Files:**
- Modify: `packages/schema/src/storyboard.ts`
- Test: `packages/schema/tests/storyboard.test.ts`
- DESIGN sync: `packages/schema/DESIGN.md`

- [ ] **Step 1: Write the failing tests**

Open `packages/schema/tests/storyboard.test.ts`. Locate where existing scene schemas are tested (search for `TextPunchSchema` or `type: 'TextPunch'`). Add the following tests in an appropriate place (typically alongside other scene schema tests):

```ts
  describe('TextPunch variant field (v1.7)', () => {
    it('accepts variant: "default" explicitly', () => {
      const result = SceneSchema.safeParse({
        type: 'TextPunch',
        sceneId: 1,
        durationInFrames: 90,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { text: 'Ship faster.', emphasis: 'primary', variant: 'default' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts variant: "photoBackdrop"', () => {
      const result = SceneSchema.safeParse({
        type: 'TextPunch',
        sceneId: 1,
        durationInFrames: 90,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { text: 'Ship faster.', emphasis: 'primary', variant: 'photoBackdrop' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts variant: "slideBlock"', () => {
      const result = SceneSchema.safeParse({
        type: 'TextPunch',
        sceneId: 1,
        durationInFrames: 90,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { text: 'Ship faster.', emphasis: 'primary', variant: 'slideBlock' },
      });
      expect(result.success).toBe(true);
    });

    it('defaults variant to "default" when omitted (backward-compat)', () => {
      const result = SceneSchema.safeParse({
        type: 'TextPunch',
        sceneId: 1,
        durationInFrames: 90,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { text: 'Ship faster.', emphasis: 'primary' },
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'TextPunch') {
        expect(result.data.props.variant).toBe('default');
      }
    });

    it('rejects unknown variant value', () => {
      const result = SceneSchema.safeParse({
        type: 'TextPunch',
        sceneId: 1,
        durationInFrames: 90,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { text: 'Ship faster.', emphasis: 'primary', variant: 'tilted' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('QuoteHero scene (v1.7)', () => {
    const validQuoteHero = {
      type: 'QuoteHero' as const,
      sceneId: 2,
      durationInFrames: 180,
      entryAnimation: 'fade' as const,
      exitAnimation: 'fade' as const,
      props: {
        quote: 'We replaced 3 days of Figma with one paste-and-wait.',
        author: 'Sarah Chen',
        attribution: 'Founder, Acme Inc.',
      },
    };

    it('accepts a minimal QuoteHero (no attribution, no backgroundHint)', () => {
      const result = SceneSchema.safeParse({
        ...validQuoteHero,
        props: { quote: validQuoteHero.props.quote, author: validQuoteHero.props.author },
      });
      expect(result.success).toBe(true);
    });

    it('accepts a full QuoteHero with attribution + backgroundHint', () => {
      const result = SceneSchema.safeParse({
        ...validQuoteHero,
        props: { ...validQuoteHero.props, backgroundHint: 'screenshot' },
      });
      expect(result.success).toBe(true);
    });

    it('defaults backgroundHint to "gradient" when omitted', () => {
      const result = SceneSchema.safeParse(validQuoteHero);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'QuoteHero') {
        expect(result.data.props.backgroundHint).toBe('gradient');
      }
    });

    it('rejects quote shorter than 10 characters', () => {
      const result = SceneSchema.safeParse({
        ...validQuoteHero,
        props: { ...validQuoteHero.props, quote: 'tiny' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects quote longer than 280 characters', () => {
      const result = SceneSchema.safeParse({
        ...validQuoteHero,
        props: { ...validQuoteHero.props, quote: 'x'.repeat(281) },
      });
      expect(result.success).toBe(false);
    });

    it('SCENE_TYPES array includes "QuoteHero"', () => {
      expect(SCENE_TYPES).toContain('QuoteHero');
    });
  });
```

If the file doesn't import `SCENE_TYPES` already, add it to the existing imports at the top:

```ts
import { SceneSchema, SCENE_TYPES } from '../src/storyboard';
```

(Adjust to whatever the existing import style is — the file may already import these.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @lumespec/schema test -- storyboard
```

Expected: ~11 new tests fail (variant tests fail because field doesn't exist; QuoteHero tests fail because schema doesn't exist; SCENE_TYPES test fails because 'QuoteHero' not in array).

- [ ] **Step 3: Add `variant` field to TextPunchSchema**

Open `packages/schema/src/storyboard.ts`. Find `TextPunchSchema` (around line 139). The current definition is:

```ts
const TextPunchSchema = z.object({
  ...sceneBase,
  type: z.literal('TextPunch'),
  props: z.object({
    text: z.string().min(1),
    emphasis: z.enum(['primary', 'secondary', 'neutral']),
  }),
});
```

Replace it with:

```ts
const TextPunchSchema = z.object({
  ...sceneBase,
  type: z.literal('TextPunch'),
  props: z.object({
    text: z.string().min(1),
    emphasis: z.enum(['primary', 'secondary', 'neutral']),
    // v1.7 visual-diversity variants. Backward-compat: existing storyboards
    // without `variant` default to 'default', renders identically to v1.6.
    // - default: solid color block + fade in/out (legacy behavior)
    // - photoBackdrop: source-page screenshot bg, dark overlay, shadow text, Ken Burns
    // - slideBlock: colored block slides in from right, holds, slides out to left
    variant: z.enum(['default', 'photoBackdrop', 'slideBlock']).default('default'),
  }),
});
```

- [ ] **Step 4: Add QuoteHeroSchema**

In the same file, add a new schema definition near the other scene schemas (place it after `TextPunchSchema`, before the `SceneSchema = z.discriminatedUnion(...)` line):

```ts
// v1.7 — single cinematic pull-quote with author. Replaces TextPunch in the
// "one dramatic line of customer voice" niche with a visually richer alternative.
// All three text fields must appear in sourceTexts (extractive check enforces).
const QuoteHeroSchema = z.object({
  ...sceneBase,
  type: z.literal('QuoteHero'),
  props: z.object({
    quote: z.string().min(10).max(280),
    author: z.string().min(2).max(80),
    attribution: z.string().min(2).max(120).optional(),
    backgroundHint: z.enum(['gradient', 'screenshot']).optional().default('gradient'),
  }),
});
```

- [ ] **Step 5: Add QuoteHeroSchema to SceneSchema discriminated union**

Find the `SceneSchema = z.discriminatedUnion('type', [...])` declaration (around line 229). Add `QuoteHeroSchema` to the array of schemas. Place it after `TextPunchSchema` for tidy diff:

```ts
export const SceneSchema = z.discriminatedUnion('type', [
  HeroRealShotSchema,
  // ... existing schemas ...
  TextPunchSchema,
  QuoteHeroSchema,    // ← NEW
  CTASchema,
  // ... remaining schemas ...
]);
```

- [ ] **Step 6: Add 'QuoteHero' to SCENE_TYPES array**

Find the `SCENE_TYPES = [...] as const` declaration (around line 247). Add `'QuoteHero'` after `'TextPunch'`:

```ts
export const SCENE_TYPES = [
  'HeroRealShot',
  // ... existing ...
  'TextPunch',
  'QuoteHero',    // ← NEW
  'CTA',
  // ... remaining ...
] as const;
```

- [ ] **Step 7: Run schema tests — all pass**

```bash
pnpm --filter @lumespec/schema test
```

Expected: all schema tests pass, including the 11 new ones added in Step 1. Total ~96 (was 85).

- [ ] **Step 8: Update DESIGN.md (sync hook will block commit)**

Open `packages/schema/DESIGN.md`. Find the responsibilities section that lists scene types (around line 41 — the `**場景 Schema（discriminated union）**` bullet). Update the scene type enumeration:

Find:
```
目前支援：`FeatureCallout`、`HeroRealShot`、`BentoGrid`、`StatsCounter`、`ReviewMarquee`、`LogoCloud`、`CodeToUI`、`DeviceMockup`
```

Replace with (add `QuoteHero`):
```
目前支援：`FeatureCallout`、`HeroRealShot`、`BentoGrid`、`StatsCounter`、`ReviewMarquee`、`LogoCloud`、`CodeToUI`、`DeviceMockup`、`QuoteHero`
```

Also, find the `normalizeText` section (we added it for the v1.6 ampersand fix) and append the new TextPunch.variant note in the section that lists key interfaces:

Add a new bullet under "共享工具類型":

```
- **`TextPunchSchema.props.variant`（v1.7）** — 'default' | 'photoBackdrop' | 'slideBlock'。Backward-compat：未帶 variant 欄位的舊 storyboard 自動 default。Renderer 端 (packages/remotion) branch 渲染。
```

And add a new bullet:

```
- **`QuoteHeroSchema`（v1.7）** — 新 scene type、單則 pull-quote (10-280 char) + author (2-80 char) + 可選 attribution + 可選 backgroundHint('gradient'|'screenshot')。所有 text 欄位都受 extractive check 約束（見 workers/storyboard/DESIGN.md）。
```

- [ ] **Step 9: Commit**

```bash
git add packages/schema/src/storyboard.ts \
        packages/schema/tests/storyboard.test.ts \
        packages/schema/DESIGN.md
git commit -m "feat(schema): add TextPunch.variant field + QuoteHero schema (v1.7)"
```

---

## Task 3: Extractive check — `case 'QuoteHero'`

**Files:**
- Modify: `workers/storyboard/src/validation/extractiveCheck.ts`
- Test: `workers/storyboard/tests/extractiveCheck.test.ts`
- DESIGN sync: `workers/storyboard/DESIGN.md`

- [ ] **Step 1: Write the failing tests**

Append to `workers/storyboard/tests/extractiveCheck.test.ts` (just before the final outermost `});`):

```ts
  describe('QuoteHero scene (v1.7)', () => {
    it('passes when quote, author, and attribution all appear in sourceTexts', () => {
      const sb: Storyboard = makeStoryboard({
        sourceTexts: [
          'We replaced 3 days of Figma with one paste-and-wait.',
          'Sarah Chen',
          'Founder, Acme Inc.',
        ],
        scenes: [
          {
            type: 'QuoteHero',
            sceneId: 1,
            durationInFrames: 180,
            entryAnimation: 'fade',
            exitAnimation: 'fade',
            props: {
              quote: 'We replaced 3 days of Figma with one paste-and-wait.',
              author: 'Sarah Chen',
              attribution: 'Founder, Acme Inc.',
              backgroundHint: 'gradient',
            },
          },
        ],
      });
      expect(extractiveCheck(sb)).toEqual({ kind: 'ok' });
    });

    it('rejects when author is hallucinated', () => {
      const sb: Storyboard = makeStoryboard({
        sourceTexts: ['We replaced 3 days of Figma with one paste-and-wait.'],
        scenes: [
          {
            type: 'QuoteHero',
            sceneId: 1,
            durationInFrames: 180,
            entryAnimation: 'fade',
            exitAnimation: 'fade',
            props: {
              quote: 'We replaced 3 days of Figma with one paste-and-wait.',
              author: 'Made-Up Person',
              backgroundHint: 'gradient',
            },
          },
        ],
      });
      const result = extractiveCheck(sb);
      expect(result.kind).toBe('error');
    });

    it('passes when quote spans multiple sourceTexts entries (uses joinedPool from T1)', () => {
      const sb: Storyboard = makeStoryboard({
        sourceTexts: [
          'We replaced 3 days of Figma',                      // entry 1
          'with one paste-and-wait — and never looked back.', // entry 2
          'Sarah Chen',
          'Founder',
        ],
        scenes: [
          {
            type: 'QuoteHero',
            sceneId: 1,
            durationInFrames: 180,
            entryAnimation: 'fade',
            exitAnimation: 'fade',
            props: {
              quote: 'We replaced 3 days of Figma with one paste-and-wait — and never looked back.',
              author: 'Sarah Chen',
              backgroundHint: 'gradient',
            },
          },
        ],
      });
      expect(extractiveCheck(sb)).toEqual({ kind: 'ok' });
    });
  });
```

Adjust `makeStoryboard` helper usage to match whatever helper signature the existing tests use.

- [ ] **Step 2: Run tests — verify failure**

```bash
pnpm --filter @lumespec/worker-storyboard test -- extractiveCheck
```

Expected: 3 new tests fail because `collectSceneTexts` has no case for `QuoteHero` — the `assertNever` at the bottom throws. Error message will mention `unhandled scene type QuoteHero`.

- [ ] **Step 3: Add the case in collectSceneTexts**

Open `workers/storyboard/src/validation/extractiveCheck.ts`. Find `collectSceneTexts` function (line 31). Find a place between existing cases — for tidy diff, place after `case 'TextPunch':` (line 48) and before `case 'CTA':` (line 50). Insert:

```ts
    case 'QuoteHero':
      return [
        scene.props.quote,
        scene.props.author,
        ...(scene.props.attribution ? [scene.props.attribution] : []),
      ];
```

- [ ] **Step 4: Run tests — all pass**

```bash
pnpm --filter @lumespec/worker-storyboard test -- extractiveCheck
```

Expected: all extractive tests pass, including the 3 new QuoteHero ones. The cross-entry test ("spans multiple sourceTexts") passes because Task 1's joinedPool fast-path is already in place.

- [ ] **Step 5: Update DESIGN.md**

In `workers/storyboard/DESIGN.md`, find the section describing extractive check (or the responsibilities section that lists what the worker validates). Add a one-line note:

```
- `collectSceneTexts` now handles `case 'QuoteHero'` — returns
  `[quote, author, attribution]`. Quote uses joinedPool fast-path
  (see Pass 1 docs above) for cross-entry tolerance.
```

- [ ] **Step 6: Commit**

```bash
git add workers/storyboard/src/validation/extractiveCheck.ts \
        workers/storyboard/tests/extractiveCheck.test.ts \
        workers/storyboard/DESIGN.md
git commit -m "feat(extractive): add QuoteHero case (v1.7)"
```

---

## Task 4: Soft validator `textPunchDiscipline` + telemetry

**Files:**
- Create: `workers/storyboard/src/validation/textPunchDiscipline.ts`
- Create: `workers/storyboard/tests/textPunchDiscipline.test.ts`
- Modify: `workers/storyboard/src/index.ts`
- DESIGN sync: `workers/storyboard/DESIGN.md`

- [ ] **Step 1: Write the failing tests (validator unit tests)**

Create `workers/storyboard/tests/textPunchDiscipline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateTextPunchDiscipline } from '../src/validation/textPunchDiscipline.js';
import type { Storyboard } from '@lumespec/schema';

function makeSb(types: Array<{ type: string; variant?: string }>): Storyboard {
  return {
    videoConfig: {
      durationInFrames: types.length * 90,
      fps: 30,
      brandColor: '#1a1a1a',
      bgm: 'minimal',
      showWatermark: false,
    },
    assets: { screenshots: {}, sourceTexts: ['placeholder text for tests'] },
    scenes: types.map((t, i) => {
      if (t.type === 'TextPunch') {
        return {
          type: 'TextPunch',
          sceneId: i + 1,
          durationInFrames: 90,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: {
            text: 'placeholder text for tests',
            emphasis: 'primary',
            variant: (t.variant ?? 'default') as 'default' | 'photoBackdrop' | 'slideBlock',
          },
        };
      }
      return {
        type: 'CTA',
        sceneId: i + 1,
        durationInFrames: 90,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { headline: 'placeholder text for tests', url: 'https://example.com' },
      };
    }) as Storyboard['scenes'],
  };
}

describe('evaluateTextPunchDiscipline', () => {
  it('reports zero TextPunch when none present', () => {
    const sb = makeSb([{ type: 'CTA' }, { type: 'CTA' }]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(0);
    expect(r.consecutive).toBe(0);
    expect(r.violatesMaxCount).toBe(false);
    expect(r.violatesNoConsecutive).toBe(false);
  });

  it('counts a single TextPunch (no violation)', () => {
    const sb = makeSb([{ type: 'CTA' }, { type: 'TextPunch', variant: 'default' }, { type: 'CTA' }]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(1);
    expect(r.consecutive).toBe(0);
    expect(r.violatesMaxCount).toBe(false);
    expect(r.violatesNoConsecutive).toBe(false);
    expect(r.variantCounts).toEqual({ default: 1 });
  });

  it('flags violatesMaxCount when total > 2', () => {
    const sb = makeSb([
      { type: 'TextPunch' },
      { type: 'CTA' },
      { type: 'TextPunch' },
      { type: 'CTA' },
      { type: 'TextPunch' },
    ]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(3);
    expect(r.consecutive).toBe(0);
    expect(r.violatesMaxCount).toBe(true);
    expect(r.violatesNoConsecutive).toBe(false);
  });

  it('flags violatesNoConsecutive when adjacent TextPunches present', () => {
    const sb = makeSb([
      { type: 'CTA' },
      { type: 'TextPunch' },
      { type: 'TextPunch' },
      { type: 'CTA' },
    ]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(2);
    expect(r.consecutive).toBe(1);
    expect(r.violatesMaxCount).toBe(false);
    expect(r.violatesNoConsecutive).toBe(true);
  });

  it('counts multiple consecutive runs correctly', () => {
    // TP TP TP CTA TP TP -> consecutive adjacencies = 2 + 1 = 3
    const sb = makeSb([
      { type: 'TextPunch' },
      { type: 'TextPunch' },
      { type: 'TextPunch' },
      { type: 'CTA' },
      { type: 'TextPunch' },
      { type: 'TextPunch' },
    ]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(5);
    expect(r.consecutive).toBe(3);
    expect(r.violatesMaxCount).toBe(true);
    expect(r.violatesNoConsecutive).toBe(true);
  });

  it('aggregates variantCounts by variant value', () => {
    const sb = makeSb([
      { type: 'TextPunch', variant: 'photoBackdrop' },
      { type: 'CTA' },
      { type: 'TextPunch', variant: 'slideBlock' },
      { type: 'CTA' },
      { type: 'TextPunch', variant: 'photoBackdrop' },
    ]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.variantCounts).toEqual({ photoBackdrop: 2, slideBlock: 1 });
  });
});
```

- [ ] **Step 2: Run tests — verify failure**

```bash
pnpm --filter @lumespec/worker-storyboard test -- textPunchDiscipline
```

Expected: all 6 tests fail with `Cannot find module './validation/textPunchDiscipline.js'`.

- [ ] **Step 3: Implement the validator**

Create `workers/storyboard/src/validation/textPunchDiscipline.ts`:

```ts
import type { Storyboard } from '@lumespec/schema';

/**
 * v1.7 soft validator — measures TextPunch usage discipline per the spec
 * (max 2 per storyboard, never consecutive). Does NOT reject; only reports.
 * Caller logs the report for telemetry; future Phase 5 may decide to upgrade
 * to hard rejection (Zod refinement) once we have prod data.
 */

export interface TextPunchDisciplineReport {
  total: number;                          // total TextPunch scenes in storyboard
  consecutive: number;                    // count of TextPunch-TextPunch adjacencies
  variantCounts: Record<string, number>;  // 'default' | 'photoBackdrop' | 'slideBlock'
  violatesMaxCount: boolean;              // total > 2
  violatesNoConsecutive: boolean;         // consecutive > 0
}

const MAX_TEXTPUNCH_PER_STORYBOARD = 2;

export function evaluateTextPunchDiscipline(sb: Storyboard): TextPunchDisciplineReport {
  const scenes = sb.scenes;
  let total = 0;
  let consecutive = 0;
  const variantCounts: Record<string, number> = {};

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene || scene.type !== 'TextPunch') continue;
    total += 1;
    const variant = scene.props.variant ?? 'default';
    variantCounts[variant] = (variantCounts[variant] ?? 0) + 1;
    const next = scenes[i + 1];
    if (next && next.type === 'TextPunch') consecutive += 1;
  }

  return {
    total,
    consecutive,
    variantCounts,
    violatesMaxCount: total > MAX_TEXTPUNCH_PER_STORYBOARD,
    violatesNoConsecutive: consecutive > 0,
  };
}
```

- [ ] **Step 4: Run validator tests — all pass**

```bash
pnpm --filter @lumespec/worker-storyboard test -- textPunchDiscipline
```

Expected: all 6 tests pass.

- [ ] **Step 5: Wire into worker pipeline (index.ts)**

Open `workers/storyboard/src/index.ts`. Find the place where the storyboard is validated AFTER zod parse + extractive check, BEFORE upload to S3. Search for `extractiveCheck` to locate the call site.

Add an import near the top with the other validation imports:

```ts
import { evaluateTextPunchDiscipline } from './validation/textPunchDiscipline.js';
```

Find the line just AFTER the extractive check passes (where the code proceeds to upload). Add this code:

```ts
    // v1.7 soft telemetry — log TextPunch discipline. Does NOT reject.
    const discipline = evaluateTextPunchDiscipline(storyboard);
    console.log(
      `[storyboard-discipline] jobId=${payload.jobId} ` +
      `textPunchTotal=${discipline.total} consecutive=${discipline.consecutive} ` +
      `violatesMax=${discipline.violatesMaxCount} violatesConsec=${discipline.violatesNoConsecutive} ` +
      `variants=${JSON.stringify(discipline.variantCounts)}`,
    );
```

The variable name holding the parsed storyboard may differ — adapt accordingly. Search for where `extractiveCheck(...)` is called, and add this immediately after that block (after the `if result.kind === 'error'` handler).

If `payload.jobId` doesn't exist in the local scope, use whatever job ID variable is in scope (the worker handler will have one — Bull's job.data has it).

- [ ] **Step 6: Verify worker still passes tests**

```bash
pnpm --filter @lumespec/worker-storyboard test
```

Expected: all 161+ tests pass (155 baseline + 1 from T1 + 3 from T3 + 6 from T4 = ~165).

- [ ] **Step 7: Update DESIGN.md**

In `workers/storyboard/DESIGN.md`, in the validation section, add:

```
- **`textPunchDiscipline` (v1.7 soft validator)** — analyzes the post-validate
  storyboard for TextPunch usage discipline (max 2 per storyboard, never
  consecutive). Always returns a report; never throws or rejects. Caller in
  `index.ts` logs a structured single-line summary (`[storyboard-discipline]
  jobId=... textPunchTotal=... consecutive=... ...`) for prod telemetry.
  Phase 5+ may decide to upgrade to hard Zod refinement once we accumulate
  ~50+ prod log lines showing Claude's actual compliance pattern.
```

- [ ] **Step 8: Commit**

```bash
git add workers/storyboard/src/validation/textPunchDiscipline.ts \
        workers/storyboard/tests/textPunchDiscipline.test.ts \
        workers/storyboard/src/index.ts \
        workers/storyboard/DESIGN.md
git commit -m "feat(storyboard): textPunchDiscipline soft validator + log telemetry (v1.7)"
```

---

## Task 5: Prompt updates — SCENE PACING DISCIPLINE + QuoteHero catalog

**Files:**
- Modify: `workers/storyboard/src/prompts/sceneTypeCatalog.ts`
- Modify: `workers/storyboard/src/prompts/systemPrompt.ts`
- DESIGN sync: `workers/storyboard/DESIGN.md`

This task has no new tests of its own — prompt content changes are validated by the actual generation behavior, which we exercise via the manual smoke render in T8. The wiring change (adding 'QuoteHero' to V1_IMPLEMENTED_SCENE_TYPES) is covered by typecheck.

- [ ] **Step 1: Add QuoteHero to SCENE_CATALOG**

Open `workers/storyboard/src/prompts/sceneTypeCatalog.ts`. Find the `SCENE_CATALOG` Record (around line 3). It maps each scene type to a description string. Add a new entry. Place it right after `TextPunch` for tidy diff (search for the line `TextPunch:` — it's the entry described as "Full-screen text beat for pacing"):

```ts
  QuoteHero:
    'Single cinematic pull-quote with author attribution — visually richer alternative to TextPunch for "one dramatic line of customer voice" moments. Props: { quote (10-280 chars, must be substring of sourceTexts; use joinedPool tolerance for multi-entry quotes), author (must appear in sourceTexts), attribution? (role + company, also from sourceTexts), backgroundHint?: "gradient" | "screenshot" — default "gradient" for soft fallback, "screenshot" enables source-page bg with Ken Burns }. Use INSTEAD OF TextPunch when source contains testimonial / press quote / customer voice content. Do NOT pair with ReviewMarquee on the same quote pool — choose one based on count: 1 dramatic quote → QuoteHero, 3+ short endorsements → ReviewMarquee.',
```

Also find the `V1_IMPLEMENTED_SCENE_TYPES` array near the bottom of the same file. Add `'QuoteHero'` entry. Place it after `'TextPunch'` for tidy diff:

```ts
export const V1_IMPLEMENTED_SCENE_TYPES = [
  'DeviceMockup',
  'HeroRealShot',
  'FeatureCallout',
  'TextPunch',
  'QuoteHero',    // ← NEW
  'SmoothScroll',
  'CTA',
  'BentoGrid',
  'CursorDemo',
  'StatsCounter',
  'ReviewMarquee',
  'LogoCloud',
  'CodeToUI',
] as const;
```

- [ ] **Step 2: Update TextPunch catalog entry to mention variant**

In the same file, find the existing `TextPunch:` entry. The current value is:

```ts
  TextPunch:
    'Full-screen text beat for pacing. Props: { text, emphasis: "primary"|"secondary"|"neutral" }. Use to break up rhythm between feature scenes.',
```

Replace with:

```ts
  TextPunch:
    'Full-screen text beat for pacing. Props: { text, emphasis: "primary"|"secondary"|"neutral", variant?: "default"|"photoBackdrop"|"slideBlock" — default "default" }. Use to break up rhythm between feature scenes. Visual variants: "default" = solid color block (legacy), "photoBackdrop" = source-page screenshot background with dark overlay, "slideBlock" = colored block slides in/out horizontally. When using TextPunch more than once in a storyboard, alternate variants for visual variety. For dramatic single-line customer voice, use QuoteHero instead.',
```

- [ ] **Step 3: Add SCENE PACING DISCIPLINE block to systemPrompt**

Open `workers/storyboard/src/prompts/systemPrompt.ts`. Find a logical place to add a new section. The `HARD_RULES` and `CREATIVITY_DIRECTIVE` constants are at the top. Add a NEW constant after `CREATIVITY_DIRECTIVE`:

```ts
const SCENE_PACING_DISCIPLINE = `
SCENE PACING DISCIPLINE (v1.7):

- TextPunch is for short single-line emphasis. Do NOT use it more than 2 times in a single storyboard.
- NEVER place TextPunch scenes consecutively. If you have two punctuation beats in a row, the second MUST be a different scene type (BentoGrid, FeatureCallout, QuoteHero, etc.) or you must merge them.
- If you want a dramatic single quote with attribution (testimonial, press quote, customer voice), use QuoteHero instead of TextPunch. QuoteHero is visually richer and the right tool for that moment.
- When TextPunch appears more than once in the storyboard, alternate the \`variant\` field between 'photoBackdrop' (source-page screenshot bg) and 'slideBlock' (sliding color block) to maintain visual variety. Avoid 'default' more than once unless variant data is unavailable.
- QuoteHero requires testimonial-shape source content (a quote + an author name). If sourceTexts has neither, use TextPunch (with non-default variant) for that beat instead.
`.trim();
```

Then find where the prompt is assembled and exported. Search for `HARD_RULES` and `CREATIVITY_DIRECTIVE` to find where they're concatenated into the final prompt. Add `SCENE_PACING_DISCIPLINE` to that concatenation. The exact insertion site depends on existing structure — typically prompts are joined with `\n\n` separators. Mirror whatever pattern exists.

If the file exports a function like `buildSystemPrompt()` that string-joins these constants, add `SCENE_PACING_DISCIPLINE` to the array/template it joins. Place it AFTER `CREATIVITY_DIRECTIVE` (so it's read in the order: hard rules → creativity → pacing discipline).

- [ ] **Step 4: Run storyboard worker tests**

```bash
pnpm --filter @lumespec/worker-storyboard test
```

Expected: all tests still pass. Prompt changes don't have direct test coverage; we verify via manual smoke in T8.

- [ ] **Step 5: Update DESIGN.md**

In `workers/storyboard/DESIGN.md`, find the section that describes prompt assembly (or scene type catalog). Add:

```
- **`SCENE_PACING_DISCIPLINE` (v1.7)** — new prompt block enforcing soft
  rules: TextPunch ≤ 2 per storyboard, never consecutive, prefer QuoteHero
  for testimonial/customer-voice moments, alternate TextPunch variants for
  visual variety. Soft enforcement only — `textPunchDiscipline` validator
  measures compliance via log telemetry; no hard rejection in Phase 1.
- **`SCENE_CATALOG.QuoteHero` (v1.7)** — describes the new scene type with
  explicit data requirements (quote + author both from sourceTexts) and
  discrimination from ReviewMarquee (1 dramatic quote vs 3+ endorsements).
- **`V1_IMPLEMENTED_SCENE_TYPES`** — now includes 'QuoteHero'. Claude is
  told this is in the allowed type list.
```

- [ ] **Step 6: Commit**

```bash
git add workers/storyboard/src/prompts/sceneTypeCatalog.ts \
        workers/storyboard/src/prompts/systemPrompt.ts \
        workers/storyboard/DESIGN.md
git commit -m "feat(prompt): SCENE PACING DISCIPLINE + QuoteHero catalog (v1.7)"
```

---

## Task 6: Remotion — TextPunch variant rendering

**Files:**
- Modify: `packages/remotion/src/scenes/TextPunch.tsx`
- Modify: `packages/remotion/src/resolveScene.tsx`
- DESIGN sync: `packages/remotion/DESIGN.md`

This task adds variant render branches in TextPunch + threads the screenshot URL through resolveScene. Following the spec §3.2 + §3.3.

- [ ] **Step 1: Update resolveScene to thread screenshot URL into TextPunch**

Open `packages/remotion/src/resolveScene.tsx`. Find the `case 'TextPunch':` (around line 62). Currently:

```ts
    case 'TextPunch':
      return <TextPunch text={scene.props.text} emphasis={scene.props.emphasis} theme={theme} />;
```

Replace with:

```ts
    case 'TextPunch': {
      // v1.7: thread screenshot for photoBackdrop variant. Mirrors the
      // HeroRealShot + CursorDemo pattern of resolving s3://... → CDN URL
      // via the resolver function. If viewport screenshot missing,
      // TextPunch component falls back to default variant render.
      const screenshotUrl = resolver(assets.screenshots.viewport);
      return (
        <TextPunch
          text={scene.props.text}
          emphasis={scene.props.emphasis}
          variant={scene.props.variant}
          theme={theme}
          {...(screenshotUrl ? { screenshotUrl } : {})}
        />
      );
    }
```

- [ ] **Step 2: Update TextPunch component to handle variants**

Open `packages/remotion/src/scenes/TextPunch.tsx`. Replace the current file content with:

```tsx
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';

export interface TextPunchProps {
  text: string;
  emphasis: 'primary' | 'secondary' | 'neutral';
  variant?: 'default' | 'photoBackdrop' | 'slideBlock';
  theme: BrandTheme;
  screenshotUrl?: string;  // optional; required for photoBackdrop, falls back to default if absent
}

export const TextPunch: React.FC<TextPunchProps> = ({
  text,
  emphasis,
  variant = 'default',
  theme,
  screenshotUrl,
}) => {
  // photoBackdrop falls back to default if screenshot URL is missing —
  // graceful degradation per spec §3.2 (no exception thrown).
  const effectiveVariant =
    variant === 'photoBackdrop' && !screenshotUrl ? 'default' : variant;

  if (effectiveVariant === 'photoBackdrop') {
    return <PhotoBackdropVariant text={text} screenshotUrl={screenshotUrl!} />;
  }
  if (effectiveVariant === 'slideBlock') {
    return <SlideBlockVariant text={text} emphasis={emphasis} theme={theme} />;
  }
  return <DefaultVariant text={text} emphasis={emphasis} theme={theme} />;
};

const DefaultVariant: React.FC<{ text: string; emphasis: TextPunchProps['emphasis']; theme: BrandTheme }> = ({
  text,
  emphasis,
  theme,
}) => {
  const bg =
    emphasis === 'primary' ? theme.primary : emphasis === 'secondary' ? theme.primaryDark : '#111';
  const color = emphasis === 'neutral' ? '#fff' : theme.textOn;
  return (
    <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 1000, textAlign: 'center', color, padding: 80 }}>
        <AnimatedText text={text} mode="charFade" style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }} />
      </div>
    </AbsoluteFill>
  );
};

const PhotoBackdropVariant: React.FC<{ text: string; screenshotUrl: string }> = ({ text, screenshotUrl }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Slow Ken Burns: 1.0 → 1.04 over scene duration.
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Faded screenshot background with Ken Burns + blur */}
      <AbsoluteFill style={{ transform: `scale(${scale})`, filter: 'blur(3px)', opacity: 0.22 }}>
        <Img src={screenshotUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      {/* Dark gradient overlay for text legibility */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 100%)' }} />
      {/* Foreground text with shadow */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            maxWidth: 1000,
            textAlign: 'center',
            color: '#fff',
            padding: 80,
            textShadow: '0 4px 24px rgba(0,0,0,0.6)',
          }}
        >
          <AnimatedText text={text} mode="charFade" style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SlideBlockVariant: React.FC<{ text: string; emphasis: TextPunchProps['emphasis']; theme: BrandTheme }> = ({
  text,
  emphasis,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const bg =
    emphasis === 'primary' ? theme.primary : emphasis === 'secondary' ? theme.primaryDark : '#111';
  const color = emphasis === 'neutral' ? '#fff' : theme.textOn;

  // Block slides in from right over first 12 frames, holds, slides out to left over last 8 frames.
  const enterProgress = spring({ frame, fps, config: { mass: 1, damping: 18, stiffness: 80 } });
  const exitStart = durationInFrames - 8;
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // x-translation: 100% → 0% (enter) → -100% (exit)
  const enterX = interpolate(enterProgress, [0, 1], [100, 0]);
  const exitX = interpolate(exitProgress, [0, 1], [0, -100]);
  const finalX = exitProgress > 0 ? exitX : enterX;

  // Text fades in 4 frames after block stops.
  const textOpacity = interpolate(frame, [12, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `translateX(${finalX}%)`, background: bg }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: textOpacity,
          }}
        >
          <div style={{ maxWidth: 1000, textAlign: 'center', color, padding: 80 }}>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>{text}</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: Run remotion typecheck**

```bash
pnpm --filter @lumespec/remotion typecheck 2>&1 | tail -10
```

Expected: 0 errors. The `Img` import from `remotion` is used by HeroRealShot already; we mirror it here.

- [ ] **Step 4: Run remotion tests**

```bash
pnpm --filter @lumespec/remotion test
```

Expected: 78+ tests pass. The `compositionRegistry.test.ts` test should still pass (TextPunch is still registered, just with new variants internally).

- [ ] **Step 5: Update DESIGN.md**

In `packages/remotion/DESIGN.md`, find the scenes / responsibilities section. Add:

```
- **`TextPunch` (v1.7 multi-variant)** — single component, branches on
  `variant` prop:
  - `default`: legacy solid color block + AnimatedText fade (existing render)
  - `photoBackdrop`: source-page screenshot at 22% opacity, blurred 3px,
    Ken Burns 1.0→1.04, dark gradient overlay for text legibility, white
    text with drop-shadow. Falls back to `default` if `screenshotUrl` prop
    is undefined (graceful — no exception).
  - `slideBlock`: solid color block translates from right (100%→0%) via
    spring (mass 1, damping 18, stiffness 80) on entry; holds; translates
    to left (0%→-100%) over final 8 frames on exit. Text fade-in starts
    4 frames after block stops moving.
  Resolved screenshot URL flows through `resolveScene` via the existing
  `resolver(assets.screenshots.viewport)` pattern (same as HeroRealShot,
  CursorDemo, SmoothScroll).
```

- [ ] **Step 6: Commit**

```bash
git add packages/remotion/src/scenes/TextPunch.tsx \
        packages/remotion/src/resolveScene.tsx \
        packages/remotion/DESIGN.md
git commit -m "feat(remotion): TextPunch photoBackdrop + slideBlock variants (v1.7)"
```

---

## Task 7: Remotion — QuoteHero scene component

**Files:**
- Create: `packages/remotion/src/scenes/QuoteHero.tsx`
- Modify: `packages/remotion/src/resolveScene.tsx`
- DESIGN sync: `packages/remotion/DESIGN.md`

- [ ] **Step 1: Create the QuoteHero component**

Create `packages/remotion/src/scenes/QuoteHero.tsx`:

```tsx
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface QuoteHeroProps {
  quote: string;
  author: string;
  attribution?: string;
  backgroundHint: 'gradient' | 'screenshot';
  screenshotUrl?: string;  // resolved viewport screenshot when backgroundHint === 'screenshot'
  theme: BrandTheme;
}

export const QuoteHero: React.FC<QuoteHeroProps> = ({
  quote,
  author,
  attribution,
  backgroundHint,
  screenshotUrl,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Slow Ken Burns on background.
  const bgScale = interpolate(frame, [0, durationInFrames], [1.0, 1.05], { extrapolateRight: 'clamp' });

  // Quote text 8-frame upward slide-in + fade.
  const quoteOpacity = interpolate(frame, [6, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const quoteTranslateY = interpolate(frame, [6, 22], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Author block fades in slightly later.
  const authorOpacity = interpolate(frame, [18, 32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const useScreenshot = backgroundHint === 'screenshot' && !!screenshotUrl;

  return (
    <AbsoluteFill style={{ background: '#0d0d1a' }}>
      {/* Background — gradient OR faded screenshot */}
      {useScreenshot ? (
        <AbsoluteFill style={{ transform: `scale(${bgScale})`, opacity: 0.08 }}>
          <Img src={screenshotUrl!} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            background: `linear-gradient(135deg, ${theme.primaryDark} 0%, #0d0d1a 100%)`,
            transform: `scale(${bgScale})`,
          }}
        />
      )}

      {/* Huge opening quote glyph top-left */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 80,
          fontSize: 280,
          fontFamily: 'Georgia, serif',
          color: theme.primary,
          opacity: 0.7,
          lineHeight: 1,
        }}
      >
        &ldquo;
      </div>

      {/* Quote body */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 120, paddingRight: 80 }}>
        <div
          style={{
            maxWidth: 1300,
            opacity: quoteOpacity,
            transform: `translateY(${quoteTranslateY}px)`,
          }}
        >
          <div
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: 56,
              fontWeight: 500,
              lineHeight: 1.3,
              color: '#fff',
            }}
          >
            {quote}
          </div>

          {/* Author block */}
          <div style={{ opacity: authorOpacity, marginTop: 60 }}>
            <div style={{ width: 140, height: 3, background: theme.primary, marginBottom: 24 }} />
            <div
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 22,
                fontWeight: 600,
                color: '#e5e5e5',
              }}
            >
              {author}
            </div>
            {attribution && (
              <div
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 18,
                  color: theme.primary,
                  marginTop: 4,
                }}
              >
                {attribution}
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Add QuoteHero to resolveScene**

Open `packages/remotion/src/resolveScene.tsx`. Add to imports near the top:

```ts
import { QuoteHero } from './scenes/QuoteHero';
```

Find the switch statement. Add a new case after `case 'TextPunch':` (or anywhere — TS exhaustive switch will compile-error if missing). Insert:

```ts
    case 'QuoteHero': {
      const screenshotUrl =
        scene.props.backgroundHint === 'screenshot' ? resolver(assets.screenshots.viewport) : undefined;
      return (
        <QuoteHero
          quote={scene.props.quote}
          author={scene.props.author}
          {...(scene.props.attribution ? { attribution: scene.props.attribution } : {})}
          backgroundHint={scene.props.backgroundHint}
          {...(screenshotUrl ? { screenshotUrl } : {})}
          theme={theme}
        />
      );
    }
```

- [ ] **Step 3: Run remotion typecheck — exhaustive switch must compile**

```bash
pnpm --filter @lumespec/remotion typecheck 2>&1 | tail -10
```

Expected: 0 errors. If `Scene` discriminated union doesn't include QuoteHero, typecheck will fail (means T2 schema work didn't land — go fix).

- [ ] **Step 4: Run workspace typecheck (catches cross-package issues)**

```bash
pnpm typecheck 2>&1 | grep -E "error|Done" | tail -20
```

Expected: 0 errors across all 9 packages.

- [ ] **Step 5: Run remotion tests**

```bash
pnpm --filter @lumespec/remotion test
```

Expected: all tests pass. If `compositionRegistry.test.ts` enforces every scene type has a render path, it should pass now (we added QuoteHero to resolveScene).

- [ ] **Step 6: Update DESIGN.md**

In `packages/remotion/DESIGN.md`, find the scenes section. Add:

```
- **`QuoteHero` (v1.7)** — single cinematic pull-quote with author. Background
  is gradient (default) OR faded source screenshot (8% opacity + Ken Burns)
  when `backgroundHint === 'screenshot'` AND `screenshotUrl` is provided.
  Large Georgia serif quote (56px, max 1300px width), 8-frame upward fade-in
  for quote, slightly delayed fade-in for author block. Brand-color thin
  underline (140px × 3px) above author. `resolveScene` threads
  `assets.screenshots.viewport` through `resolver` only when
  `backgroundHint === 'screenshot'` (avoids needless screenshot fetch
  when gradient bg requested).
```

- [ ] **Step 7: Commit**

```bash
git add packages/remotion/src/scenes/QuoteHero.tsx \
        packages/remotion/src/resolveScene.tsx \
        packages/remotion/DESIGN.md
git commit -m "feat(remotion): QuoteHero scene component (v1.7)"
```

---

## Task 8: Workspace integration smoke + final verification

**Files:** No code changes (verification only). May commit DESIGN.md sweep if anything was missed.

- [ ] **Step 1: Workspace-level typecheck**

```bash
pnpm typecheck 2>&1 | grep -E "error|Done|Tasks" | tail -15
```

Expected: 0 errors across all 9 packages.

- [ ] **Step 2: Full workspace test**

```bash
pnpm test 2>&1 | grep -E "Test Files|Tests |failed" | tail -25
```

Expected: ~830 tests passing (817 baseline + ~13 new from T1-T4). 0 failures (apps/api may flake on `pg 42P18` — re-run if so).

- [ ] **Step 3: Restart workers to pick up new schema**

Worker tsx caches modules at boot. Hot-fix to schema requires restart for the storyboard worker to pick up `QuoteHero` schema and the new prompt.

```bash
pnpm lume stop && pnpm lume start
pnpm lume status
```

Expected: all 5 services UP (crawler, storyboard, render, api, web).

- [ ] **Step 4: Manual smoke render**

Submit a single test job for a brand likely to trigger QuoteHero (Burton has testimonial-style content). The render-showcase script is reusable:

```bash
node scripts/render-showcase-videos.mjs https://www.burton.com/ burton-v17-smoke
```

Note the new `burton-v17-smoke` filename prefix avoids overwriting the v1.6 production showcase MP4s.

Expected behavior:
- Script submits 3 jobs (hardsell + tech + emotional) and downloads MP4s to `apps/landing/public/showcase/burton-v17-smoke-*.mp4`
- Storyboard worker logs include at least one `[storyboard-discipline]` line per job (T4 telemetry — confirms it wired in)
- At least one of the 3 storyboards contains either a `QuoteHero` scene OR a TextPunch with `variant: 'photoBackdrop'` or `'slideBlock'` (Claude has been told about them in the prompt)

- [ ] **Step 5: Inspect telemetry log**

```bash
grep "storyboard-discipline" .tmp/demo/logs/storyboard.log | tail -3
```

Expected: structured log lines showing total/consecutive/variants for the test jobs. Confirms T4 integration.

- [ ] **Step 6: Inspect storyboard JSONs to confirm new scene types appearing**

```bash
docker exec -i lumespec-postgres-1 psql -U lumespec -d lumespec \
  -c "SELECT id, storyboard_uri FROM jobs WHERE created_at > NOW() - INTERVAL '15 minutes' AND status='done' ORDER BY created_at DESC LIMIT 3;"
```

For each `storyboard_uri`, fetch and inspect:

```bash
curl -s "http://localhost:9000/lumespec-dev/jobs/<jobId>/storyboard.json" | python3 -c "
import sys, json
sb = json.load(sys.stdin)
types = [s['type'] for s in sb.get('scenes', [])]
variants = [s.get('props', {}).get('variant') for s in sb.get('scenes', []) if s['type'] == 'TextPunch']
print('  types:', types)
print('  textpunch variants:', variants)
print('  has QuoteHero:', 'QuoteHero' in types)
"
```

Expected (across the 3 storyboards): at least 1 storyboard shows either a `QuoteHero` entry OR a non-default `variant` value in TextPunch. Telemetry logs corroborate.

If NO storyboard shows v1.7 features, investigate:
- Is the prompt actually including SCENE_PACING_DISCIPLINE? (`grep DISCIPLINE workers/storyboard/src/prompts/systemPrompt.ts` and verify the const is referenced in prompt assembly)
- Is V1_IMPLEMENTED_SCENE_TYPES exported and includes QuoteHero? (`grep -A2 V1_IMPLEMENTED workers/storyboard/src/prompts/sceneTypeCatalog.ts`)
- Is sourceTexts content non-testimonial-shaped on burton? (rare — burton has reviews; should work)

- [ ] **Step 7: Verify MP4 outputs**

```bash
ls -lh apps/landing/public/showcase/burton-v17-smoke-*.mp4
```

Expected: 3 MP4s, each ~3-9 MB, valid `ISO Media MP4`. If any contains a TextPunch.photoBackdrop with screenshot, manual visual inspection (open the MP4) should show a faded screenshot bg, NOT a transparent/black bg (Gotcha 2 verification).

- [ ] **Step 8: Clean up smoke artifacts (do NOT commit them)**

```bash
rm apps/landing/public/showcase/burton-v17-smoke-*.mp4
```

These were ad-hoc test renders. Production showcase MP4s (`vercel-*`, `burton-*` without `-v17-smoke`) are untouched.

- [ ] **Step 9: Final DESIGN.md sweep — verify all 3 are synced**

```bash
git status
```

If any DESIGN.md isn't updated for a touched src file, the pre-commit hook would have already blocked. But double-check:

```bash
git log --oneline -8 | head -10
```

Expected: 7 commits land for v1.7 (T1 → T7). If T8 had any DESIGN.md additions, commit them now:

```bash
# only if anything left modified
git add -A && git commit -m "docs(design): v1.7 sweep — final DESIGN.md sync if missed"
```

- [ ] **Step 10: Push (triggers no deploy — landing untouched, but main branch consistency)**

```bash
git push origin main
```

`apps/landing/**` was NOT touched in v1.7 Phase 1 — deploy workflow path-filter excludes this push. (Re-rendering the showcase with v1.7 features is explicitly out of scope per spec §6 — deferred decision.)

---

## Self-Review

**1. Spec coverage (§-by-§ map):**
- Spec §3.1 QuoteHero schema → T2 ✅
- Spec §3.1 QuoteHero extractive (joinedPool + new case) → T1 + T3 ✅
- Spec §3.2 TextPunch.photoBackdrop variant → T2 (schema) + T6 (renderer) ✅
- Spec §3.3 TextPunch.slideBlock variant → T2 (schema) + T6 (renderer) ✅
- Spec §3.4 SCENE PACING DISCIPLINE prompt → T5 ✅
- Spec §3.5 textPunchDiscipline soft validator → T4 ✅
- Spec §4 file map → distributed across T1-T7, all 14 files touched ✅
- Spec §6 explicit out-of-scope → respected (no re-render of showcase, no apps/landing changes, no P4 hard reject)
- Spec §7 risks → mitigations baked in (joinedPool fix in T1, screenshot fallback in T6, presigned URL via existing resolver pattern)
- Spec §9 acceptance criteria → T8 verifies all 6

**2. Placeholder scan:** No "TBD", "TODO", "fill in details". One acknowledged ambiguity (T4 Step 5: "variable name holding parsed storyboard may differ — adapt") is appropriate handover detail.

**3. Type consistency:**
- `variant` field uses identical enum across schema (T2), validator types (T4), renderer prop (T6), prompt catalog (T5)
- `QuoteHeroProps` in renderer (T7) matches schema field names (`quote`, `author`, `attribution`, `backgroundHint`)
- `evaluateTextPunchDiscipline` signature consistent between definition (T4 Step 3), tests (T4 Step 1), and call site (T4 Step 5)
- `screenshotUrl` flows: resolveScene (T6/T7) → component prop (T6/T7) — same name in all 3 places

---

## Phase 2-4 backlog (NOT in this plan — committed during brainstorming)

Recorded in `memory/project_scene_library_v17_backlog.md`:
- Phase 2: VersusSplit scene (~3 hr)
- Phase 3: ProcessSteps scene (~3 hr)
- Phase 4: DataChart scene (~5 hr)

Each has its own design + plan + execution cycle. Phase 1 is the foundation that proves the pattern.
