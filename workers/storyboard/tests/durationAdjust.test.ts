import { describe, it, expect } from 'vitest';
import { adjustDuration } from '../src/validation/durationAdjust.js';

type MinimalScene = { durationInFrames: number };
type MinimalBoard = {
  videoConfig: { durationInFrames: number };
  scenes: MinimalScene[];
};

function mk(target: number, scenes: number[]): MinimalBoard {
  return {
    videoConfig: { durationInFrames: target },
    scenes: scenes.map((d) => ({ durationInFrames: d })),
  };
}

describe('adjustDuration', () => {
  it('passes through when sum already equals target', () => {
    const sb = mk(900, [300, 300, 300]);
    const r = adjustDuration(sb);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.storyboard.scenes.map((s) => s.durationInFrames)).toEqual([300, 300, 300]);
  });

  it('auto-prorates within 15% tolerance (small drift)', () => {
    const sb = mk(900, [300, 300, 290]); // sum 890, delta 10 (1.1%)
    const r = adjustDuration(sb);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const newSum = r.storyboard.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(newSum).toBe(900);
  });

  it('auto-prorates at the 8.3% real-world case that previously failed', () => {
    // Exact scenario from user bug report 2026-04-25:
    // target 1800, sum 1950, drift 150 / 1800 = 8.33%.
    const sb = mk(1800, [600, 500, 400, 250, 200]); // sum 1950, drift 8.33%
    const r = adjustDuration(sb);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const newSum = r.storyboard.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(newSum).toBe(1800);
  });

  it('auto-corrects 27.8% drift (vercel.com short-punchy regression)', () => {
    // Regression: intent "short punchy" caused Claude to produce sum=1300
    // vs target=1800 (27.8% off). Previously all 3 generator retries failed
    // with STORYBOARD_GEN_FAILED because the 15% tolerance gate forced a
    // retry signal instead of proportional rescaling. Fixed by removing the
    // gate — proportional rescaling is safe at any magnitude.
    const sb = mk(1800, [200, 180, 200, 190, 180, 200, 150]); // sum 1300, 27.8% off
    const r = adjustDuration(sb);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const newSum = r.storyboard.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(newSum).toBe(1800);
  });

  it('auto-corrects large overshoot (16.7% drift, previously would retry)', () => {
    const sb = mk(900, [400, 400, 250]); // sum 1050, drift 16.7%
    const r = adjustDuration(sb);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const newSum = r.storyboard.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(newSum).toBe(900);
  });

  it('auto-prorates 11% drift (the exact 2000-vs-1800 case from the user bug report)', () => {
    // Pre-tolerance-widening, this triggered STORYBOARD_GEN_FAILED with
    // "scenes sum 2000 differs from target 1800 by 11.1%" — now silently
    // prorated since 11.1% < 15%.
    const sb = mk(1800, [400, 400, 400, 400, 400]); // sum 2000, drift 11.1%
    const r = adjustDuration(sb);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const newSum = r.storyboard.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(newSum).toBe(1800);
  });
});
