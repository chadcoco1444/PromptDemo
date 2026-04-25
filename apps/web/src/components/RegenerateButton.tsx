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
    <div className="rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-6 space-y-3">
      <div className="font-medium text-white">Not quite right?</div>
      <textarea
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="Tell us what to change (e.g. faster pace, emphasize the data security)"
        className="w-full rounded-lg border border-white/15 bg-white/5 text-white px-3 py-2 h-20 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/60 focus-visible:border-violet-500/50 transition-colors resize-none"
      />
      <button
        onClick={handleClick}
        disabled={!hint || pending}
        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] active:scale-[0.98] transition-all duration-150"
        style={{ boxShadow: hint && !pending ? '0 0 20px rgba(109,40,217,0.4)' : undefined }}
      >
        {pending ? 'Regenerating…' : 'Regenerate with hint'}
      </button>
    </div>
  );
}
