import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, CloudDownload, CloudUpload, Download, FileUp, Loader2, Share2, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react';
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
import { ConnectionStatus } from './Header';
import { Button, InfoNote, PageHeader } from './ui';

/** Öffnet auf GitHub das Hochladen direkt in den public/-Ordner; eine gleichnamige Datei wird ersetzt. */
const GITHUB_UPLOAD_URL = 'https://github.com/erichoechtl-beep/Band_Planner/upload/main/public';

type Busy = 'export' | 'share' | 'server' | 'file' | null;

interface Result {
  tone: 'success' | 'error' | 'info';
  message: string;
}

// Über 25 MB wird die Datei auf GitHub und in Messengern unhandlich (GitHub warnt ab 50 MB).
const LARGE_FILE_BYTES = 25 * 1024 * 1024;

function summarize(file: BandDataFile): string {
  return `${file.songs.length} Songs, ${file.setlists.length} Setlists, ${file.rehearsals.length} Termine, ${file.documents.length} Dokumente`;
}

interface SyncRowProps {
  icon: LucideIcon;
  tone: 'green' | 'cyan' | 'neutral';
  title: string;
  description: string;
  actions: ReactNode;
  hint?: ReactNode;
}

function SyncRow({ icon: Icon, tone, title, description, actions, hint }: SyncRowProps) {
  const tile = tone === 'green' ? 'bg-brand/10 text-brand' : tone === 'cyan' ? 'bg-accent/10 text-accent' : 'bg-stage-raised text-stage-muted';
  return (
    <article className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug">{title}</h3>
          <p className="mt-1 text-sm text-stage-muted">{description}</p>
          {hint}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:w-56">{actions}</div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 truncate text-[15px] font-semibold">{value}</dd>
    </div>
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
  const resultColor = result?.tone === 'success' ? 'text-brand' : result?.tone === 'error' ? 'text-danger' : 'text-accent';
  const resultBorder = result?.tone === 'success' ? 'border-brand/40' : result?.tone === 'error' ? 'border-danger/50' : 'border-accent/40';

  return (
    <section>
      <PageHeader title="Daten-Sync" description="Den aktuellen Band-Stand laden, importieren oder als Admin verteilen." />
      <ConnectionStatus />

      <div className="card mb-4 p-4 sm:p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <Fact label="Band-Stand" value={formatDateTime(status?.bandDataUpdatedAt)} />
          <Fact label="Quelle" value={status?.lastSyncSource ?? 'Lokal bearbeitet'} />
          <Fact label="Inhalt" value={`${counts?.songs ?? 0} Songs · ${counts?.setlists ?? 0} Setlists`} />
          <Fact label="Persönliche Notizen" value={counts?.notes ?? 0} />
        </dl>
        {status?.hasLocalChanges && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2.5 text-sm font-medium text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Dieses Gerät hat Änderungen, die noch nicht exportiert wurden.
          </p>
        )}
      </div>

      {result && (
        <p role={result.tone === 'error' ? 'alert' : 'status'} className={`mb-4 flex items-start gap-3 rounded-xl border bg-stage-surface px-4 py-3 text-[15px] ${resultBorder}`}>
          <ResultIcon className={`mt-0.5 h-5 w-5 shrink-0 ${resultColor}`} aria-hidden />
          <span>{result.message}</span>
        </p>
      )}

      <div className="card mb-4 divide-y divide-stage-line">
        <SyncRow
          icon={CloudDownload}
          tone="green"
          title="Aktuellen Band-Stand vom Server laden (GitHub-Sync)"
          description="Jedes Gerät prüft automatisch beim Öffnen, beim Zurückkehren in die App und alle paar Minuten, ob ein neuer Stand auf GitHub liegt. Mit dem Knopf geht es sofort."
          hint={!isOnline && <p className="mt-2 text-sm font-medium text-warn">Du bist offline – für den Server-Sync wird eine Internetverbindung benötigt.</p>}
          actions={
            <Button variant="primary" icon={busy === 'server' ? Loader2 : CloudDownload} disabled={busy !== null} onClick={syncFromServer}>
              {busy === 'server' ? 'Wird geladen …' : 'Band-Stand laden'}
            </Button>
          }
        />

        <SyncRow
          icon={FileUp}
          tone="cyan"
          title="Band-Daten aus Datei importieren (JSON)"
          description="Für eine per WhatsApp oder AirDrop empfangene band-data.json. Funktioniert auch offline."
          actions={
            <>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="JSON-Datei auswählen"
                onChange={(event) => importFile(event.target.files?.[0])}
              />
              <Button icon={busy === 'file' ? Loader2 : FileUp} disabled={busy !== null} onClick={() => fileInput.current?.click()}>
                {busy === 'file' ? 'Wird importiert …' : 'Datei auswählen'}
              </Button>
            </>
          }
        />

        {isAdmin && (
          <SyncRow
            icon={Download}
            tone="neutral"
            title="Band-Daten exportieren (band-data.json)"
            description="Enthält Songs, Setlists, Bandnamen und Moodboard inklusive aller PDFs und Bilder."
            hint={
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-stage-muted">
                <li>„Band-Daten exportieren“ antippen – die Datei band-data.json wird gespeichert.</li>
                <li>„Auf GitHub hochladen“ öffnen, die Datei hineinziehen bzw. auswählen.</li>
                <li>Unten „Commit changes“ drücken. Nach etwa einer Minute holen sich alle Geräte den neuen Stand.</li>
              </ol>
            }
            actions={
              <>
                <Button variant="accent" icon={busy === 'export' ? Loader2 : Download} disabled={busy !== null} onClick={() => exportData('download')}>
                  Band-Daten exportieren
                </Button>
                <a
                  href={GITHUB_UPLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-touch items-center justify-center gap-2 rounded-lg border border-stage-line bg-stage-raised px-4 py-2 text-[15px] font-medium text-stage-text transition-colors hover:border-stage-strong hover:bg-stage-hover"
                >
                  <CloudUpload className="h-[18px] w-[18px] shrink-0" strokeWidth={2.25} aria-hidden />
                  Auf GitHub hochladen
                </a>
                {canShareFiles && (
                  <Button icon={busy === 'share' ? Loader2 : Share2} disabled={busy !== null} onClick={() => exportData('share')}>
                    Teilen (z. B. WhatsApp)
                  </Button>
                )}
              </>
            }
          />
        )}
      </div>

      <InfoNote icon={ShieldCheck}>Sync und Import ersetzen nur die Band-Daten. Deine persönlichen Notizen bleiben immer unangetastet.</InfoNote>
    </section>
  );
}
