/* Theme — light / dark switch.

   We don't derive colors at runtime (unlike accent.ts) because the dark
   palette is hand-tuned in src/index.css under [data-theme="dark"].
   This module just toggles the data-theme attribute on <html> and
   persists the preference. The whole UI repaints from CSS without a
   single React re-render — same pattern as the accent picker. */

export type ThemeMode = 'light' | 'dark';

const KEY = 'marathon.theme.v1';
const DEFAULT: ThemeMode = 'light';

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  if (mode === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'dark' ? 'dark' : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setStoredTheme(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, mode); } catch { /* ignore */ }
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getStoredTheme() === 'dark' ? 'light' : 'dark';
  setStoredTheme(next);
  applyTheme(next);
  return next;
}

export const DEFAULT_THEME: ThemeMode = DEFAULT;
