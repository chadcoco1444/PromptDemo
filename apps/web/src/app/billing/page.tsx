import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, isAuthEnabled } from '../../auth';
import { getPool } from '../../lib/pg';
import { ApiKeyManager } from '../../components/ApiKeyManager';

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

export default async function BillingPage() {
  if (!isAuthEnabled() || !auth) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-6">
          <h1 className="text-lg font-semibold text-white">Billing is not configured</h1>
          <p className="mt-2 text-sm text-gray-400">
            Set <code className="font-mono text-violet-300">AUTH_ENABLED=true</code> and{' '}
            <code className="font-mono text-violet-300">PRICING_ENABLED=true</code> to enable the billing page.
          </p>
          <Link href="/" className="inline-block mt-4 text-sm text-brand-400 hover:text-brand-300 transition-colors">
            ← Back to home
          </Link>
        </div>
      </main>
    );
  }

  const session = await auth();
  if (!session?.user) redirect('/auth/signin?callbackUrl=/billing');

  const userId = Number((session.user as { id?: string }).id);
  if (!Number.isFinite(userId)) throw new Error('session missing user id');

  const pool = getPool();
  type SnapshotRow = { balance: number; tier: string; active_jobs: number };
  type TxnRow = { id: string; job_id: string | null; delta: number; reason: string; balance_after: number; created_at: Date };
  type ApiKeyRow = { id: string; name: string; key_prefix: string; last_used_at: Date | null; created_at: Date };

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

  // Load API keys only for Max-tier users (cheap guarded query)
  let apiKeys: Array<{ id: string; name: string; keyPrefix: string; lastUsedAt: string | null; createdAt: string }> = [];
  if (tier === 'max') {
    const apiKeyRes = await pool.query<ApiKeyRow>(
      `SELECT id, name, key_prefix, last_used_at, created_at
         FROM api_keys
        WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC`,
      [userId],
    );
    apiKeys = apiKeyRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.key_prefix,
      lastUsedAt: r.last_used_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    }));
  }
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

  const barColor = pctUsed > 0.9 ? 'bg-red-500' : pctUsed > 0.7 ? 'bg-amber-500' : 'bg-brand-500';

  return (
    <main className="max-w-3xl mx-auto px-6 py-16 space-y-6">
      <header>
        <h1
          className="font-extrabold tracking-tight text-transparent bg-clip-text"
          style={{
            backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
            fontSize: 'clamp(24px, 3.5vw, 40px)',
            letterSpacing: '-0.02em',
          }}
        >
          Billing
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage your plan and see how your render-seconds are being spent.
        </p>
      </header>

      {/* Current plan card */}
      <section className="rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-6" style={{ boxShadow: '0 0 40px rgba(109,40,217,0.06)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-500">Current plan</div>
            <div className="mt-1.5 text-xl font-bold text-white flex items-center gap-2">
              {TIER_LABEL[tier]}
              <span className="text-sm font-normal text-gray-500">{TIER_PRICE_USD[tier]}/mo</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-gray-500">Balance</div>
            <div className="mt-1.5 text-xl font-bold text-white">
              {snap.balance}s
              <span className="text-sm font-normal text-gray-500 ml-1">/ {allowance}s</span>
            </div>
          </div>
        </div>

        <div className="mt-5 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.round(pctUsed * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {snap.active_jobs} active {snap.active_jobs === 1 ? 'render' : 'renders'} · resets monthly
        </p>
      </section>

      {/* Upgrade */}
      <section className="rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-6">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Upgrade</h2>
        <p className="text-sm text-gray-400 mt-1">
          More render-seconds, higher concurrency, and 60-second duration.
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

      {/* API Access — Max tier only */}
      {tier === 'max' && (
        <section className="rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-6">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">API Access</h2>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            Use API keys to generate videos programmatically. Send{' '}
            <code className="font-mono text-violet-300 text-xs">Authorization: Bearer lume_…</code>{' '}
            to <code className="font-mono text-violet-300 text-xs">POST /api/jobs</code>.
          </p>
          <ApiKeyManager initialKeys={apiKeys} />
        </section>
      )}

      {/* Recent activity */}
      <section className="rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-6">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Recent activity</h2>
        <p className="text-sm text-gray-400 mt-1">
          Last 10 credit movements. Negative = debit when you start a render.
        </p>
        {txns.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500">
            No activity yet. Start a render from the{' '}
            <Link href="/" className="text-brand-400 hover:text-brand-300 transition-colors">
              home page
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {txns.map((t) => (
              <li key={t.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-gray-200 capitalize">{t.reason}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {t.jobId ? `Job ${t.jobId}` : '—'} · {new Date(t.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono font-semibold ${t.delta < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {t.delta > 0 ? '+' : ''}{t.delta}s
                  </div>
                  <div className="text-xs text-gray-500">bal {t.balanceAfter}s</div>
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
    <div className="rounded-xl ring-1 ring-white/10 bg-white/[0.03] p-4 hover:ring-violet-500/30 hover:bg-white/[0.06] transition-all duration-200">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-white">{props.label}</div>
        <div className="text-sm text-gray-400">{props.price}</div>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-gray-400">
        {props.bullets.map((b) => (
          <li key={b} className="flex items-center gap-1.5">
            <span className="text-brand-500">•</span> {b}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-lg ring-1 ring-white/10 bg-white/5 text-gray-500 text-sm font-medium py-2 cursor-not-allowed"
        title="Stripe checkout lands before production — tracked in the roadmap."
      >
        {props.current ? 'Current plan' : 'Upgrade — coming soon'}
      </button>
    </div>
  );
}
