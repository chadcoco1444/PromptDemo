# Dynamic Watermark PLG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a "Made with LumeSpec" Pill Badge watermark in every Free-tier rendered video, enforced server-side so it cannot be bypassed.

**Architecture:** `showWatermark` is determined once in `apps/api` (from the `subscriptions` table), passed through the BullMQ job payload into the storyboard worker, and baked into the storyboard JSON stored in S3 by `enrichFromCrawlResult()`. The Remotion layer passively reads the field with zero tier awareness.

**Tech Stack:** Zod (schema), React + Remotion (component), pg Pool (tier query), Vitest (tests), BullMQ (queue wiring)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/schema/src/storyboard.ts` | modify | Add `showWatermark` field to `VideoConfigSchema` |
| `packages/schema/tests/storyboard.test.ts` | modify | Backward-compat + new field parse tests |
| `packages/remotion/src/primitives/Watermark.tsx` | **create** | Pill Badge overlay component (inline styles, % positioning) |
| `packages/remotion/src/MainComposition.tsx` | modify | Conditional `<Watermark />` as final child |
| `packages/remotion/tests/Watermark.test.tsx` | **create** | Structural smoke tests |
| `apps/api/src/credits/ledger.ts` | modify | Add `getUserTier()` DB utility |
| `apps/api/tests/credits/ledger.test.ts` | modify | 4 `getUserTier` unit tests with mock pools |
| `workers/storyboard/src/generator.ts` | modify | Add `showWatermark` to `GenerateInput`; inject in `enrichFromCrawlResult` |
| `workers/storyboard/src/index.ts` | modify | Add `showWatermark` to `JobPayload`; pass to `generateStoryboard` |
| `workers/storyboard/tests/generator.test.ts` | modify | 3 propagation + override-enforcement tests |
| `apps/api/src/orchestrator/index.ts` | modify | Add `creditPool` to config; call `getUserTier` on crawl-complete dispatch |
| `apps/api/src/routes/postJob.ts` | modify | Hoist `showWatermark`; pass in skip-crawl storyboard dispatch |
| `apps/api/src/index.ts` | modify | Wire `creditPool` into orchestrator opts |

---

## Task 1: Schema — `showWatermark` in VideoConfigSchema

**Files:**
- Modify: `packages/schema/src/storyboard.ts`
- Modify: `packages/schema/tests/storyboard.test.ts`

- [ ] **Step 1.1: Write three failing tests**

Open `packages/schema/tests/storyboard.test.ts` and append this `describe` block after the existing tests:

```typescript
describe('VideoConfigSchema — showWatermark', () => {
  it('parses a storyboard without showWatermark field and defaults to false', () => {
    // Existing S3 storyboards have no showWatermark — must parse without error
    const parsed = StoryboardSchema.parse(minimalValid);
    expect(parsed.videoConfig.showWatermark).toBe(false);
  });

  it('parses a storyboard with showWatermark: true', () => {
    const parsed = StoryboardSchema.parse({
      ...minimalValid,
      videoConfig: { ...minimalValid.videoConfig, showWatermark: true },
    });
    expect(parsed.videoConfig.showWatermark).toBe(true);
  });

  it('parses a storyboard with showWatermark: false', () => {
    const parsed = StoryboardSchema.parse({
      ...minimalValid,
      videoConfig: { ...minimalValid.videoConfig, showWatermark: false },
    });
    expect(parsed.videoConfig.showWatermark).toBe(false);
  });
});
```

- [ ] **Step 1.2: Run tests — verify they fail**

```bash
cd packages/schema && pnpm test
```

Expected: 3 new failures — `parsed.videoConfig.showWatermark` is `undefined`, not `false`.

- [ ] **Step 1.3: Add `showWatermark` to `VideoConfigSchema`**

In `packages/schema/src/storyboard.ts`, replace the `VideoConfigSchema` definition (lines 24–30):

```typescript
const VideoConfigSchema = z.object({
  durationInFrames: IntPositive,
  fps: z.literal(30),
  brandColor: HexColorSchema,
  logoUrl: S3UriSchema.optional(),
  bgm: BgmEnum,
  showWatermark: z.boolean().optional().default(false),
});
```

- [ ] **Step 1.4: Run tests — verify they pass**

```bash
cd packages/schema && pnpm test
```

Expected: all tests pass, including the 3 new ones.

- [ ] **Step 1.5: Commit**

```bash
git add packages/schema/src/storyboard.ts packages/schema/tests/storyboard.test.ts
git commit -m "feat(schema): add showWatermark to VideoConfigSchema with optional().default(false)"
```

---

## Task 2: Remotion — Watermark Component + MainComposition Injection

**Files:**
- Create: `packages/remotion/src/primitives/Watermark.tsx`
- Modify: `packages/remotion/src/MainComposition.tsx`
- Create: `packages/remotion/tests/Watermark.test.tsx`

- [ ] **Step 2.1: Write failing tests**

Create `packages/remotion/tests/Watermark.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { Watermark } from '../src/primitives/Watermark';
import { MainComposition } from '../src/MainComposition';

