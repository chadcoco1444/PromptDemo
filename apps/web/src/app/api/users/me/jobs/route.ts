import { NextResponse } from 'next/server';
import { auth, isAuthEnabled } from '../../../../../auth';
import { signInternalToken } from '../../../../../lib/internalToken';
import { API_BASE } from '../../../../../lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isAuthEnabled() || !auth) {
    return NextResponse.json({ error: 'auth_disabled' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ jobs: [] });

  const token = await signInternalToken(userId);
  const url = new URL(request.url);
  const upstream = `${API_BASE}/api/users/me/jobs?${url.searchParams.toString()}`;
  const res = await fetch(upstream, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
