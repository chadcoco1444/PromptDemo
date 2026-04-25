'use client';

import { motion } from 'framer-motion';
import { JobStatus } from '../../../components/JobStatus';
import { RegenerateButton } from '../../../components/RegenerateButton';
import { LandingBackdrop } from '../../../components/landing/LandingBackdrop';
import { createJob, streamUrl } from '../../../lib/api';
import { API_BASE } from '../../../lib/config';
import { useEffect, useState } from 'react';

interface PageProps {
  params: { jobId: string };
}

function resolveVideoUrl(s3Uri: string): string {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(s3Uri);
  if (!m) return s3Uri;
  const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT ?? 'http://localhost:9000';
  return `${endpoint}/${m[1]}/${m[2]}`;
}

export default function JobPage({ params }: PageProps) {
  const { jobId } = params;
  const [parentInput, setParentInput] = useState<{ url: string; duration: 10 | 30 | 60 } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((job) => {
        if (job?.input) setParentInput({ url: job.input.url, duration: job.input.duration });
      })
      .catch(() => {});
  }, [jobId]);

  return (
    <LandingBackdrop className="min-h-[calc(100vh-65px)]">
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-8">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1
            className="font-extrabold tracking-tight text-transparent bg-clip-text"
            style={{
              backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
              fontSize: 'clamp(28px, 4vw, 44px)',
              letterSpacing: '-0.02em',
            }}
          >
            Mission Control
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Rendering your video — sit tight.
          </p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, type: 'spring', stiffness: 80, damping: 20 }}
        >
          <JobStatus streamUrl={streamUrl(jobId, API_BASE)} jobId={jobId} resolveVideoUrl={resolveVideoUrl} />
        </motion.div>

        {parentInput ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <RegenerateButton
              parentJobId={jobId}
              parentInput={parentInput}
              onSubmit={(input) => createJob(input, API_BASE)}
            />
          </motion.div>
        ) : null}
      </div>
    </LandingBackdrop>
  );
}
