import { describe, it, expect } from 'vitest';
import { Watermark } from '../src/primitives/Watermark';
import { MainComposition } from '../src/MainComposition';

describe('Watermark', () => {
  it('is exported as a function component', () => {
    // renderToString fails without Remotion Composition context — structural check is correct here.
    // Render correctness is exercised by renderSmoke.test.ts (REMOTION_SMOKE=true).
    expect(typeof Watermark).toBe('function');
  });

  it('has a displayable component name', () => {
    expect(Watermark.name).toBeTruthy();
  });
});

describe('MainComposition after Watermark injection', () => {
  it('is still a valid function component', () => {
    expect(typeof MainComposition).toBe('function');
  });
});
