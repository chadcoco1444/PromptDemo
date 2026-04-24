'use client';

import { useRouter } from 'next/navigation';
import { JobForm } from '../components/JobForm';
import { createJob } from '../lib/api';
import { API_BASE } from '../lib/config';

export default function Home() {
  const router = useRouter();
  return (
    <main className="max-w-2xl mx-auto p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Turn any URL into a demo video</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Paste a product URL, describe what to emphasize, and get a 10/30/60-second demo rendered with Remotion.
        </p>
      </header>
      <JobForm
        onSubmit={async (input) => {
          const res = await createJob(input, API_BASE);
          router.push(`/jobs/${res.jobId}`);
          return res;
        }}
      />
    </main>
  );
}
