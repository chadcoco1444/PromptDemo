import './globals.css';
import { Inter } from 'next/font/google';
import { AuthButton } from '../components/AuthButton';
import { UsageIndicator } from '../components/UsageIndicator';
import { Providers } from '../components/Providers';

// v2.1 Phase 4: high-contrast, geometric Inter as the system font. Loaded
// via next/font so Next.js inlines a <style> with font-display:swap and
// self-hosts the woff2 — no network round-trip to fonts.gstatic.com on first
// paint, eliminating the FOUT during typography swap-in.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'LumeSpec',
  description: 'Turn any URL into a demo video',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
              <UsageIndicator />
              <AuthButton />
            </div>
          </div>
        </nav>
        <main><Providers>{children}</Providers></main>
      </body>
    </html>
  );
}
