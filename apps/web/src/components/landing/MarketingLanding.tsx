'use client';

import type { JobInput } from '../../lib/types';
import { LandingHero } from './LandingHero';
import { LandingFeatures } from './LandingFeatures';
import { LandingFinalCTA } from './LandingFinalCTA';
import { LandingFooter } from './LandingFooter';

export interface MarketingLandingProps {
  onAuthedSubmit: (input: JobInput) => Promise<{ jobId: string }>;
}

export function MarketingLanding({ onAuthedSubmit }: MarketingLandingProps) {
  return (
    <div className="bg-[#0a0a14]">
      <LandingHero onAuthedSubmit={onAuthedSubmit} />
      <LandingFeatures />
      <LandingFinalCTA />
      <LandingFooter />
    </div>
  );
}