describe('Watermark', () => {
  it('is exported as a function component', () => {
    // renderToString fails without Remotion Composition context — structural check is correct here.
    // Render correctness is exercised by renderSmoke.test.ts (REMOTION_SMOKE=true).
    expect(typeof Watermark).toBe('function');
  });

  it('has a displayable component name', () => {
    expect(Watermark.name).toBeTruthy();
  });
});

describe('MainComposition after Watermark injection', () => {
  it('is still a valid function component', () => {
    expect(typeof MainComposition).toBe('function');
  });
});
```

- [ ] **Step 2.2: Run tests — verify they fail**

```bash
cd packages/remotion && pnpm test
```

Expected: 3 failures — `Cannot find module '../src/primitives/Watermark'`.

- [ ] **Step 2.3: Create `Watermark.tsx`**

Create `packages/remotion/src/primitives/Watermark.tsx`:

```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';

export const Watermark: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <div
      style={{
        position: 'absolute',
        bottom: '3%',
        right: '2%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(0, 0, 0, 0.50)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        borderRadius: 24,
        padding: '5px 14px 5px 8px',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
          borderRadius: 5,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.88)',
          letterSpacing: '0.02em',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          whiteSpace: 'nowrap',
        }}
      >
        Made with LumeSpec
      </span>
    </div>
  </AbsoluteFill>
);
```

- [ ] **Step 2.4: Add conditional watermark to `MainComposition.tsx`**

In `packages/remotion/src/MainComposition.tsx`:

1. Add import after the existing imports (line 10):
```typescript
import { Watermark } from './primitives/Watermark';
```

2. Add the conditional render as the **last child** inside the root `<AbsoluteFill>`, after `</TransitionSeries>` (before the closing `</AbsoluteFill>` on line 73):
```tsx
      {videoConfig.showWatermark && <Watermark />}
```

The final return block becomes:
```tsx
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <BGMTrack mood={videoConfig.bgm} durationInFrames={videoConfig.durationInFrames} />
      <TransitionSeries>
        {scenes.map((scene, i) => {
          // ... existing scene rendering unchanged ...
        })}
      </TransitionSeries>
      {videoConfig.showWatermark && <Watermark />}
    </AbsoluteFill>
  );
```

- [ ] **Step 2.5: Run tests — verify they pass**

```bash
cd packages/remotion && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2.6: Commit**

```bash
git add packages/remotion/src/primitives/Watermark.tsx packages/remotion/src/MainComposition.tsx packages/remotion/tests/Watermark.test.tsx
git commit -m "feat(remotion): add Watermark primitive + conditional injection in MainComposition"
```

---

## Task 3: `getUserTier()` Utility + Tests

**Files:**
- Modify: `apps/api/src/credits/ledger.ts`
- Modify: `apps/api/tests/credits/ledger.test.ts`

- [ ] **Step 3.1: Write four failing tests**

Open `apps/api/tests/credits/ledger.test.ts` and add after the existing tests:

```typescript
import type { Pool } from 'pg';
import { vi } from 'vitest';
// (add to the existing import line at the top: getUserTier)

function mockPool(rows: Array<{ tier: string }>): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

describe('getUserTier', () => {
  it('returns "free" when no subscription row exists (COALESCE fallback)', async () => {
    // LEFT JOIN with no subscriptions row → COALESCE(null, 'free') = 'free'
    const pool = mockPool([{ tier: 'free' }]);
    expect(await getUserTier(pool, 42)).toBe('free');
  });

  it('returns "pro" for a user with an active pro subscription', async () => {
    const pool = mockPool([{ tier: 'pro' }]);
    expect(await getUserTier(pool, 42)).toBe('pro');
  });

  it('returns "max" for a user with an active max subscription', async () => {
    const pool = mockPool([{ tier: 'max' }]);
    expect(await getUserTier(pool, 42)).toBe('max');
  });

  it('returns "free" as safe fallback for unknown tier values', async () => {
    // Guards against future DB values not yet in the Tier union
    const pool = mockPool([{ tier: 'enterprise' }]);
    expect(await getUserTier(pool, 42)).toBe('free');
  });
});
```

