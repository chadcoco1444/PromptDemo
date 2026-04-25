'use client';

import { useRouter } from 'next/navigation';
import { hostnameMatches, hostnameOf } from '../../lib/url-utils';

export interface ParentInfo {
  jobId: string;
  hostname: string; // raw URL of the parent's input.url
  createdAt: number; // ms
}

export interface LineageBadgeProps {
  parent: ParentInfo | null;
  currentUrl: string;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function LineageBadge({ parent, currentUrl }: LineageBadgeProps) {
  const router = useRouter();
  if (!parent) return null;
  const sameHost = hostnameMatches(parent.hostname, currentUrl);
  const text = sameHost
    ? `↳ regenerated ${relativeTime(parent.createdAt)}`
    : `↳ from ${hostnameOf(parent.hostname)}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/jobs/${parent.jobId}`);
      }}
      aria-label={`Regenerated from job ${parent.jobId} (${hostnameOf(parent.hostname)})`}
      className="text-[11px] italic text-brand-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1 cursor-pointer"
    >
      {text}
    </button>
  );
}
