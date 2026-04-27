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

  it('returns the dominant neutrals when only neutral colors present (post soft-neutral: minimalist brands get a real answer)', () => {
    const counts = new Map([
      ['#ffffff', 500],
      ['#eeeeee', 300],
      ['#111111', 200],
    ]);
    // Pre soft-neutral, this asserted {} (hard-reject neutrals). Post fix,
    // neutral candidates are demoted but still returned when no non-neutral
    // alternative exists. Within the neutral group, frequency wins —
    // #ffffff (500) > #eeeeee (300) > #111111 (200).
    expect(pickDominantFromFrequencies(counts)).toEqual({
      primary: '#ffffff',
      secondary: '#eeeeee',
    });
  });

  it('handles single-color map', () => {
    const counts = new Map([['#4f46e5', 100]]);
    expect(pickDominantFromFrequencies(counts)).toEqual({ primary: '#4f46e5' });
  });

  it('prefers non-neutral over neutral even when neutral has higher frequency', () => {
    // Vercel pattern: site has many black headers (high freq) but a single
    // colored brand accent (low freq). The accent should still win.
    const counts = new Map<string, number>([
      ['#000000', 50],   // neutral, very common
      ['#58cc02', 1],    // non-neutral, rare
    ]);
    const result = pickDominantFromFrequencies(counts);
    expect(result.primary).toBe('#58cc02');
  });

  it('accepts pure neutral when no non-neutral candidates exist (regression: minimalist brands)', () => {
    // Regression: previously this returned {} because isNeutral filter rejected
    // all candidates. Now neutral is acceptable as a last resort so minimalist
    // brands (Vercel, Stripe, Linear, etc.) get a real answer.
    const counts = new Map<string, number>([
      ['#000000', 12],
      ['#fafafa', 5],
    ]);
    const result = pickDominantFromFrequencies(counts);
    expect(result.primary).toBe('#000000');
    expect(result.secondary).toBe('#fafafa');
  });
});
