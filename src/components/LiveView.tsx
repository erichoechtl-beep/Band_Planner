import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, FileWarning, Loader2, MicVocal, Music2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { db, type Song } from '../db/schema';
import { playableSongIds } from '../lib/setlist';
import { parseDuration } from '../lib/time';
import { useWakeLock } from '../lib/useWakeLock';
import { AutoScrollBar, useAutoScroll, useCanScroll, usePdfPages, ZOOM_STEPS } from './PdfViewer';
import { Button, IconButton } from './ui';

/** Ohne Berührung blenden sich die Leisten nach dieser Zeit aus. */
const CONTROLS_HIDE_MS = 3000;

/** Fordert beim Öffnen den Browser-Vollbildmodus an (wo möglich) und gibt ihn beim Schließen wieder frei. */
function useBrowserFullscreen() {
  useEffect(() => {
    const root = document.documentElement;
    let entered = false;
    if (!document.fullscreenElement && typeof root.requestFullscreen === 'function' && document.fullscreenEnabled) {
      root
        .requestFullscreen()
        .then(() => {
          entered = true;
        })
        .catch(() => undefined);
    }
    return () => {
      if (entered && document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, []);
}

/** Platzhalter für Songs ohne Leadsheet – damit die Reihenfolge der Setlist erhalten bleibt. */
function NoLeadsheet({ song, number }: { song: Song; number: number }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="font-mono text-sm font-semibold tracking-widest text-stage-subtle">{String(number).padStart(2, '0')}</p>
      <h2 className="text-[40px] font-bold leading-tight tracking-[-0.03em] sm:text-6xl">{song.title}</h2>
      {song.artist && song.artist !== '?' && <p className="text-lg text-stage-muted">{song.artist}</p>}
      <div className="mt-2 flex flex-wrap justify-center gap-2 text-lg font-semibold">
        {song.key && song.key !== '?' && <span className="rounded-lg bg-white/10 px-3 py-1.5 font-mono">{song.key}</span>}
        {song.bpm !== null && <span className="rounded-lg bg-white/10 px-3 py-1.5 tabular-nums">{song.bpm} BPM</span>}
        {song.leadVocals && (
          <span className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5">
            <MicVocal className="h-4 w-4" aria-hidden /> {song.leadVocals}
          </span>
        )}
      </div>
      <p className="mt-4 flex items-center gap-2 text-stage-muted">
        <FileWarning className="h-5 w-5" aria-hidden /> Für diesen Song ist kein Leadsheet hinterlegt.
      </p>
    </div>
  );
}

interface LiveViewProps {
  setlistId: string;
  initialIndex: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
}

/**
 * Live-Ansicht: nur die Leadsheets der Setlist im Vollbild, direkt von Song zu Song blätterbar
 * (Wischen, Pfeil-/Bild-Tasten bzw. Fußpedal, Knöpfe). Gleiche Songs und Reihenfolge wie die Probeansicht.
 */
export function LiveView({ setlistId, initialIndex, onIndexChange, onExit }: LiveViewProps) {
  const data = useLiveQuery(async () => {
    const setlist = await db.setlists.get(setlistId);
    if (!setlist) return { setlist: null, songs: [] as Song[] };
    const rows = await db.songs.bulkGet(setlist.songIds);
    return { setlist, songs: rows.filter((song): song is Song => song !== undefined) };
  }, [setlistId]);

  // Reihenfolge beim Öffnen festhalten – wie in der Probeansicht.
  const [sessionIds, setSessionIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (data?.setlist && sessionIds === null) setSessionIds(playableSongIds(data.setlist));
  }, [data, sessionIds]);

  const songs = useMemo(() => {
    if (!data || !sessionIds) return [];
    const byId = new Map(data.songs.map((song) => [song.id, song]));
    return sessionIds.flatMap((id) => byId.get(id) ?? []);
  }, [data, sessionIds]);

  if (!data || (data.setlist && !sessionIds)) return <div className="fixed inset-0 z-40 bg-neutral-950" />;

  if (!data.setlist || songs.length === 0) {
    return (
      <div className="theme-dark fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-center text-stage-text">
        <Music2 className="h-10 w-10 text-stage-subtle" aria-hidden />
        <p className="text-xl font-semibold">{data.setlist ? 'In dieser Setlist ist kein Song fix oder in Abklärung.' : 'Diese Setlist gibt es nicht mehr.'}</p>
        <Button variant="primary" icon={X} onClick={onExit}>
          Zurück zu den Setlists
        </Button>
      </div>
    );
  }

  // Der Player startet erst, wenn die Songs feststehen – so ist der Bereich für das PDF von Anfang an da.
  return <LivePlayer songs={songs} initialIndex={initialIndex} onIndexChange={onIndexChange} onExit={onExit} />;
}

function LivePlayer({ songs, initialIndex, onIndexChange, onExit }: { songs: Song[] } & Omit<LiveViewProps, 'setlistId'>) {
  const [index, setIndex] = useState(initialIndex);
  const lastIndex = songs.length - 1;
  const currentIndex = Math.min(Math.max(index, 0), Math.max(lastIndex, 0));
  const song = songs[currentIndex] ?? null;
  const nextSong = songs[currentIndex + 1] ?? null;

  // null = wird geladen, undefined = kein Leadsheet
  const leadsheet = useLiveQuery(() => (song ? db.pdfs.get(song.id) : undefined), [song?.id], null);

  useWakeLock();
  useBrowserFullscreen();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const { status, setStatus } = usePdfPages({
    data: leadsheet?.data,
    title: song?.title ?? '',
    scrollerRef,
    pagesRef,
    zoom: ZOOM_STEPS[zoomIndex],
    margin: 0,
  });
  const canScroll = useCanScroll(scrollerRef, pagesRef, status);
  const autoScroll = useAutoScroll(scrollerRef, song ? parseDuration(song.duration) : null);
  const { setRunning } = autoScroll;

  // Neuer Song: altes Blatt sofort weg, nach oben springen, Auto-Scroll anhalten.
  useEffect(() => {
    pagesRef.current?.replaceChildren();
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    setRunning(false);
    setStatus('loading');
  }, [song?.id, setRunning, setStatus]);

  const [controlsShown, setControlsShown] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);
  const showControls = useCallback(() => {
    setControlsShown(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsShown(false), CONTROLS_HIDE_MS);
  }, []);
  useEffect(() => {
    showControls();
    return () => window.clearTimeout(hideTimer.current);
  }, [showControls]);

  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target > lastIndex) return;
      setIndex(target);
      onIndexChange(target);
      showControls();
    },
    [lastIndex, onIndexChange, showControls],
  );

  // Pfeil- und Bild-Tasten (Bluetooth-Fußpedale) blättern, Leertaste startet den Bildlauf, Esc beendet.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest('input, textarea')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        goTo(currentIndex + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goTo(currentIndex - 1);
      } else if (event.key === ' ' && !(event.target as HTMLElement | null)?.closest('button')) {
        event.preventDefault();
        if (canScroll) setRunning((value) => !value);
      } else if (event.key === 'Escape' && !document.fullscreenElement) {
        onExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, goTo, canScroll, setRunning, onExit]);

  // Wischen nach links = nächster Song, nach rechts = vorheriger (nicht, wenn das Blatt seitlich gezoomt ist).
  const swipe = useRef<{ x: number; y: number; time: number } | null>(null);
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    swipe.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY, time: Date.now() } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = swipe.current;
    swipe.current = null;
    const touch = event.changedTouches[0];
    const scroller = scrollerRef.current;
    if (!start || !touch || (scroller && scroller.scrollWidth > scroller.clientWidth + 2)) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - start.time > 700) return;
    goTo(currentIndex + (dx < 0 ? 1 : -1));
  };

  if (!song) return null;

  const fade = `transition-opacity duration-300 ${controlsShown ? 'opacity-100' : 'pointer-events-none opacity-0 [&_*]:!pointer-events-none'}`;
  const navButton =
    'pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/70 text-stage-text shadow-pop backdrop-blur transition-colors hover:bg-black/85 disabled:opacity-30';

  return (
    <div
      className="theme-dark fixed inset-0 z-40 bg-neutral-950 text-stage-text"
      role="region"
      aria-label={`Live-Ansicht: ${song.title}`}
      onPointerDown={showControls}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div ref={scrollerRef} className="h-full overflow-auto pb-32 pt-safe">
        <div ref={pagesRef} className={`flex w-max min-w-full flex-col gap-2 ${leadsheet ? '' : 'hidden'}`} />
        {leadsheet === undefined && <NoLeadsheet song={song} number={currentIndex + 1} />}
        {leadsheet && status === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-24 text-lg text-stage-muted" role="status">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> Leadsheet wird geladen …
          </div>
        )}
        {leadsheet && status === 'error' && (
          <p className="py-24 text-center text-lg text-stage-muted" role="alert">
            Das Leadsheet konnte nicht angezeigt werden.
          </p>
        )}
      </div>

      {/* Kopfleiste: beenden, Position und Titel, Zoom */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent pb-8 pt-safe ${fade}`}>
        <div className="flex items-center gap-2 px-2 pt-2">
          <IconButton icon={X} label="Live-Ansicht beenden" onClick={onExit} className="pointer-events-auto rounded-full bg-black/60 text-stage-text" />
          <div className="min-w-0 flex-1 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stage-muted">
              Song {currentIndex + 1} von {songs.length}
            </p>
            <h2 className="truncate text-lg font-bold">{song.title}</h2>
          </div>
          <div className="pointer-events-auto flex gap-1">
            <IconButton icon={ZoomOut} label="Verkleinern" disabled={zoomIndex === 0} onClick={() => setZoomIndex(zoomIndex - 1)} className="rounded-full bg-black/60 text-stage-text" />
            <IconButton
              icon={ZoomIn}
              label="Vergrößern"
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() => setZoomIndex(zoomIndex + 1)}
              className="rounded-full bg-black/60 text-stage-text"
            />
          </div>
        </div>
      </div>

      {/* Fußleiste: zurück, Auto-Scroll, weiter */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-10 ${fade}`}>
        <p className="mb-2 truncate text-center text-sm text-stage-muted">
          {nextSong ? (
            <>
              <span className="eyebrow mr-2">Als Nächstes</span>
              <span className="font-semibold text-stage-text">{nextSong.title}</span>
            </>
          ) : (
            'Letzter Song der Setlist'
          )}
        </p>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0} aria-label="Vorheriges Leadsheet" className={navButton}>
            <ChevronLeft className="h-7 w-7" aria-hidden />
          </button>
          {leadsheet && status === 'ready' ? <AutoScrollBar autoScroll={autoScroll} canScroll={canScroll} compact /> : <span />}
          <button type="button" onClick={() => goTo(currentIndex + 1)} disabled={!nextSong} aria-label="Nächstes Leadsheet" className={navButton}>
            <ChevronRight className="h-7 w-7" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
