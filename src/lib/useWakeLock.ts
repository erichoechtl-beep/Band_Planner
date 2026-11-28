import { useEffect } from 'react';

/** Hält das Display an, solange Probe- oder Live-Ansicht offen ist (falls das Gerät es unterstützt). */
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (active) lock = sentinel;
        else void sentinel.release();
      } catch {
        // z. B. im Energiesparmodus – die Ansicht funktioniert auch ohne.
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, []);
}
