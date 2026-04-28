import { describe, it, expect } from 'vitest';
import { evaluateTextPunchDiscipline } from '../src/validation/textPunchDiscipline.js';
import type { Storyboard } from '@lumespec/schema';

function makeSb(types: Array<{ type: string; variant?: string }>): Storyboard {
  return {
    videoConfig: {
      durationInFrames: types.length * 90,
      fps: 30,
      brandColor: '#1a1a1a',
      bgm: 'minimal',
      showWatermark: false,
    },
    assets: { screenshots: {}, sourceTexts: ['placeholder text for tests'] },
    scenes: types.map((t, i) => {
      if (t.type === 'TextPunch') {
        return {
          type: 'TextPunch',
          sceneId: i + 1,
          durationInFrames: 90,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: {
            text: 'placeholder text for tests',
            emphasis: 'primary',
            variant: (t.variant ?? 'default') as 'default' | 'photoBackdrop' | 'slideBlock',
          },
        };
      }
      return {
        type: 'CTA',
        sceneId: i + 1,
        durationInFrames: 90,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { headline: 'placeholder text for tests', url: 'https://example.com' },
      };
    }) as Storyboard['scenes'],
  };
}

describe('evaluateTextPunchDiscipline', () => {
  it('reports zero TextPunch when none present', () => {
    const sb = makeSb([{ type: 'CTA' }, { type: 'CTA' }]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(0);
    expect(r.consecutive).toBe(0);
    expect(r.violatesMaxCount).toBe(false);
    expect(r.violatesNoConsecutive).toBe(false);
  });

  it('counts a single TextPunch (no violation)', () => {
    const sb = makeSb([{ type: 'CTA' }, { type: 'TextPunch', variant: 'default' }, { type: 'CTA' }]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(1);
    expect(r.consecutive).toBe(0);
    expect(r.violatesMaxCount).toBe(false);
    expect(r.violatesNoConsecutive).toBe(false);
    expect(r.variantCounts).toEqual({ default: 1 });
  });

  it('flags violatesMaxCount when total > 2', () => {
    const sb = makeSb([
      { type: 'TextPunch' },
      { type: 'CTA' },
      { type: 'TextPunch' },
      { type: 'CTA' },
      { type: 'TextPunch' },
    ]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(3);
    expect(r.consecutive).toBe(0);
    expect(r.violatesMaxCount).toBe(true);
    expect(r.violatesNoConsecutive).toBe(false);
  });

  it('flags violatesNoConsecutive when adjacent TextPunches present', () => {
    const sb = makeSb([
      { type: 'CTA' },
      { type: 'TextPunch' },
      { type: 'TextPunch' },
      { type: 'CTA' },
    ]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(2);
    expect(r.consecutive).toBe(1);
    expect(r.violatesMaxCount).toBe(false);
    expect(r.violatesNoConsecutive).toBe(true);
  });

  it('counts multiple consecutive runs correctly', () => {
    // TP TP TP CTA TP TP -> consecutive adjacencies = 2 + 1 = 3
    const sb = makeSb([
      { type: 'TextPunch' },
      { type: 'TextPunch' },
      { type: 'TextPunch' },
      { type: 'CTA' },
      { type: 'TextPunch' },
      { type: 'TextPunch' },
    ]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.total).toBe(5);
    expect(r.consecutive).toBe(3);
    expect(r.violatesMaxCount).toBe(true);
    expect(r.violatesNoConsecutive).toBe(true);
  });

  it('aggregates variantCounts by variant value', () => {
    const sb = makeSb([
      { type: 'TextPunch', variant: 'photoBackdrop' },
      { type: 'CTA' },
      { type: 'TextPunch', variant: 'slideBlock' },
      { type: 'CTA' },
      { type: 'TextPunch', variant: 'photoBackdrop' },
    ]);
    const r = evaluateTextPunchDiscipline(sb);
    expect(r.variantCounts).toEqual({ photoBackdrop: 2, slideBlock: 1 });
  });
});