Also update the import at the top of the file:
```typescript
import {
  TIER_ALLOWANCE,
  CONCURRENCY_LIMIT,
  ALLOWED_DURATIONS,
  calculateCost,
  calculateRefund,
  isDurationAllowed,
  getUserTier,        // ADD THIS
} from '../../src/credits/ledger.js';
```

- [ ] **Step 3.2: Run tests — verify they fail**

```bash
cd apps/api && pnpm test
```

Expected: 4 failures — `getUserTier is not a function` (not exported yet).

- [ ] **Step 3.3: Implement `getUserTier()` in `ledger.ts`**

Open `apps/api/src/credits/ledger.ts`. Add a `pg` import at the top:
```typescript
import type { Pool } from 'pg';
```

Then append the function at the end of the file:

```typescript
/**
 * Read a user's subscription tier in a single query. Safe fallback to 'free'
 * for users with no subscription row (COALESCE) or unknown tier values.
 * No transaction needed — single read.
 */
export async function getUserTier(db: Pool, userId: number): Promise<Tier> {
  const result = await db.query<{ tier: string }>(
    `SELECT COALESCE(s.tier, 'free') AS tier
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  const raw = result.rows[0]?.tier ?? 'free';
  return raw === 'free' || raw === 'pro' || raw === 'max' ? raw : 'free';
}
```

- [ ] **Step 3.4: Run tests — verify they pass**

```bash
cd apps/api && pnpm test
```

Expected: all tests pass including the 4 new `getUserTier` tests.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/credits/ledger.ts apps/api/tests/credits/ledger.test.ts
git commit -m "feat(api): add getUserTier() utility — single-query tier read with free fallback"
```

---

## Task 4: Storyboard Worker — `GenerateInput`, `enrichFromCrawlResult`, `JobPayload`

**Files:**
- Modify: `workers/storyboard/src/generator.ts`
- Modify: `workers/storyboard/src/index.ts`
- Modify: `workers/storyboard/tests/generator.test.ts`

- [ ] **Step 4.1: Write three failing tests**

Open `workers/storyboard/tests/generator.test.ts` and append inside the existing `describe('generateStoryboard', ...)` block:

```typescript
  it('sets showWatermark:true in videoConfig when input.showWatermark is true', async () => {
    const client = mockClient(JSON.stringify(validStoryboard));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: true,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.storyboard.videoConfig.showWatermark).toBe(true);
    }
  });

  it('sets showWatermark:false in videoConfig when input.showWatermark is false', async () => {
    const client = mockClient(JSON.stringify(validStoryboard));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: false,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.storyboard.videoConfig.showWatermark).toBe(false);
    }
  });

  it('overrides LLM output: showWatermark:false from Claude is ignored when input.showWatermark is true', async () => {
    // Critical enforcement guarantee: even if LLM emits showWatermark:false,
    // the enrichFromCrawlResult deterministic override must set it to true.
    const withLlmFalse = JSON.parse(JSON.stringify(validStoryboard));
    withLlmFalse.videoConfig.showWatermark = false;
    const client = mockClient(JSON.stringify(withLlmFalse));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: true,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.storyboard.videoConfig.showWatermark).toBe(true);
    }
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
```

- [ ] **Step 4.2: Run tests — verify they fail**

```bash
cd workers/storyboard && pnpm test
```

Expected: TypeScript error — `showWatermark` does not exist on `GenerateInput`. Tests cannot compile.

- [ ] **Step 4.3: Add `showWatermark` to `GenerateInput` in `generator.ts`**

In `workers/storyboard/src/generator.ts`, update the `GenerateInput` interface (around line 153):

```typescript
export interface GenerateInput {
  claude: ClaudeClient;
  crawlResult: CrawlResult;
  intent: string;
  duration: 10 | 30 | 60;
  hint?: string;
  previousStoryboard?: Storyboard;
  /**
   * When non-null, the Anthropic daily spend guard runs pre-flight (rejects
   * with STORYBOARD_BUDGET_EXCEEDED if cap is hit) and post-call (records
   * the cost from the usage block). Null = guard disabled, behavior matches
   * pre-Phase-5.
   */
  spendGuardPool?: Pool | null;
  /** Baked into videoConfig by enrichFromCrawlResult — never set by Claude. */
  showWatermark: boolean;
}
```

- [ ] **Step 4.4: Extend `enrichFromCrawlResult` signature and override block**

In `workers/storyboard/src/generator.ts`, update the `enrichFromCrawlResult` function signature (line 76):

