# Dynamic Watermark (PLG) Design Spec
**Date:** 2026-04-25
**Feature:** LumeSpec v2.2 Module 1 — Dynamic Watermark for Product-Led Growth

---

## Problem

LumeSpec generates demo videos that users share publicly with no branding attribution. Free users receive a fully unbranded product, leaving no organic growth loop. The goal is to embed a persistent "Made with LumeSpec" watermark into every video generated on the Free plan, making each shared video an advertisement, while giving Pro/Max subscribers a clean, watermark-free experience as an upgrade incentive.

---

## Goals

- Brand every Free-tier video with a visible "Made with LumeSpec" Pill Badge in the bottom-right corner
- Pro/Max users receive watermark-free videos, creating a clear upgrade incentive
- Zero frontend bypass possible — tier enforcement is server-side only, baked into the stored storyboard JSON
- Zero DB migration required — the existing `subscriptions` table has `tier` already

## Non-Goals (v1)

- In-app "Upgrade to Pro" CTA banner on `/history` page (belongs in History Vault spec)
- Animated watermark (e.g. fade-in/fade-out) — static is PLG-optimal and simpler
- Custom watermark text per user or plan
- Watermark on video thumbnail (`thumbUrl`) — only on rendered MP4

---

## Architecture Decision: Orchestrator Injection (Method A)

`showWatermark` is determined once in `apps/api` during job creation, injected into the storyboard worker job payload, and baked into the storyboard JSON stored in S3 by `enrichFromCrawlResult()`. The render worker and Remotion layer receive it as a passive field with no tier awareness.

**Why this approach:**
1. Tier logic already lives in `apps/api` (`debitForJob`, `ALLOWED_DURATIONS`, `CONCURRENCY_LIMIT`) — `showWatermark` belongs in the same layer
2. The stored storyboard JSON in S3 becomes an audit trail: the tier decision at generation time is permanently recorded
3. `enrichFromCrawlResult()` in the storyboard worker already deterministically overrides `fps`, `brandColor`, `logoUrl` — `showWatermark` follows the exact same pattern
4. Render worker preserves its zero tier-awareness principle

---

## Section 1: Schema

### `packages/schema/src/storyboard.ts` — VideoConfigSchema

Add one field to `VideoConfigSchema`:

```typescript
showWatermark: z.boolean().optional().default(false)
```

**`optional().default(false)`** rationale: Existing storyboard JSONs in S3 do not contain this field. Zod defaults to `false` on parse, so all historical storyboards decode correctly and render without a watermark — the correct backward-compatible behavior. New storyboards have the value explicitly set by `enrichFromCrawlResult`.

Claude is **never told about this field**. It is always overridden deterministically post-LLM, so `systemPrompt.ts` and `HARD_RULES` require no changes.

---

## Section 2: Remotion Component

### `packages/remotion/src/components/Watermark.tsx` — New File

**Visual style: Pill Badge** (selected for maximum PLG brand visibility)

```
AbsoluteFill (pointerEvents: none)
  └─ div
       position: absolute
       bottom: '3%'          ← percentage: resolution-agnostic
       right: '2%'           ← percentage: resolution-agnostic
       display: flex, alignItems: center, gap: 8
       background: rgba(0, 0, 0, 0.50)
       border: 1px solid rgba(255, 255, 255, 0.18)
       borderRadius: 24
       padding: '5px 14px 5px 8px'
       backdropFilter: 'blur(10px)'   ← readable on dark + light backgrounds
       ├─ div  20×20  gradient(#7c3aed → #4f46e5)  borderRadius: 5  (brand icon)
       └─ span  "Made with LumeSpec"
                fontSize: 14, fontWeight: 600
                color: rgba(255, 255, 255, 0.88)
                letterSpacing: '0.02em'
                fontFamily: system-ui sans-serif
```

All styles are inline (no Tailwind — Remotion environment constraint).  
`pointerEvents: none` — watermark is a visual overlay, must not intercept any Remotion internal events.  
Percentage positioning — future-safe for 9:16 or 4:3 compositions without code changes.

### `packages/remotion/src/MainComposition.tsx` — Modify

Add as the **final child** inside the root `<AbsoluteFill>`:

```tsx
{videoConfig.showWatermark && <Watermark />}
```

DOM order = highest paint layer. No explicit `zIndex` needed — the last `AbsoluteFill` child naturally renders above all preceding scene content and transitions.

---

## Section 3: Backend Enforcement

### 3-A. New Utility: `getUserTier()`

**Location:** `apps/api/src/credits/ledger.ts` (alongside `debitForJob`)

```typescript
export async function getUserTier(db: Pool, userId: number): Promise<Tier> {
  const result = await db.query<{ tier: string }>(
    `SELECT COALESCE(s.tier, 'free') AS tier
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  return (result.rows[0]?.tier ?? 'free') as Tier;
}
```

`COALESCE(s.tier, 'free')` handles the edge case where a user exists in the `users` table but has no row in `subscriptions` — safe fallback to 'free'. Single read query, no transaction needed.

### 3-B. Job Creation Flow — `apps/api/src/jobs/`

In the job creation handler, after verifying the JWT and before dispatching to the storyboard worker:

```typescript
const tier = await getUserTier(db, userId);
const showWatermark = tier === 'free';  // Pro + Max get no watermark

