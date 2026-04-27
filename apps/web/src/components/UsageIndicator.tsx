'use client';

import { useEffect, useState } from 'react';

interface CreditsSnapshot {
  balance: number;
  tier: 'free' | 'pro' | 'max';
  allowance: number;
  activeJobs: number;
  concurrencyLimit: number;
}

type FetchState = { kind: 'loading' } | { kind: 'ok'; data: CreditsSnapshot } | { kind: 'error' };

export function UsageIndicator({ initialCredits }: { initialCredits?: CreditsSnapshot | null }) {
  const [state, setState] = useState<FetchState>(
    initialCredits ? { kind: 'ok', data: initialCredits } : { kind: 'loading' },
  );

  useEffect(() => {
    if (initialCredits) return; // server pre-fetched, skip client fetch
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/me/credits', { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: 'error' });
          return;
        }
        const data = (await res.json()) as CreditsSnapshot;
        setState({ kind: 'ok', data });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCredits]);

  if (state.kind !== 'ok') return null;

  const { balance, tier, allowance } = state.data;
  const pctLeft = allowance > 0 ? balance / allowance : 0;
  const tone =
    pctLeft < 0.1
      ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
      : pctLeft < 0.3
      ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
      : 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-800';

  return (
    <a
      href="/billing"
      className={`text-xs rounded-full border px-2.5 py-1 font-medium ${tone} hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-opacity`}
      title={`${balance}s remaining of ${allowance}s monthly allowance · ${tier} plan`}
      suppressHydrationWarning
    >
      {balance}s left
      <span className="ml-1 opacity-60 uppercase">{tier}</span>
    </a>
  );
}
