import { describe, it, expect } from 'vitest';
import { formatExtractiveFeedback } from '../src/validation/extractiveFeedback.js';
import type { ExtractiveViolation } from '../src/validation/extractiveCheck.js';

describe('formatExtractiveFeedback', () => {
  it('formats a single violation with closest sourceText candidates and a verbatim suggestion', () => {
    const violations: ExtractiveViolation[] = [
      { sceneId: 3, field: 'text', text: 'businesses on stripe in 2025' },
    ];
    const sourceTexts = [
      'businesses on stripe',
      '$1.4 trillion+ payment volume',
      'in 2025',
      'completely unrelated marketing copy about webhooks',
    ];

    const out = formatExtractiveFeedback(violations, sourceTexts);

    // Header should explain (a)/(b)/(c) resolution strategy
    expect(out).toContain('(a) Replace with a VERBATIM substring');
    expect(out).toContain('(b) Change the scene type');
    expect(out).toContain('(c) Remove the scene');
    // Per-violation: rejected text + closest candidates listed
    expect(out).toContain('scene 3: "businesses on stripe in 2025"');
    expect(out).toContain('businesses on stripe');
    // Star suggestion when the best candidate is a strong match
    expect(out).toMatch(/★ suggestion:.*"businesses on stripe"/);
  });

  it('ranks candidates by similarity (closest first, top-3 only)', () => {
    const violations: ExtractiveViolation[] = [
      { sceneId: 1, field: 'text', text: 'embedded payments for platforms' },
    ];
    const sourceTexts = [
      'embedded payments',
      'embedded finance',
      'platforms and marketplaces',
      'totally unrelated cookie banner copy',
      'irrelevant footer link about careers',
      'the longest random sentence about pricing tiers and per-transaction fees nobody asked for',
    ];

    const out = formatExtractiveFeedback(violations, sourceTexts);

    // 'embedded payments' must come before 'embedded finance' (closer to violation)
    const idxEmbeddedPayments = out.indexOf('embedded payments');
    const idxEmbeddedFinance = out.indexOf('embedded finance');
    expect(idxEmbeddedPayments).toBeGreaterThan(0);
    expect(idxEmbeddedFinance).toBeGreaterThan(0);
    expect(idxEmbeddedPayments).toBeLessThan(idxEmbeddedFinance);

    // Truly unrelated entries should NOT appear (top-K is 3, those are way down the list)
    expect(out).not.toContain('cookie banner');
    expect(out).not.toContain('footer link');
  });

  it('handles multiple violations across different scenes (each gets its own block)', () => {
    const violations: ExtractiveViolation[] = [
      { sceneId: 3, field: 'text', text: 'generated on stripe in 2025' },
      { sceneId: 9, field: 'text', text: 'expand your product offerings with embedded payments' },
      { sceneId: 12, field: 'text', text: 'users with their best day ever on stripe' },
    ];
    const sourceTexts = [
      'businesses on stripe',
      'in 2025',
      'embedded payments',
      'expand your product offerings',
      'best in class',
    ];

    const out = formatExtractiveFeedback(violations, sourceTexts);

    expect(out).toContain('scene 3: "generated on stripe in 2025"');
    expect(out).toContain('scene 9: "expand your product offerings with embedded payments"');
    expect(out).toContain('scene 12: "users with their best day ever on stripe"');

    // Verify they appear IN ORDER (scene 3 before scene 9 before scene 12)
    const i3 = out.indexOf('scene 3:');
    const i9 = out.indexOf('scene 9:');
    const i12 = out.indexOf('scene 12:');
    expect(i3).toBeLessThan(i9);
    expect(i9).toBeLessThan(i12);
  });

  it('appends previous extractive feedback as history when provided (prevents repeating same errors)', () => {
    const violations: ExtractiveViolation[] = [
      { sceneId: 5, field: 'text', text: 'completely new fabricated phrase' },
    ];
    const sourceTexts = ['some real source text'];
    const previousFeedback = 'scene 3: "first attempt rejected phrase"\nscene 7: "another rejected phrase"';

    const out = formatExtractiveFeedback(violations, sourceTexts, previousFeedback);

    // Current attempt's violation present
    expect(out).toContain('scene 5: "completely new fabricated phrase"');
    // Previous attempt's history section appended
    expect(out).toContain('Previous rejected attempts');
    expect(out).toContain('first attempt rejected phrase');
    expect(out).toContain('another rejected phrase');
  });
});
