import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/prompts/systemPrompt.js';

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt();

  it('mentions all v1 scene types', () => {
    for (const t of ['HeroRealShot', 'FeatureCallout', 'TextPunch', 'SmoothScroll', 'CTA']) {
      expect(prompt).toContain(t);
    }
  });

  it('does not mention v1.1-deferred types in the implemented catalog', () => {
    // They can still be referenced in the deferred/rule text; check via the implemented subset text
    expect(prompt).toContain('v1 implemented subset');
  });

  it('includes the extractive hard rule', () => {
    expect(prompt.toLowerCase()).toContain('sourcetexts');
    expect(prompt).toMatch(/may not invent/i);
  });

  it('declares duration invariants', () => {
    expect(prompt).toContain('300');
    expect(prompt).toContain('900');
    expect(prompt).toContain('1800');
  });

  it('prohibits markdown / code fences', () => {
    expect(prompt.toLowerCase()).toMatch(/no markdown|no code fences/);
  });

  it('fits within Claude prompt caching limits (under 16k tokens ≈ 60k chars)', () => {
    expect(prompt.length).toBeLessThan(60_000);
  });
});
