import { describe, it, expect } from 'vitest';
import { detectLocale } from '../src/lib/localeDetect.js';

describe('detectLocale', () => {
  it('returns en for empty input', () => {
    expect(detectLocale([])).toBe('en');
    expect(detectLocale([''])).toBe('en');
  });

  it('returns en for English-only text', () => {
    expect(detectLocale(['Turn any URL into a demo video in seconds.'])).toBe('en');
    expect(detectLocale(['Fast', 'Secure', 'Affordable pricing plans'])).toBe('en');
  });

  it('returns zh for predominantly Traditional Chinese text', () => {
    expect(detectLocale(['將任意網址轉換成展示影片，只需六十秒。'])).toBe('zh');
    expect(detectLocale(['快速', '安全', '實惠的定價方案', '立即開始'])).toBe('zh');
  });

  it('returns zh for predominantly Simplified Chinese text', () => {
    expect(detectLocale(['将任意网址转换成演示视频，只需六十秒。'])).toBe('zh');
    expect(detectLocale(['快速生成', '安全可靠', '灵活定价', '立即开始使用'])).toBe('zh');
  });

  it('returns en when CJK is below 30% threshold', () => {
    // One Chinese word among many English words — ratio well below 30%
    expect(detectLocale(['LumeSpec turns URLs into demo videos quickly and affordably. 視頻'])).toBe('en');
  });

  it('returns zh when CJK is above 30% threshold in mixed text', () => {
    // Majority Chinese
    expect(detectLocale(['LumeSpec 將您的產品網址轉換成精美的演示影片'])).toBe('zh');
  });

  it('handles whitespace-only strings without crashing', () => {
    expect(detectLocale(['   ', '\t\n'])).toBe('en');
  });

  it('processes multiple strings as a combined corpus', () => {
    const mixedCorpus = [
      'Product features',        // English
      '快速、安全、實惠',         // Chinese
      '將網址轉為影片',           // Chinese
      'Pricing starts at $0',    // English
    ];
    // Should detect zh because combined CJK ratio exceeds threshold
    expect(detectLocale(mixedCorpus)).toBe('zh');
  });
});
