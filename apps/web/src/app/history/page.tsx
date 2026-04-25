import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, isAuthEnabled } from '../../auth';
import { HistoryGrid } from '../../components/HistoryGrid';

export default async function HistoryPage() {
  if (!isAuthEnabled() || !auth) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-6">
          <h1 className="text-lg font-semibold text-white">History is not configured</h1>
          <p className="mt-2 text-sm text-gray-400">
            Set <code className="font-mono text-violet-300">AUTH_ENABLED=true</code> in your environment and
            configure OAuth credentials to enable the History feature.
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-sm text-brand-400 hover:text-brand-300 transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    );
  }

  const session = await auth();
  if (!session?.user) redirect('/auth/signin?callbackUrl=/history');

  return (
    <main className="max-w-5xl mx-auto px-6 py-16 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1
            className="font-extrabold tracking-tight text-transparent bg-clip-text"
            style={{
              backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
              fontSize: 'clamp(24px, 3.5vw, 40px)',
              letterSpacing: '-0.02em',
            }}
          >
            Your videos
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            All demos you've rendered. Click one to rewatch or regenerate.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] active:scale-[0.98] transition-all"
          style={{ boxShadow: '0 0 20px rgba(109,40,217,0.4)' }}
        >
          + New video
        </Link>
      </header>

      <HistoryGrid />
    </main>
  );
}
