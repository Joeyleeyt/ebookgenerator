'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'ebookly-theme';
export const DEFAULT_THEME: Theme = 'dark';

/**
 * Inline script that applies the persisted theme to `<html>` before first paint,
 * preventing a flash of the wrong palette during hydration. The palettes
 * themselves live in app/globals.css, keyed by the `data-theme` attribute.
 */
export const themeInitScript = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME}';document.documentElement.dataset.theme=t;}catch(e){}`;

/** Read/update the active theme, persisting to localStorage and `<html data-theme>`. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? DEFAULT_THEME;
    setThemeState(stored);
    document.documentElement.dataset.theme = stored;
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode) — the in-memory state still applies */
    }
    document.documentElement.dataset.theme = next;
  }

  return [theme, setTheme];
}
