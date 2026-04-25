import './globals.css';
import { Inter } from 'next/font/google';
import { ThemeToggle } from '../components/ThemeToggle';
import { AuthButton } from '../components/AuthButton';
import { UsageIndicator } from '../components/UsageIndicator';
import { THEME_PRELUDE_SCRIPT } from '../lib/theme';

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
  title: 'PromptDemo',
  description: 'Turn any URL into a demo video',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        {/* Runs before React hydration so .dark is on <html> before first paint,
            eliminating the flash-of-wrong-theme for dark-mode users. */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_PRELUDE_SCRIPT }}
        />
      </head>
      <body className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans antialiased transition-colors">
        {/* v2.1 Phase 4: glassmorphism nav — semi-transparent background with
            backdrop-blur. Sticky so it floats above content during scroll. */}
        <nav className="sticky top-0 z-50 border-b border-gray-200/60 dark:border-gray-800/60 bg-white/70 dark:bg-gray-900/70 backdrop-blur-md">
          <div className="max-w-5xl mx-auto p-4 flex items-center gap-4">
            <a href="/" className="font-semibold text-lg tracking-tight">
              PromptDemo
            </a>
            <div className="ml-auto flex items-center gap-3">
              <UsageIndicator />
              <AuthButton />
              <ThemeToggle />
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
