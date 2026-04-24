import { describe, it, expect } from 'vitest';
import { INTENT_PRESETS, applyPreset } from '../../src/lib/intentPresets';

describe('INTENT_PRESETS', () => {
  it('exposes exactly 5 presets with the expected ids in order', () => {
    expect(INTENT_PRESETS.map((p) => p.id)).toEqual([
      'executive-summary',
      'tutorial',
      'marketing-hype',
      'technical-deep-dive',
      'customer-success',
    ]);
  });

  it('every preset has non-empty en + zh labels AND non-empty en + zh bodies', () => {
    for (const p of INTENT_PRESETS) {
      expect(p.labels.en.length).toBeGreaterThan(0);
      expect(p.labels.zh.length).toBeGreaterThan(0);
      expect(p.body.en.length).toBeGreaterThan(40);
      expect(p.body.zh.length).toBeGreaterThan(10);
      expect(p.body.en.slice(0, 40)).not.toMatch(/[一-鿿]/);
      expect(p.body.zh).toMatch(/[一-鿿]/);
    }
  });
});

describe('applyPreset', () => {
  const preset = {
    id: 'executive-summary',
    labels: { en: 'Executive Summary', zh: '高階主管摘要' },
    body: {
      en: 'Emphasize business outcomes.',
      zh: '聚焦商業成果。',
    },
  };

  it('fills an empty textarea with the EN body when locale="en"', () => {
    expect(applyPreset('', preset, 'en')).toBe('Emphasize business outcomes.');
  });

  it('fills an empty textarea with the ZH body when locale="zh"', () => {
    expect(applyPreset('', preset, 'zh')).toBe('聚焦商業成果。');
  });

  it('fills whitespace-only textarea the same way as empty', () => {
    expect(applyPreset('   \n  ', preset, 'en')).toBe('Emphasize business outcomes.');
    expect(applyPreset('   \n  ', preset, 'zh')).toBe('聚焦商業成果。');
  });

  it('appends EN body with EN label marker when locale="en" and current is non-empty', () => {
    expect(applyPreset('existing', preset, 'en')).toBe(
      'existing\n\n[Preset: Executive Summary]\nEmphasize business outcomes.'
    );
  });

  it('appends ZH body with ZH label marker when locale="zh" and current is non-empty', () => {
    expect(applyPreset('既有內容', preset, 'zh')).toBe(
      '既有內容\n\n[Preset: 高階主管摘要]\n聚焦商業成果。'
    );
  });

  it('dedup: same locale + same chip twice = no duplicate', () => {
    const once = applyPreset('', preset, 'en');
    const twice = applyPreset(once, preset, 'en');
    expect(twice).toBe(once);
  });

  it('dedup is bilingual: EN body applied, then zh click of same preset = no-op', () => {
    const withEn = applyPreset('', preset, 'en');
    const afterZhReclick = applyPreset(withEn, preset, 'zh');
    expect(afterZhReclick).toBe(withEn);
  });

  it('dedup is bilingual: ZH body applied, then en click of same preset = no-op', () => {
    const withZh = applyPreset('', preset, 'zh');
    const afterEnReclick = applyPreset(withZh, preset, 'en');
    expect(afterEnReclick).toBe(withZh);
  });

  it('allows appending a DIFFERENT preset even if the first was in a different locale', () => {
    const tutorial = {
      id: 'tutorial',
      labels: { en: 'Tutorial', zh: '教學版' },
      body: { en: 'Walk through.', zh: '一步步帶過。' },
    };
    const first = applyPreset('', preset, 'en');
    const second = applyPreset(first, tutorial, 'zh');
    expect(second).toContain(preset.body.en);
    expect(second).toContain('[Preset: 教學版]');
    expect(second).toContain(tutorial.body.zh);
  });

  it('does not mutate the preset object', () => {
    const snapshot = JSON.stringify(preset);
    applyPreset('anything', preset, 'en');
    applyPreset('anything', preset, 'zh');
    expect(JSON.stringify(preset)).toBe(snapshot);
  });

  it('handles undefined current defensively (partial-HMR safety)', () => {
    expect(applyPreset(undefined, preset, 'en')).toBe('Emphasize business outcomes.');
    expect(applyPreset(null, preset, 'zh')).toBe('聚焦商業成果。');
  });

  it('defaults locale to "en" when not passed (partial-HMR safety)', () => {
    expect(applyPreset('', preset)).toBe('Emphasize business outcomes.');
  });
});
