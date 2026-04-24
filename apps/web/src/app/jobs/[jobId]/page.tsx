'use client';

import { JobStatus } from '../../../components/JobStatus';
import { RegenerateButton } from '../../../components/RegenerateButton';
import { createJob, streamUrl } from '../../../lib/api';
import { API_BASE } from '../../../lib/config';
import { useEffect, useState } from 'react';

interface PageProps {
  params: { jobId: string };
}

// Resolve `s3://bucket/key` by mapping to API base's `/s3/<bucket>/<key>` proxy,
// or simply route to MinIO path-style URL if the bucket is public-read.
// Dev/MVP: assume MinIO public path-style (crawler sets `mc anonymous set download`).
function resolveVideoUrl(s3Uri: string): string {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(s3Uri);
  if (!m) return s3Uri;
  const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT ?? 'http://localhost:9000';
  return `${endpoint}/${m[1]}/${m[2]}`;
}

export default function JobPage({ params }: PageProps) {
  const { jobId } = params;
  const [parentInput, setParentInput] = useState<{ url: string; duration: 10 | 30 | 60 } | null>(null);

  // Fetch the initial job to grab input.url + input.duration for the regenerate flow.
  useEffect(() => {
    fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((job) => {
        if (job?.input) setParentInput({ url: job.input.url, duration: job.input.duration });
      })
      .catch(() => {});
  }, [jobId]);

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Your video</h1>
      <JobStatus streamUrl={streamUrl(jobId, API_BASE)} jobId={jobId} resolveVideoUrl={resolveVideoUrl} />
      {parentInput ? (
        <RegenerateButton
          parentJobId={jobId}
          parentInput={parentInput}
          onSubmit={(input) => createJob(input, API_BASE)}
        />
      ) : null}
    </main>
  );
}
