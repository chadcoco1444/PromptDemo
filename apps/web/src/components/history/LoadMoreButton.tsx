'use client';

import Link from 'next/link';

export type LoadMoreState = 'idle' | 'pending' | 'end';

export interface LoadMoreButtonProps {
  state: LoadMoreState;
  onClick: () => void;
}

export function LoadMoreButton({ state, onClick }: LoadMoreButtonProps) {
  if (state === 'end') {
    return (
      <div className="flex justify-center mt-12 mb-24">
        <Link
          href="/create"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-brand-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1"
        >
          You've reached the end. Make more videos →
        </Link>
      </div>
    );
  }

  const isPending = state === 'pending';
  return (
    <div className="flex justify-center mt-12 mb-24">
      <button
        type="button"
        disabled={isPending}
        onClick={onClick}
        className={
          'inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium ' +
          'bg-white/5 ring-1 ring-white/15 text-gray-200 hover:bg-white/10 hover:ring-brand-500/40 ' +
          'shadow-md shadow-brand-500/10 hover:shadow-brand-500/30 transition-all ' +
          'min-w-[160px] disabled:opacity-70 disabled:cursor-not-allowed ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a14]'
        }
      >
        {isPending ? (
          <>
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Loading…
          </>
        ) : (
          'Load 24 more →'
        )}
      </button>
    </div>
  );
}
