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
  const sceneCount = input.scenes.length;
  if (sceneCount === 0) return null;

  // Feasibility softening: pacing profiles are a *target*, not a hard
  // contract. Claude doesn't reliably produce enough scenes to honor the
  // strict cap on every video — e.g., marketing_hype caps at 60f/scene
  // (2s) but if Claude returns only 13 scenes for a 60s video, we'd need
  // ≥30 scenes for the math to work. When that happens, soften the cap
  // to ceil(totalFrames / sceneCount) so pacing degrades gracefully
  // instead of throwing STORYBOARD_GEN_FAILED.
  let max = rules.maxSceneFrames ?? Number.POSITIVE_INFINITY;
  let min = rules.minSceneFrames ?? 1;
  if (max !== Number.POSITIVE_INFINITY && max * sceneCount < input.totalFrames) {
    max = Math.ceil(input.totalFrames / sceneCount);
  }
  if (min > 1 && min * sceneCount > input.totalFrames) {
    min = Math.max(1, Math.floor(input.totalFrames / sceneCount));
  }

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
    // Final balance: redistribute residual integer drift one frame at a
    // time across scenes that can absorb it within [min, max]. Walking
    // frame-by-frame ensures we never push a single scene past the cap
    // (Zod requires the sum to exactly equal the target).
    total = clamped.reduce((acc, c) => acc + c.durationInFrames, 0);
    drift = total - input.totalFrames;
    let remaining = Math.abs(drift);
    const direction = drift > 0 ? -1 : 1;
    const maxAttempts = clamped.length * 4 + remaining;
    let attempts = 0;
    while (remaining > 0 && attempts < maxAttempts) {
      attempts++;
      const candidate = clamped.find((c) => {
        const next = c.durationInFrames + direction;
        return next >= min && next <= max;
      });
      if (!candidate) break;
      candidate.durationInFrames += direction;
      remaining--;
    }
    if (remaining > 0) return null;
  }

  return {
    scenes: clamped.map((c) => ({ durationInFrames: c.durationInFrames })),
    clampedSceneCount,
  };
}
