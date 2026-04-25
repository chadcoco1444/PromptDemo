import { getPacingRules, type PacingProfile } from '../prompts/pacingProfiles.js';

/**
 * v2.1 Phase 2.3 — pacing auto-clamp.
 *
 * Claude often ignores per-scene frame caps even after retries (the model is
 * better at honoring overall duration than per-scene rules). To keep the
 * retry loop from burning attempts on something we can fix locally, we
 * clamp scenes to the profile's [min, max] and reprorate so the total
 * still equals videoConfig.durationInFrames.
 *
 * Algorithm:
 *   1. If profile = default, no-op.
 *   2. Walk scenes; for each, clamp durationInFrames to [min ?? 1, max ?? Infinity].
 *      Track the delta (positive = stretched, negative = trimmed) per scene.
 *   3. Total drift after clamping rarely matches the target. Distribute the
 *      drift across the unclamped scenes (those that didn't hit a cap), or
 *      if everything was clamped, across all scenes proportionally to their
 *      pre-clamp size.
 *   4. If the math overflows (e.g. all scenes pinned at min and we still
 *      need to shed frames, total min*N > target), bail to the original
 *      array — caller's existing retry loop handles it.
 *
 * Returns null when no clamp is needed or possible. Caller treats null as
 * "use the input as-is".
 */
export interface ClampInput {
  profile: PacingProfile;
  scenes: Array<{ durationInFrames: number }>;
  totalFrames: number;
}

export interface ClampResult {
  scenes: Array<{ durationInFrames: number }>;
  clampedSceneCount: number;
}

export function clampPacing(input: ClampInput): ClampResult | null {
  if (input.profile === 'default') return null;
  const rules = getPacingRules(input.profile);
  const min = rules.minSceneFrames ?? 1;
  const max = rules.maxSceneFrames ?? Number.POSITIVE_INFINITY;
  if (input.scenes.length === 0) return null;

  // Step 1: clamp each scene; track which were clamped (= no longer free
  // to absorb drift).
  const clamped = input.scenes.map((s) => {
    const v = Math.max(min, Math.min(max, s.durationInFrames));
    return { durationInFrames: v, wasClamped: v !== s.durationInFrames, original: s.durationInFrames };
  });
  const clampedSceneCount = clamped.filter((c) => c.wasClamped).length;
  if (clampedSceneCount === 0) return null;

  // Step 2: redistribute drift.
  let total = clamped.reduce((acc, c) => acc + c.durationInFrames, 0);
  let drift = total - input.totalFrames;

  // Sanity check: if even pinning everything to min still exceeds target
  // (drift > 0 with all clamped low), or pinning to max still falls short
  // (drift < 0 with all clamped high), there's no math that yields the
  // target — bail and let the caller decide.
  if (drift !== 0) {
    const free = clamped.filter((c) => !c.wasClamped);
    if (free.length === 0) {
      // Everything clamped — distribute proportionally across all.
      const sum = clamped.reduce((acc, c) => acc + c.durationInFrames, 0);
      if (sum === 0) return null;
      for (const c of clamped) {
        const share = Math.round((c.durationInFrames / sum) * drift);
        const next = c.durationInFrames - share;
        // Re-clamp after redistribution (otherwise we'd violate the cap again).
        c.durationInFrames = Math.max(min, Math.min(max, next));
      }
    } else {
      const perFree = drift / free.length;
      for (const c of free) {
        const next = c.durationInFrames - Math.round(perFree);
        c.durationInFrames = Math.max(min, Math.min(max, next));
      }
    }
    // Final balance: any residual drift goes to the longest scene that
    // still has room. Single integer fix-up so the sum exactly equals the
    // target frame count (Zod requires exact equality).
    total = clamped.reduce((acc, c) => acc + c.durationInFrames, 0);
    drift = total - input.totalFrames;
    if (drift !== 0) {
      const candidates = drift > 0
        ? clamped.filter((c) => c.durationInFrames - drift >= min) // need to shrink
        : clamped.filter((c) => c.durationInFrames - drift <= max); // need to grow (drift<0 → -drift>0)
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.durationInFrames - a.durationInFrames);
      candidates[0]!.durationInFrames -= drift;
    }
  }

  return {
    scenes: clamped.map((c) => ({ durationInFrames: c.durationInFrames })),
    clampedSceneCount,
  };
}
