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

  it('falls back to first balanced { } block when JSON is followed by prose', () => {
    // Real-world case 2026-04-25: Claude emitted the object then a trailing
    // "Note:" sentence without fencing. We should recover silently.
    const r = parseJson('{"a": 4}\nNote: I included one stats scene.');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 4 });
  });

  it('handles nested braces and string-literal braces correctly when extracting', () => {
    const input = '{"nested": {"k": "has } in string"}, "other": 5}\nstray trailing garbage';
    const r = parseJson(input);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.value).toEqual({ nested: { k: 'has } in string' }, other: 5 });
    }
  });

  it('handles escaped quotes inside strings when extracting', () => {
    const input = '{"msg": "he said \\"hi\\""}\nextra prose';
    const r = parseJson(input);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ msg: 'he said "hi"' });
  });

  it('surfaces the ORIGINAL parse error when repair + extraction both fail', () => {
    const r = parseJson('{"a": 1, totally broken stuff that cannot be repaired');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toMatch(/JSON parse failed/);
  });

  it('auto-repairs trailing comma before closing brace', () => {
    const r = parseJson('{"a": 1, "b": 2,}');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 1, b: 2 });
  });

  it('auto-repairs trailing comma before closing bracket inside an array', () => {
    const r = parseJson('{"items": [1, 2, 3,]}');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ items: [1, 2, 3] });
  });

  it('auto-repairs unescaped newline inside a string value', () => {
    const r = parseJson('{"note": "line one\nline two"}');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ note: 'line one\nline two' });
  });

  it('auto-repairs smart quotes inside a string value', () => {
    const r = parseJson('{"title": "it’s “live”"}');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      const v = (r.value as { title: string }).title;
      expect(v).toContain('live'); // repair kept the core content intact
    }
  });

  it('does NOT strip commas that are inside a JSON string value', () => {
    // The comma before the closing " is STRING CONTENT, not a trailing comma.
    const r = parseJson('{"msg": "hello, world", "n": 1}');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ msg: 'hello, world', n: 1 });
  });
});
