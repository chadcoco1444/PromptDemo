'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobInput } from '../lib/types';

export interface RegenerateButtonProps {
  parentJobId: string;
  parentInput: Pick<JobInput, 'url' | 'duration'>;
  onSubmit: (input: JobInput) => Promise<{ jobId: string }>;
}

export function RegenerateButton({ parentJobId, parentInput, onSubmit }: RegenerateButtonProps) {
  const router = useRouter();
  const [hint, setHint] = useState('');
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!hint) return;
    setPending(true);
    try {
      const { jobId } = await onSubmit({
        url: parentInput.url,
        intent: hint,
        duration: parentInput.duration,
        parentJobId,
        hint,
      });
      router.push(`/jobs/${jobId}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 space-y-3">
      <div className="font-medium text-gray-800 dark:text-gray-200">Not quite right?</div>
      <textarea
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="Tell us what to change (e.g. faster pace, emphasize the data security)"
        className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 h-20 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:border-transparent transition-colors"
      />
      <button
        onClick={handleClick}
        disabled={!hint || pending}
        className="bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 active:scale-[0.98] transition-all duration-150"
      >
        {pending ? 'Regenerating…' : 'Regenerate with hint'}
      </button>
    </div>
  );
}
