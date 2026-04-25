import { describe, it, expect } from 'vitest';
import { getColumnCount } from '../src/scenes/BentoGrid.js';

describe('BentoGrid — getColumnCount', () => {
  it('returns 2 for 3 items', () => expect(getColumnCount(3)).toBe(2));
  it('returns 2 for 4 items', () => expect(getColumnCount(4)).toBe(2));
  it('returns 3 for 5 items', () => expect(getColumnCount(5)).toBe(3));
  it('returns 3 for 6 items', () => expect(getColumnCount(6)).toBe(3));
});
