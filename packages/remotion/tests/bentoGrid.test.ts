import { describe, it, expect } from 'vitest';
import { getColumnCount, getGridConfig } from '../src/scenes/BentoGrid.js';

describe('BentoGrid — getColumnCount', () => {
  it('returns 2 for 3 items', () => expect(getColumnCount(3)).toBe(2));
  it('returns 2 for 4 items', () => expect(getColumnCount(4)).toBe(2));
  it('returns 3 for 5 items', () => expect(getColumnCount(5)).toBe(3));
  it('returns 3 for 6 items', () => expect(getColumnCount(6)).toBe(3));
});

describe('BentoGrid — getGridConfig', () => {
  it('3 items: 2-col grid, area[0] is tall hero (featuredIndices=[0])', () => {
    const cfg = getGridConfig(3);
    expect(cfg.templateColumns).toBe('1fr 1fr');
    expect(cfg.areas).toEqual(['a', 'b', 'c']);
    expect(cfg.featuredIndices).toEqual([0]);
  });

  it('4 items: 3-col grid, items 0 and 3 are featured (wide cards)', () => {
    const cfg = getGridConfig(4);
    expect(cfg.templateColumns).toBe('repeat(3, 1fr)');
    expect(cfg.areas).toHaveLength(4);
    expect(cfg.featuredIndices).toEqual([0, 3]);
  });

  it('5 items: 3-col grid, only item 0 is featured', () => {
    const cfg = getGridConfig(5);
    expect(cfg.templateColumns).toBe('repeat(3, 1fr)');
    expect(cfg.areas).toHaveLength(5);
    expect(cfg.featuredIndices).toEqual([0]);
  });

  it('6 items: 3-col zigzag, items 0, 3, 4 are featured', () => {
    const cfg = getGridConfig(6);
    expect(cfg.templateColumns).toBe('repeat(3, 1fr)');
    expect(cfg.areas).toHaveLength(6);
    expect(cfg.featuredIndices).toEqual([0, 3, 4]);
  });

  it('clamps below 3 to 3-item config', () => {
    expect(getGridConfig(2).areas).toHaveLength(3);
  });

  it('clamps above 6 to 6-item config', () => {
    expect(getGridConfig(7).areas).toHaveLength(6);
  });
});
