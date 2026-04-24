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
});
