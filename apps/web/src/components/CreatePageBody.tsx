'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { JobForm } from './JobForm';
import { LandingBackdrop } from './landing/LandingBackdrop';
import { createJob } from '../lib/api';
import { API_BASE } from '../lib/config';
import type { Prefill } from '../lib/prefill';
import type { JobInput } from '../lib/types';

export interface CreatePageBodyProps {
  prefill?: Prefill;
  initialUrl?: string;
}

export function CreatePageBody({ prefill, initialUrl }: CreatePageBodyProps) {
  const router = useRouter();
  const submittedRef = useRef(false);

  const submit = async (input: JobInput) => {
    const res = await createJob(input, API_BASE);
    router.push(`/jobs/${res.jobId}`);
    return res;
  };

  useEffect(() => {
    if (!prefill || submittedRef.current) return;
    submittedRef.current = true;
    void submit({ url: prefill.url, intent: prefill.intent, duration: prefill.duration });
  }, [prefill]);

  return (
    <LandingBackdrop className="min-h-[calc(100vh-65px)]">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <h1
            className="font-extrabold tracking-tight text-transparent bg-clip-text leading-tight"
            style={{
              backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
              fontSize: 'clamp(28px, 4vw, 44px)',
              letterSpacing: '-0.02em',
            }}
          >
            Turn any URL into a demo video.
          </h1>
          <p className="mt-3 text-sm text-gray-400 leading-relaxed">
            Paste a product URL, describe what to emphasize, and get a 10/30/60-second demo rendered with Remotion.
          </p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, type: 'spring', stiffness: 80, damping: 20 }}
          className="rounded-2xl p-8 ring-1 ring-white/10 bg-white/5 backdrop-blur-md"
          style={{ boxShadow: '0 0 60px rgba(109,40,217,0.08)' }}
        >
          <JobForm
            onSubmit={submit}
            {...(prefill
              ? { initialUrl: prefill.url, initialIntent: prefill.intent, initialDuration: prefill.duration }
              : initialUrl
                ? { initialUrl }
                : {})}
          />
        </motion.div>
      </div>
    </LandingBackdrop>
  );
}
