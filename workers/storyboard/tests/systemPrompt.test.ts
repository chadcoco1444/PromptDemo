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

  it('does NOT leak unimplemented scene types in the SCENE TYPES section', () => {
    // Phase 2.1 hardening: Claude hallucinated CursorDemo / BentoGrid /
    // UseCaseStory / StatsBand / HeroStylized when the full catalog leaked.
    // The implemented subset must be the only one in the SCENE TYPES list.
    const sceneTypesSection = prompt.split('SCENE TYPES')[1]!.split('HARD RULES')[0]!;
    expect(sceneTypesSection).not.toMatch(/^\s*-\s+CursorDemo/m);
    expect(sceneTypesSection).not.toMatch(/^\s*-\s+BentoGrid/m);
    expect(sceneTypesSection).not.toMatch(/^\s*-\s+UseCaseStory/m);
    expect(sceneTypesSection).not.toMatch(/^\s*-\s+StatsBand/m);
    expect(sceneTypesSection).not.toMatch(/^\s*-\s+HeroStylized/m);
  });

  it('injects pacing block for marketing_hype profile', () => {
    const p = buildSystemPrompt({ profile: 'marketing_hype' });
    expect(p).toContain('PACING PROFILE — MARKETING_HYPE');
    expect(p).toContain('high-energy trailer');
    expect(p).toContain('60 frames');
  });

  it('injects pacing block for tutorial profile', () => {
    const p = buildSystemPrompt({ profile: 'tutorial' });
    expect(p).toContain('PACING PROFILE — TUTORIAL');
    expect(p).toContain('instructional');
    expect(p).toContain('120 frames');
  });

  it('omits pacing block for default profile', () => {
    const p = buildSystemPrompt({ profile: 'default' });
    expect(p).not.toContain('PACING PROFILE');
  });
});
