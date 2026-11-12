import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileWarning, Loader2, Minus, Pause, Play, Plus, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { db } from '../db/schema';
import { downloadBlob } from '../lib/files';
import { Button, IconButton, Modal } from './ui';

type PdfEngine = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let enginePromise: Promise<PdfEngine> | null = null;

// Die Legacy-Fassung läuft auch auf älteren Tablets. Engine und Worker liegen im Offline-Cache.
function loadPdfEngine(): Promise<PdfEngine> {
  enginePromise ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([engine, worker]) => {
    engine.GlobalWorkerOptions.workerSrc = worker.default;
    return engine;
  });
  enginePromise.catch(() => {
    enginePromise = null;
  });
  return enginePromise;
}

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3];
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** Ohne bekannte Songlänge: so viele Pixel pro Sekunde */
const DEFAULT_SPEED = 30;

/**
 * Lässt das PDF gleichmäßig nach unten gleiten. Das Grundtempo ist so gewählt, dass das Leadsheet
 * ungefähr in der Länge des Songs durchläuft; mit „Schneller“/„Langsamer“ lässt es sich anpassen.
 * Scrollt man von Hand, läuft der Bildlauf von der neuen Stelle aus weiter.
 */
function useAutoScroll(scrollerRef: RefObject<HTMLDivElement | null>, durationSeconds: number | null) {
  const [running, setRunning] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(2);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!running || !scroller) return;
    const max = () => scroller.scrollHeight - scroller.clientHeight;
    const base = durationSeconds ? Math.max(8, max() / (durationSeconds * 0.92)) : DEFAULT_SPEED;
    let position = scroller.scrollTop;
    let last = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const seconds = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (Math.abs(scroller.scrollTop - position) > 3) position = scroller.scrollTop;
      position = Math.min(max(), position + base * SPEED_STEPS[speedIndex] * seconds);
      scroller.scrollTop = position;
      if (position >= max() - 1) {
        setRunning(false);
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running, speedIndex, durationSeconds, scrollerRef]);

  return { running, setRunning, speedIndex, setSpeedIndex };
}

interface PdfViewerProps {
  songId: string;
  title: string;
  /** Songlänge in Sekunden – bestimmt das Grundtempo des automatischen Bildlaufs */
  durationSeconds?: number | null;
  /** Welches PDF des Songs: Leadsheet (Standard) oder Drum Sheet */
  source?: 'leadsheet' | 'drum';
  onClose: () => void;
}

/** Leadsheet eines Songs aus der lokalen Datenbank. */
export function PdfViewer({ songId, title, durationSeconds = null, source = 'leadsheet', onClose }: PdfViewerProps) {
  const pdf = useLiveQuery(() => (source === 'drum' ? db.drumSheets : db.pdfs).get(songId), [songId, source], null);
  return <PdfModal title={title} file={pdf} durationSeconds={durationSeconds} onClose={onClose} />;
}

interface PdfModalProps {
  title: string;
  /** null = wird geladen, undefined = nicht vorhanden */
  file: { name: string; data: ArrayBuffer } | null | undefined;
  durationSeconds?: number | null;
  onClose: () => void;
}

