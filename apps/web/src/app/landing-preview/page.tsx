import { notFound } from 'next/navigation';
import { MarketingLandingClientShell } from '../../components/landing/MarketingLandingClientShell';

export const dynamic = 'force-dynamic';

/**
 * Dev-only — always renders the marketing landing regardless of session.
 * 404 in production so it doesn't pollute the public surface area.
 */
export default function LandingPreview() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <MarketingLandingClientShell />;
}
