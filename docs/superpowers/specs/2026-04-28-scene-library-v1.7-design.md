# LumeSpec v1.7 — Scene Library Visual Diversity Upgrade — Design Spec

**Date:** 2026-04-28
**Status:** Approved (brainstorming complete) — pending user review of this spec
**Phase 1 scope (this spec):** 1 new scene (QuoteHero) + 2 TextPunch variants (photoBackdrop, slideBlock) + 1 prompt+validator constraint
**Phase 2-4 scope (cataloged backlog, NOT in this spec):** 3 additional scenes (VersusSplit, ProcessSteps, DataChart) — see "Phase 2-4 Backlog" section at end

---

## 1. Goal

Eliminate the "templated PowerPoint" feel of LumeSpec-generated videos by attacking it on three coordinated fronts:

1. **Supply** — give Claude a richer scene to fill the "single dramatic moment" niche it currently fills with TextPunch
2. **Visual variance** — break TextPunch's solid-color-block monotony with two distinct visual modes
3. **Discipline** — prevent Claude from chaining TextPunch consecutively, with telemetry to measure compliance

Empirical baseline (2026-04-28, from the v1.6 IntentVideoShowcase data): TextPunch appears **16 times across 6 storyboards (avg 2.67×/video)** — 2.7× more than any other scene type. Vercel hardsell uses TextPunch 4× in 9 scenes. This is the immediate visual-quality bottleneck.

---

## 2. Architecture

The upgrade is a coordinated change across 5 packages. Each delta is small and bounded; coordination matters because the prompt must reference the new scene + variants the same way the schema and renderer recognize them.

```
packages/schema       — add QuoteHero schema, add TextPunch variant field
packages/remotion     — add QuoteHero component, add 2 TextPunch variant renderers
workers/storyboard    — add QuoteHero to extractiveCheck, add prompt guidance, add soft validator
```

No new package. No new dep (we have everything: Remotion primitives, Ken Burns, image rendering, Pino-style logging).

