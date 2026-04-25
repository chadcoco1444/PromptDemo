'use client';

import { useRouter } from 'next/navigation';
import { MarketingLanding } from './MarketingLanding';
import { createJob } from '../../lib/api';
import { API_BASE } from '../../lib/config';
import type { JobInput } from '../../lib/types';

/**
 * Client-side wrapper around <MarketingLanding/> that wires `onAuthedSubmit`
 * to the existing createJob → router.push flow. Lives separately from the
 * server-rendered / route so that route can stay async/server-only.
 */
export function MarketingLandingClientShell() {
  const router = useRouter();
  const onAuthedSubmit = async (input: JobInput) => {
    const res = await createJob(input, API_BASE);
    router.push(`/jobs/${res.jobId}`);
    return res;
  };
  return <MarketingLanding onAuthedSubmit={onAuthedSubmit} />;
}
