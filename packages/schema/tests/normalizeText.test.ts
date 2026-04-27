import { describe, it, expect } from 'vitest';
import { normalizeText } from '../src/normalizeText.js';

describe('normalizeText', () => {
  it('decodes HTML entities', () => {
    expect(normalizeText('Build &amp; ship')).toBe('build & ship');
  });

  it('collapses whitespace including tabs and newlines', () => {
    expect(normalizeText('  multi\t\n  spaced   ')).toBe('multi spaced');
  });

  it('strips zero-width and BOM characters', () => {
    expect(normalizeText('hel\u200Blo\uFEFF')).toBe('hello');
  });

  it('lowercases ASCII', () => {
    expect(normalizeText('HELLO World')).toBe('hello world');
  });

  it('applies NFKC normalization for unicode', () => {
    // fullwidth 'Ａ' NFKC normalizes to 'A'
    expect(normalizeText('Ａbc')).toBe('abc');
  });

  it('preserves CJK characters as-is (no lowering) and trims edges', () => {
    expect(normalizeText('自動化')).toBe('自動化');
    expect(normalizeText('  未來  ')).toBe('未來');
  });

  it('removes whitespace between adjacent CJK characters (no word boundaries in CJK)', () => {
    // Essential for downstream Fuse.js / N-gram matching. Mixed CJK+Latin retains the boundary space.
    expect(normalizeText('自  動 化')).toBe('自動化');
    expect(normalizeText('ai 自動化 ship')).toBe('ai 自動化 ship');
  });

  it('converts fullwidth space to removed when between CJK chars', () => {
    expect(normalizeText('自\u3000動化')).toBe('自動化');
  });

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  // Regression: 2026-04-27 duolingo emotional intent failed extractive
  // check because crawled HTML had U+2019 (curly apostrophe) in "world's"
  // while the LLM emitted U+0027 (ASCII). NFKC alone does not fold these —
  // a separate normalization step is required.
  it('folds typographic single quotes (U+2018/U+2019) to ASCII apostrophe', () => {
    expect(normalizeText('world’s most popular')).toBe("world's most popular");
    // Curly and ASCII forms must normalize to the same string.
    expect(normalizeText('world’s')).toBe(normalizeText("world's"));
    expect(normalizeText('‘hi’')).toBe("'hi'");
  });

  it('folds typographic double quotes (U+201C/U+201D) to ASCII', () => {
    expect(normalizeText('“hello”')).toBe('"hello"');
    expect(normalizeText('“hi”')).toBe(normalizeText('"hi"'));
  });

  it('strips control chars but keeps printable punctuation', () => {
    expect(normalizeText('hello\u0001, world!')).toBe('hello, world!');
  });
});
