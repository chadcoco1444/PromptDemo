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
  coverUrl: string | null;
  createdAt: number;
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ok'; jobs: HistoryJob[] }
  | { kind: 'error'; message: string };

/**
 * v2.1 Phase 3.1: collapse the 5 in-flight statuses
 * (queued/crawling/generating/waiting_render_slot/rendering) plus 'done'
 * and 'failed' into 3 user-visible buckets:
 *   - 'generating' — anything still working
 *   - 'done'       — terminal success (video available)
 *   - 'failed'     — terminal failure (refunded; user can retry)
 *
 * Hides intermediate stage churn that just makes users anxious.
 */
type DisplayStatus = 'generating' | 'done' | 'failed';

function bucketStatus(raw: string): DisplayStatus {
  if (raw === 'done') return 'done';
  if (raw === 'failed') return 'failed';
  return 'generating';
}

const STATUS_LABEL: Record<DisplayStatus, string> = {
  generating: 'Generating',
  done: 'Done',
  failed: 'Failed',
};

const STATUS_BADGE_CLASS: Record<DisplayStatus, string> = {
  generating:
    'bg-amber-50 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800',
  done: 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 ring-1 ring-brand-200 dark:ring-brand-800',
  failed:
    'bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-800',
};

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
        const display = bucketStatus(j.status);
        return (
          <Link
            key={j.jobId}
            href={`/jobs/${j.jobId}`}
            className="group rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 hover:border-brand-500 hover:shadow-md transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            <div className="relative aspect-video rounded bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
              {j.coverUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={j.coverUrl}
                    alt=""
                    className={`w-full h-full object-cover transition-opacity ${
                      display === 'generating' ? 'opacity-70' : ''
                    }`}
                  />
                  {display === 'generating' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <span className="text-[11px] uppercase tracking-wider text-white px-2 py-1 rounded bg-black/50 backdrop-blur-sm animate-pulse">
                        Generating
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <span
                  className={`text-xs font-mono uppercase ${
                    display === 'done'
                      ? 'text-brand-500'
                      : display === 'failed'
                      ? 'text-red-500'
                      : 'text-gray-400 dark:text-gray-500 animate-pulse'
                  }`}
                >
                  {STATUS_LABEL[display]}
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
              <span>
                {j.input.duration}s · {relativeTime(j.createdAt)}
              </span>
              <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE_CLASS[display]}`}>
                {STATUS_LABEL[display]}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
