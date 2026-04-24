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

  it('auto-prorates within 10% tolerance (small drift)', () => {
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

  it('returns retry signal when delta exceeds 10%', () => {
    const sb = mk(900, [300, 300, 200]); // sum 800, drift 100 (11.1%)
    const r = adjustDuration(sb);
    expect(r.kind).toBe('retry');
    if (r.kind !== 'retry') return;
    expect(r.reason).toMatch(/10%/);
  });
});
