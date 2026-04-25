'use client';

import Link from 'next/link';
import { hostnameOf } from '../../lib/url-utils';
import { LineageBadge, type ParentInfo } from './LineageBadge';
import type { Tier } from '../../lib/tier';

export interface HistoryJob {
  jobId: string;
  parentJobId: string | null;
  status: string;
  stage: string | null;
  input: { url: string; intent: string; duration: 10 | 30 | 60 };
  videoUrl: string | null;
  thumbUrl: string | null;
  coverUrl: string | null;
  createdAt: number;
  parent: ParentInfo | null;
}

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
  generating: 'bg-amber-50/10 text-amber-300 ring-1 ring-amber-500/30',
  done: 'bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/30',
  failed: 'bg-red-500/10 text-red-300 ring-1 ring-red-500/30',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function HistoryCard({ job, tier }: { job: HistoryJob; tier: Tier }) {
  const display = bucketStatus(job.status);
  const isDone = display === 'done';

  return (
    <div
      className={
        'group rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md overflow-hidden ' +
        'transition-all duration-200 ease-out hover:-translate-y-1 hover:ring-violet-500/40 ' +
        'hover:shadow-2xl hover:shadow-violet-500/20 motion-reduce:hover:translate-y-0 motion-reduce:transition-none'
      }
    >
      {/* Clickable area — navigates to job detail */}
      <Link
        href={`/jobs/${job.jobId}`}
        className="block p-4 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a14]"
      >
        {/* Thumbnail */}
        <div className="relative aspect-video rounded-lg bg-gray-800/50 overflow-hidden flex items-center justify-center ring-1 ring-white/5">
          {job.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.coverUrl}
              alt=""
              className={
                'w-full h-full object-cover transition-opacity ' +
                (display === 'generating' ? 'opacity-70' : '')
              }
            />
          ) : (
            <span className="text-xs font-mono uppercase text-gray-500">{STATUS_LABEL[display]}</span>
          )}
          {display === 'generating' && job.coverUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="text-[11px] uppercase tracking-wider text-white px-2 py-1 rounded bg-black/50 backdrop-blur-sm animate-pulse">
                Generating
              </span>
            </div>
          ) : null}
        </div>

        {/* Meta */}
        <div className="space-y-1">
          <div className="text-sm font-medium text-gray-100 truncate">
            {hostnameOf(job.input.url)}
          </div>
          <div className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
            {job.input.intent}
          </div>
          {job.parent ? (
            <div className="pt-1">
              <LineageBadge parent={job.parent} currentUrl={job.input.url} />
            </div>
          ) : null}
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>
            {job.input.duration}s · {relativeTime(job.createdAt)}
          </span>
          <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE_CLASS[display]}`}>
            {STATUS_LABEL[display]}
          </span>
        </div>
      </Link>

      {/* Action row — only for done jobs */}
      {isDone && (
        <div className="px-4 pb-3 flex items-center gap-2 border-t border-white/5 pt-3">
          <a
            href={`/api/jobs/${job.jobId}/download?type=mp4`}
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-md ring-1 ring-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            title="Download MP4"
            onClick={(e) => e.stopPropagation()}
          >
            ↓ MP4
          </a>
          <a
            href={`/api/jobs/${job.jobId}/download?type=storyboard`}
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-md ring-1 ring-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            title="Download Storyboard JSON"
            onClick={(e) => e.stopPropagation()}
          >
            ↓ JSON
          </a>
          <Link
            href={`/create?forkId=${job.jobId}`}
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-md ring-1 ring-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 hover:text-brand-200 transition-colors"
            title="Fork & Edit"
            onClick={(e) => e.stopPropagation()}
          >
            ⑂ Fork
          </Link>
        </div>
      )}

      {/* Watermark upgrade hint — free tier + done */}
      {isDone && tier === 'free' && (
        <div className="px-4 pb-3">
          <Link
            href="/billing"
            className="flex items-center gap-2 text-[11px] text-amber-300/80 hover:text-amber-200 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <span>⚡</span>
            <span>Upgrade to Pro to remove the watermark</span>
          </Link>
        </div>
      )}
    </div>
  );
}
