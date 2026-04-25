import { CreatePageBody, type ForkInfo } from '../../components/CreatePageBody';
import { decodePrefill } from '../../lib/prefill';
import { auth, isAuthEnabled } from '../../auth';
import { getPool } from '../../lib/pg';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { prefill?: string; url?: string; forkId?: string };
}

export default async function CreatePage({ searchParams }: PageProps) {
  const prefill = searchParams.prefill ? decodePrefill(searchParams.prefill) : null;

  // Fork prefill: load parent job server-side (auth-gated ownership check).
  let fork: ForkInfo | undefined;
  const forkId = searchParams.forkId;
  if (forkId && forkId.length <= 64 && /^[A-Za-z0-9_-]+$/.test(forkId) && isAuthEnabled() && auth) {
    try {
      const session = await auth();
      const userId = (session?.user as { id?: string } | null)?.id;
      if (userId) {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT id, input FROM jobs WHERE id = $1 AND user_id = $2 LIMIT 1`,
          [forkId, Number(userId)],
        );
        if (rows.length > 0) {
          const row = rows[0] as {
            id: string;
            input: { url: string; intent: string; duration: 10 | 30 | 60; hint?: string };
          };
          fork = {
            parentJobId: row.id,
            url: row.input.url,
            intent: row.input.intent,
            duration: row.input.duration,
            hint: row.input.hint,
          };
        }
      }
    } catch {
      // Non-fatal: if fork lookup fails, render a clean form
    }
  }

  return (
    <CreatePageBody
      {...(fork ? { fork } : {})}
      {...(!fork && prefill ? { prefill } : {})}
      {...(!fork && !prefill && searchParams.url ? { initialUrl: searchParams.url } : {})}
    />
  );
}
