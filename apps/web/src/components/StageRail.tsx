'use client';

import type { JobStreamState } from '../lib/useJobStream';

type StageId = 'crawl' | 'storyboard' | 'render';

interface StageDef {
  id: StageId;
  label: string;
  detail: string;
}

const STAGES: StageDef[] = [
  { id: 'crawl',      label: 'Crawling',          detail: 'Playwright + rescue fallbacks' },
  { id: 'storyboard', label: 'Writing storyboard', detail: 'Claude Sonnet 4.6' },
  { id: 'render',     label: 'Rendering video',    detail: 'Remotion MainComposition' },
];

type StageStatus = 'pending' | 'active' | 'done';

function statusFor(stage: StageId, state: JobStreamState): StageStatus {
  if (state.status === 'done') return 'done';
  if (state.status === 'failed') {
    return state.stage === stage ? 'active' : (stageOrder(stage) < stageOrder(state.stage) ? 'done' : 'pending');
  }
  if (state.stage === stage) return 'active';
  // Before current stage → done; after → pending.
  if (stageOrder(stage) < stageOrder(state.stage)) return 'done';
  return 'pending';
}

function stageOrder(s: StageId | null): number {
  if (s === 'crawl') return 0;
  if (s === 'storyboard') return 1;
  if (s === 'render') return 2;
  return -1; // null / pre-crawl
}

export interface StageRailProps {
  state: JobStreamState;
  jobId: string;
}

export function StageRail({ state, jobId }: StageRailProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400">Progress</h2>
        <code className="text-[11px] text-gray-400 dark:text-gray-500">{jobId}</code>
      </div>

      <ol className="relative space-y-5">
        {STAGES.map((s, i) => {
          const status = statusFor(s.id, state);
          const isLast = i === STAGES.length - 1;
          return (
            <li key={s.id} className="relative pl-8">
              {/* Vertical connector line (skipped on last item) */}
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute left-[11px] top-6 bottom-[-20px] w-px ${
                    status === 'done'
                      ? 'bg-brand-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              )}
              {/* Dot */}
              <span
                aria-hidden
                className={`absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full ${
                  status === 'done'
                    ? 'bg-brand-500 text-white'
                    : status === 'active'
                    ? 'bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500 animate-pulse'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 ring-1 ring-gray-300 dark:ring-gray-700'
                }`}
              >
                {status === 'done' ? (
                  // simple check glyph
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2.5]">
                    <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>

              <div>
                <div
                  className={`text-sm font-medium ${
                    status === 'active'
                      ? 'text-gray-900 dark:text-gray-100'
                      : status === 'done'
                      ? 'text-gray-700 dark:text-gray-300'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {s.label}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.detail}</div>
                {status === 'active' && state.progress > 0 ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(100, Math.max(0, state.progress))}%` }}
                      aria-valuenow={state.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      role="progressbar"
                      aria-label={`${s.label} progress`}
                    />
                  </div>
                ) : null}
                {status === 'active' && state.status === 'waiting_render_slot' && state.queuedPosition ? (
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Queued — position {state.queuedPosition} (renders are serialized)
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
