'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface HistoryJob {
  jobId: string;
  status: string;
  stage: string | null;
  input: { url: string; intent: string; duration: 10 | 30 | 60 };
  videoUrl: string | null;
  thumbUrl: string | null;
  createdAt: number;
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ok'; jobs: HistoryJob[] }
  | { kind: 'error'; message: string };

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const hrs = diff / (1000 * 60 * 60);
  if (hrs < 1) return `${Math.max(1, Math.floor(diff / 60000))} min ago`;
  if (hrs < 24) return `${Math.floor(hrs)}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function HistoryGrid() {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/me/jobs', { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: 'error', message: `HTTP ${res.status}` });
          return;
        }
        const body = (await res.json()) as { jobs: HistoryJob[] };
        setState({ kind: 'ok', jobs: body.jobs ?? [] });
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 animate-pulse"
          >
            <div className="aspect-video rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-3 rounded bg-gray-200 dark:bg-gray-800 w-3/4" />
            <div className="h-3 rounded bg-gray-200 dark:bg-gray-800 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-6 text-sm text-red-800 dark:text-red-300">
        Couldn't load your history: {state.message}
      </div>
    );
  }

  if (state.jobs.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-8 text-center">
        <h2 className="font-medium text-gray-800 dark:text-gray-200">No videos yet</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Create your first one from the home page — it'll appear here.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-md font-medium transition-colors"
        >
          + New video
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {state.jobs.map((j) => {
        const isDone = j.status === 'done' && j.videoUrl;
        return (
          <Link
            key={j.jobId}
            href={`/jobs/${j.jobId}`}
            className="group rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 hover:border-brand-500 hover:shadow-md transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            <div className="aspect-video rounded bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
              {j.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={j.thumbUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span
                  className={`text-xs font-mono uppercase ${
                    isDone
                      ? 'text-brand-500'
                      : j.status === 'failed'
                      ? 'text-red-500'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {j.status}
                </span>
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {hostnameOf(j.input.url)}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
                {j.input.intent}
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
              <span>{j.input.duration}s · {relativeTime(j.createdAt)}</span>
              <span
                className={`px-1.5 py-0.5 rounded ${
                  isDone
                    ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                    : j.status === 'failed'
                    ? 'bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                {j.status}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