```typescript
function enrichFromCrawlResult(
  candidate: unknown,
  input: { crawlResult: CrawlResult; duration: 10 | 30 | 60; showWatermark: boolean },
): unknown {
```

Then add `showWatermark` to the deterministic overrides block (inside the `enriched` object, after `logoUrl`):

```typescript
  const enriched: Record<string, unknown> = {
    ...obj,
    videoConfig: {
      // defaults first (overridden by Claude's picks if present)
      bgm: DEFAULT_BGM,
      ...videoConfig,
      // deterministic overrides (Claude cannot change these)
      durationInFrames: DURATION_FRAMES[input.duration],
      fps: 30,
      brandColor: pickBrandColor(brand.primaryColor),
      ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {}),
      showWatermark: input.showWatermark,
    },
    assets: enrichedAssets,
    scenes: withVariants,
  };
```

- [ ] **Step 4.5: Update the `enrichFromCrawlResult` call site in `generateStoryboard`**

In `workers/storyboard/src/generator.ts`, update the call to `enrichFromCrawlResult` (around line 216):

```typescript
    let candidate: unknown = enrichFromCrawlResult(parsed.value, {
      crawlResult: input.crawlResult,
      duration: input.duration,
      showWatermark: input.showWatermark,
    });
```

- [ ] **Step 4.6: Add `showWatermark` to `JobPayload` in `workers/storyboard/src/index.ts`**

In `workers/storyboard/src/index.ts`, update the `JobPayload` schema (around line 13):

```typescript
const JobPayload = z.object({
  jobId: z.string().min(1),
  crawlResultUri: z.string().startsWith('s3://'),
  intent: z.string().min(1),
  duration: z.union([z.literal(10), z.literal(30), z.literal(60)]),
  hint: z.string().optional(),
  previousStoryboardUri: z.string().startsWith('s3://').optional(),
  showWatermark: z.boolean().optional().default(false),
});
```

- [ ] **Step 4.7: Pass `showWatermark` to `generateStoryboard` in `index.ts`**

In `workers/storyboard/src/index.ts`, update the `generateStoryboard` call (around line 68):

```typescript
      const res = await generateStoryboard({
        claude,
        crawlResult,
        intent: payload.intent,
        duration: payload.duration,
        showWatermark: payload.showWatermark,
        ...(payload.hint ? { hint: payload.hint } : {}),
        ...(previous ? { previousStoryboard: previous } : {}),
        ...(spendGuardPool ? { spendGuardPool } : {}),
      });
```

- [ ] **Step 4.8: Run tests — verify they pass**

```bash
cd workers/storyboard && pnpm test
```

Expected: all tests pass including the 3 new propagation tests.

- [ ] **Step 4.9: Commit**

```bash
git add workers/storyboard/src/generator.ts workers/storyboard/src/index.ts workers/storyboard/tests/generator.test.ts
git commit -m "feat(storyboard): thread showWatermark through GenerateInput, enrichFromCrawlResult, and JobPayload"
```

---

## Task 5: Orchestrator Wiring — `creditPool` + `showWatermark` Dispatch

**Files:**
- Modify: `apps/api/src/orchestrator/index.ts`
- Modify: `apps/api/src/routes/postJob.ts`
- Modify: `apps/api/src/index.ts`

### 5-A: Orchestrator crawl-complete dispatch

- [ ] **Step 5.1: Add `creditPool` to `OrchestratorConfig` and import `getUserTier`**

In `apps/api/src/orchestrator/index.ts`, update the imports (add at the top):

```typescript
import type { Pool } from 'pg';
import { getUserTier } from '../credits/ledger.js';
```

Update `OrchestratorConfig` interface to add `creditPool`:

```typescript
export interface OrchestratorConfig {
  queues: QueueBundle;
  store: JobStore;
  broker: Broker;
  renderCap?: number;
  now?: () => number;
  /** When set, used to resolve showWatermark from the user's subscription tier. */
  creditPool?: Pool | null;
  onJobFailed?: (args: {
    jobId: string;
    userId: string | undefined;
    stage: 'crawl' | 'storyboard' | 'render';
    errorCode: string;
    duration: 10 | 30 | 60;
  }) => Promise<void> | void;
}
```

- [ ] **Step 5.2: Compute `showWatermark` and pass it in the storyboard dispatch**

In `apps/api/src/orchestrator/index.ts`, replace the `crawlEvents.on('completed', ...)` handler (around line 68–84) with:

