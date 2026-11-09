import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppMode = 'admin' | 'stage';
export type Theme = 'hell' | 'dunkel';

interface AdminContextValue {
  mode: AppMode;
  isAdmin: boolean;
  isOnline: boolean;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'band-planner:modus';
/** Muss mit dem Startskript in index.html übereinstimmen. */
const THEME_KEY = 'band-planner:darstellung';

const AdminContext = createContext<AdminContextValue | null>(null);

function readStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ohne localStorage gilt die Einstellung nur bis zum nächsten Start.
  }
}

export function AdminProvider({ children }: { children: ReactNode }) {
  // Standard ist der Bühnen-Modus: Auf jedem neuen Gerät lässt sich zunächst nichts versehentlich ändern.
  const [mode, setModeState] = useState<AppMode>(() => readStored<AppMode>(STORAGE_KEY, 'stage', ['admin', 'stage']));
  // Standard ist die helle Darstellung, der Dunkelmodus ist optional.
  const [theme, setThemeState] = useState<Theme>(() => readStored<Theme>(THEME_KEY, 'hell', ['hell', 'dunkel']));
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dunkel');
  }, [theme]);

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    store(STORAGE_KEY, next);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    store(THEME_KEY, next);
  }, []);

  const value = useMemo<AdminContextValue>(
    () => ({
      mode,
      isAdmin: mode === 'admin',
      isOnline,
      setMode,
      toggleMode: () => setMode(mode === 'admin' ? 'stage' : 'admin'),
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dunkel' ? 'hell' : 'dunkel'),
    }),
    [mode, isOnline, setMode, theme, setTheme],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin muss innerhalb von AdminProvider verwendet werden.');
  return context;
}
