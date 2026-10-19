import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';

export type BossTheme = 'light' | 'dark';
const STORAGE_KEY = 'boss-ui-theme-v1';

function routeDefault(): BossTheme {
  // The office application was light by default; the ambassador portal was dark.
  return typeof window !== 'undefined' && window.location.pathname.replace(/\/$/, '') === '/ambassadors' ? 'dark' : 'light';
}
function storedTheme(): BossTheme {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : routeDefault();
  } catch { return routeDefault(); }
}
function applyTheme(theme: BossTheme) {
  document.documentElement.dataset.bossTheme = theme;
  document.documentElement.style.colorScheme = theme;
  const chrome = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (chrome) chrome.content = theme === 'dark' ? '#0b1220' : '#f8fafc';
}

type ThemeValue = { theme: BossTheme; setTheme: (theme: BossTheme) => void; toggleTheme: () => void };
const Context = createContext<ThemeValue | null>(null);

export function BossThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, updateTheme] = useState<BossTheme>(storedTheme);
  const setTheme = useCallback((next: BossTheme) => {
    updateTheme(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Private browsing may block storage. */ }
  }, []);
  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [setTheme, theme]);
  useLayoutEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) updateTheme(storedTheme());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBossTheme(): ThemeValue {
  const value = useContext(Context);
  if (!value) throw new Error('BossThemeProvider is required for the appearance control.');
  return value;
}