**Design philosophy preserved:**
- Discriminated union exhaustiveness via `assertNever` (CLAUDE.md gotcha #3)
- Symmetric normalizeText fold rules (DESIGN.md's normalizeText section)
- Workers do not directly access DB — soft validator logs to stdout/Pino, not Postgres
- Schema is single source of truth for new types

---

## 3. Component Designs

### 3.1 QuoteHero scene (new scene type)

**Purpose:** Single cinematic pull-quote with author attribution. Replaces TextPunch in the "I want one dramatic line of customer voice" niche with a visually richer alternative.

**Schema (Zod, in `packages/schema/src/scenes/`):**

```ts
export const QuoteHeroSchema = z.object({
  type: z.literal('QuoteHero'),
  sceneId: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  props: z.object({
    quote: z.string().min(10).max(280),     // pull-quote body, must be in sourceTexts
    author: z.string().min(2).max(80),       // person name, also extractive-checked
    attribution: z.string().min(2).max(120).optional(), // role + company, e.g., "Founder, Acme"
    backgroundHint: z.enum(['gradient', 'screenshot']).optional().default('gradient'),
  }),
});
```

**Visual spec (Remotion component in `packages/remotion/src/scenes/QuoteHero.tsx`):**
- Background: brand-color gradient (default) OR faded source-page screenshot at 8% opacity (when `backgroundHint === 'screenshot'` and screenshot available from crawl)
- Large opening quote glyph (`"`) at top-left, ~280px serif font, brand color at 70% opacity
- Quote body: serif (Georgia or system serif), ~56px, white, max 3 lines, centered horizontally with left-margin padding
- Brand-color thin underline (140px wide, 3px) above author block
- Author name: Inter 22px semibold, white
- Attribution line below in brand color, Inter 18px regular
- Animation: Ken Burns slow zoom on background (1.0 → 1.05 over scene duration) + quote text fade-in with 8-frame upward slide

**Discrimination from ReviewMarquee (mandatory — both deal with quotes):**
- ReviewMarquee = 3+ short reviews (≤120 char each), horizontal scroll, no per-quote dwell
- QuoteHero = 1 quote (10–280 char), full scene dwell with Ken Burns, prominent author treatment
- Prompt rule: if Claude has 1 dramatic quote → QuoteHero. If 3+ quick endorsements → ReviewMarquee. Never both in same storyboard for the same quote pool.

**Source data requirements:**
- `quote` text must appear in `sourceTexts` (extractive check enforces; smart-quote + ampersand normalize already handles common rewrites)
- `author` must appear in `sourceTexts` (extractive check enforces)
- `attribution` must appear in `sourceTexts` if present

**Extractive-check robustness for long quotes (architectural concern flagged 2026-04-28 review):**

A 280-character quote is much more fragile against the existing 4-pass extractive check than the short-phrase scenes that pipeline was tuned for. Two failure modes are likely:
- **Whitespace + line-break drift**: HTML-extracted quotes often contain `\n`, multiple spaces, or `<br>` artifacts that `normalizeText` collapses to single spaces — but Claude regenerates with its own whitespace cadence. The existing `WHITESPACE` collapse handles this.
- **Cross-entry joining**: Source pool may have the full quote split across multiple `sourceTexts` entries (testimonial header + body + author rendered as separate DOM elements → separate pool entries). Claude reconstructs the full quote — substring inclusion against any single pool entry fails.

**Phase 1 fix (small additional scope, ~10 lines):** Extend `extractiveCheck.ts` Pass 1 with a joined-pool fast-path:

```ts
// In addition to: pool.some((p) => p.includes(n))
// Add: cross-entry concatenation tolerance
const joinedPool = pool.join(' ');  // computed once per storyboard
if (joinedPool.includes(n)) return true;
```

This is symmetric (applied to all scene types, not just QuoteHero) and resolves the "Claude joins phrases across sourceTexts entries" bug class that was deferred from this morning's `save up to 40% off` Burton incident. **In-scope for Phase 1** because (a) QuoteHero won't be reliable without it, (b) the fix is genuinely small, and (c) we already paid the design+review cost for this bug class today.

**Existing protections (no new work needed):**
- normalizeText fold rules: `& → and`, smart-quotes, NFKC, lowercasing — already symmetric
- Sentence-level split (Pass 4) — already handles multi-sentence quotes
- Fuse fuzzy fallback at threshold 0.3 — generous edit budget for 280-char strings (~84 char tolerance)

### 3.2 TextPunch variant: `photoBackdrop` (V1)

**Purpose:** Break the solid-color-block monotony — same TextPunch text-anchor pattern, but on a faded source-page screenshot instead of a flat color rectangle.

**Schema change (extend existing `TextPunchSchema.props`):**

```ts
// existing TextPunchSchema (assumed shape based on IntentMatrix data + collectSceneTexts):
//   props: { text: string }
// NEW field added:
//   variant: z.enum(['default', 'photoBackdrop', 'slideBlock']).optional().default('default')
```

This is **backward-compatible** — every existing TextPunch storyboard (without `variant`) defaults to `'default'` and renders identically to today.

**Visual spec:**
- Background: source-page screenshot (already captured by crawler, available at `crawlResult.screenshot`), rendered full-frame with `object-fit: cover`, opacity 22%, slight blur (3px)
- Subtle dark gradient overlay (top-down, 0% → 40% black) for text legibility
- Text: same TextPunch sizing/weight as default variant, white with `text-shadow: 0 4px 24px rgba(0,0,0,0.6)` for crisp readability
- Animation: existing TextPunch fade-in, unchanged. Background gets a slow 1.0 → 1.04 scale Ken Burns over scene.

**Why screenshot data is safe to use:** Crawler already produces screenshot in every successful crawl. Storyboard worker already has the URI in `crawlResult`.

**Critical asset-pipeline requirement (architectural concern flagged 2026-04-28 review):** Render worker is Remotion = headless Chromium. Chromium fetches `<img src="...">` over HTTP at render time. The screenshot URL passed to `TextPunch.tsx` MUST be either:
- (a) A presigned S3/MinIO URL with sufficient TTL to outlast the render (typically 15+ min for a 30-sec MP4 with cold-start), OR
- (b) A public URL behind a CDN

Passing a raw `s3://lumespec-dev/...` URI will silently break — Chromium can't fetch it, image fails to load, scene renders with transparent background, no error thrown by Remotion. This is the worst kind of bug: silent visual regression.

**Mitigation (plan-time research required):** The plan implementer MUST first locate how `HeroRealShot` already threads its screenshot URL (it's been working in production) — likely via `packages/remotion/src/s3Resolver.ts` (file confirmed exists). Mirror the EXACT same pattern for `TextPunch.photoBackdrop`. Do NOT invent a new asset-passing convention. If the existing pattern is per-scene presigning at render-worker boot, the same path applies; if it's storyboard-time presigning baked into the JSON, same path applies. Either works as long as we don't fork conventions.

**Fallback:** If no screenshot is available (crawl produced text-only result, e.g., legacy fixtures), OR if the screenshot URL is unresolvable at render time, fall back to default variant rendering. No exception thrown. The plan implementer MUST add this fallback path explicitly — silent missing image is unacceptable.

### 3.3 TextPunch variant: `slideBlock` (V2)

**Purpose:** Break the static fade-in/fade-out motion pattern. Same text content, but animated entry uses horizontal motion.

**Visual spec:**
- Background: solid brand color (same as default), but as a sliding block, not a static fill
- Block animation: enters from right edge (x: 100% → 0%), Spring config (mass 1, damping 18, stiffness 80), takes ~12 frames to settle
- Text appears 4 frames after block stops, with subtle 8-frame fade-in
- Hold for remainder of scene
- Exit: block slides out to LEFT (x: 0% → -100%) over final 8 frames

**No schema change beyond `variant` field added in 3.2.**

### 3.4 Prompt guidance (P3 soft constraint)

**Edit `workers/storyboard/src/prompts/systemPrompt.ts`:**

Add a new section to the existing system prompt, placed near other scene-selection guidance:

```
SCENE PACING DISCIPLINE:
- TextPunch is for short single-line emphasis. Do NOT use it more than 2 times in a single storyboard.
- NEVER place TextPunch scenes consecutively (no TextPunch immediately followed by TextPunch).
- If you want a dramatic single quote with attribution, use QuoteHero instead of TextPunch.
- When TextPunch appears more than once in a storyboard, alternate the `variant` field
  between 'photoBackdrop' and 'slideBlock' to maintain visual variety.
```

Also add per-scene catalog descriptions for QuoteHero and the TextPunch variants in whatever section enumerates each scene type (the plan implementer will identify the exact insertion point).

### 3.5 Soft validator with telemetry (P3 enforcement layer)

**New file: `workers/storyboard/src/validation/textPunchDiscipline.ts`**

```ts
import type { Storyboard } from '@lumespec/schema';

export interface TextPunchDisciplineReport {
  total: number;                 // total TextPunch scenes
  consecutive: number;           // count of TextPunch-TextPunch adjacencies
  variantCounts: Record<string, number>; // 'default' | 'photoBackdrop' | 'slideBlock'
  violatesMaxCount: boolean;     // total > 2
  violatesNoConsecutive: boolean; // consecutive > 0
}

export function evaluateTextPunchDiscipline(sb: Storyboard): TextPunchDisciplineReport;
```

**Integration:** Called in `workers/storyboard/src/index.ts` AFTER successful zod validation + extractive check, BEFORE upload to S3. Emits a single structured log line via the existing logger (Pino-style):

```
[storyboard-discipline] jobId=ABC textPunchTotal=4 consecutive=1 violatesMax=true violatesConsec=true variants={default:3,photoBackdrop:1}
```

**Behavior:**
- **Does NOT reject** the storyboard. Proceeds normally.
- **Does NOT throw** under any input. Always returns a report.
- Violation flags are computed but only logged — used for post-hoc analysis, not flow control.

**Future Phase 5+ usage:** Once we accumulate ~50+ prod storyboard log lines, decide whether to upgrade to Zod refinement (P4 hard reject). Empirical data > guesswork.

---

## 4. File Structure

| File | Action | Notes |
|---|---|---|
| `packages/schema/src/scenes/QuoteHero.ts` | CREATE | New Zod schema file (or inline in `storyboard.ts` per existing convention — plan to verify) |
| `packages/schema/src/scenes/TextPunch.ts` (or wherever TextPunch lives) | MODIFY | Add optional `variant` enum field, default `'default'` |
| `packages/schema/src/storyboard.ts` (or `index.ts`) | MODIFY | Add `QuoteHero` to scene union + `SCENE_TYPES` array; export new types |
| `packages/remotion/src/scenes/QuoteHero.tsx` | CREATE | New scene component |
| `packages/remotion/src/scenes/TextPunch.tsx` | MODIFY | Branch on `variant` prop to render default / photoBackdrop / slideBlock |
| `packages/remotion/src/resolveScene.tsx` | MODIFY | Add `case 'QuoteHero':` (TS exhaustive switch will compile-error otherwise) |
| `workers/storyboard/src/validation/extractiveCheck.ts` | MODIFY | (1) Add `case 'QuoteHero':` returning `[quote, author, attribution].filter(Boolean)`. (2) Extend Pass 1 with `joinedPool` substring fast-path (see §3.1) — symmetric, applies to all scenes |
| `workers/storyboard/tests/extractiveCheck.test.ts` | MODIFY | Add tests: QuoteHero scene passes; cross-entry joined quote passes via joinedPool fast-path; QuoteHero with hallucinated author rejected |
| `workers/storyboard/src/prompts/systemPrompt.ts` | MODIFY | Add SCENE PACING DISCIPLINE block + QuoteHero scene catalog entry + variant usage hint |
| `workers/storyboard/src/validation/textPunchDiscipline.ts` | CREATE | New soft validator |
| `workers/storyboard/src/validation/textPunchDiscipline.test.ts` | CREATE | Unit tests for the new validator (3-5 cases: clean / max violation / consec violation / variant rotation) |
| `workers/storyboard/src/index.ts` | MODIFY | Call `evaluateTextPunchDiscipline` and log report after extractive check passes |
| `packages/schema/tests/storyboard.test.ts` | MODIFY | Add Zod parse roundtrip tests for QuoteHero + TextPunch variant field |
| `packages/remotion/tests/compositionRegistry.test.ts` | MAY MODIFY | Verify QuoteHero registered (if registry test enforces completeness) |
| `apps/landing/src/data/intentMatrix.ts` | NO CHANGE this phase | Will get re-rendered once Phase 1 ships and we re-render showcase MP4s (separate execution decision, see §7) |
| `packages/schema/DESIGN.md` | MODIFY | Document QuoteHero added; document TextPunch.variant field; one-sentence note that Phase 2-4 scenes are roadmapped |
| `packages/remotion/DESIGN.md` | MODIFY | Document QuoteHero composition, TextPunch variant render branches |
| `workers/storyboard/DESIGN.md` | MODIFY | Document SCENE PACING DISCIPLINE prompt block + soft validator behavior |

**Total: ~14 file touches** (5 creates, ~9 modifies). Pre-commit DESIGN.md sync hook WILL trigger because `packages/schema/src/**`, `packages/remotion/src/scenes/**`, `workers/storyboard/src/**` are all in the sync map. All 3 DESIGN.md updates are listed above.

---

## 5. Data Flow

```
Crawler ─► crawlResult { sourceTexts, screenshot, brandColor, ... }
                         │
                         ▼
Storyboard worker ─► Claude API (with NEW prompt: pacing discipline + QuoteHero scene catalog)
                         │
                         ▼
                    raw JSON ─► Zod parse (storyboard schema with QuoteHero + TextPunch.variant)
                                     │ (rejects malformed, including bad variant value)
                                     ▼
                              extractiveCheck (with NEW case 'QuoteHero')
                                     │ (rejects if quote/author/attribution not in sourceTexts)
                                     ▼
                              evaluateTextPunchDiscipline ◄─── NEW
                                     │ (always returns report, never throws)
                                     ▼
                              log line (structured) ◄─── NEW telemetry
                                     │
                                     ▼
                              upload to S3 + emit job complete
                         │
                         ▼
Render worker ─► Remotion ─► resolveScene (with NEW case 'QuoteHero')
                              │
                              ├─► QuoteHero.tsx (new) — gradient or screenshot bg + Ken Burns + serif quote + author block
                              └─► TextPunch.tsx (modified) — branches on variant:
                                    ├─ default       — existing solid-color-block render
                                    ├─ photoBackdrop — screenshot bg + dark overlay + shadow text + Ken Burns
                                    └─ slideBlock    — colored block slides in from right, exits left
```

---

## 6. Out of Scope (explicit guard)

These are NOT in Phase 1. Listed to prevent scope creep:

- ❌ **VersusSplit, ProcessSteps, DataChart scenes** — see "Phase 2-4 Backlog" below
- ❌ **TextPunch variant V3 (bigNumber)** — overlaps with existing StatsCounter scene (rejected during brainstorming)
- ❌ **TextPunch variant V4 (typewriterGradient)** — visual force weaker than V1 (rejected)
- ❌ **TextPunch variant V5 (tiltedAngular)** — too stylized, brand-color compatibility weak (rejected)
- ❌ **Hard-reject Zod refinement (P4)** — too risky pre-telemetry; revisit Phase 5 if data justifies (rejected)
- ❌ **Re-rendering the 6 v1.6 showcase MP4s with new scenes/variants** — separate execution decision; could be a follow-up commit after Phase 1 lands or deferred to v1.8. NOT a Phase 1 deliverable. (Reasoning: re-render burns ~$0.30 Anthropic and 3 min wall, AND the new scenes will only manifest if Claude actually picks them — sample size of 6 may not visibly demonstrate the upgrade. Better: ship Phase 1, observe a week of fresh user-submitted jobs via telemetry, THEN re-render showcase if statistically meaningful change.)
- ❌ **A/B testing the prompt constraint effectiveness** — would require infra changes; defer
- ❌ **Migrating existing storyboards in DB to add `variant: 'default'` field** — backward-compat default handles this transparently; no migration needed
- ❌ **TextPunch.photoBackdrop fallback when screenshot missing** — falls back to default render, not a separate code path requiring its own design

---

## 7. Risks + Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Claude ignores SCENE PACING DISCIPLINE prompt | Medium | Low (variants make TextPunch repetition less ugly anyway) | Soft validator gives us telemetry to measure; iterate prompt wording in Phase 1.5 if needed |
| QuoteHero 280-char quote fragile against extractive check (whitespace drift, cross-entry joining) | Medium-High | Storyboard rejected, retry burns cost | (1) §3.1 fix: extend Pass 1 with `joinedPool` substring fast-path — solves cross-entry joining, in-scope for Phase 1. (2) Existing normalizeText whitespace collapse handles drift. (3) Prompt explicitly says quote + author MUST come from sourceTexts. (4) If post-ship rejection rate > 20%, add per-source-page detection asking Claude to skip QuoteHero when no testimonial-style content present |
| TextPunch.photoBackdrop screenshot URL not Chromium-fetchable at render time (silent visual regression) | Medium-High | Image fails to load, transparent background, NO error — worst kind of silent bug | (1) §3.2 mitigation: plan implementer MUST locate existing HeroRealShot screenshot threading via `packages/remotion/src/s3Resolver.ts` and mirror exactly — do NOT invent a new asset-passing convention. (2) Add explicit fallback to default variant if screenshot URL is missing or unresolvable. (3) Add a smoke test that renders TextPunch.photoBackdrop with a real-world (presigned) screenshot URL end-to-end |
| `variant` field name collides with existing scene-level `variant` discriminator (some scenes use this for sub-types) | Low | TS error at compile time (not prod) | Plan implementer reads existing schema to confirm naming; if collision, use `mode` or `style` as field name |
| Soft validator log spam (every storyboard logs even when clean) | Low | Log noise, not functional | Log line is single structured row, low volume; can downgrade to debug-level in Phase 5 if noisy |
| QuoteHero + ReviewMarquee both selected for same quote → visual redundancy | Low | Visual quality regression | Prompt rule explicitly forbids; soft validator can later detect this if it becomes a pattern |

---

## 8. Phase 2-4 Backlog (committed scope)

These scenes were validated as desirable during brainstorming and committed for future phases. Each is independent of Phase 1 and the others — can be developed in any order based on priority.

### Phase 2 — VersusSplit
- Left/right split-screen "before/after" or "X vs Y" comparison
- Schema: `{ left: { label, value, iconHint }, right: { label, value, iconHint }, headline? }`
- Best for: hardsell + tech intents
- Visual: vertical divider with brand-color edge, left side desaturated (gray palette), right side full brand color, animated diagonal entry
- Estimated effort: ~3 hr (more complex than QuoteHero — needs side-pair data shape + comparison animation)

### Phase 3 — ProcessSteps
- Numbered timeline (1→2→3) with sequential reveal
- Schema: `{ steps: Array<{ number, title, subtitle? }> (length 3-5), headline? }`
- Best for: tech intent walkthroughs
- Visual: horizontal connecting line, numbered circles fill in sequentially with brand color, per-step title + subtitle below
- Estimated effort: ~3 hr (timeline layout + sequential animation orchestration)

### Phase 4 — DataChart
- Animated bar/line chart with axis + values
- Schema: `{ chartType: 'bar' | 'line', title, dataPoints: Array<{ label, value, isHighlight? }>, yAxisLabel?, xAxisLabel? }`
- Best for: hardsell ("our numbers vs competitors")
- Visual: bars rise from baseline with stagger, value labels reveal on top, highlighted bar in brand color
- Estimated effort: ~5 hr (highest scope — needs chart primitive or simple custom rendering)

**Cumulative Phase 2-4 effort:** ~11 hr (vs ~6 hr for Phase 1). Total v1.7 vision: ~17 hr eng work, $1-2 Anthropic, 4 separate ship cycles.

**Recorded in memory:** `project_scene_library_v17_backlog.md` (will be created when this spec is committed).

---

## 9. Acceptance Criteria (Phase 1)

Phase 1 ships when ALL these hold:

1. ✅ `pnpm test` passes across all 9 workspace packages (current baseline 817 tests; Phase 1 adds ~10 — expect ~827)
2. ✅ `pnpm typecheck` workspace-level passes (catches missing `case 'QuoteHero'` in any switch)
3. ✅ A test-rendered storyboard with `type: 'QuoteHero'` produces a valid MP4 via render worker (manual smoke via `node scripts/render-showcase-videos.mjs https://vercel.com vercel-test` — first time should pull QuoteHero given prompt update)
4. ✅ Soft validator log line appears in storyboard worker stdout for at least one rendered job
5. ✅ DESIGN.md sync hook does NOT block any commit (all 3 DESIGN.md files updated)
6. ✅ All 3 DESIGN.md changes accurately describe the new behavior (post-write self-review)

**NOT acceptance criteria** (out of scope for Phase 1):
- Demonstrable reduction in TextPunch usage rate (needs ~50 prod jobs to measure statistically)
- Re-rendered showcase MP4s reflecting v1.7 (deferred per §6)
- Hard-reject enforcement of constraints (P4, deferred per §3.4 / §6)

---

## 10. Phase 1 Estimated Cost

| Resource | Estimate |
|---|---|
| Engineering wall time | 4-6 hrs (subagent-driven, may be longer if QuoteHero animation iteration needed) |
| Anthropic API cost (testing) | ~$0.30 (1 manual smoke render) |
| New tests | ~10 (unit tests for variant + discipline validator + storyboard parse roundtrip) |
| New file count | 5 creates, ~9 modifies |
| Blast radius | 3 packages (schema, remotion, storyboard) — no apps/web or apps/api impact |
| Risk of prod breakage | Low — backward-compat schema, soft validator, no hard reject |

---

## 11. Self-Review

(per brainstorming skill, run before declaring spec done)

**Placeholder scan:** No "TBD", "TODO", or "fill in later". One acknowledged ambiguity (§7 risk row about screenshot URL threading + §3.2 fallback) is explicitly flagged for the plan implementer to resolve via codebase reading — this is appropriate for a design spec to defer to plan-time.

**Internal consistency:** §3 designs match §4 file list match §5 data flow match §9 acceptance criteria. Phase 2-4 explicitly excluded from §6, listed in §8.

**Scope check:** Phase 1 is 1 cohesive change (visual diversity intervention) across 3 coordinated packages, ~14 file touches, ~6 hrs work. Single plan-able unit. Phase 2-4 are independent units, will get their own specs+plans when sequenced.

**Ambiguity check:** Variants schema design (option A vs B vs C in brainstorming notes) resolved to **Option A: optional `variant` field on existing TextPunch schema with default `'default'`**. This is the only previously-open question; resolved here.
