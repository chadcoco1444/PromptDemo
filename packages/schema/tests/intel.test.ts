import { describe, it, expect } from 'vitest';
import { IntelPayloadSchema, isIntelPayload, makeIntel } from '../src/intel';

describe('intel payload', () => {
  it('round-trips through makeIntel', () => {
    const p = makeIntel('crawl', 'Opening the page');
    expect(p.kind).toBe('intel');
    expect(p.stage).toBe('crawl');
    expect(p.message).toBe('Opening the page');
    expect(p.ts).toBeGreaterThan(0);
    expect(IntelPayloadSchema.safeParse(p).success).toBe(true);
  });

  it('isIntelPayload narrows correctly', () => {
    expect(isIntelPayload(makeIntel('render', 'hi'))).toBe(true);
    expect(isIntelPayload({ kind: 'other', stage: 'crawl', message: 'x', ts: 1 })).toBe(false);
    expect(isIntelPayload(42)).toBe(false);
    expect(isIntelPayload({})).toBe(false);
    expect(isIntelPayload(null)).toBe(false);
  });

  it('rejects invalid stage', () => {
    expect(isIntelPayload({ kind: 'intel', stage: 'bogus', message: 'x', ts: 1 })).toBe(false);
  });

  it('rejects overly long messages (>200 chars)', () => {
    const long = 'a'.repeat(201);
    expect(isIntelPayload({ kind: 'intel', stage: 'crawl', message: long, ts: 1 })).toBe(false);
  });
});
