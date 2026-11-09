import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppMode = 'admin' | 'stage';

interface AdminContextValue {
  mode: AppMode;
  isAdmin: boolean;
  isOnline: boolean;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY = 'band-planner:modus';

const AdminContext = createContext<AdminContextValue | null>(null);

function readStoredMode(): AppMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'admin' ? 'admin' : 'stage';
  } catch {
    return 'stage';
  }
}

export function AdminProvider({ children }: { children: ReactNode }) {
  // Standard ist der Bühnen-Modus: Auf jedem neuen Gerät lässt sich zunächst nichts versehentlich ändern.
  const [mode, setModeState] = useState<AppMode>(readStoredMode);
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

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ohne localStorage gilt der Modus nur bis zum nächsten Start.
    }
  }, []);

  const value = useMemo<AdminContextValue>(
    () => ({
      mode,
      isAdmin: mode === 'admin',
      isOnline,
      setMode,
      toggleMode: () => setMode(mode === 'admin' ? 'stage' : 'admin'),
    }),
    [mode, isOnline, setMode],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin muss innerhalb von AdminProvider verwendet werden.');
  return context;
}
