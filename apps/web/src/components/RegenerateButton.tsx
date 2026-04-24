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
    <div className="rounded border bg-slate-50 p-4 space-y-3">
      <div className="font-medium text-slate-800">Not quite right?</div>
      <textarea
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="Tell us what to change (e.g. faster pace, emphasize the data security)"
        className="w-full rounded border px-3 py-2 h-20"
      />
      <button
        onClick={handleClick}
        disabled={!hint || pending}
        className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
      >
        {pending ? 'Regenerating…' : 'Regenerate with hint'}
      </button>
    </div>
  );
}
