import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, FileText, ListOrdered, Maximize, Minimize, Music2, StickyNote, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, type Song } from '../db/schema';
import { transposeSong } from '../lib/transpose';
import { StatusBar } from './Header';
import { PdfViewer } from './PdfViewer';
import { SongNotes } from './PersonalNotes';
import { TransposeTool } from './TransposeTool';
import { Button, IconButton, Modal, Stat, StructureFlow } from './ui';

/** Hält das Display an, solange die Bühnenansicht offen ist (falls das Gerät es unterstützt). */
function useWakeLock() {
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

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isSupported = typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled;

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', update);
    if (isSupported) document.documentElement.requestFullscreen().catch(() => undefined);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [isSupported]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  return { isSupported, isFullscreen, toggle };
}

interface StageViewProps {
  setlistId: string;
  initialIndex: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
}

export function StageView({ setlistId, initialIndex, onIndexChange, onExit }: StageViewProps) {
  const data = useLiveQuery(async () => {
    const setlist = await db.setlists.get(setlistId);
    if (!setlist) return { setlist: null, songs: [] as Song[] };
    const rows = await db.songs.bulkGet(setlist.songIds);
    return { setlist, songs: rows.filter((song): song is Song => song !== undefined) };
  }, [setlistId]);

  const [index, setIndex] = useState(initialIndex);
  // Transposition je Song merken, damit sie beim Vor- und Zurückblättern erhalten bleibt.
  const [transpositions, setTranspositions] = useState<Record<string, number>>({});
  const [panel, setPanel] = useState<'pdf' | 'chords' | 'notes' | 'list' | null>(null);

  useWakeLock();
  const fullscreen = useFullscreen();

  const songs = data?.songs ?? [];
  const lastIndex = songs.length - 1;
  const currentIndex = Math.min(Math.max(index, 0), Math.max(lastIndex, 0));
  const song = songs[currentIndex] ?? null;
  const nextSong = songs[currentIndex + 1] ?? null;
  const previousSong = songs[currentIndex - 1] ?? null;

  const notes = useLiveQuery(
    () => (song ? db.personalNotes.where('songId').equals(song.id).sortBy('updatedAt') : []),
    [song?.id],
  );

  const goTo = useCallback(
    (target: number) => {
      setIndex(target);
      onIndexChange(target);
    },
    [onIndexChange],
  );

  // Pfeiltasten, Bild-Tasten und Bluetooth-Fußpedale (die meist genau diese Tasten senden)
  useEffect(() => {
    if (panel) return;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      if ((event.key === 'ArrowRight' || event.key === 'PageDown') && currentIndex < lastIndex) {
        event.preventDefault();
        goTo(currentIndex + 1);
      } else if ((event.key === 'ArrowLeft' || event.key === 'PageUp') && currentIndex > 0) {
        event.preventDefault();
        goTo(currentIndex - 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [panel, currentIndex, lastIndex, goTo]);

  const semitones = song ? (transpositions[song.id] ?? 0) : 0;
  const shown = useMemo(() => (song ? transposeSong(song, semitones) : null), [song, semitones]);
  const nextKey = nextSong ? transposeSong(nextSong, transpositions[nextSong.id] ?? 0).key : '';

  if (!data) return <div className="h-screen-safe bg-stage-bg" />;

  if (!data.setlist || !song || !shown) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-stage-bg p-6 text-center">
        <Music2 className="h-10 w-10 text-stage-subtle" aria-hidden />
        <p className="text-xl font-semibold">{data.setlist ? 'Diese Setlist enthält keine Songs.' : 'Diese Setlist gibt es nicht mehr.'}</p>
        <Button variant="primary" icon={X} onClick={onExit}>
          Zurück zu den Setlists
        </Button>
      </div>
    );
  }

  const progress = ((currentIndex + 1) / songs.length) * 100;
  const tuningChange = nextSong && nextSong.tuning && nextSong.tuning !== song.tuning;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-stage-bg pt-safe pb-safe">
      <StatusBar />
      <header className="relative flex shrink-0 items-center gap-1 border-b border-stage-line bg-stage-surface px-2 py-1.5">
        <IconButton icon={X} label="Bühnenansicht beenden" onClick={onExit} />
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-xs font-medium text-stage-muted">{data.setlist.name}</div>
          <div className="text-sm font-bold tabular-nums">
            Song {currentIndex + 1} <span className="font-medium text-stage-subtle">/ {songs.length}</span>
          </div>
        </div>
        <IconButton icon={ListOrdered} label="Setlist anzeigen" onClick={() => setPanel('list')} />
        {fullscreen.isSupported && (
          <IconButton
            icon={fullscreen.isFullscreen ? Minimize : Maximize}
            label={fullscreen.isFullscreen ? 'Vollbild verlassen' : 'Vollbild'}
            onClick={fullscreen.toggle}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-stage-line" aria-hidden>
          <div className="h-full bg-neon transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-6">
          <div>
            <h2 className="break-words text-[44px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-7xl">{song.title}</h2>
            {song.artist && <p className="mt-2 text-lg text-stage-muted sm:text-xl">{song.artist}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
            {shown.key && <Stat size="xl" label="Tonart" value={shown.key} tone="green" />}
            {song.bpm !== null && <Stat size="xl" label="BPM" value={String(song.bpm)} tone="cyan" />}
            {song.tuning && <Stat size="xl" label="Stimmung" value={song.tuning} tone={song.tuning !== 'Standard E' ? 'amber' : 'neutral'} />}
            {song.duration && <Stat size="xl" label="Dauer" value={song.duration} />}
          </div>

          {shown.structure && (
            <section>
              <h3 className="eyebrow mb-2">Song-Ablauf</h3>
              <StructureFlow structure={shown.structure} size="xl" />
            </section>
          )}

          {notes && notes.length > 0 && (
            <button
              type="button"
              onClick={() => setPanel('notes')}
              className="rounded-xl border border-warn/40 bg-warn/[0.07] px-4 py-3 text-left transition-colors hover:bg-warn/10"
            >
              <span className="eyebrow mb-1 flex items-center gap-1.5 text-warn">
                <StickyNote className="h-3.5 w-3.5" aria-hidden /> Meine Notizen
              </span>
              {notes.map((note) => (
                <span key={note.id} className="block whitespace-pre-wrap break-words text-lg font-medium sm:text-xl">
                  {note.text}
                </span>
              ))}
            </button>
          )}

          {/* Im Querformat stehen Schnellzugriffe und Transponierer in einer Reihe, damit nichts gescrollt werden muss. */}
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Button variant="accent" icon={FileText} className="min-h-14 text-base" disabled={!song.pdfName} onClick={() => setPanel('pdf')}>
              {song.pdfName ? 'PDF-Leadsheet' : 'Kein PDF'}
            </Button>
            <Button icon={Music2} className="min-h-14 text-base" disabled={!song.chords} onClick={() => setPanel('chords')}>
              Akkorde
            </Button>
            <Button icon={StickyNote} className="min-h-14 text-base" onClick={() => setPanel('notes')}>
              Notizen{notes && notes.length > 0 ? ` (${notes.length})` : ''}
            </Button>
            <div className="sm:col-span-3">
              <TransposeTool
                large
                semitones={semitones}
                originalKey={song.key}
                transposedKey={shown.key}
                onChange={(value) => setTranspositions((current) => ({ ...current, [song.id]: value }))}
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="shrink-0 border-t border-stage-line bg-stage-surface p-2 sm:p-3">
        <div className="mb-2 flex min-h-7 items-center justify-center gap-2 px-1 text-center text-[15px]">
          {nextSong ? (
            <p className="truncate">
              <span className="eyebrow mr-2">Als Nächstes</span>
              <span className="font-semibold">{nextSong.title}</span>
              {nextKey && <span className="font-mono text-stage-muted"> · {nextKey}</span>}
              {tuningChange && <span className="font-semibold text-warn"> · Umstimmen: {nextSong.tuning}</span>}
            </p>
          ) : (
            <p className="font-semibold text-signal">Letzter Song der Setlist</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!previousSong}
            onClick={() => goTo(currentIndex - 1)}
            className="flex min-h-20 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-stage-line bg-stage-raised px-2 text-lg font-bold transition-colors hover:bg-stage-hover disabled:opacity-30 sm:min-h-24 sm:text-xl"
          >
            <ChevronLeft className="h-7 w-7 shrink-0" aria-hidden /> Vorheriger Song
          </button>
          <button
            type="button"
            disabled={!nextSong}
            onClick={() => goTo(currentIndex + 1)}
            className="flex min-h-20 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-neon px-2 text-lg font-bold text-stage-bg transition-colors hover:bg-[#2fd36b] disabled:bg-stage-raised disabled:text-stage-subtle sm:min-h-24 sm:text-xl"
          >
            Nächster Song <ChevronRight className="h-7 w-7 shrink-0" aria-hidden />
          </button>
        </div>
      </footer>

      {panel === 'pdf' && <PdfViewer songId={song.id} title={song.title} onClose={() => setPanel(null)} />}

      {panel === 'chords' && (
        <Modal title={song.title} subtitle={`Akkorde${semitones !== 0 ? ` · ${shown.key}` : ''}`} onClose={() => setPanel(null)} size="full">
          <pre className="p-5 font-mono text-xl leading-relaxed sm:p-8 sm:text-3xl">{shown.chords}</pre>
        </Modal>
      )}

      {panel === 'notes' && (
        <Modal title="Meine Notizen" subtitle={song.title} onClose={() => setPanel(null)}>
          <div className="p-5">
            <SongNotes song={song} />
          </div>
        </Modal>
      )}

      {panel === 'list' && (
        <Modal title={data.setlist.name} subtitle={`${songs.length} Songs`} onClose={() => setPanel(null)}>
          <ol className="flex flex-col gap-1 p-3">
            {songs.map((entry, position) => {
              const isCurrent = position === currentIndex;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => {
                      goTo(position);
                      setPanel(null);
                    }}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors ${
                      isCurrent ? 'bg-neon/10 text-neon' : 'hover:bg-stage-raised'
                    }`}
                  >
                    <span className={`w-7 shrink-0 text-center text-sm font-semibold tabular-nums ${isCurrent ? '' : 'text-stage-subtle'}`}>
                      {String(position + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base font-semibold">{entry.title}</span>
                    {entry.key && <span className="font-mono text-sm text-stage-muted">{entry.key}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </Modal>
      )}
    </div>
  );
}