/** Zeigt ein beliebiges PDF seitenweise an – offline, mit Zoom und Download. */
export function PdfModal({ title, file: pdf, durationSeconds = null, onClose }: PdfModalProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const autoScroll = useAutoScroll(scrollerRef, durationSeconds);
  const [canScroll, setCanScroll] = useState(false);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const [attempt, setAttempt] = useState(0);

  // Seiten werden auf die verfügbare Breite eingepasst (Drehen des Tablets eingeschlossen).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => setWidth(scroller.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const zoom = ZOOM_STEPS[zoomIndex];
  const data = pdf?.data;

  useEffect(() => {
    if (!data || width === 0) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;

    (async () => {
      setStatus((current) => (current === 'ready' ? current : 'loading'));
      try {
        const engine = await loadPdfEngine();
        // Der Worker übernimmt den Puffer, deshalb bekommt er eine Kopie.
        const task = engine.getDocument({ data: new Uint8Array(data.slice(0)) });
        destroy = () => void task.destroy();
        const document_ = await task.promise;
        if (cancelled) return;
        setPageCount(document_.numPages);

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const canvases: HTMLCanvasElement[] = [];
        for (let number = 1; number <= document_.numPages; number++) {
          const page = await document_.getPage(number);
          if (cancelled) return;
          const baseViewport = page.getViewport({ scale: 1 });
          const cssScale = ((width - 16) / baseViewport.width) * zoom;
          const viewport = page.getViewport({ scale: cssScale * pixelRatio });

          const canvas = window.document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
          canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
          canvas.className = 'mx-auto block rounded-sm bg-white shadow-pop';
          canvas.setAttribute('aria-label', `${title}, Seite ${number}`);
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          canvases.push(canvas);
          // Erste Seite sofort zeigen, weitere nachreichen.
          if (number === 1) pagesRef.current?.replaceChildren(canvas);
          else pagesRef.current?.append(canvas);
          setStatus('ready');
        }
      } catch (error) {
        if (!cancelled) {
          console.error('PDF konnte nicht angezeigt werden:', error);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [data, width, zoom, title, attempt]);

  // Ob es etwas zu scrollen gibt, ändert sich mit jeder nachgeladenen Seite, mit Zoom und Bildschirmgröße –
  // deshalb wird die Größe der Seiten laufend beobachtet.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const pages = pagesRef.current;
    if (!scroller || !pages || status !== 'ready') return;
    const measure = () => setCanScroll(scroller.scrollHeight - scroller.clientHeight > 24);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pages);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [status]);

  // Leertaste startet und stoppt den Bildlauf (auch per Bluetooth-Tastatur oder Pedal).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' || (event.target as HTMLElement | null)?.closest('input, textarea, button')) return;
      event.preventDefault();
      if (canScroll) autoScroll.setRunning((value) => !value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canScroll, autoScroll]);

  const download = () => {
    if (pdf) downloadBlob(new Blob([pdf.data], { type: 'application/pdf' }), pdf.name);
  };

  const missing = pdf === undefined;

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="full"
      layer="top"
      headerExtra={
        <div className="flex items-center gap-1">
          {pageCount > 1 && <span className="hidden px-2 text-sm text-stage-muted sm:inline">{pageCount} Seiten</span>}
          <IconButton icon={ZoomOut} label="Verkleinern" disabled={zoomIndex === 0} onClick={() => setZoomIndex(zoomIndex - 1)} />
          <IconButton
            icon={ZoomIn}
            label="Vergrößern"
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() => setZoomIndex(zoomIndex + 1)}
          />
        </div>
      }
    >
      <div className="relative h-full">
      <div ref={scrollerRef} className="h-full overflow-auto bg-stage-bg p-2 pb-28">
        <div ref={pagesRef} className="flex w-max min-w-full flex-col gap-2" />

        {!missing && status === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-20 text-lg" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
            PDF wird geladen …
          </div>
        )}

        {(missing || status === 'error') && (
          <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-4 text-center" role="alert">
            <FileWarning className="h-12 w-12 text-warn" aria-hidden />
            <p className="text-lg font-semibold">
              {missing ? 'Für diesen Song ist kein PDF gespeichert.' : 'Das PDF konnte nicht angezeigt werden.'}
            </p>
            {!missing && (
              <>
                <p className="text-stage-muted">
                  Falls die App gerade aktualisiert wurde, hilft Neuladen. Die Datei selbst ist weiterhin lokal gespeichert.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="primary"
                    icon={RefreshCw}
                    onClick={() => {
                      setStatus('loading');
                      setAttempt(attempt + 1);
                    }}
                  >
                    Erneut versuchen
                  </Button>
                  <Button icon={RefreshCw} onClick={() => window.location.reload()}>
                    App neu laden
                  </Button>
                  <Button icon={Download} onClick={download}>
                    PDF herunterladen
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {status === 'ready' && !missing && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-stage-line bg-stage-surface/95 p-1.5 shadow-pop backdrop-blur" role="group" aria-label="Automatischer Bildlauf">
            <IconButton
              icon={Minus}
              label="Langsamer"
              disabled={autoScroll.speedIndex === 0}
              onClick={() => autoScroll.setSpeedIndex(autoScroll.speedIndex - 1)}
              className="rounded-full"
            />
            <button
              type="button"
              onClick={() => autoScroll.setRunning(!autoScroll.running)}
              disabled={!canScroll}
              aria-pressed={autoScroll.running}
              title={canScroll ? 'Leertaste startet und stoppt' : 'Das PDF passt komplett auf den Bildschirm'}
              className={`flex min-h-touch items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors disabled:opacity-40 ${
                autoScroll.running ? 'bg-stage-text text-stage-surface' : 'bg-brand text-on-fill hover:bg-brand-strong'
              }`}
            >
              {autoScroll.running ? <Pause className="h-[18px] w-[18px]" aria-hidden /> : <Play className="h-[18px] w-[18px]" aria-hidden />}
              {autoScroll.running ? 'Pause' : 'Auto-Scroll'}
            </button>
            <span className="w-12 text-center text-sm font-semibold tabular-nums text-stage-muted" aria-live="polite" aria-label={`Tempo ${SPEED_STEPS[autoScroll.speedIndex]}-fach`}>
              {SPEED_STEPS[autoScroll.speedIndex].toLocaleString('de-DE')}×
            </span>
            <IconButton
              icon={Plus}
              label="Schneller"
              disabled={autoScroll.speedIndex === SPEED_STEPS.length - 1}
              onClick={() => autoScroll.setSpeedIndex(autoScroll.speedIndex + 1)}
              className="rounded-full"
            />
          </div>
        </div>
      )}
      </div>
    </Modal>
  );
}
