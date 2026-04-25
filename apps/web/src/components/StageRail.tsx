'use client';

import { AnimatePresence, motion } from 'framer-motion';
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
  if (stageOrder(stage) < stageOrder(state.stage)) return 'done';
  return 'pending';
}

function stageOrder(s: StageId | null): number {
  if (s === 'crawl') return 0;
  if (s === 'storyboard') return 1;
  if (s === 'render') return 2;
  return -1;
}

export interface StageRailProps {
  state: JobStreamState;
  jobId: string;
}

export function StageRail({ state, jobId }: StageRailProps) {
  const isConnecting = state.status === 'connecting';
  return (
    <div
      className="rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-6"
      style={{ boxShadow: '0 0 60px rgba(109,40,217,0.1)' }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          {isConnecting ? 'Connecting…' : 'Progress'}
        </h2>
        <code className="text-[11px] text-gray-600 font-mono">{jobId}</code>
      </div>

      <ol className="relative space-y-6">
        {STAGES.map((s, i) => {
          const status = statusFor(s.id, state);
          const isLast = i === STAGES.length - 1;
          return (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className="relative pl-9"
            >
              {/* Connector line */}
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute left-[13px] top-7 bottom-[-24px] w-px transition-colors duration-500 ${
                    status === 'done' ? 'bg-brand-500' : 'bg-white/10'
                  }`}
                />
              )}

              {/* Status dot */}
              <span
                aria-hidden
                className={`absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 ${
                  status === 'done'
                    ? 'bg-brand-500'
                    : status === 'active'
                    ? 'bg-brand-500/20 ring-2 ring-brand-500 animate-breathe-glow'
                    : 'bg-white/5 ring-1 ring-white/15'
                }`}
              >
                <AnimatePresence mode="wait">
                  {status === 'done' ? (
                    <motion.svg
                      key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 fill-none stroke-white stroke-[2.5]"
                    >
                      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                    </motion.svg>
                  ) : (
                    <motion.span
                      key="dot"
                      className={`h-2 w-2 rounded-full ${
                        status === 'active' ? 'bg-brand-400' : 'bg-white/20'
                      }`}
                    />
                  )}
                </AnimatePresence>
              </span>

              <div>
                <div
                  className={`text-sm font-medium transition-colors duration-200 ${
                    status === 'active'
                      ? 'text-white'
                      : status === 'done'
                      ? 'text-gray-300'
                      : 'text-gray-600'
                  }`}
                >
                  {s.label}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{s.detail}</div>

                {status === 'active' && state.progress > 0 ? (
                  <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-brand-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, state.progress))}%` }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      role="progressbar"
                      aria-valuenow={state.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${s.label} progress`}
                    />
                  </div>
                ) : null}

                {status === 'active' && state.status === 'waiting_render_slot' && state.queuedPosition ? (
                  <div className="mt-2 text-xs text-amber-400">
                    Queued — position {state.queuedPosition}
                  </div>
                ) : null}

                {status === 'active' && state.intel && state.intel.stage === s.id ? (
                  <div className="mt-1.5 relative h-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={state.intel.ts}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="absolute inset-0 text-xs italic text-gray-500"
                        aria-live="polite"
                      >
                        {state.intel.message}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                ) : null}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
