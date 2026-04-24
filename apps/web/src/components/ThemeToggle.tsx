'use client';

import { useEffect, useState } from 'react';
import {
  readStoredTheme,
  writeStoredTheme,
  resolveTheme,
  applyResolvedTheme,
  cycleTheme,
  type Theme,
} from '../lib/theme';

/**
 * 3-state theme toggle (system / light / dark).
 *
 * The initial render shows 'system' to keep server + client markup identical
 * (avoids a hydration mismatch). A useEffect then loads the real preference
 * from localStorage and applies it — the prelude script in layout.tsx has
 * already set the .dark class on <html> before first paint, so the user
 * never sees a theme flash.
 *
 * Button text rotates through the three states so the user always sees
 * their CURRENT preference. Click cycles to the next.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  // Load real preference + attach system-change listener.
  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (readStoredTheme() === 'system') {
        applyResolvedTheme(resolveTheme('system', mq.matches));
      }
    };
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, []);

  function handleClick() {
    const next = cycleTheme(theme);
    setTheme(next);
    writeStoredTheme(next);
    const systemDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyResolvedTheme(resolveTheme(next, systemDark));
  }

  const icon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻';
  const label = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Theme: ${label}. Click to switch.`}
      title={`Theme: ${label} (click to switch)`}
      className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900"
      suppressHydrationWarning
    >
      <span aria-hidden="true">{icon}</span>
      <span className="ml-1 hidden sm:inline">{label}</span>
    </button>
  );
}
