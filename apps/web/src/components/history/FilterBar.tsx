'use client';

import type { HistoryQuery, HistoryStatus, HistoryDuration, HistoryTime } from '../../lib/history-query';
import { SearchInput } from './SearchInput';
import { ChipGroup } from './ChipGroup';

export interface FilterBarProps {
  query: HistoryQuery;
  onChange: (next: HistoryQuery) => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'generating', label: 'Generating' },
  { value: 'done', label: 'Done' },
  { value: 'failed', label: 'Failed' },
] as const;

const DURATION_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '10', label: '10s' },
  { value: '30', label: '30s' },
  { value: '60', label: '60s' },
] as const;

const TIME_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const;

export function FilterBar({ query, onChange }: FilterBarProps) {
  const update = (patch: { [K in keyof HistoryQuery]?: HistoryQuery[K] | undefined }): void => {
    // We always reset `before` cursor when filters change — paginating into
    // a different result set wouldn't make sense.
    // Use a loose intermediate type to avoid exactOptionalPropertyTypes conflicts
    // during the merge; we cast to HistoryQuery after stripping undefined values.
    const merged: Record<string, unknown> = { ...query, ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'before') === false) {
      delete merged['before'];
    }
    // Strip explicitly-undefined / empty fields so URL serialization stays clean.
    for (const k of Object.keys(merged)) {
      if (merged[k] === undefined || merged[k] === null || merged[k] === '') {
        delete merged[k];
      }
    }
    onChange(merged as HistoryQuery);
  };

  return (
    <div className="space-y-4">
      <SearchInput
        value={query.q ?? ''}
        onChange={(q) => update({ q: q.length > 0 ? q : undefined })}
      />
      <div className="flex flex-col md:flex-row md:flex-wrap gap-3 md:gap-6">
        <ChipGroup
          label="Status"
          options={STATUS_OPTIONS as never}
          value={(query.status ?? null) as HistoryStatus | null}
          onChange={(status) => update({ status: (status ?? undefined) as HistoryStatus | undefined })}
        />
        <ChipGroup
          label="Duration"
          options={DURATION_OPTIONS as never}
          value={query.duration ? (String(query.duration) as never) : null}
          onChange={(d) => update({ duration: d ? (Number(d) as HistoryDuration) : undefined })}
        />
        <ChipGroup
          label="Time"
          options={TIME_OPTIONS as never}
          value={(query.time ?? null) as HistoryTime | null}
          onChange={(t) => update({ time: (t ?? undefined) as HistoryTime | undefined })}
        />
      </div>
    </div>
  );
}
