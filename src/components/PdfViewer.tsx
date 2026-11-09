import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileWarning, Loader2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

interface PdfViewerProps {
  songId: string;
  title: string;
  onClose: () => void;
}

export function PdfViewer({ songId, title, onClose }: PdfViewerProps) {
  const pdf = useLiveQuery(() => db.pdfs.get(songId), [songId], null);
  const scrollerRef = useRef<HTMLDivElement>(null);
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
      <div ref={scrollerRef} className="relative h-full overflow-auto bg-stage-bg p-2">
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
    </Modal>
  );
}
