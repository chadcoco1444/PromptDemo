import { describe, it, expect } from 'vitest';
import { REGION_COORDS, bezierQuad } from '../src/scenes/CursorDemo.js';

describe('REGION_COORDS', () => {
  it('covers all 9 compass regions', () => {
    const expected = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
    expected.forEach((r) => expect(REGION_COORDS[r]).toBeDefined());
  });

  it('center region is at 50%/50%', () => {
    expect(REGION_COORDS['center']).toEqual({ x: 0.50, y: 0.50 });
  });

  it('top-left region is in the top-left quadrant', () => {
    const { x, y } = REGION_COORDS['top-left']!;
    expect(x).toBeLessThan(0.3);
    expect(y).toBeLessThan(0.3);
  });

  it('bottom-right region is in the bottom-right quadrant', () => {
    const { x, y } = REGION_COORDS['bottom-right']!;
    expect(x).toBeGreaterThan(0.7);
    expect(y).toBeGreaterThan(0.7);
  });
});

describe('bezierQuad', () => {
  it('returns p0 when t=0', () => {
    expect(bezierQuad(0, 10, 50, 100)).toBe(10);
  });

  it('returns p2 when t=1', () => {
    expect(bezierQuad(1, 10, 50, 100)).toBe(100);
  });

  it('returns midpoint-ish value at t=0.5', () => {
    // Quadratic Bezier at t=0.5: 0.25*p0 + 0.5*p1 + 0.25*p2
    const result = bezierQuad(0.5, 0, 50, 100);
    expect(result).toBeCloseTo(50, 1); // symmetric control point → midpoint
  });
});
