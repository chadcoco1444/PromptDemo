import { describe, it, expect } from 'vitest';
import { rescaleFrames } from '../src/rescaleFrames.js';

describe('rescaleFrames', () => {
  it('returns unchanged when sum already matches target', () => {
    const out = rescaleFrames([100, 200, 300], 600);
    expect(out).toEqual([100, 200, 300]);
  });

  it('distributes a positive delta proportionally across all scenes', () => {
    // sum=890, target=900, delta=+10 → proportional, not lumped into longest
    // Proportional result: [101, 202, 304, 293] (all scenes grow)
    const out = rescaleFrames([100, 200, 300, 290], 900);
    expect(out.reduce((a, b) => a + b, 0)).toBe(900);
    expect(out[0]).toBeGreaterThan(100); // smallest scene grows too
    expect(out[2]).toBeLessThan(310);    // longest does NOT absorb entire delta
  });

  it('distributes a negative delta proportionally across all scenes', () => {
    // sum=605, target=600, delta=-5 → proportional
    // Proportional result: [99, 198, 303] (all scenes shrink)
    const out = rescaleFrames([100, 200, 305], 600);
    expect(out.reduce((a, b) => a + b, 0)).toBe(600);
    expect(out[0]).toBeLessThan(100); // smallest scene shrinks too
    expect(out[2]).toBeGreaterThan(300); // longest does NOT absorb entire delta
  });

  it('splits across multiple scenes when delta exceeds the longest scene margin', () => {
    // sum=1020, target=1000, delta=-20; longest=400, can absorb all if >0 result
    const out = rescaleFrames([100, 200, 400, 320], 1000);
    expect(out.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(out.every((n) => n > 0)).toBe(true);
  });

  it('throws when target forces any scene to <=0 frames', () => {
    expect(() => rescaleFrames([10, 10, 10], 0)).toThrow();
  });

  it('throws on empty array', () => {
    expect(() => rescaleFrames([], 900)).toThrow();
  });
});
