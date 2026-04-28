# LumeSpec Phase 2 — VersusSplit Scene — Design Spec

**Date:** 2026-04-28 PM
**Status:** Approved (brainstorming captured during v1.7 Phase 1, refined here)
**Phase 2 scope (this spec):** 1 new scene type — VersusSplit
**Out of scope:** ProcessSteps (Phase 3), DataChart (Phase 4) — see `project_scene_library_v17_backlog.md`

---

## 1. Goal

Add a 14th scene type — `VersusSplit` — that visually compares two contrasting elements side-by-side (before/after, them/us, old/new, slow/fast). Strongest tool for hardsell intent ("we're 10× faster than X") and tech intent ("old way → new way"). Visual reading: vertical divider, left side desaturated grayscale, right side full brand color, diagonal-progression entry.

This is the **biggest single visual addition since v1.6's IntentVideoShowcase** — opens up "comparison" as an explicit narrative tool, currently being faked by Claude with consecutive FeatureCallouts or a TextPunch + BentoGrid pair.

## 2. Architecture (mini)

Single scene type, single component, no variant system, no new validator. Reuses v1.7 infrastructure:
- ✅ `SCENE_PACING_DISCIPLINE` prompt block (no change — VersusSplit already counts as "different scene type" for the no-consecutive-TextPunch rule)
- ✅ `textPunchDiscipline` soft validator (no change — only watches TextPunch)
- ✅ `joinedPool` extractive fast-path (no change — VersusSplit text fields use same machinery)
- ✅ `resolver` asset pipeline (no change — VersusSplit doesn't need screenshots, gradient + icon-only)

5-package coordinated change like v1.7 but smaller surface (no variants, no new prompt block, no new validator file).

```
packages/schema       — add VersusSplitSchema, add to union + SCENE_TYPES
packages/remotion     — add VersusSplit component + resolveScene case
workers/storyboard    — add to SCENE_CATALOG + V1_IMPLEMENTED + extractiveCheck case
```

## 3. Component Design

### 3.1 Schema (in `packages/schema/src/storyboard.ts`)

```ts
const VersusSplitSchema = z.object({
  ...sceneBase,
  type: z.literal('VersusSplit'),
  props: z.object({
    headline: z.string().min(3).max(60).optional(),  // optional centered headline above the split
    compareFraming: z.enum(['before-after', 'them-us', 'old-new', 'slow-fast']),
    left: z.object({
      label: z.string().min(2).max(30),     // displayed framing word, e.g. "Before"
      value: z.string().min(1).max(80),     // the data point, must appear in sourceTexts
      iconHint: z.string().min(1).max(4).optional(), // single emoji or short symbol
    }),
    right: z.object({
      label: z.string().min(2).max(30),     // displayed framing word, e.g. "After"
      value: z.string().min(1).max(80),     // the data point, must appear in sourceTexts
      iconHint: z.string().min(1).max(4).optional(),
    }),
  }),
});
```

**A3 design rationale (from brainstorm):**
- Both `value` fields must come from `sourceTexts` (extractive check enforces) — same data discipline as QuoteHero
- `compareFraming` is a CLOSED enum with 4 values — Claude picks ONE, gets visual + data framing for free
- `label` is the displayed framing word (e.g. "Before", "After", "Them", "Us") — derived from `compareFraming` but allowed to be customized per scene context (not enforced — if Claude picks "before-after" framing it can still write `label: 'Old way'` for left side); MUST be in sourceTexts OR exactly match the standard framing word for the chosen `compareFraming`
- `iconHint` is single emoji or symbol (e.g. 🐌 for slow, ⚡ for fast) — optional decoration

### 3.2 Visual spec (`packages/remotion/src/scenes/VersusSplit.tsx`)

- Background: solid `#0d0d1a` (matching landing aesthetic)
- Optional headline at top center (60-180px from top, Inter 32px white, 60% opacity, fades in frames 4-12)
- Vertical divider line at x=50%, 4px wide, brand-color, 70% opacity
- Left half:
  - Background: `linear-gradient(135deg, #1a1a1a, #0a0a0a)` (desaturated dark gray)
  - Label at top: Inter 28px uppercase, gray-400, letter-spacing 3px, frames 8-18 fade
  - Icon (if present): 100px centered vertically, gray-500, frames 12-22 fade
  - Value: Inter 56px bold white, 70% Y position, frames 16-28 fade + 12px slide up
- Right half:
  - Background: `linear-gradient(135deg, theme.primary 0%, theme.primaryDark 100%)`
  - Label at top: Inter 28px uppercase, theme.textOn, letter-spacing 3px, frames 12-22 fade (slightly later than left for diagonal-progression feel)
  - Icon (if present): 100px centered vertically, theme.textOn at 80% opacity, frames 16-26 fade
  - Value: Inter 56px bold theme.textOn, 70% Y position, frames 20-32 fade + 12px slide up
- Subtle Ken Burns scale 1.0→1.02 on the entire frame for cinematic settle

**Diagonal-progression timing rationale:** Reading left→right matches user expectation (English-reading audience), so left animates slightly earlier, building anticipation for the right side reveal. Total entry takes ~32 frames (~1 sec at 30fps), comfortable settle for typical 90-180 frame scene durations.

### 3.3 Prompt catalog entry (`workers/storyboard/src/prompts/sceneTypeCatalog.ts`)

Add to `SCENE_CATALOG`:

```ts
  VersusSplit:
    'Side-by-side comparison scene — left vs right with strong visual contrast. Props: { headline? (centered above split), compareFraming: "before-after"|"them-us"|"old-new"|"slow-fast", left: { label, value (must be substring of sourceTexts), iconHint? (1 emoji) }, right: { label, value (must be substring of sourceTexts), iconHint? } }. Use when source contains a clear pair of comparable data points — e.g., performance numbers ("3 days" vs "60 seconds"), capability claims ("manual setup" vs "one-click"), market positioning. Strongest for hardsell + tech intents. Do NOT use if no genuine pair exists in sourceTexts — Claude must NOT fabricate a comparison just to use this scene.',
```

Add `'VersusSplit'` to `V1_IMPLEMENTED_SCENE_TYPES` array (after `'QuoteHero'`).

### 3.4 Extractive check case (`workers/storyboard/src/validation/extractiveCheck.ts`)

Add to `collectSceneTexts`:

```ts
    case 'VersusSplit':
      return [
        ...(scene.props.headline ? [scene.props.headline] : []),
        scene.props.left.value,
        scene.props.right.value,
        // NOTE: label fields are framing words (Before/After/etc.), not necessarily
        // in sourceTexts. We don't extractive-check them — they're labels not content.
      ];
```

`label` is intentionally NOT extractive-checked — it's a UI framing word, not content. Same approach as how `iconHint` (single emoji) is not checked.

## 4. File Structure

| File | Action | Notes |
|---|---|---|
| `packages/schema/src/storyboard.ts` | MODIFY | Add VersusSplitSchema + add to SceneSchema union + SCENE_TYPES array |
| `packages/schema/tests/storyboard.test.ts` | MODIFY | Add ~5-7 parse tests (valid minimal, valid full, all 4 compareFraming values, headline length bounds, missing iconHint OK) |
| `packages/schema/DESIGN.md` | MODIFY | Add VersusSplit bullet to scenes list |
| `workers/storyboard/src/validation/extractiveCheck.ts` | MODIFY | Add `case 'VersusSplit'` |
| `workers/storyboard/tests/extractiveCheck.test.ts` | MODIFY | Add ~3 tests (valid VersusSplit passes, hallucinated value rejected, headline-less variant works) |
| `workers/storyboard/src/prompts/sceneTypeCatalog.ts` | MODIFY | Add VersusSplit description + V1_IMPLEMENTED entry |
| `workers/storyboard/DESIGN.md` | MODIFY | Add VersusSplit catalog bullet |
| `packages/remotion/src/scenes/VersusSplit.tsx` | CREATE | New scene component |
| `packages/remotion/src/resolveScene.tsx` | MODIFY | Add `case 'VersusSplit'` (theme passed, no resolver needed since no screenshots) |
| `packages/remotion/DESIGN.md` | MODIFY | Add VersusSplit bullet to scenes list |

**Total: 8 files, 1 new + 7 modified.** All 3 DESIGN.md syncs required (schema, storyboard worker, remotion).

## 5. Out of Scope (explicit guard)

- ❌ ProcessSteps scene (Phase 3 backlog)
- ❌ DataChart scene (Phase 4 backlog)
- ❌ Re-rendering landing showcase to display VersusSplit (separate decision — VersusSplit may not naturally fire on vercel/burton; defer until proven valuable)
- ❌ Updating IntentMatrix data (won't change post-Phase-2 unless we re-render — handled in §11 acceptance criteria)
- ❌ TextPunch / QuoteHero / any other v1.7 scene changes — Phase 2 is purely additive
- ❌ New `compareFraming` values beyond the 4 defined (4 is enough for v1; future expansion can add more)
- ❌ Animated diagram (e.g., arrows, transition between sides) — pure side-by-side, not a flow
- ❌ Multi-row VersusSplit (more than 2 sides — that's a different scene type, future ProcessSteps territory)
- ❌ Image / screenshot in either side (icon only — keeps the comparison tight + verbal)

## 6. Risks + Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Claude doesn't pick VersusSplit — same fate as QuoteHero (0% trigger on burton/vercel because no obvious pair data) | High | Visual diversity goal partially missed | Prompt explicitly says "do NOT fabricate a pair" — better 0% triggers than wrong-data renders. Re-render decision (§5) deferred until we observe trigger rate. |
| `compareFraming` enum picks wrong framing for the data context | Low | Mild — visual + label still readable | Schema enforces 4 valid values, Claude can pick from semantic match |
| Schema discrim union grows past 14 — performance / readability cost | Low | None measurable at this scale | Will cross 16 mark when Phase 4 ships; revisit then if needed (remote concern) |
| Animation timing too tight at short scene durations (<32 frames) | Low | Right-side fade-in cut off | Scene durations almost always ≥ 90 frames in practice; document the assumption in component code |
| Right-side `theme.primary` color too saturated against `theme.textOn` (low contrast) | Low | Right value text unreadable | `theme.textOn` is computed from `theme.primary` for contrast — already handled by existing brandTheme utility |

## 7. Acceptance Criteria

Phase 2 ships when ALL hold:

1. ✅ `pnpm test` workspace passes (all 9 packages, expect ~835+ tests after VersusSplit additions)
2. ✅ `pnpm typecheck` workspace clean (0 errors)
3. ✅ `case 'VersusSplit'` added to `collectSceneTexts` AND `resolveScene` (both exhaustive switches; missing case = compile-time TS error)
4. ✅ Manual smoke: dispatch a single test storyboard generation for a brand likely to have comparison data (Vercel — has perf claims like "10× faster"). Inspect the produced storyboard JSON for VersusSplit usage. NOT mandatory to trigger — Claude may still skip if it doesn't see a clean pair. What matters: if it DOES pick VersusSplit, schema parses cleanly and component renders without throw.
5. ✅ DESIGN.md sync hook does NOT block any commit (all 3 DESIGN.md updates landed)
6. ✅ Re-render showcase NOT done in this phase — explicit non-goal per §5

**NOT acceptance criteria** (out of scope):
- VersusSplit appearing in the live landing showcase (re-render is a separate decision)
- Updated IntentMatrix data (rendered storyboards may not have VersusSplit)
- Phase 5+ hard-rejection of TextPunch (still in Phase 1's deferred decision)

## 8. Phase 2 Estimated Cost

| Resource | Estimate |
|---|---|
| Engineering wall time | 1.5–2 hrs (subagent-driven, simpler than v1.7 — no variants, no new validator) |
| Anthropic API cost (testing) | ~$0.10 (1 manual smoke render) |
| New tests | ~10 (5-7 schema parse + 3 extractive case + maybe 1 catalog regression) |
| New file count | 1 create, 7 modify |
| Blast radius | 3 packages (schema, remotion, storyboard) — same as v1.7, no new package |
| Risk of prod breakage | Very low — purely additive scene type, backward-compat by construction |

## 9. Self-Review

**Placeholder scan:** No "TBD", "TODO". §6 risk row about right-side contrast defers to existing brandTheme utility — already-implemented mitigation.

**Internal consistency:** §3.1 schema matches §3.4 extractive case (left.value + right.value extractive-checked, label not). §4 file list = §3 designs. §6 risks acknowledged in §5 out-of-scope where relevant.

**Scope check:** Single new scene type, no chain-effect changes to existing v1.7 work, ~1.5-2 hr eng, single plan-able unit. Clean.

**Ambiguity check:** `label` extractive-check policy explicit (NOT checked, per §3.4 NOTE). `compareFraming` enum closed at 4 values with explicit "no expansion this phase" guard.
