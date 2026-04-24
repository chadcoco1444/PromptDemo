import Link from 'next/link';
import { auth, isAuthEnabled } from '../auth';

/**
 * Server component that renders sign-in / sign-out / user affordance in the
 * nav. Silently renders nothing when AUTH_ENABLED=false so the app stays
 * visually identical to pre-v2 for users who haven't opted in.
 */
export async function AuthButton() {
  if (!isAuthEnabled() || !auth) return null;

  const session = await auth();

  if (!session?.user) {
    return (
      <Link
        href="/api/auth/signin"
        className="text-sm rounded-md border border-brand-500 bg-brand-500 text-white px-3 py-1 font-medium hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/history"
        className="text-sm text-gray-700 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 rounded transition-colors"
      >
        History
      </Link>
      {session.user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={session.user.image}
          alt={session.user.name ?? 'user'}
          className="h-7 w-7 rounded-full border border-gray-300 dark:border-gray-700"
        />
      ) : (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {session.user.name ?? session.user.email}
        </span>
      )}
      <Link
        href="/api/auth/signout"
        className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 rounded transition-colors"
      >
        Sign out
      </Link>
    </div>
  );
}
