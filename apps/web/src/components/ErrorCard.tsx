'use client';

import { useState } from 'react';

export interface ErrorCardProps {
  code: string;
  message: string;
  retryable: boolean;
  onRetry?: () => void;
}

/**
 * Per-code friendly headline + hint. The map is intentionally small — most
 * user-visible failures fall into 3 buckets (crawl / plan / render). Unknown
 * codes fall through to a generic headline but still show the technical
 * details in the collapsible block so the user can copy/paste for support.
 */
interface ErrorCopy {
  headline: string;
  hint: string;
}

function explainError(code: string): ErrorCopy {
  const c = code.toUpperCase();
  // Crawl stage
  if (c.includes('CRAWL')) {
    return {
      headline: "We couldn't read your URL",
      hint: 'The site may have blocked our crawler or taken too long to load. Try a different URL, or check that the site is public and reachable.',
    };
  }
  // Storyboard stage
  if (c.includes('STORYBOARD')) {
    return {
      headline: "We couldn't plan the video",
      hint: 'The AI had trouble turning this page into a storyboard. This is usually temporary — try again, or tweak your intent to be more specific.',
    };
  }
  // Render stage
  if (c.includes('RENDER')) {
    return {
      headline: 'Video assembly failed',
      hint: 'Something went wrong while stitching the video frames. This is usually transient — try again in a moment.',
    };
  }
  // Network / stream
  if (c.includes('STREAM') || c.includes('NETWORK')) {
    return {
      headline: "We lost connection to the server",
      hint: "The server may be restarting or your network hiccupped. Refresh the page — your job is still running in the background.",
    };
  }
  return {
    headline: 'Something went wrong',
    hint: 'This is an unexpected failure. Check the details below or try again.',
  };
}

export function ErrorCard({ code, message, retryable, onRetry }: ErrorCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const copy = explainError(code);
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-5 space-y-3"
    >
      <div>
        <div className="font-semibold text-red-900 dark:text-red-200 text-base">
          {copy.headline}
        </div>
        <p className="text-sm text-red-800 dark:text-red-300 mt-1">{copy.hint}</p>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {retryable && onRetry ? (
          <button
            onClick={onRetry}
            className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 active:scale-[0.98] transition-all"
          >
            Try again
          </button>
        ) : null}
        <a
          href="/"
          className="bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-sm px-3 py-1.5 rounded-md font-medium hover:bg-red-50 dark:hover:bg-red-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
        >
          Try a different URL
        </a>
        <button
          onClick={() => setDetailsOpen((v) => !v)}
          className="text-sm px-3 py-1.5 rounded-md text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
          aria-expanded={detailsOpen}
          aria-controls="error-details"
        >
          {detailsOpen ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {detailsOpen ? (
        <div
          id="error-details"
          className="mt-2 rounded border border-red-200 dark:border-red-900 bg-white dark:bg-gray-900 p-3"
        >
          <div className="text-[11px] font-mono text-red-700 dark:text-red-400 mb-1">
            {code}
          </div>
          <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
            {message}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
