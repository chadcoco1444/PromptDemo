/**
 * v2.2 History Page query model. Single source of truth for the URL params
 * the /history page reads and the /api/users/me/jobs endpoint accepts.
 *
 * Conventions:
 *   - Empty / blank / out-of-set values are DROPPED from the parsed output
 *     (no `undefined` fields). The API treats "missing" as "no filter".
 *   - Round-trip is preserved: serialize(parse(x)) === x for valid input.
 *   - limit defaults to 24 client-side; not serialized when at default.
 */

export type HistoryStatus = 'generating' | 'done' | 'failed';
export type HistoryDuration = 10 | 30 | 60;
export type HistoryTime = '7d' | '30d' | '90d';

export interface HistoryQuery {
  q?: string;
  status?: HistoryStatus;
  duration?: HistoryDuration;
  time?: HistoryTime;
  before?: string; // ISO8601
  limit?: number;
}

const STATUSES: ReadonlySet<HistoryStatus> = new Set(['generating', 'done', 'failed']);
const TIMES: ReadonlySet<HistoryTime> = new Set(['7d', '30d', '90d']);
const DEFAULT_LIMIT = 24;

export function parseHistoryQuery(params: URLSearchParams): HistoryQuery {
  const out: HistoryQuery = {};

  const rawQ = params.get('q');
  if (rawQ !== null) {
    const trimmed = rawQ.trim();
    if (trimmed.length > 0) out.q = trimmed;
  }

  const status = params.get('status');
  if (status && STATUSES.has(status as HistoryStatus)) {
    out.status = status as HistoryStatus;
  }

  const duration = Number(params.get('duration'));
  if (duration === 10 || duration === 30 || duration === 60) {
    out.duration = duration;
  }

  const time = params.get('time');
  if (time && TIMES.has(time as HistoryTime)) {
    out.time = time as HistoryTime;
  }

  const before = params.get('before');
  if (before && !Number.isNaN(Date.parse(before))) {
    out.before = before;
  }

  const limit = params.get('limit');
  if (limit !== null) {
    const n = Number(limit);
    if (Number.isFinite(n)) {
      out.limit = Math.min(100, Math.max(1, Math.trunc(n)));
    }
  }

  return out;
}

export function serializeHistoryQuery(q: HistoryQuery): URLSearchParams {
  const out = new URLSearchParams();
  if (q.q && q.q.trim().length > 0) out.set('q', q.q.trim());
  if (q.status) out.set('status', q.status);
  if (q.duration !== undefined) out.set('duration', String(q.duration));
  if (q.time) out.set('time', q.time);
  if (q.before) out.set('before', q.before);
  if (q.limit !== undefined && q.limit !== DEFAULT_LIMIT) out.set('limit', String(q.limit));
  return out;
}
