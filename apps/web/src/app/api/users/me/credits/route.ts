import { NextResponse } from 'next/server';
import { auth, isAuthEnabled } from '../../../../../auth';
import { signInternalToken } from '../../../../../lib/internalToken';
import { API_BASE } from '../../../../../lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isAuthEnabled() || !auth) {
    return NextResponse.json({ error: 'auth_disabled' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: 'session_missing_id' }, { status: 500 });

  const token = await signInternalToken(userId);
  const res = await fetch(`${API_BASE}/api/users/me/credits`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
