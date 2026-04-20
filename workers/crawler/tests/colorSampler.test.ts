import { describe, it, expect } from 'vitest';
import { pickDominantFromFrequencies, toHex } from '../src/extractors/colorSampler.js';

describe('toHex', () => {
  it('converts rgb to #rrggbb', () => {
    expect(toHex(255, 85, 0)).toBe('#ff5500');
  });

  it('clamps and zero-pads single digits', () => {
    expect(toHex(1, 2, 3)).toBe('#010203');
  });
});

describe('pickDominantFromFrequencies', () => {
  it('returns most frequent non-neutral color', () => {
    const counts = new Map([
      ['#ffffff', 500], // near-white, filtered
      ['#4f46e5', 100],
      ['#a78bfa', 80],
      ['#000000', 200], // near-black, filtered
    ]);
    expect(pickDominantFromFrequencies(counts)).toEqual({ primary: '#4f46e5', secondary: '#a78bfa' });
  });

  it('returns undefined when only neutral colors present', () => {
    const counts = new Map([
      ['#ffffff', 500],
      ['#eeeeee', 300],
      ['#111111', 200],
    ]);
    expect(pickDominantFromFrequencies(counts)).toEqual({});
  });

  it('handles single-color map', () => {
    const counts = new Map([['#4f46e5', 100]]);
    expect(pickDominantFromFrequencies(counts)).toEqual({ primary: '#4f46e5' });
  });
});
