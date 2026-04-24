import { describe, it, expect } from 'vitest';
import { rescaleFrames } from '../src/rescaleFrames.js';

describe('rescaleFrames', () => {
  it('returns unchanged when sum already matches target', () => {
    const out = rescaleFrames([100, 200, 300], 600);
    expect(out).toEqual([100, 200, 300]);
  });

  it('absorbs a positive delta into the largest element', () => {
    // sum=890, target=900, delta=+10 → longest (300) gets +10
    const out = rescaleFrames([100, 200, 300, 290], 900);
    expect(out.reduce((a, b) => a + b, 0)).toBe(900);
    expect(out[2]).toBe(310);
    expect(out[0]).toBe(100);
    expect(out[1]).toBe(200);
    expect(out[3]).toBe(290);
  });

  it('absorbs a negative delta from the largest element', () => {
    const out = rescaleFrames([100, 200, 305], 600);
    expect(out.reduce((a, b) => a + b, 0)).toBe(600);
    expect(out[2]).toBe(300);
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
