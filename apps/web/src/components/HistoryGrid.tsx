'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { parseHistoryQuery, serializeHistoryQuery, type HistoryQuery } from '../lib/history-query';
import { FilterBar } from './history/FilterBar';
import { HistoryCard, type HistoryJob } from './history/HistoryCard';
import { LoadMoreButton } from './history/LoadMoreButton';

interface FetchState {
  jobs: HistoryJob[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  tier: 'free' | 'pro' | 'max';
}

const PAGE_SIZE = 24;

export function HistoryGrid() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = parseHistoryQuery(new URLSearchParams(searchParams.toString()));

  const [state, setState] = useState<FetchState>({
    jobs: [],
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: null,
    tier: 'free',
  });

  // Track the cursor we last loaded, used by Load More.
  const [cursor, setCursor] = useState<string | null>(null);

  // Identifier for the freshest filter set; throw away stale responses.
  const filterKey = JSON.stringify({ q: query.q, status: query.status, duration: query.duration, time: query.time });

  // Initial / filter-change fetch (no `before` cursor).
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const { before: _drop, ...queryWithoutCursor } = query;
    const params = serializeHistoryQuery({ ...queryWithoutCursor, limit: PAGE_SIZE });
    fetch(`/api/users/me/jobs?${params.toString()}`, { credentials: 'include' })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ jobs: [], hasMore: false, loading: false, loadingMore: false, error: `HTTP ${res.status}` });
          return;
        }
        const body = (await res.json()) as { jobs: HistoryJob[]; hasMore: boolean; tier?: 'free' | 'pro' | 'max' };
        const jobs = body.jobs ?? [];
        setState({ jobs, hasMore: body.hasMore, loading: false, loadingMore: false, error: null, tier: body.tier ?? 'free' });
        setCursor(jobs.length > 0 ? new Date(jobs[jobs.length - 1]!.createdAt).toISOString() : null);
      })
      .catch((err) => {
        if (!cancelled) setState({ jobs: [], hasMore: false, loading: false, loadingMore: false, error: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // URL sync — when FilterBar emits a change, write it back to the URL.
  const onFilterChange = useCallback((next: HistoryQuery) => {
    const params = serializeHistoryQuery(next);
    router.replace(params.toString().length > 0 ? `/history?${params.toString()}` : '/history');
  }, [router]);

  const onLoadMore = useCallback(async () => {
    if (state.loadingMore || !state.hasMore || !cursor) return;
    setState((s) => ({ ...s, loadingMore: true }));
    const params = serializeHistoryQuery({ ...query, before: cursor, limit: PAGE_SIZE });
    try {
      const res = await fetch(`/api/users/me/jobs?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        setState((s) => ({ ...s, loadingMore: false, error: `HTTP ${res.status}` }));
        return;
      }
      const body = (await res.json()) as { jobs: HistoryJob[]; hasMore: boolean };
      const more = body.jobs ?? [];
      setState((s) => ({ ...s, jobs: [...s.jobs, ...more], hasMore: body.hasMore, loadingMore: false }));
      if (more.length > 0) setCursor(new Date(more[more.length - 1]!.createdAt).toISOString());
    } catch (err) {
      setState((s) => ({ ...s, loadingMore: false, error: (err as Error).message }));
    }
  }, [cursor, query, state.hasMore, state.loadingMore]);

  // — render —

  if (state.loading) {
    return (
      <div className="space-y-6">
        <FilterBar query={query} onChange={onFilterChange} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-4 space-y-3 animate-pulse"
            >
              <div className="aspect-video rounded-lg bg-white/5" />
              <div className="h-3 rounded bg-white/5 w-3/4" />
              <div className="h-3 rounded bg-white/5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="space-y-6">
        <FilterBar query={query} onChange={onFilterChange} />
        <div className="rounded-2xl ring-1 ring-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
          Couldn't load your history: {state.error}
        </div>
      </div>
    );
  }

  // Distinguish "no jobs at all" (empty corpus) from "no results for this filter set"
  const hasFilters = Boolean(query.q || query.status || query.duration || query.time);
  if (state.jobs.length === 0) {
    return (
      <div className="space-y-6">
        <FilterBar query={query} onChange={onFilterChange} />
        {hasFilters ? (
          <div className="rounded-2xl ring-1 ring-white/10 bg-white/5 p-8 text-center">
            <h2 className="font-medium text-gray-200">No videos match these filters</h2>
            <p className="mt-2 text-sm text-gray-400">Try clearing some filters or searching for something else.</p>
            <button
              type="button"
              onClick={() => onFilterChange({})}
              className="inline-block mt-4 text-sm text-brand-300 hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="rounded-2xl ring-1 ring-white/10 bg-white/5 p-8 text-center">
            <h2 className="font-medium text-gray-200">No videos yet</h2>
            <p className="mt-2 text-sm text-gray-400">
              Create your first one from the home page — it'll appear here.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-md font-medium transition-colors"
            >
              + New video
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FilterBar query={query} onChange={onFilterChange} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence initial={false}>
          {state.jobs.map((j, idx) => (
            <motion.div
              key={j.jobId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: Math.min(idx * 0.03, 0.45) }}
            >
              <HistoryCard job={j} tier={state.tier} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <LoadMoreButton
        state={state.loadingMore ? 'pending' : state.hasMore ? 'idle' : 'end'}
        onClick={onLoadMore}
      />
    </div>
  );
}
