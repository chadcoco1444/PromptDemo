import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, isAuthEnabled } from '../../auth';
import { getPool } from '../../lib/pg';

export const dynamic = 'force-dynamic';

const TIER_LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' };
const TIER_ALLOWANCE: Record<string, number> = { free: 30, pro: 300, max: 2000 };
const TIER_PRICE_USD: Record<string, string> = { free: '$0', pro: '$19', max: '$99' };

interface Txn {
  id: string;
  jobId: string | null;
  delta: number;
  reason: string;
  balanceAfter: number;
  createdAt: Date;
}

/**
 * Billing + plan overview for the signed-in user. v2.0 scope:
 *   - Current tier + allowance vs. balance
 *   - Last 10 credit-ledger transactions (debit / refund / refresh)
 *   - Upgrade CTAs that show "Coming soon" until Stripe is wired in prod
 *
 * Kept as a server component so balance + history are rendered from a single
 * round-trip. No client-side refetch needed: the UsageIndicator in the nav
 * handles live balance updates.
 */
export default async function BillingPage() {
  if (!isAuthEnabled() || !auth) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-6">
          <h1 className="text-lg font-semibold">Billing is not configured</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set <code className="font-mono">AUTH_ENABLED=true</code> and{' '}
            <code className="font-mono">PRICING_ENABLED=true</code> to enable the billing page.
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    );
  }

  const session = await auth();
  if (!session?.user) redirect('/api/auth/signin?callbackUrl=/billing');

  const userId = Number((session.user as { id?: string }).id);
  if (!Number.isFinite(userId)) {
    throw new Error('session missing user id');
  }

  const pool = getPool();
  type SnapshotRow = { balance: number; tier: string; active_jobs: number };
  type TxnRow = {
    id: string;
    job_id: string | null;
    delta: number;
    reason: string;
    balance_after: number;
    created_at: Date;
  };
  const [snapRes, txnRes] = await Promise.all([
    pool.query<SnapshotRow>(
      `SELECT COALESCE(c.balance, 0)::int AS balance,
              COALESCE(s.tier, 'free') AS tier,
              (SELECT count(*)::int FROM jobs WHERE user_id = $1
                 AND status IN ('queued','crawling','generating','waiting_render_slot','rendering')
              ) AS active_jobs
         FROM users u
         LEFT JOIN credits c ON c.user_id = u.id
         LEFT JOIN subscriptions s ON s.user_id = u.id
         WHERE u.id = $1`,
      [userId],
    ),
    pool.query<TxnRow>(
      `SELECT id, job_id, delta, reason, balance_after, created_at
         FROM credit_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10`,
      [userId],
    ),
  ]);

  const snap = snapRes.rows[0] ?? { balance: 0, tier: 'free', active_jobs: 0 };
  const tier = (snap.tier ?? 'free') as 'free' | 'pro' | 'max';
  const allowance = TIER_ALLOWANCE[tier] ?? 30;
  const pctUsed = allowance > 0 ? Math.min(1, Math.max(0, 1 - snap.balance / allowance)) : 0;

  const txns: Txn[] = txnRes.rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    delta: r.delta,
    reason: r.reason,
    balanceAfter: r.balance_after,
    createdAt: r.created_at,
  }));

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Manage your plan and see how your render-seconds are being spent.
        </p>
      </header>

      <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Current plan
            </div>
            <div className="mt-1 text-lg font-semibold flex items-center gap-2">
              {TIER_LABEL[tier]}
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                {TIER_PRICE_USD[tier]}/mo
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Balance
            </div>
            <div className="mt-1 text-lg font-semibold">
              {snap.balance}s
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">
                / {allowance}s
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
          <div
            className={`h-full ${
              pctUsed > 0.9
                ? 'bg-red-500'
                : pctUsed > 0.7
                ? 'bg-amber-500'
                : 'bg-brand-500'
            }`}
            style={{ width: `${Math.round(pctUsed * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {snap.active_jobs} active {snap.active_jobs === 1 ? 'render' : 'renders'} · resets
          monthly on your billing anniversary
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-base font-semibold">Upgrade</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          More render-seconds, higher concurrency, and the 60-second duration option.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <UpgradeCard
            tierKey="pro"
            label="Pro"
            price="$19/mo"
            bullets={['300s/mo render', '3 concurrent jobs', 'Up to 60s duration']}
            current={tier === 'pro'}
          />
          <UpgradeCard
            tierKey="max"
            label="Max"
            price="$99/mo"
            bullets={['2000s/mo render', '10 concurrent jobs', 'Priority queue']}
            current={tier === 'max'}
          />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-base font-semibold">Recent activity</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Last 10 credit movements. Negative = debit when you start a render.
        </p>
        {txns.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            No activity yet. Start a render from the{' '}
            <Link href="/" className="text-brand-600 dark:text-brand-400 hover:underline">
              home page
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-800">
            {txns.map((t) => (
              <li key={t.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <div className="font-medium capitalize">{t.reason}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {t.jobId ? `Job ${t.jobId}` : '—'} ·{' '}
                    {new Date(t.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`font-mono ${
                      t.delta < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {t.delta > 0 ? '+' : ''}
                    {t.delta}s
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    balance {t.balanceAfter}s
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function UpgradeCard(props: {
  tierKey: 'pro' | 'max';
  label: string;
  price: string;
  bullets: string[];
  current: boolean;
}) {
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{props.label}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{props.price}</div>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">
        {props.bullets.map((b) => (
          <li key={b}>• {b}</li>
        ))}
      </ul>
      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm font-medium py-1.5 cursor-not-allowed"
        title="Stripe checkout lands before production — tracked in the roadmap."
      >
        {props.current ? 'Current plan' : 'Upgrade — coming soon'}
      </button>
    </div>
  );
}
