import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, CloudDownload, Download, FileUp, Loader2, Share2, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import {
  applyBandData,
  assessImport,
  BAND_DATA_FILE_NAME,
  buildBandDataFile,
  db,
  describeError,
  fetchBandDataFromServer,
  getBandStatus,
  markExported,
  parseBandDataText,
  type BandDataFile,
} from '../db/schema';
import { downloadBlob, formatBytes } from '../lib/files';
import { formatDateTime } from '../lib/time';
import { Button, SectionTitle } from './ui';

type Busy = 'export' | 'share' | 'server' | 'file' | null;

interface Result {
  tone: 'success' | 'error' | 'info';
  message: string;
}

// Über 25 MB wird die Datei auf GitHub und in Messengern unhandlich (GitHub warnt ab 50 MB).
const LARGE_FILE_BYTES = 25 * 1024 * 1024;

function summarize(file: BandDataFile): string {
  return `${file.songs.length} Songs, ${file.setlists.length} Setlists, ${file.bandNames.length} Bandnamen, ${file.moodboard.length} Bilder`;
}

function SyncCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <article className="card flex flex-col gap-3 p-4">
      <h3 className="flex items-start gap-2 text-lg font-bold">
        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-signal" aria-hidden />
        {title}
      </h3>
      {children}
    </article>
  );
}

