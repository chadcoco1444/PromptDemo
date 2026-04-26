# S-B: Pipeline Reliability — BullMQ Retry + resolveScene Fallback

**Risks:** R5 (BullMQ no retry) + R11 (resolveScene hard throw) — P1  
**Date:** 2026-04-26  
**Status:** Approved — ready for implementation planning

---

## Problem

Two independent reliability gaps in the job pipeline:

### R5 — BullMQ Queues Have No Retry Config

```ts
// apps/api/src/queues.ts (current)
const opts = { connection: connection as any };
return {
  crawl:      new Queue('crawl',      opts),
  storyboard: new Queue('storyboard', opts),
  render:     new Queue('render',     opts),
  ...
};
```

No `attempts` or `backoff` configured. A transient error (network blip, Playwright crash, Claude 429, S3 timeout) immediately moves the job to `failed` state with no retry. The user sees a permanent failure that would have self-healed on a second attempt.

### R11 — resolveScene Throws on Unimplemented Scene Types

```ts
// packages/remotion/src/resolveScene.tsx (current)
case 'HeroStylized':
case 'UseCaseStory':
case 'StatsBand':
  throw new Error(
    `scene type "${scene.type}" is deferred to v1.1 and not implemented in v1.0`
  );
```

If Claude generates a storyboard containing any of these three scene types (despite prompt instructions to avoid them), the entire Remotion render fails. The 7-layer Claude output defense filters most cases, but Fuse.js fuzzy matching could still let a variant through.

The correct behaviour is **graceful degradation**: skip the unimplemented scene and substitute a safe fallback, rather than crashing the render.

---

## Design

### R5 — BullMQ Retry with Exponential Backoff

**Configuration added to each queue job default:**

```ts
// apps/api/src/queues.ts
const jobDefaults = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5_000,   // 5s, 10s, 20s
  },
  removeOnComplete: { count: 100 },
  removeOnFail:     { count: 50 },
};

const opts = { connection: connection as any, defaultJobOptions: jobDefaults };
```

**Retry schedule per queue:**

| Queue | Attempt 1 | Attempt 2 | Attempt 3 |
|---|---|---|---|
| `crawl` | immediate | +5s | +10s |
| `storyboard` | immediate | +5s | +10s |
| `render` | immediate | +5s | +10s |

**Why 3 attempts, not 5?** Render jobs take 30–90s. Five attempts with exponential backoff could delay failure feedback by 5+ minutes. Three attempts (max ~35s of backoff) balance reliability against user wait time.

**Why exponential, not fixed?** Transient errors (Claude 429, S3 throttle) benefit from back-off. Fixed delay would pile up requests in a burst.

**Jobs that should NOT retry:** None currently. If a job fails due to invalid input (e.g., unparseable URL), it would retry 3 times unnecessarily. Acceptable trade-off at this stage — the schema validation in `postJob.ts` catches most invalid inputs before enqueuing.

**`removeOnComplete` / `removeOnFail`:** Prevents the Redis job list from growing unboundedly in production. Keep last 100 completed and 50 failed jobs for debugging visibility.

### R11 — resolveScene Graceful Fallback

Replace the hard throw with a fallback to `TextPunch`, the simplest scene type that requires no assets.

```ts
// packages/remotion/src/resolveScene.tsx
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

**Why TextPunch and not a blank frame?**
- TextPunch requires no external assets or props beyond `text` and `theme` — always renderable
- A visible placeholder makes it obvious in QA that a fallback fired, rather than a silent blank frame that looks like a bug

**Logging:** The orchestrator / render worker should log a warning when a fallback fires, so the team can track how often Claude bypasses the scene catalog restrictions.

```ts
// In the render worker, wrap resolveScene:
try {
  return resolveScene(input);
} catch (err) {
  // This path should now be unreachable for deferred types,
  // but catch unexpected throws from future scene additions.
  console.warn('[resolveScene] unexpected throw, substituting TextPunch:', err);
  return <TextPunch text="Scene unavailable" emphasis="secondary" theme={theme} />;
}
```

**Prompt hardening (complementary, no code change):** The scene catalog in `sceneTypeCatalog.ts` already marks these types as deferred. No additional prompt change needed.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/queues.ts` | Add `defaultJobOptions` with `attempts: 3`, `backoff`, `removeOnComplete/Fail` |
| `packages/remotion/src/resolveScene.tsx` | Replace `throw` with `TextPunch` fallback for deferred scene types |
| `apps/api/tests/queues.test.ts` (new) | Verify queue options include retry config |
| `packages/remotion/tests/resolveScene.test.ts` | Add test: deferred scene types return a React element, not an error |

---

## Testing

**R5 — BullMQ config (queues.test.ts):**
```ts
it('queues have retry config', () => {
  const bundle = makeQueueBundle(mockRedis);
  expect(bundle.crawl.defaultJobOptions?.attempts).toBe(3);
  expect(bundle.storyboard.defaultJobOptions?.attempts).toBe(3);
  expect(bundle.render.defaultJobOptions?.attempts).toBe(3);
  expect(bundle.crawl.defaultJobOptions?.backoff).toMatchObject({ type: 'exponential' });
});
```

**R11 — resolveScene fallback:**
```ts
it.each(['HeroStylized', 'UseCaseStory', 'StatsBand'])(
  'resolveScene returns a fallback element for deferred type %s',
  (type) => {
    const scene = { type, sceneId: 1, durationInFrames: 90, props: {} } as any;
    const result = resolveScene({ scene, assets: {}, theme: mockTheme, url: 'x', resolver: () => undefined });
    expect(result).toBeTruthy(); // React element, not an Error
  }
);
```

---

## Non-Goals

- Per-queue different retry counts (uniform policy is simpler; revisit if crawl jobs need different tolerance)
- Dead-letter queue (BullMQ `failed` queue provides this natively; no custom DLQ needed)
- Replacing deferred scene types with full implementations (that is a product feature, not a reliability fix)