```typescript
  cfg.queues.crawlEvents.on('completed', async ({ jobId, returnvalue }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    const parsed = parseReturn<{ crawlResultUri: S3Uri }>(returnvalue);
    await applyPatch(jobId, reduceEvent(current, { kind: 'crawl:completed', crawlResultUri: parsed.crawlResultUri }));

    let showWatermark = false;
    if (cfg.creditPool && current.userId) {
      const userIdNum = Number(current.userId);
      if (Number.isFinite(userIdNum)) {
        const tier = await getUserTier(cfg.creditPool, userIdNum);
        showWatermark = tier === 'free';
      }
    }

    await cfg.queues.storyboard.add(
      'generate',
      {
        jobId,
        crawlResultUri: parsed.crawlResultUri,
        intent: current.input.intent,
        duration: current.input.duration,
        showWatermark,
        ...(current.input.hint ? { hint: current.input.hint } : {}),
      },
      { jobId }
    );
  });
```

### 5-B: PostJob skip-crawl dispatch

- [ ] **Step 5.3: Hoist `showWatermark` and pass it in the skip-crawl dispatch**

In `apps/api/src/routes/postJob.ts`, make two changes:

**Change 1** — Declare `showWatermark` before the credit gate block. Find the line `const jobId = nano();` (line 74) and add the declaration after it:

```typescript
    const jobId = nano();
    const createdAt = now();
    let showWatermark = false;
```

**Change 2** — Inside the credit gate block, after `const tier = (result.tier ?? 'free') as Tier;` (line 154), add:

```typescript
      const tier = (result.tier ?? 'free') as Tier;
      showWatermark = tier === 'free';
```

**Change 3** — In the skip-crawl dispatch (around line 188), add `showWatermark` to the payload:

```typescript
      await opts.storyboardQueue.add(
        'generate',
        {
          jobId,
          crawlResultUri: inheritedCrawlUri,
          intent: input.intent,
          duration: input.duration,
          showWatermark,
          ...(input.hint ? { hint: input.hint } : {}),
        },
        { jobId },
      );
```

### 5-C: Wire `creditPool` into orchestrator opts

- [ ] **Step 5.4: Pass `creditPool` to the orchestrator in `apps/api/src/index.ts`**

In `apps/api/src/index.ts`, find the `orchestratorOpts` object (around line 87) and add `creditPool`:

```typescript
const orchestratorOpts: Parameters<typeof startOrchestrator>[0] = {
  queues,
  store,
  broker,
  creditPool: pricingEnabled ? pgPoolForCredits : null,
};
```

- [ ] **Step 5.5: Run the full monorepo test suite**

```bash
pnpm -r test
```

Expected: all tests pass with zero regressions. TypeScript compilation confirms the wiring is type-safe across all three files.

- [ ] **Step 5.6: Commit**

```bash
git add apps/api/src/orchestrator/index.ts apps/api/src/routes/postJob.ts apps/api/src/index.ts
git commit -m "feat(api): wire showWatermark through orchestrator and postJob skip-crawl dispatch"
```

---

## Final Verification

- [ ] **Step 6.1: Full monorepo test run**

```bash
pnpm -r test
```

Expected: 501+ tests pass (all existing + the new ones added in this plan). Zero failures.

- [ ] **Step 6.2: Confirm acceptance criteria**

Manually trace the data flow for each acceptance criterion:

1. **Free-tier watermark** — `tier === 'free'` → `showWatermark: true` in queue payload → `enrichFromCrawlResult` injects `showWatermark: true` → S3 JSON has it → Remotion renders `<Watermark />`
2. **Pro/Max no watermark** — `tier !== 'free'` → `showWatermark: false` → no `<Watermark />` rendered
3. **Bypass impossible** — even if someone sends `showWatermark: false` in their API request body, `JobInput` schema strips unknown fields (Zod `.object()` default strips extras), and `enrichFromCrawlResult` override always wins regardless of LLM output
4. **Historical S3 storyboards parse correctly** — `showWatermark: z.boolean().optional().default(false)` → missing field → defaults to `false` → no watermark on old videos
5. **S3 storyboard JSON for free jobs** — contains `videoConfig.showWatermark: true` (verifiable by inspecting S3 after a test job)

---

## Acceptance Criteria Checklist

- [ ] A Free-tier user's rendered MP4 shows the Pill Badge watermark in the bottom-right corner
- [ ] A Pro or Max user's rendered MP4 has no watermark
- [ ] A Free user who manually crafts an API payload with `showWatermark: false` receives a watermarked video regardless
- [ ] All existing storyboard JSONs in S3 parse without error (`showWatermark` defaults to `false`)
- [ ] `pnpm -r test` passes with zero regressions
- [ ] The storyboard JSON stored in S3 for a Free-tier job contains `videoConfig.showWatermark: true`
