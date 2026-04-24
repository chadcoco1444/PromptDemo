'use client';

import { useJobStream } from '../lib/useJobStream';
import { ProgressBar } from './ProgressBar';
import { StageLabel } from './StageLabel';
import { VideoResult } from './VideoResult';
import { ErrorCard } from './ErrorCard';

export interface JobStatusProps {
  streamUrl: string;
  jobId: string;
  resolveVideoUrl: (s3Uri: string) => string;
}

export function JobStatus({ streamUrl, jobId, resolveVideoUrl }: JobStatusProps) {
  const state = useJobStream(streamUrl);

  if (state.status === 'done' && state.videoUrl) {
    return <VideoResult videoUrl={state.videoUrl} resolvedUrl={resolveVideoUrl(state.videoUrl)} />;
  }

  if (state.status === 'failed' && state.error) {
    return <ErrorCard code={state.error.code} message={state.error.message} retryable={state.error.retryable} />;
  }

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex justify-between items-center">
        <StageLabel stage={state.stage} />
        <span className="text-sm text-slate-500">Job {jobId}</span>
      </div>
      <ProgressBar pct={state.progress} />
      {state.status === 'waiting_render_slot' && state.queuedPosition ? (
        <div className="text-sm text-slate-600">
          Queued — position {state.queuedPosition} (renders are serialized)
        </div>
      ) : null}
    </div>
  );
}
