import { redirect } from 'next/navigation';
import { auth, signIn, isAuthEnabled } from '../../../auth';

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  if (!isAuthEnabled()) redirect('/');

  const session = await auth?.();
  if (session?.user) {
    const { callbackUrl } = await searchParams;
    redirect(callbackUrl ?? '/');
  }

  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl ?? '/';

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md p-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-white tracking-tight">Sign in to LumeSpec</h1>
          <p className="text-sm text-gray-400">Create demo videos from any URL</p>
        </div>

        <form
          action={async () => {
            'use server';
            await signIn!('google', { redirectTo });
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white text-gray-900 px-4 py-3 text-sm font-semibold hover:bg-gray-100 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://authjs.dev/img/providers/google.svg"
              alt="Google logo"
              width={20}
              height={20}
            />
            Continue with Google
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">
          By signing in you agree to our{' '}
          <a href="/terms" className="underline hover:text-gray-300 transition-colors">
            Terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="underline hover:text-gray-300 transition-colors">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
