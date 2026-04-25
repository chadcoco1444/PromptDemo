'use client';

import { useEffect, useRef, useState } from 'react';

export interface SearchInputProps {
  /** The committed value (URL-synced upstream). Re-renders the input. */
  value: string;
  /** Called with the new value after debounce, or immediately on Enter/Escape/clear. */
  onChange: (next: string) => void;
  debounceMs?: number;
  placeholder?: string;
}

export function SearchInput({ value, onChange, debounceMs = 300, placeholder = 'Search your videos…' }: SearchInputProps) {
  // Local state so typing is responsive; commit to parent on debounce.
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from prop when URL state changes externally (e.g. back-button).
  useEffect(() => { setLocal(value); }, [value]);

  // Debounced commit.
  useEffect(() => {
    if (local === value) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(local), debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [local, value, onChange, debounceMs]);

  const flush = (next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLocal(next);
    onChange(next);
  };

  return (
    <div className="relative">
      <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
        🔍
      </span>
      <input
        type="search"
        role="searchbox"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') flush(local);
          else if (e.key === 'Escape') flush('');
        }}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2 rounded-md bg-white/5 ring-1 ring-white/10 text-gray-100 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-shadow"
      />
      {local.length > 0 ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => flush('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full text-gray-400 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
