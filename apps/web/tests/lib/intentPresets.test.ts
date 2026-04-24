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

  it('every preset has non-empty en + zh labels and an English body', () => {
    for (const p of INTENT_PRESETS) {
      expect(p.labels.en.length).toBeGreaterThan(0);
      expect(p.labels.zh.length).toBeGreaterThan(0);
      expect(p.body.length).toBeGreaterThan(40);
      // Body is authored in English (Chinese prompt weaker for Claude per spec).
      // Heuristic: first 40 chars should not contain a CJK character.
      expect(p.body.slice(0, 40)).not.toMatch(/[一-鿿]/);
    }
  });
});

describe('applyPreset', () => {
  const preset = {
    id: 'executive-summary',
    labels: { en: 'Executive Summary', zh: '高階主管摘要' },
    body: 'Emphasize business outcomes.',
  };

  it('returns the preset body verbatim when current is empty', () => {
    expect(applyPreset('', preset)).toBe('Emphasize business outcomes.');
  });

  it('returns the preset body verbatim when current is only whitespace', () => {
    expect(applyPreset('   \n  ', preset)).toBe('Emphasize business outcomes.');
  });

  it('appends with the bilingual-safe [Preset: en-label] marker when current is non-empty', () => {
    const result = applyPreset('show the pricing page', preset);
    expect(result).toBe(
      'show the pricing page\n\n[Preset: Executive Summary]\nEmphasize business outcomes.'
    );
  });

  it('always uses the English label in the append marker regardless of locale', () => {
    const result = applyPreset('existing text', preset);
    expect(result).toContain('[Preset: Executive Summary]');
    expect(result).not.toContain('[Preset: 高階主管摘要]');
  });

  it('does not mutate the preset object', () => {
    const snapshot = JSON.stringify(preset);
    applyPreset('anything', preset);
    expect(JSON.stringify(preset)).toBe(snapshot);
  });

  it('is a no-op when the same preset was already applied (dedup on double-click)', () => {
    // Clicking the same chip twice shouldn't stuff the intent with duplicates.
    // Detection rule: the current text already contains the preset body verbatim.
    const once = applyPreset('', preset);
    const twice = applyPreset(once, preset);
    expect(twice).toBe(once);
  });

  it('is also a no-op when the preset was applied via append mode and then re-clicked', () => {
    const withAppend = applyPreset('existing text', preset);
    const reclick = applyPreset(withAppend, preset);
    expect(reclick).toBe(withAppend);
  });

  it('still allows appending a DIFFERENT preset after one is already applied', () => {
    const tutorial = {
      id: 'tutorial',
      labels: { en: 'Tutorial / Walkthrough', zh: '教學版' },
      body: 'Walk through the product step-by-step.',
    };
    const first = applyPreset('', preset);
    const second = applyPreset(first, tutorial);
    expect(second).toContain(preset.body);
    expect(second).toContain('[Preset: Tutorial / Walkthrough]');
    expect(second).toContain(tutorial.body);
  });
});
