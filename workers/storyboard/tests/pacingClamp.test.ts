import { describe, it, expect } from 'vitest';
import { clampPacing } from '../src/validation/pacingClamp.js';

describe('clampPacing', () => {
  it('returns null for default profile (no clamp needed)', () => {
    expect(
      clampPacing({
        profile: 'default',
        scenes: [{ durationInFrames: 60 }, { durationInFrames: 240 }],
        totalFrames: 300,
      }),
    ).toBeNull();
  });

  it('returns null when no scene violates the cap', () => {
    const out = clampPacing({
      profile: 'tutorial',
      scenes: [{ durationInFrames: 150 }, { durationInFrames: 150 }],
      totalFrames: 300,
    });
    expect(out).toBeNull();
  });

  it('tutorial: stretches short scene to floor and shrinks the rest to balance', () => {
    // Tutorial floor = 120. Scene 0 is 60, two others are 420 each → total 900.
    const out = clampPacing({
      profile: 'tutorial',
      scenes: [
        { durationInFrames: 60 },
        { durationInFrames: 420 },
        { durationInFrames: 420 },
      ],
      totalFrames: 900,
    });
    expect(out).not.toBeNull();
    expect(out!.scenes[0]!.durationInFrames).toBe(120);
    const sum = out!.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(sum).toBe(900);
    expect(out!.clampedSceneCount).toBe(1);
  });

  it('marketing_hype: trims long scene to cap and grows the rest', () => {
    // Marketing cap = 60. 5 scenes — scene 0 is over the cap, 4 others
    // are short. Total = 300 frames (10s video).
    // Cap is 60 → 5×60=300 is the only way the math works out, so all
    // scenes will land at or near the cap.
    const out = clampPacing({
      profile: 'marketing_hype',
      scenes: [
        { durationInFrames: 200 },
        { durationInFrames: 50 },
        { durationInFrames: 50 },
        { durationInFrames: 50 },
        { durationInFrames: 50 },
      ],
      totalFrames: 300,
    });
    expect(out).not.toBeNull();
    expect(out!.scenes[0]!.durationInFrames).toBeLessThanOrEqual(60);
    const sum = out!.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(sum).toBe(300);
    for (const s of out!.scenes) {
      expect(s.durationInFrames).toBeLessThanOrEqual(60);
    }
  });

  it('keeps total exactly equal to target after redistribution', () => {
    const out = clampPacing({
      profile: 'tutorial',
      scenes: [
        { durationInFrames: 90 },
        { durationInFrames: 100 },
        { durationInFrames: 110 },
        { durationInFrames: 600 },
      ],
      totalFrames: 900,
    });
    expect(out).not.toBeNull();
    const sum = out!.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(sum).toBe(900);
    // Each scene meets the floor.
    for (const s of out!.scenes) {
      expect(s.durationInFrames).toBeGreaterThanOrEqual(120);
    }
  });

  it('softens min cap when strict floor would overshoot the total', () => {
    // Tutorial min=120 × 10 scenes = 1200 needed but target=900. Soften
    // min to floor(900/10)=90 so the math fits. Result still hits exactly 900.
    const out = clampPacing({
      profile: 'tutorial',
      scenes: Array.from({ length: 10 }, () => ({ durationInFrames: 50 })),
      totalFrames: 900,
    });
    expect(out).not.toBeNull();
    const sum = out!.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(sum).toBe(900);
  });

  it('softens max cap to keep video at target duration when scene count is too low', () => {
    // The exact marketing_hype crash from 2026-04-25:
    // 13 scenes, totalFrames=1800, cap=60 → max possible 780 < 1800.
    // Soften max to ceil(1800/13)=139. Scene at 240 clamps to ≤139.
    const scenes = Array.from({ length: 13 }, () => ({ durationInFrames: 100 }));
    scenes[12]!.durationInFrames = 240; // the offender from the bug report
    const out = clampPacing({
      profile: 'marketing_hype',
      scenes,
      totalFrames: 1800,
    });
    expect(out).not.toBeNull();
    const sum = out!.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(sum).toBe(1800);
    // Every scene now within the softened cap (≤ 139).
    for (const s of out!.scenes) {
      expect(s.durationInFrames).toBeLessThanOrEqual(139);
    }
  });
});
