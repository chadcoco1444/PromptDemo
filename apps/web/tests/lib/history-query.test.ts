import { describe, it, expect } from 'vitest';
import { parseHistoryQuery, serializeHistoryQuery, type HistoryQuery } from '../../src/lib/history-query';

describe('parseHistoryQuery', () => {
  it('returns empty query for empty params', () => {
    const params = new URLSearchParams('');
    expect(parseHistoryQuery(params)).toEqual({});
  });

  it('parses q (trimmed, dropped when blank)', () => {
    expect(parseHistoryQuery(new URLSearchParams('q=  marketing  '))).toEqual({ q: 'marketing' });
    expect(parseHistoryQuery(new URLSearchParams('q='))).toEqual({});
    expect(parseHistoryQuery(new URLSearchParams('q=   '))).toEqual({});
  });

  it('parses status only when in the allowed set', () => {
    expect(parseHistoryQuery(new URLSearchParams('status=done'))).toEqual({ status: 'done' });
    expect(parseHistoryQuery(new URLSearchParams('status=generating'))).toEqual({ status: 'generating' });
    expect(parseHistoryQuery(new URLSearchParams('status=failed'))).toEqual({ status: 'failed' });
    expect(parseHistoryQuery(new URLSearchParams('status=bogus'))).toEqual({});
  });

  it('parses duration only when 10/30/60', () => {
    expect(parseHistoryQuery(new URLSearchParams('duration=30'))).toEqual({ duration: 30 });
    expect(parseHistoryQuery(new URLSearchParams('duration=45'))).toEqual({});
    expect(parseHistoryQuery(new URLSearchParams('duration=foo'))).toEqual({});
  });

  it('parses time only when 7d/30d/90d', () => {
    expect(parseHistoryQuery(new URLSearchParams('time=7d'))).toEqual({ time: '7d' });
    expect(parseHistoryQuery(new URLSearchParams('time=999d'))).toEqual({});
  });

  it('parses before (ISO) and limit (clamped 1-100)', () => {
    expect(parseHistoryQuery(new URLSearchParams('before=2026-04-25T00:00:00.000Z&limit=12')))
      .toEqual({ before: '2026-04-25T00:00:00.000Z', limit: 12 });
    expect(parseHistoryQuery(new URLSearchParams('limit=0'))).toEqual({ limit: 1 });
    expect(parseHistoryQuery(new URLSearchParams('limit=999'))).toEqual({ limit: 100 });
    expect(parseHistoryQuery(new URLSearchParams('limit=abc'))).toEqual({});
  });

  it('combines all params', () => {
    const params = new URLSearchParams('q=hype&status=done&duration=30&time=7d&before=2026-04-25T00:00:00.000Z&limit=24');
    expect(parseHistoryQuery(params)).toEqual({
      q: 'hype', status: 'done', duration: 30, time: '7d',
      before: '2026-04-25T00:00:00.000Z', limit: 24,
    });
  });
});

describe('serializeHistoryQuery', () => {
  it('drops empty/undefined fields from output', () => {
    expect(serializeHistoryQuery({}).toString()).toBe('');
    expect(serializeHistoryQuery({ q: '   ' }).toString()).toBe('');
  });

  it('round-trips through parse', () => {
    const q: HistoryQuery = { q: 'marketing', status: 'done', duration: 60, time: '30d' };
    const params = serializeHistoryQuery(q);
    expect(parseHistoryQuery(params)).toEqual(q);
  });

  it('omits limit when default (24) and before when not paging', () => {
    const params = serializeHistoryQuery({ q: 'foo', limit: 24 });
    expect(params.has('limit')).toBe(false);
    expect(params.get('q')).toBe('foo');
  });
});
