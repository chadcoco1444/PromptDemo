# S-B: Pipeline Reliability — BullMQ Retry + resolveScene Fallback

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two independent reliability gaps: transient worker errors immediately fail jobs (no retry), and three deferred Remotion scene types crash the entire render when Claude generates them despite prompt filtering.

**Architecture:** Task 1 extracts a `JOB_DEFAULTS` constant from `queues.ts` and passes it as `defaultJobOptions` — this is tested directly as a unit (no Redis needed). Task 2 replaces the three `throw` branches in `resolveScene.tsx` with a `TextPunch` placeholder return, and updates the existing "throws for deferred" test to assert the new behaviour before implementing it.

**Tech Stack:** BullMQ 5, Remotion 4, Vitest.

---

## File Map

| File | Action |
|---|---|
| `apps/api/src/queues.ts` | Export `JOB_DEFAULTS` constant; pass as `defaultJobOptions` to each `Queue` |
| `apps/api/tests/queues.test.ts` | New — unit-test `JOB_DEFAULTS` fields without a live Redis connection |
| `packages/remotion/src/resolveScene.tsx` | Replace `throw` with `TextPunch` fallback for `HeroStylized`, `UseCaseStory`, `StatsBand` |
| `packages/remotion/tests/resolveScene.test.tsx` | Update the existing "throws" test + add `it.each` for all three deferred types |

---

### Task 1: BullMQ Retry Config

**Files:**
- Modify: `apps/api/src/queues.ts`
- Create: `apps/api/tests/queues.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/queues.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { JOB_DEFAULTS } from '../src/queues.js';

describe('queue job defaults', () => {
  it('retries 3 times with exponential backoff', () => {
    expect(JOB_DEFAULTS.attempts).toBe(3);
    expect(JOB_DEFAULTS.backoff.type).toBe('exponential');
    expect(JOB_DEFAULTS.backoff.delay).toBe(5_000);
  });

  it('caps completed and failed job history to prevent unbounded Redis growth', () => {
    expect(JOB_DEFAULTS.removeOnComplete).toMatchObject({ count: 100 });
    expect(JOB_DEFAULTS.removeOnFail).toMatchObject({ count: 50 });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/api && pnpm vitest run tests/queues.test.ts
```

Expected: import error — `JOB_DEFAULTS` is not exported from `queues.ts`.

- [ ] **Step 3: Add `JOB_DEFAULTS` and wire it into `makeQueueBundle`**

In `apps/api/src/queues.ts`, replace the entire file with:

```ts
import { Queue, QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';

export interface QueueBundle {
  crawl: Queue;
  storyboard: Queue;
  render: Queue;
  crawlEvents: QueueEvents;
  storyboardEvents: QueueEvents;
  renderEvents: QueueEvents;
}

export const JOB_DEFAULTS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5_000, // 5s → 10s → 20s
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
} as const;

export function makeQueueBundle(connection: Redis): QueueBundle {
  const opts = { connection: connection as any, defaultJobOptions: JOB_DEFAULTS };
  return {
    crawl: new Queue('crawl', opts),
    storyboard: new Queue('storyboard', opts),
    render: new Queue('render', opts),
    crawlEvents: new QueueEvents('crawl', { connection: connection as any }),
    storyboardEvents: new QueueEvents('storyboard', { connection: connection as any }),
    renderEvents: new QueueEvents('render', { connection: connection as any }),
  };
}

export async function closeQueueBundle(b: QueueBundle): Promise<void> {
  await Promise.all([
    b.crawl.close(),
    b.storyboard.close(),
    b.render.close(),
    b.crawlEvents.close(),
    b.storyboardEvents.close(),
    b.renderEvents.close(),
  ]);
}
```

