import { auth, isAuthEnabled } from '../auth';
import { CreatePageBody } from '../components/CreatePageBody';
import { MarketingLandingClientShell } from '../components/landing/MarketingLandingClientShell';

export const dynamic = 'force-dynamic';

/**
 * Conditional root:
 *   - signed-out  → marketing landing page (high-conversion path)
 *   - signed-in   → existing job-creation form (the muscle-memory path)
 *
 * Server-side session read prevents flicker. AUTH_ENABLED=false → always
 * shows the form (the historical behavior pre-v2.1).
 */
export default async function Root() {
  if (!isAuthEnabled() || !auth) {
    return <CreatePageBody />;
  }
  const session = await auth();
  if (session?.user) {
    return <CreatePageBody />;
  }
  return <MarketingLandingClientShell />;
}
