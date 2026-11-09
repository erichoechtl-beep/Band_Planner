import { CloudDownload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeedback } from '../context/FeedbackContext';
import { applyBandData, autoSyncFromServer, type BandDataFile } from '../db/schema';
import { formatDateTime } from '../lib/time';
import { Button } from './ui';

/** Höchstens so oft wird beim Zurückkehren in die App erneut nachgefragt. */
const MIN_GAP_MS = 20_000;
/** Solange die App sichtbar ist, wird zusätzlich regelmäßig nachgefragt. */
const INTERVAL_MS = 3 * 60_000;

/**
 * Holt neue Band-Stände automatisch vom Server: beim Öffnen, beim Zurückkehren in die App,
 * wenn die Verbindung zurückkommt und alle paar Minuten. Dank ETag kostet eine Nachfrage
 * ohne Änderung kaum Daten. Lokale, nicht exportierte Änderungen werden nie still überschrieben.
 */
export interface AutoSyncState {
  pending: BandDataFile | null;
  accept: () => Promise<void>;
  dismiss: () => void;
}

export function useAutoSync(): AutoSyncState {
  const { toast, confirm } = useFeedback();
  const [pending, setPending] = useState<BandDataFile | null>(null);
  const running = useRef(false);
  const lastRun = useRef(0);
  const dismissed = useRef<string | null>(null);

  const check = useCallback(
    async (force = false) => {
      if (running.current || !navigator.onLine || document.visibilityState === 'hidden') return;
      if (!force && Date.now() - lastRun.current < MIN_GAP_MS) return;
      running.current = true;
      lastRun.current = Date.now();
      try {
        const result = await autoSyncFromServer();
        if (result.kind === 'updated') {
          setPending(null);
          toast(`Neuer Band-Stand vom ${formatDateTime(result.file.lastUpdated)} geladen.`);
        } else if (result.kind === 'conflict') {
          if (dismissed.current !== result.file.lastUpdated) setPending(result.file);
        } else {
          setPending(null);
        }
      } catch {
        // Kein Netz, keine Datei oder Server-Fehler: Die lokalen Daten bleiben einfach gültig.
      } finally {
        running.current = false;
      }
    },
    [toast],
  );

  useEffect(() => {
    void check(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onOnline = () => void check(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onVisible);
    const timer = window.setInterval(() => void check(true), INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(timer);
    };
  }, [check]);

  const accept = useCallback(async () => {
    if (!pending) return;
    const ok = await confirm({
      title: 'Neuen Band-Stand übernehmen?',
      message:
        'Deine Änderungen an Songs, Setlists und Ideen auf diesem Gerät wurden noch nicht exportiert und gehen dabei verloren. Persönliche Notizen bleiben erhalten.',
      confirmLabel: 'Übernehmen',
      danger: true,
    });
    if (!ok) return;
    try {
      await applyBandData(pending, 'Automatisch vom Server');
      toast(`Neuer Band-Stand vom ${formatDateTime(pending.lastUpdated)} geladen.`);
      setPending(null);
    } catch {
      toast('Der Band-Stand konnte nicht übernommen werden. Deine bisherigen Daten sind unverändert.', 'error');
    }
  }, [pending, confirm, toast]);

  const dismiss = useCallback(() => {
    if (pending) dismissed.current = pending.lastUpdated;
    setPending(null);
  }, [pending]);

  return { pending, accept, dismiss };
}

/** Hinweis, wenn ein neuer Server-Stand lokale Änderungen überschreiben würde. */
export function AutoSyncBanner({ pending, accept, dismiss }: AutoSyncState) {
  if (!pending) return null;
  return (
    <div role="status" className="border-b border-brand/30 bg-brand/[0.08]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <p className="flex min-w-0 items-start gap-2.5 text-[15px] sm:flex-1">
          <CloudDownload className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <span>
            <strong className="font-semibold">Neuer Band-Stand vom {formatDateTime(pending.lastUpdated)} verfügbar.</strong>{' '}
            <span className="text-stage-muted">Dieses Gerät hat eigene, nicht exportierte Änderungen.</span>
          </span>
        </p>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          <Button variant="ghost" onClick={dismiss}>
            Später
          </Button>
          <Button variant="primary" icon={CloudDownload} onClick={accept}>
            Übernehmen
          </Button>
        </div>
      </div>
    </div>
  );
}
