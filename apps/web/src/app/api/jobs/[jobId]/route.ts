import { auth, isAuthEnabled } from '../../../../auth';
import { getPool } from '../../../../lib/pg';

export const dynamic = 'force-dynamic';

const IN_FLIGHT = new Set(['queued', 'crawling', 'generating', 'waiting_render_slot', 'rendering']);

export async function DELETE(_req: Request, ctx: { params: { jobId: string } }) {
  if (!isAuthEnabled() || !auth) return new Response(null, { status: 404 });

  const session = await auth();
  if (!session?.user) return new Response(null, { status: 401 });
  const userId = (session.user as { id?: string }).id;
  if (!userId) return new Response(null, { status: 404 });

  const { jobId } = ctx.params;
  if (!jobId || jobId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return new Response(null, { status: 404 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT status, (input->>'duration')::int AS duration
       FROM jobs WHERE id = $1 AND user_id = $2`,
      [jobId, Number(userId)],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return new Response(null, { status: 404 });
    }

    const { status, duration } = rows[0] as { status: string; duration: number };

    if (IN_FLIGHT.has(status)) {
      const refund = await client.query(
        `UPDATE credits SET balance = balance + $1 WHERE user_id = $2 RETURNING balance`,
        [duration, Number(userId)],
      );
      const balanceAfter = (refund.rows[0] as { balance: number })?.balance ?? 0;
      await client.query(
        `INSERT INTO credit_transactions (user_id, job_id, delta, reason, balance_after)
         VALUES ($1, $2, $3, 'refund', $4)`,
        [Number(userId), jobId, duration, balanceAfter],
      );
    }

    await client.query(
      `UPDATE jobs SET parent_job_id = NULL WHERE parent_job_id = $1`,
      [jobId],
    );
    await client.query(
      `DELETE FROM jobs WHERE id = $1 AND user_id = $2`,
      [jobId, Number(userId)],
    );
    await client.query('COMMIT');
    return new Response(null, { status: 204 });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[api/jobs/delete]', (err as Error).message);
    return new Response(JSON.stringify({ error: 'delete_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    client.release();
  }
}
