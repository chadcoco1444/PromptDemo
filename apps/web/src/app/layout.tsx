import './globals.css';
import { Inter } from 'next/font/google';
import { AuthButton } from '../components/AuthButton';
import { UsageIndicator } from '../components/UsageIndicator';
import { Providers } from '../components/Providers';
import { auth, isAuthEnabled } from '../auth';
import { signInternalToken } from '../lib/internalToken';
import { API_BASE } from '../lib/config';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'LumeSpec',
  description: 'Turn any URL into a demo video',
};

interface CreditsSnapshot {
  balance: number;
  tier: 'free' | 'pro' | 'max';
  allowance: number;
  activeJobs: number;
  concurrencyLimit: number;
}

async function fetchInitialCredits(userId: string): Promise<CreditsSnapshot | null> {
  try {
    const token = await signInternalToken(userId);
    const res = await fetch(`${API_BASE}/api/users/me/credits`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as CreditsSnapshot;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialCredits: CreditsSnapshot | null = null;
  if (isAuthEnabled() && auth) {
    try {
      const session = await auth();
      const userId = (session?.user as { id?: string } | undefined)?.id;
      if (userId) {
        initialCredits = await fetchInitialCredits(userId);
      }
    } catch {
      // Non-fatal: UsageIndicator fetches on mount as fallback
    }
  }

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head />
      <body className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans antialiased">
        <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
          <div className="max-w-5xl mx-auto p-4 flex items-center gap-4">
            <a href="/" className="font-semibold text-lg tracking-tight">
              LumeSpec
            </a>
            <div className="ml-auto flex items-center gap-3">
              <UsageIndicator initialCredits={initialCredits} />
              <AuthButton />
            </div>
          </div>
        </nav>
        <main><Providers>{children}</Providers></main>
      </body>
    </html>
  );
}
