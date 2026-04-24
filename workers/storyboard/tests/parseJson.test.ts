import { describe, it, expect } from 'vitest';
import { parseJson } from '../src/validation/parseJson.js';

describe('parseJson', () => {
  it('parses clean JSON', () => {
    const r = parseJson('{"a": 1}');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 1 });
  });

  it('strips triple-backtick fences with optional json language tag', () => {
    const r = parseJson('```json\n{"a": 1}\n```');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 1 });
  });

  it('strips plain triple-backtick fences without language tag', () => {
    const r = parseJson('```\n{"a": 2}\n```');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 2 });
  });

  it('returns error for unparseable content', () => {
    const r = parseJson('not json');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toMatch(/JSON/i);
  });

  it('trims leading/trailing whitespace', () => {
    const r = parseJson('   {"a": 3}   ');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 3 });
  });
});
