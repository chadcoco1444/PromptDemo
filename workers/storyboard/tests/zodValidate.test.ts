import { describe, it, expect } from 'vitest';
import { zodValidate } from '../src/validation/zodValidate.js';
import validStoryboard from '@promptdemo/schema/fixtures/storyboard.30s.json' with { type: 'json' };

describe('zodValidate', () => {
  it('accepts valid fixture', () => {
    const r = zodValidate(validStoryboard);
    expect(r.kind).toBe('ok');
  });

  it('rejects malformed and surfaces Zod issues as a flat string list', () => {
    const r = zodValidate({ videoConfig: {}, assets: {}, scenes: [] });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.issues.length).toBeGreaterThan(0);
      expect(typeof r.issues[0]).toBe('string');
    }
  });

  it('default profile applies no extra pacing rules', () => {
    const r = zodValidate(validStoryboard, { profile: 'default' });
    expect(r.kind).toBe('ok');
  });

  it('marketing_hype rejects scenes longer than 60 frames', () => {
    // The 30s fixture has scenes well above the 60-frame cap, so it should
    // fail under marketing_hype.
    const r = zodValidate(validStoryboard, { profile: 'marketing_hype' });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.issues.some((i) => i.includes('marketing_hype cap of 60'))).toBe(true);
    }
  });

  it('tutorial rejects scenes shorter than 120 frames', () => {
    // Inject a deliberately short scene into a clone of the fixture.
    const sb = JSON.parse(JSON.stringify(validStoryboard));
    sb.scenes[0].durationInFrames = 90;
    // Re-balance the last scene so the total still equals videoConfig.durationInFrames
    // — the duration-sum check would otherwise mask the pacing failure.
    const total = (sb.scenes as Array<{ durationInFrames: number }>).reduce(
      (acc, s) => acc + s.durationInFrames,
      0,
    );
    const drift = total - (sb.videoConfig.durationInFrames as number);
    if (drift !== 0) {
      sb.scenes[sb.scenes.length - 1].durationInFrames -= drift;
    }
    const r = zodValidate(sb, { profile: 'tutorial' });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.issues.some((i) => i.includes('tutorial floor of 120'))).toBe(true);
    }
  });
});
