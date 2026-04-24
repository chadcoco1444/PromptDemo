import { handlers, isAuthEnabled } from '../../../../auth';

// NextAuth's GET + POST handlers are gated behind AUTH_ENABLED. If the flag
// is off we return 404 for both to match the "feature not available" contract
// the rest of the app uses — avoids leaking a half-working auth surface.
const notFound = async () => new Response(JSON.stringify({ error: 'auth_disabled' }), {
  status: 404,
  headers: { 'Content-Type': 'application/json' },
});

export const GET = isAuthEnabled() && handlers ? handlers.GET : notFound;
export const POST = isAuthEnabled() && handlers ? handlers.POST : notFound;
