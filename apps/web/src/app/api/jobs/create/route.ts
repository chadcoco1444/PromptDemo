import { NextResponse } from 'next/server';
import { auth, isAuthEnabled } from '../../../../auth';
import { signInternalToken } from '../../../../lib/internalToken';
import { checkRateLimit } from '../../../../lib/rateLimitProxy';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_MAX_PER_MIN = Number(process.env.BFF_RATE_LIMIT_PER_MIN ?? '20');

/**
 * Trusted proxy for POST /api/jobs.
 *
 * SECURITY MODEL (v2.1):
 *   1. We read the NextAuth session here (Fastify has no NextAuth state).
 *   2. We mint a 60-second HS256 JWT with `sub=userId` using
 *      INTERNAL_API_SECRET, attach as `Authorization: Bearer <jwt>`.
 *   3. apps/api verifies the JWT — refuses to honor any X-User-Id from a
 *      direct caller. If apps/api is exposed without a gateway and an
 *      attacker reaches it, they cannot forge a userId without also
 *      knowing INTERNAL_API_SECRET.
 *   4. Rate limit at this hop (per IP + per userId) — basic defense before
 *      the JWT mint cost so a flood can't burn signing CPU.
 *
 * AUTH_ENABLED=false: forwarded WITHOUT a token; apps/api accepts anonymous.
 */
export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  // Resolve userId first so the rate-limit key is per-(ip,user). Anonymous
  // users share a single ip:anon bucket, which is what we want — we don't
  // want one signed-in user to share a bucket with anonymous traffic from
  // the same NAT.
  let userId: string | null = null;
  if (isAuthEnabled() && auth) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Sign in to create videos.' },
        { status: 401 },
      );
    }
    const sid = (session.user as { id?: string }).id;
    if (!sid) {
      return NextResponse.json(
        { error: 'session_missing_id', message: 'Sign-in session is missing user id; try signing in again.' },
        { status: 500 },
      );
    }
    userId = sid;
  }

  const rateKey = `${ip}:${userId ?? 'anon'}`;
  const decision = checkRateLimit(rateKey, RATE_LIMIT_MAX_PER_MIN);
  if (!decision.ok) {
    const retryAfter = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: `Too many requests — wait ${retryAfter}s before trying again.`,
      },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const body = await request.text();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (userId) {
    try {
      const token = await signInternalToken(userId);
      headers['Authorization'] = `Bearer ${token}`;
    } catch (err) {
      console.error('[bff] signInternalToken failed:', err);
      return NextResponse.json(
        {
          error: 'internal_token_unavailable',
          message: 'Server is misconfigured (missing INTERNAL_API_SECRET). Contact ops.',
        },
        { status: 500 },
      );
    }
  }

  const upstream = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers,
    body,
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
