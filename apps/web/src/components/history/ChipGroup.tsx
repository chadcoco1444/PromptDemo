'use client';

export interface ChipOption<V extends string> {
  /** Sentinel `'all'` clears the filter (yields null in onChange). */
  value: V | 'all';
  label: string;
}

export interface ChipGroupProps<V extends string> {
  label: string;
  options: ReadonlyArray<ChipOption<V>>;
  /** null === "All" selected. */
  value: V | null;
  onChange: (next: V | null) => void;
}

export function ChipGroup<V extends string>({ label, options, value, onChange }: ChipGroupProps<V>) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="text-xs uppercase tracking-wider text-gray-500 font-medium mr-1">
        {label}
      </span>
      {options.map((opt) => {
        const isAll = opt.value === 'all';
        const isSelected = isAll ? value === null : value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(isAll ? null : (opt.value as V))}
            className={
              'text-sm px-3 py-1 rounded-full transition-colors min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ' +
              (isSelected
                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/40'
                : 'bg-white/5 ring-1 ring-white/10 text-gray-300 hover:bg-white/10')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
