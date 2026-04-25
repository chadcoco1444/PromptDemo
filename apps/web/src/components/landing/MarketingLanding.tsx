'use client';

import { LandingHero } from './LandingHero';
import { IntentShowcase } from './IntentShowcase';
import { LandingFeatures } from './LandingFeatures';
import { LandingFinalCTA } from './LandingFinalCTA';
import { LandingFooter } from './LandingFooter';

export function MarketingLanding() {
  return (
    <div style={{ background: '#0a0a0a' }}>
      <LandingHero />
      <IntentShowcase />
      <LandingFeatures />
      <LandingFinalCTA />
      <LandingFooter />
    </div>
  );
}
