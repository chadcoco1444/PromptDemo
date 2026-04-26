import { NextResponse } from 'next/server';
import { auth, isAuthEnabled } from '../../../../../../auth';
import { getPool } from '../../../../../../lib/pg';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/users/me/api-keys/:id
 * Soft-revokes an API key by setting revoked_at = now().
 * Only the key's owner can revoke it.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthEnabled() || !auth) {
    return NextResponse.json({ error: 'auth_disabled' }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  const userId = Number((session.user as { id?: string }).id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'session_missing_id' }, { status: 500 });

  const { id } = await params;

  const pool = getPool();
  const result = await pool.query(
    `UPDATE api_keys
        SET revoked_at = now()
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [id, userId],
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
