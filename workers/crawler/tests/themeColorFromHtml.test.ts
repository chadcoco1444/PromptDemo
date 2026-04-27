import { describe, it, expect } from 'vitest';
import { extractThemeColorFromHtml } from '../src/extractors/themeColorFromHtml.js';

describe('extractThemeColorFromHtml', () => {
  it('extracts a bare meta theme-color', () => {
    const html = '<html><head><meta name="theme-color" content="#58cc02"></head></html>';
    expect(extractThemeColorFromHtml(html)).toBe('#58cc02');
  });

  it('prefers bare over media-attributed when both present (Vercel pattern)', () => {
    const html = `
      <html><head>
        <meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
        <meta name="theme-color" content="#abcdef">
      </head></html>
    `;
    expect(extractThemeColorFromHtml(html)).toBe('#abcdef');
  });

  it('falls back to first media-attributed when bare absent', () => {
    const html = `
      <html><head>
        <meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
      </head></html>
    `;
    expect(extractThemeColorFromHtml(html)).toBe('#fafafa');
  });

  it('returns undefined when no theme-color meta exists', () => {
    const html = '<html><head><title>Test</title></head></html>';
    expect(extractThemeColorFromHtml(html)).toBeUndefined();
  });

  it('returns undefined for invalid hex values', () => {
    const html1 = '<html><head><meta name="theme-color" content="red"></head></html>';
    const html2 = '<html><head><meta name="theme-color" content="#fff"></head></html>'; // 3-digit
    const html3 = '<html><head><meta name="theme-color" content="transparent"></head></html>';
    expect(extractThemeColorFromHtml(html1)).toBeUndefined();
    expect(extractThemeColorFromHtml(html2)).toBeUndefined();
    expect(extractThemeColorFromHtml(html3)).toBeUndefined();
  });

  it('lowercases the output for downstream comparison stability', () => {
    const html = '<html><head><meta name="theme-color" content="#ABCDEF"></head></html>';
    expect(extractThemeColorFromHtml(html)).toBe('#abcdef');
  });

  // Real-world HTML often has formatter-added whitespace inside attribute
  // values. Without .trim(), the regex would silently reject these.
  it('trims whitespace inside the content attribute before validation', () => {
    const html = '<html><head><meta name="theme-color" content="  #58cc02  "></head></html>';
    expect(extractThemeColorFromHtml(html)).toBe('#58cc02');
  });
});
