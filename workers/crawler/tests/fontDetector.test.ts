import { describe, it, expect } from 'vitest';
import { pickPrimaryFontFamily, isGoogleFontSupported } from '../src/extractors/fontDetector.js';

describe('pickPrimaryFontFamily', () => {
  it('strips quotes and takes first family in the stack', () => {
    expect(pickPrimaryFontFamily('"Inter", Arial, sans-serif')).toBe('Inter');
  });

  it('returns undefined when empty', () => {
    expect(pickPrimaryFontFamily('')).toBeUndefined();
  });

  it('returns undefined for generic-only stacks', () => {
    expect(pickPrimaryFontFamily('sans-serif')).toBeUndefined();
  });
});

describe('isGoogleFontSupported', () => {
  it('returns true for Inter', () => {
    expect(isGoogleFontSupported('Inter')).toBe(true);
  });

  it('returns true for JetBrains Mono', () => {
    expect(isGoogleFontSupported('JetBrains Mono')).toBe(true);
  });

  it('returns false for a proprietary font name', () => {
    expect(isGoogleFontSupported('Acme Sans')).toBe(false);
  });
});
