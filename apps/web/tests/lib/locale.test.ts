import { describe, it, expect } from 'vitest';
import { detectLocale } from '../../src/lib/locale';

describe('detectLocale', () => {
  it('returns "zh" for any zh-* language tag', () => {
    expect(detectLocale('zh-TW')).toBe('zh');
    expect(detectLocale('zh-CN')).toBe('zh');
    expect(detectLocale('zh-Hant')).toBe('zh');
    expect(detectLocale('zh')).toBe('zh');
  });

  it('returns "en" for English tags', () => {
    expect(detectLocale('en-US')).toBe('en');
    expect(detectLocale('en')).toBe('en');
    expect(detectLocale('en-GB')).toBe('en');
  });

  it('returns "en" for any other language tag (conservative fallback)', () => {
    expect(detectLocale('fr-FR')).toBe('en');
    expect(detectLocale('ja-JP')).toBe('en');
    expect(detectLocale('de')).toBe('en');
  });

  it('returns "en" for empty / undefined / garbage input', () => {
    expect(detectLocale('')).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
    expect(detectLocale('x-invalid-tag')).toBe('en');
  });

  it('is case-insensitive on the language subtag', () => {
    expect(detectLocale('ZH-tw')).toBe('zh');
    expect(detectLocale('EN-us')).toBe('en');
  });
});
