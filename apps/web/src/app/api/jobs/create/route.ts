import { NextResponse } from 'next/server';
import { auth, isAuthEnabled } from '../../../../auth';

export const dynamic = 'force-dynamic';

/**
 * Trusted proxy for POST /api/jobs.
 *
 * Why route through Next.js instead of calling apps/api directly from the
 * browser: Fastify (apps/api) has no knowledge of NextAuth sessions. This
 * route reads the session server-side, extracts the user id, and forwards
 * the body to apps/api with X-User-Id set.
 *
 * When AUTH_ENABLED=false we still forward — just without X-User-Id — so
 * the client never has to know whether auth is on or off. Keeps
 * apps/web/src/lib/api.ts clean.
 *
 * SECURITY: apps/api trusts X-User-Id unconditionally. Production deploys
 * MUST NOT expose apps/api directly to the internet; lock it behind a
 * gateway that strips any client-supplied X-User-Id before forwarding.
 * Local dev binds apps/api to 127.0.0.1:3000 so only this same-process
 * proxy can reach it.
 */
export async function POST(request: Request) {
  const body = await request.text(); // forward opaque — let apps/api validate
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isAuthEnabled() && auth) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Sign in to create videos.' },
        { status: 401 },
      );
    }
    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      // NextAuth database adapter populates session.user.id from the sessions
      // table. If it's missing something upstream is misconfigured.
      return NextResponse.json(
        { error: 'session_missing_id', message: 'Sign-in session is missing user id; try signing in again.' },
        { status: 500 },
      );
    }
    headers['X-User-Id'] = userId;
  }

  const upstream = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers,
    body,
  });

  // Passthrough body + status. Content-Type is always JSON per the apps/api contract.
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