export function DataSync() {
  const { isAdmin, isOnline } = useAdmin();
  const { confirm } = useFeedback();
  const status = useLiveQuery(getBandStatus, []);
  const counts = useLiveQuery(async () => ({
    songs: await db.songs.count(),
    setlists: await db.setlists.count(),
    notes: await db.personalNotes.count(),
  }), []);
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  /** Fragt nur nach, wenn wirklich etwas verloren ginge oder der neue Stand älter ist. */
  const confirmImport = async (file: BandDataFile, sourceLabel: string): Promise<boolean> => {
    const assessment = await assessImport(file);
    const warnings: string[] = [];
    if (assessment.hasLocalChanges) {
      warnings.push('Auf diesem Gerät gibt es Änderungen an den Band-Daten, die noch nicht exportiert wurden. Sie gehen dabei verloren.');
    }
    if (assessment.isOlder) {
      warnings.push(`${sourceLabel} ist älter (${formatDateTime(file.lastUpdated)}) als dein aktueller Stand (${formatDateTime(status?.bandDataUpdatedAt)}).`);
    }
    if (warnings.length === 0) return true;
    return confirm({
      title: 'Band-Daten wirklich ersetzen?',
      message: `${warnings.join('\n\n')}\n\nDeine persönlichen Notizen bleiben in jedem Fall erhalten.`,
      confirmLabel: 'Band-Daten ersetzen',
      danger: true,
    });
  };

  const exportData = async (mode: 'download' | 'share') => {
    setBusy(mode === 'download' ? 'export' : 'share');
    setResult(null);
    try {
      const file = await buildBandDataFile();
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const sizeHint = blob.size > LARGE_FILE_BYTES ? ' Die Datei ist recht groß – WhatsApp oder GitHub können sie eventuell ablehnen.' : '';

      if (mode === 'share') {
        const shareFile = new File([blob], BAND_DATA_FILE_NAME, { type: 'application/json' });
        if (!navigator.canShare({ files: [shareFile] })) {
          setResult({ tone: 'error', message: 'Dieses Gerät kann die Datei nicht direkt teilen. Bitte nutze „Band-Daten exportieren“.' });
          return;
        }
        try {
          await navigator.share({ files: [shareFile], title: 'Band-Daten' });
        } catch (error) {
          if ((error as Error).name === 'AbortError') return; // Teilen abgebrochen: Es gilt nichts als exportiert.
          throw error;
        }
      } else {
        downloadBlob(blob, BAND_DATA_FILE_NAME);
      }
      await markExported(file);
      setResult({ tone: 'success', message: `${BAND_DATA_FILE_NAME} erstellt (${formatBytes(blob.size)}): ${summarize(file)}.${sizeHint}` });
    } catch (error) {
      setResult({ tone: 'error', message: describeError(error) });
    } finally {
      setBusy(null);
    }
  };

  const syncFromServer = async () => {
    setBusy('server');
    setResult(null);
    try {
      const file = await fetchBandDataFromServer();
      const assessment = await assessImport(file);
      if (assessment.isSameVersion && !assessment.hasLocalChanges) {
        setResult({ tone: 'info', message: `Du bist bereits auf dem neuesten Stand (${formatDateTime(file.lastUpdated)}).` });
        return;
      }
      if (!(await confirmImport(file, 'Der Stand auf dem Server'))) {
        setResult({ tone: 'info', message: 'Abgebrochen – es wurde nichts geändert.' });
        return;
      }
      await applyBandData(file, 'GitHub-Sync');
      setResult({ tone: 'success', message: `Band-Stand vom ${formatDateTime(file.lastUpdated)} geladen: ${summarize(file)}. Deine Notizen sind unverändert.` });
    } catch (error) {
      setResult({ tone: 'error', message: describeError(error) });
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (selected: File | undefined) => {
    if (!selected) return;
    setBusy('file');
    setResult(null);
    try {
      const file = parseBandDataText(await selected.text());
      if (!(await confirmImport(file, 'Die gewählte Datei'))) {
        setResult({ tone: 'info', message: 'Abgebrochen – es wurde nichts geändert.' });
        return;
      }
      await applyBandData(file, `Datei: ${selected.name}`);
      setResult({ tone: 'success', message: `„${selected.name}“ importiert: ${summarize(file)}. Deine Notizen sind unverändert.` });
    } catch (error) {
      setResult({ tone: 'error', message: describeError(error) });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const ResultIcon = result?.tone === 'success' ? CheckCircle2 : result?.tone === 'error' ? XCircle : AlertTriangle;
  const resultColor = result?.tone === 'success' ? 'border-neon text-neon' : result?.tone === 'error' ? 'border-danger text-danger' : 'border-signal text-signal';

  return (
    <section>
      <SectionTitle>Daten-Sync</SectionTitle>

      <div className="card mb-4 grid gap-x-6 gap-y-1 p-4 text-sm sm:grid-cols-2">
        <p>
          <span className="text-stage-muted">Band-Stand auf diesem Gerät: </span>
          <strong>{formatDateTime(status?.bandDataUpdatedAt)}</strong>
        </p>
        <p>
          <span className="text-stage-muted">Quelle: </span>
          <strong>{status?.lastSyncSource ?? 'Lokal bearbeitet'}</strong>
        </p>
        <p>
          <span className="text-stage-muted">Inhalt: </span>
          <strong>
            {counts?.songs ?? 0} Songs, {counts?.setlists ?? 0} Setlists
          </strong>
        </p>
        <p>
          <span className="text-stage-muted">Persönliche Notizen: </span>
          <strong>{counts?.notes ?? 0}</strong>
        </p>
        {status?.hasLocalChanges && (
          <p className="mt-2 flex items-start gap-2 font-semibold text-warn sm:col-span-2">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            Dieses Gerät hat Änderungen, die noch nicht exportiert wurden.
          </p>
        )}
      </div>

      <p className="mb-4 flex items-start gap-2 rounded-lg border border-neon/40 bg-neon/10 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-neon" aria-hidden />
        Sync und Import ersetzen nur die Band-Daten. Deine persönlichen Notizen bleiben immer unangetastet.
      </p>

      {result && (
        <p role={result.tone === 'error' ? 'alert' : 'status'} className={`mb-4 flex items-start gap-2 rounded-lg border bg-stage-surface p-3 font-medium ${resultColor}`}>
          <ResultIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span className="text-stage-text">{result.message}</span>
        </p>
      )}

      <div className="flex flex-col gap-3">
        <SyncCard icon={CloudDownload} title="Aktuellen Band-Stand vom Server laden (GitHub-Sync)">
          <p className="text-sm text-stage-muted">Lädt die vom Admin veröffentlichte band-data.json und aktualisiert dieses Gerät mit einem Klick.</p>
          <Button variant="primary" icon={busy === 'server' ? Loader2 : CloudDownload} disabled={busy !== null} onClick={syncFromServer}>
            {busy === 'server' ? 'Wird geladen …' : 'Band-Stand laden'}
          </Button>
          {!isOnline && <p className="text-sm font-medium text-warn">Du bist offline – für den Server-Sync wird eine Internetverbindung benötigt.</p>}
        </SyncCard>

        <SyncCard icon={FileUp} title="Band-Daten aus Datei importieren (JSON)">
          <p className="text-sm text-stage-muted">Für eine per WhatsApp oder AirDrop empfangene band-data.json. Funktioniert auch offline.</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="JSON-Datei auswählen"
            onChange={(event) => importFile(event.target.files?.[0])}
          />
          <Button variant="accent" icon={busy === 'file' ? Loader2 : FileUp} disabled={busy !== null} onClick={() => fileInput.current?.click()}>
            {busy === 'file' ? 'Wird importiert …' : 'Datei auswählen'}
          </Button>
        </SyncCard>

        {isAdmin && (
          <SyncCard icon={Download} title="Band-Daten exportieren (band-data.json)">
            <p className="text-sm text-stage-muted">
              Enthält Songs, Setlists, Bandnamen und Moodboard inklusive aller PDFs und Bilder. Lege die Datei in den public/-Ordner des Repos oder
              teile sie direkt mit der Band.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={busy === 'export' ? Loader2 : Download} disabled={busy !== null} onClick={() => exportData('download')} className="flex-1">
                Band-Daten exportieren
              </Button>
              {canShareFiles && (
                <Button icon={busy === 'share' ? Loader2 : Share2} disabled={busy !== null} onClick={() => exportData('share')} className="flex-1">
                  Teilen (z. B. WhatsApp)
                </Button>
              )}
            </div>
          </SyncCard>
        )}
      </div>
    </section>
  );
}
