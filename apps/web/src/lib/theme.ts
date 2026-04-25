/**
 * Theme preference is one of three values:
 *   - 'system': follow the OS-level `prefers-color-scheme` media query
 *   - 'light':  force light mode regardless of OS
 *   - 'dark':   force dark mode regardless of OS
 *
 * Internally the DOM only has two states (the `.dark` class is on <html>
 * or not). `resolveTheme(pref)` picks `light|dark` from a `Theme` preference
 * plus the current OS setting.
 */
export type Theme = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'lumespec:theme';

/**
 * Inline script string that runs BEFORE React hydration. Injected into <head>
 * from the root layout so the .dark class is set on <html> before first paint
 * — prevents the "flash of wrong theme" that a useEffect-based apply would
 * cause. Kept as a hardcoded string (not importable from TS) because it has
 * to execute synchronously in the browser before any module loads. Keep it
 * tiny and defensive: no try/catch failures should break the page.
 */
export const THEME_PRELUDE_SCRIPT = `
(function(){
  try {
    var k = ${JSON.stringify(THEME_STORAGE_KEY)};
    var pref = localStorage.getItem(k) || 'system';
    var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = pref === 'dark' || (pref === 'system' && systemDark);
    if (dark) document.documentElement.classList.add('dark');
  } catch (_) {}
})();
`.trim();

export function readStoredTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'system';
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

export function writeStoredTheme(theme: Theme): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private mode / disabled storage — ignore
  }
}

export function resolveTheme(pref: Theme, systemDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

/**
 * Cycle the 3-state preference: system → light → dark → system.
 */
export function cycleTheme(current: Theme): Theme {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}
