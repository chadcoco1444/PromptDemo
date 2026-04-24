import { describe, it, expect } from 'vitest';
import { toPresentation, ANIMATION_ENUM } from '../src/animations/entryExit.js';

describe('toPresentation', () => {
  it('returns a presentation object for each known enum value', () => {
    for (const v of ANIMATION_ENUM) {
      const p = toPresentation(v);
      expect(p).toHaveProperty('component');
      expect(p).toHaveProperty('props');
    }
  });

  it('maps "none" to a no-op presentation (0 duration)', () => {
    const p = toPresentation('none');
    expect(p.props.durationInFrames ?? 0).toBe(0);
  });
});
