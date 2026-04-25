'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { JobForm } from './JobForm';
import { createJob } from '../lib/api';
import { API_BASE } from '../lib/config';
import type { Prefill } from '../lib/prefill';
import type { JobInput } from '../lib/types';

export interface CreatePageBodyProps {
  /**
   * When provided, the form mounts with these values prefilled and submits
   * automatically once on first mount. Used by /create after a sign-in
   * round-trip from the marketing landing page.
   */
  prefill?: Prefill;
}

export function CreatePageBody({ prefill }: CreatePageBodyProps) {
  const router = useRouter();
  const submittedRef = useRef(false);

  const submit = async (input: JobInput) => {
    const res = await createJob(input, API_BASE);
    router.push(`/jobs/${res.jobId}`);
    return res;
  };

  // Auto-submit once when prefill is present.
  useEffect(() => {
    if (!prefill || submittedRef.current) return;
    submittedRef.current = true;
    void submit({ url: prefill.url, intent: prefill.intent, duration: prefill.duration });
  }, [prefill]);

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Turn any URL into a demo video</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Paste a product URL, describe what to emphasize, and get a 10/30/60-second demo rendered with Remotion.
        </p>
      </header>
      <JobForm
        onSubmit={submit}
        {...(prefill ? { initialUrl: prefill.url, initialIntent: prefill.intent, initialDuration: prefill.duration } : {})}
      />
    </main>
  );
}
