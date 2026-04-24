'use client';

import { useJobStream } from '../lib/useJobStream';
import { StageRail } from './StageRail';
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
    <div aria-live="polite">
      <StageRail state={state} jobId={jobId} />
    </div>
  );
}
