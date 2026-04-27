import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDominantColorFromImage } from '../src/extractors/colorFromImage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(resolve(__dirname, 'fixtures/colors', name));

// Sharp's HSV clustering is deterministic but not pixel-exact — allow ±8 on
// each channel to absorb rounding from PNG encoding + the clustering
// step itself. (For these synthesized fixtures it's typically close, but
// we don't want this test to flake on a Sharp version bump or platform
// differences in PNG codec behavior.)
function approxEqHex(actual: string, expected: string, tolerance = 8): boolean {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(actual);
  const [er, eg, eb] = parse(expected);
  return Math.abs(ar - er) <= tolerance
      && Math.abs(ag - eg) <= tolerance
      && Math.abs(ab - eb) <= tolerance;
}

describe('extractDominantColorFromImage', () => {
  it('extracts green from a solid-green PNG fixture', async () => {
    const result = await extractDominantColorFromImage(fixture('solid-green.png'));
    expect(result).toBeDefined();
    expect(approxEqHex(result!, '#58cc02')).toBe(true);
  });

  it('extracts the dominant region from a multi-color fixture (80% green / 20% black)', async () => {
    const result = await extractDominantColorFromImage(fixture('mostly-green.png'));
    expect(result).toBeDefined();
    expect(approxEqHex(result!, '#58cc02')).toBe(true);
  });

  it('extracts black from a solid-black PNG fixture (regression: minimalist logos)', async () => {
    // Vercel-style: logo IS black. Sharp must return it; orchestrator's
    // soft-neutral preference will only demote it if a non-neutral exists.
    const result = await extractDominantColorFromImage(fixture('solid-black.png'));
    expect(result).toBeDefined();
    expect(approxEqHex(result!, '#000000')).toBe(true);
  });

  it('returns undefined for invalid buffer', async () => {
    const result = await extractDominantColorFromImage(Buffer.from('not an image'));
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty buffer', async () => {
    const result = await extractDominantColorFromImage(Buffer.alloc(0));
    expect(result).toBeUndefined();
  });
});
