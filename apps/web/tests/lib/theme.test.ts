import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  readStoredTheme,
  writeStoredTheme,
  resolveTheme,
  applyResolvedTheme,
  cycleTheme,
} from '../../src/lib/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('readStoredTheme', () => {
  it('returns "system" when nothing stored', () => {
    expect(readStoredTheme()).toBe('system');
  });

  it('returns "dark" when "dark" stored', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('returns "system" when a garbage value is stored', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon-pink');
    expect(readStoredTheme()).toBe('system');
  });
});

describe('writeStoredTheme', () => {
  it('persists the chosen theme', () => {
    writeStoredTheme('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('does not throw when storage is unavailable', () => {
    const orig = localStorage.setItem;
    localStorage.setItem = vi.fn(() => { throw new Error('full'); });
    expect(() => writeStoredTheme('light')).not.toThrow();
    localStorage.setItem = orig;
  });
});

describe('resolveTheme', () => {
  it('returns light/dark verbatim for explicit preferences', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('follows the system hint when preference is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('applyResolvedTheme', () => {
  it('adds .dark to <html> when resolved=dark', () => {
    applyResolvedTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes .dark from <html> when resolved=light', () => {
    document.documentElement.classList.add('dark');
    applyResolvedTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('cycleTheme', () => {
  it('cycles system → light → dark → system', () => {
    expect(cycleTheme('system')).toBe('light');
    expect(cycleTheme('light')).toBe('dark');
    expect(cycleTheme('dark')).toBe('system');
  });
});