> Note: `QueueEvents` intentionally does not receive `defaultJobOptions` — it is a listener, not a producer. Only the three `Queue` instances need retry defaults.

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd apps/api && pnpm vitest run tests/queues.test.ts
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/queues.ts apps/api/tests/queues.test.ts
git commit -m "feat(queues): add retry config — 3 attempts, exponential backoff, history caps"
```

---

### Task 2: resolveScene Graceful Fallback

**Files:**
- Modify: `packages/remotion/tests/resolveScene.test.tsx`
- Modify: `packages/remotion/src/resolveScene.tsx`

- [ ] **Step 1: Update the test — change "throws" to "returns element", add `it.each`**

In `packages/remotion/tests/resolveScene.test.tsx`, replace the existing block:

```ts
  it('throws for deferred v1.1 scene types', () => {
    const scene = {
      sceneId: 1,
      type: 'StatsBand',
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { stats: [{ value: '99%', label: 'uptime' }] },
    } as unknown as Scene;
    expect(() => resolveScene({ scene, assets, theme, url: 'https://x.com', resolver })).toThrow(/not implemented/i);
  });
```

With:

```ts
  it.each([
    {
      type: 'HeroStylized' as const,
      sceneId: 10,
      durationInFrames: 90,
      entryAnimation: 'fade' as const,
      exitAnimation: 'fade' as const,
      props: { title: 'Coming soon' },
    },
    {
      type: 'UseCaseStory' as const,
      sceneId: 11,
      durationInFrames: 90,
      entryAnimation: 'fade' as const,
      exitAnimation: 'fade' as const,
      props: {
        beats: [
          { label: 'before' as const, text: 'Before' },
          { label: 'action' as const, text: 'Action' },
          { label: 'after' as const, text: 'After' },
        ],
      },
    },
    {
      type: 'StatsBand' as const,
      sceneId: 12,
      durationInFrames: 90,
      entryAnimation: 'fade' as const,
      exitAnimation: 'fade' as const,
      props: { stats: [{ value: '99%', label: 'uptime' }] },
    },
  ])('returns a TextPunch fallback for deferred scene type $type', (scene) => {
    const el = resolveScene({ scene: scene as unknown as Scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
    expect(el.props.text).toContain(scene.type);
  });
```

- [ ] **Step 2: Run the tests to confirm the new cases fail**

```bash
cd packages/remotion && pnpm vitest run tests/resolveScene.test.tsx
```

Expected: the `it.each` block produces 3 failures — `resolveScene` still throws instead of returning an element. The 5 existing non-deferred tests continue to pass.

- [ ] **Step 3: Replace the `throw` with a `TextPunch` fallback in `resolveScene.tsx`**

In `packages/remotion/src/resolveScene.tsx`, replace:

```ts
    case 'HeroStylized':
    case 'UseCaseStory':
    case 'StatsBand':
      throw new Error(
        `scene type "${scene.type}" is deferred to v1.1 and not implemented in v1.0`
      );
```

With:

```ts
    case 'HeroStylized':
    case 'UseCaseStory':
    case 'StatsBand': {
      // Deferred scene type: substitute a TextPunch placeholder rather than
      // crashing the render. The storyboard validator should have filtered these
      // out already; this is a last-resort defence.
      const label = scene.type;
      return <TextPunch text={`${label} coming soon`} emphasis="secondary" theme={theme} />;
    }
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd packages/remotion && pnpm vitest run tests/resolveScene.test.tsx
```

Expected: `8 passed` (5 existing + 3 new deferred-type cases).

- [ ] **Step 5: Commit**

```bash
git add packages/remotion/src/resolveScene.tsx packages/remotion/tests/resolveScene.test.tsx
git commit -m "feat(resolveScene): return TextPunch fallback for deferred scene types instead of throwing"
```

---

### Task 3: Full Suite Verification

**Files:** none — verification only

- [ ] **Step 1: Run workspace typecheck**

```bash
cd ../.. && pnpm typecheck
```

Expected: 0 errors across all 8 workspace packages.

- [ ] **Step 2: Run full workspace test suite**

```bash
pnpm test
```

Expected: all tests pass. New totals: `queues.test.ts` adds 2 tests; `resolveScene.test.tsx` grows from 6 to 8 tests (net +4 across packages). The 3 Postgres integration test files (`credits/store`, `apiKeyAuth`, `retentionCron`) continue to fail only when Postgres is unavailable — pre-existing, unrelated to S-B.
