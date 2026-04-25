import { describe, it, expect } from 'vitest';
import { detectPacingProfile, getPacingRules } from '../src/prompts/pacingProfiles.js';

describe('detectPacingProfile', () => {
  it('returns marketing_hype for hype keywords (en)', () => {
    expect(detectPacingProfile('Marketing Hype trailer for our launch')).toBe('marketing_hype');
    expect(detectPacingProfile('high-energy promo')).toBe('marketing_hype');
    expect(detectPacingProfile('limited time announcement')).toBe('marketing_hype');
  });

  it('returns marketing_hype for hype keywords (zh)', () => {
    expect(detectPacingProfile('行銷影片')).toBe('marketing_hype');
    expect(detectPacingProfile('產品預告')).toBe('marketing_hype');
  });

  it('returns tutorial for tutorial keywords (en)', () => {
    expect(detectPacingProfile('Tutorial walkthrough of the dashboard')).toBe('tutorial');
    expect(detectPacingProfile('how to set up authentication')).toBe('tutorial');
    expect(detectPacingProfile('step-by-step guide for new users')).toBe('tutorial');
    expect(detectPacingProfile('onboarding flow demo')).toBe('tutorial');
  });

  it('returns tutorial for tutorial keywords (zh)', () => {
    expect(detectPacingProfile('教學影片')).toBe('tutorial');
    expect(detectPacingProfile('使用步驟示範')).toBe('tutorial');
  });

  it('returns default when no keyword matches', () => {
    expect(detectPacingProfile('show the homepage and pricing')).toBe('default');
    expect(detectPacingProfile('emphasize the team page')).toBe('default');
    expect(detectPacingProfile('')).toBe('default');
  });

  it('case-insensitive', () => {
    expect(detectPacingProfile('TUTORIAL')).toBe('tutorial');
    expect(detectPacingProfile('Hype HYPE')).toBe('marketing_hype');
  });

  it('hype wins when both keyword sets match (first-match-wins)', () => {
    // Documents the deterministic precedence order.
    expect(detectPacingProfile('hype tutorial')).toBe('marketing_hype');
  });
});

describe('getPacingRules', () => {
  it('marketing_hype caps scene frames at 60 with no minimum', () => {
    const r = getPacingRules('marketing_hype');
    expect(r.maxSceneFrames).toBe(60);
    expect(r.minSceneFrames).toBeNull();
    expect(r.systemPromptAddition).toContain('high-energy trailer');
    expect(r.systemPromptAddition).toContain('TextPunch');
  });

  it('tutorial sets minimum scene frames to 120 with no cap', () => {
    const r = getPacingRules('tutorial');
    expect(r.minSceneFrames).toBe(120);
    expect(r.maxSceneFrames).toBeNull();
    expect(r.systemPromptAddition).toContain('instructional');
    expect(r.systemPromptAddition).toContain('FeatureCallout');
  });

  it('default has no caps and an empty addition', () => {
    const r = getPacingRules('default');
    expect(r.maxSceneFrames).toBeNull();
    expect(r.minSceneFrames).toBeNull();
    expect(r.systemPromptAddition).toBe('');
  });
});