await queue.dispatch('storyboard', {
  jobId,
  crawlResultUri,
  intent,
  duration,
  showWatermark,   // NEW field in worker job payload
});
```

### 3-C. Storyboard Worker — `workers/storyboard/src/generator.ts`

**`GenerateInput` interface — add required field:**

```typescript
export interface GenerateInput {
  claude: ClaudeClient;
  crawlResult: CrawlResult;
  intent: string;
  duration: 10 | 30 | 60;
  hint?: string;
  previousStoryboard?: Storyboard;
  spendGuardPool?: Pool | null;
  showWatermark: boolean;   // NEW — required; orchestrator always provides it
}
```

`required` (not optional): The orchestrator always supplies this value. The worker has no fallback logic or billing awareness.

**`enrichFromCrawlResult()` — add one line in the deterministic override block:**

```typescript
const enrichedVideoConfig = {
  bgm: DEFAULT_BGM,
  ...videoConfig,            // Claude's LLM output
  // ── Deterministic overrides — Claude cannot change these ──
  durationInFrames: DURATION_FRAMES[input.duration],
  fps: 30,
  brandColor: pickBrandColor(brand.primaryColor),
  ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {}),
  showWatermark: input.showWatermark,   // NEW — baked into S3 storyboard permanently
};
```

Even if the LLM output contains `showWatermark: false`, the override block wins. This is the enforcement guarantee.

---

## Data Flow (End-to-End)

```
POST /api/jobs/create (Next.js BFF)
  → reads NextAuth session (userId)
  → mints JWT → forwards to apps/api

apps/api (ALL tier logic lives here)
  → verifyInternalToken()
  → getUserTier(db, userId)            ← queries subscriptions table
  → showWatermark = (tier === 'free')
  → debitForJob()                      ← existing, unchanged
  → dispatch storyboard worker:
    { jobId, crawlResultUri, intent, duration, showWatermark }

Storyboard Worker (zero billing awareness)
  → GenerateInput.showWatermark received
  → enrichFromCrawlResult() injects showWatermark into videoConfig
  → storyboard JSON with showWatermark baked in → stored to S3
  → jobs table updated: status = rendering

Render Worker (unchanged, zero billing awareness)
  → fetches storyboard from S3
  → StoryboardSchema.parse() — showWatermark is now a valid field
  → passes storyboard as Remotion inputProps

Remotion MainComposition
  → videoConfig.showWatermark === true  → renders <Watermark />
  → videoConfig.showWatermark === false → no extra rendering
```

---

## Testing Strategy

### Priority 1 — API Tier Enforcement (business-critical; silent bugs = revenue leak)

**`apps/api/tests/credits/ledger.test.ts`** — `getUserTier()`
```typescript
it('returns "free" when no subscription row exists')   // COALESCE edge case
it('returns "pro" for active pro subscription')
it('returns "max" for active max subscription')
it('returns "free" as safe fallback for unknown tier value')
```

**`workers/storyboard/tests/generator.test.ts`** — `enrichFromCrawlResult` propagation
```typescript
it('sets showWatermark: true in videoConfig when input.showWatermark is true')
it('sets showWatermark: false in videoConfig when input.showWatermark is false')
it('overrides Claude output: LLM showWatermark:false is ignored when input is true')
// ↑ Most critical: proves the enforcement guarantee holds
```

### Priority 2 — Schema Backward Compatibility

**`packages/schema/tests/storyboard.test.ts`**
```typescript
it('parses storyboard without showWatermark field (defaults to false)')
it('parses storyboard with showWatermark: true')
it('parses storyboard with showWatermark: false')
```

### Priority 3 — Remotion Smoke Tests (catch render crashes)

**`packages/remotion/tests/Watermark.test.tsx`** — new file
```typescript
it('Watermark component renders without crashing (renderStill)')
it('MainComposition with showWatermark:true includes Watermark in output')
it('MainComposition with showWatermark:false renders without Watermark')
// ↑ Confirms no regression to existing MainComposition structure
```

---

## File Change Summary

| File | Type | Change |
|---|---|---|
| `packages/schema/src/storyboard.ts` | modify | Add `showWatermark: z.boolean().optional().default(false)` to VideoConfigSchema |
| `packages/schema/tests/storyboard.test.ts` | modify | 3 backward-compat + new field parse tests |
| `packages/remotion/src/components/Watermark.tsx` | **new** | Pill Badge watermark component (inline styles, % positioning) |
| `packages/remotion/src/MainComposition.tsx` | modify | Add `{videoConfig.showWatermark && <Watermark />}` as final child |
| `packages/remotion/tests/Watermark.test.tsx` | **new** | renderStill smoke tests (3 cases) |
| `workers/storyboard/src/generator.ts` | modify | Add `showWatermark` to `GenerateInput`; inject in `enrichFromCrawlResult` |
| `workers/storyboard/tests/generator.test.ts` | modify | Propagation + override enforcement tests (3 cases) |
| `apps/api/src/credits/ledger.ts` | modify | Add `getUserTier()` utility function |
| `apps/api/src/jobs/` (job creation handler) | modify | Call `getUserTier()`, compute `showWatermark`, inject into worker payload |
| `apps/api/tests/credits/ledger.test.ts` | modify | `getUserTier()` unit tests (4 cases) |

**Total: 10 files — 2 new, 8 modified. Zero DB migrations.**

---

## Acceptance Criteria

1. A Free-tier user's rendered MP4 shows the Pill Badge watermark in the bottom-right corner, readable on both dark and light scene backgrounds
2. A Pro or Max user's rendered MP4 has no watermark
3. A Free user who manually crafts an API payload with `showWatermark: false` receives a watermarked video regardless (server-side override wins)
4. All existing storyboard JSONs in S3 parse without error (`showWatermark` defaults to `false`)
5. `pnpm -r test` passes with zero regressions
6. The storyboard JSON stored in S3 for a Free-tier job contains `videoConfig.showWatermark: true`
