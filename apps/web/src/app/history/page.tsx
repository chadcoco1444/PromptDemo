import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, isAuthEnabled } from '../../auth';

/**
 * History page — lists the signed-in user's past render jobs.
 *
 * v2.0 scope: skeleton. The real data fetch happens against
 * GET /api/users/me/jobs (Feature 4 partial — apps/api route follows). Until
 * that endpoint is wired + the Postgres job store backfill runs, this page
 * shows a placeholder message explaining what's on its way.
 */
export default async function HistoryPage() {
  if (!isAuthEnabled() || !auth) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-6">
          <h1 className="text-lg font-semibold">History is not configured</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set <code className="font-mono">AUTH_ENABLED=true</code> in your environment and
            configure OAuth credentials to enable the History feature.
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
  if (!session?.user) redirect('/api/auth/signin?callbackUrl=/history');

  return (
    <main className="max-w-5xl mx-auto p-8 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your videos</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            All demos you've rendered. Click one to rewatch or regenerate.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 active:scale-[0.98] transition-all"
        >
          + New video
        </Link>
      </header>

      {/* History grid placeholder. Once the API endpoint ships, swap this
          to a client component that fetches /api/users/me/jobs and renders
          a card per row. Skeleton cards give the layout its final shape. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 animate-pulse"
          >
            <div className="aspect-video rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-3 rounded bg-gray-200 dark:bg-gray-800 w-3/4" />
            <div className="h-3 rounded bg-gray-200 dark:bg-gray-800 w-1/2" />
          </div>
        ))}
      </div>
      <div className="text-center text-sm text-gray-500 dark:text-gray-400">
        Job persistence and the listing endpoint (GET /api/users/me/jobs) are coming online —
        past jobs will appear here once the backfill completes.
      </div>
    </main>
  );
}
