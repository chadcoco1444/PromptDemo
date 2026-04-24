import './globals.css';
import { ThemeToggle } from '../components/ThemeToggle';
import { AuthButton } from '../components/AuthButton';
import { UsageIndicator } from '../components/UsageIndicator';
import { THEME_PRELUDE_SCRIPT } from '../lib/theme';

export const metadata = {
  title: 'PromptDemo',
  description: 'Turn any URL into a demo video',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before React hydration so .dark is on <html> before first paint,
            eliminating the flash-of-wrong-theme for dark-mode users. */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_PRELUDE_SCRIPT }}
        />
      </head>
      <body className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
        <nav className="border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-5xl mx-auto p-4 flex items-center gap-4">
            <a href="/" className="font-semibold text-lg">
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
