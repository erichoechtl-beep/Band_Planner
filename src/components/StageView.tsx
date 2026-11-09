import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, FileText, ListOrdered, Maximize, Minimize, Music2, StickyNote, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, type Song } from '../db/schema';
import { transposeSong } from '../lib/transpose';
import { PdfViewer } from './PdfViewer';
import { SongNotes } from './PersonalNotes';
import { StatusBar } from './Header';
import { TransposeTool } from './TransposeTool';
import { Button, IconButton, Modal } from './ui';

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

function StageBadge({ label, value, tone }: { label: string; value: string; tone: 'green' | 'cyan' | 'white' }) {
  const color = tone === 'green' ? 'text-neon border-neon' : tone === 'cyan' ? 'text-signal border-signal' : 'text-stage-text border-stage-line';
  return (
    <div className={`rounded-xl border-2 bg-stage-surface px-4 py-1.5 ${color}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-stage-muted">{label}</div>
      <div className="text-2xl font-extrabold leading-tight sm:text-4xl">{value}</div>
    </div>
  );
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

  if (!data) return <div className="h-screen-safe bg-stage-bg" />;

  if (!data.setlist || !song || !shown) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-stage-bg p-6 text-center">
        <Music2 className="h-12 w-12 text-stage-muted" aria-hidden />
        <p className="text-2xl font-bold">{data.setlist ? 'Diese Setlist enthält keine Songs.' : 'Diese Setlist gibt es nicht mehr.'}</p>
        <Button variant="primary" icon={X} onClick={onExit}>
          Zurück zu den Setlists
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-stage-bg pt-safe pb-safe">
      <StatusBar />
      <header className="flex shrink-0 items-center gap-2 border-b border-stage-line bg-stage-surface px-2 py-1.5">
        <IconButton icon={X} label="Bühnenansicht beenden" onClick={onExit} />
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold text-stage-muted">{data.setlist.name}</div>
          <div className="text-lg font-extrabold tabular-nums leading-tight">
            Song {currentIndex + 1} / {songs.length}
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
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div>
            <h2 className="break-words text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">{song.title}</h2>
            {song.artist && <p className="mt-1 text-xl text-stage-muted">{song.artist}</p>}
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3">
            {shown.key && <StageBadge label="Tonart" value={shown.key} tone="green" />}
            {song.bpm !== null && <StageBadge label="BPM" value={String(song.bpm)} tone="cyan" />}
            {song.tuning && <StageBadge label="Stimmung" value={song.tuning} tone="white" />}
            {song.duration && <StageBadge label="Dauer" value={song.duration} tone="white" />}
          </div>

          {shown.structure && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stage-muted">Song-Ablauf</h3>
              <p className="break-words text-2xl font-bold leading-snug text-signal sm:text-3xl">{shown.structure}</p>
            </div>
          )}

          {notes && notes.length > 0 && (
            <button
              type="button"
              onClick={() => setPanel('notes')}
              className="rounded-xl border-2 border-warn/60 bg-warn/10 p-3 text-left"
            >
              <span className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warn">
                <StickyNote className="h-4 w-4" aria-hidden /> Meine Notizen
              </span>
              {notes.map((note) => (
                <span key={note.id} className="block whitespace-pre-wrap break-words text-xl font-semibold">
                  {note.text}
                </span>
              ))}
            </button>
          )}

          {/* Im Querformat stehen Schnellzugriffe und Transponierer in einer Reihe, damit nichts gescrollt werden muss. */}
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Button variant="accent" icon={FileText} className="min-h-16 text-lg" disabled={!song.pdfName} onClick={() => setPanel('pdf')}>
              {song.pdfName ? 'PDF-Leadsheet' : 'Kein PDF'}
            </Button>
            <Button icon={Music2} className="min-h-16 text-lg" disabled={!song.chords} onClick={() => setPanel('chords')}>
              Akkorde
            </Button>
            <Button icon={StickyNote} className="min-h-16 text-lg" onClick={() => setPanel('notes')}>
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

      <footer className="shrink-0 border-t border-stage-line bg-stage-surface p-2">
        <p className="mb-2 truncate px-1 text-center text-lg">
          {nextSong ? (
            <>
              <span className="text-stage-muted">Als Nächstes: </span>
              <span className="font-bold text-neon">{nextSong.title}</span>
              {transposeSong(nextSong, transpositions[nextSong.id] ?? 0).key && (
                <span className="text-stage-muted"> · {transposeSong(nextSong, transpositions[nextSong.id] ?? 0).key}</span>
              )}
              {nextSong.tuning !== song.tuning && nextSong.tuning && <span className="font-bold text-warn"> · Umstimmen: {nextSong.tuning}</span>}
            </>
          ) : (
            <span className="font-bold text-signal">Letzter Song der Setlist</span>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!previousSong}
            onClick={() => goTo(currentIndex - 1)}
            className="flex min-h-20 min-w-0 items-center justify-center gap-1 rounded-xl border-2 border-stage-line bg-stage-raised px-2 text-lg font-extrabold disabled:opacity-40 sm:min-h-24 sm:text-2xl"
          >
            <ChevronLeft className="h-8 w-8 shrink-0" aria-hidden /> Vorheriger Song
          </button>
          <button
            type="button"
            disabled={!nextSong}
            onClick={() => goTo(currentIndex + 1)}
            className="flex min-h-20 min-w-0 items-center justify-center gap-1 rounded-xl bg-neon px-2 text-lg font-extrabold text-stage-bg disabled:opacity-40 sm:min-h-24 sm:text-2xl"
          >
            Nächster Song <ChevronRight className="h-8 w-8 shrink-0" aria-hidden />
          </button>
        </div>
      </footer>

      {panel === 'pdf' && <PdfViewer songId={song.id} title={song.title} onClose={() => setPanel(null)} />}

      {panel === 'chords' && (
        <Modal title={`Akkorde: ${song.title}`} onClose={() => setPanel(null)} size="full">
          <pre className="p-4 font-mono text-xl leading-relaxed sm:text-3xl">{shown.chords}</pre>
        </Modal>
      )}

      {panel === 'notes' && (
        <Modal title={`Meine Notizen: ${song.title}`} onClose={() => setPanel(null)}>
          <div className="p-4">
            <SongNotes song={song} />
          </div>
        </Modal>
      )}

      {panel === 'list' && (
        <Modal title={data.setlist.name} onClose={() => setPanel(null)}>
          <ol className="flex flex-col gap-2 p-4">
            {songs.map((entry, position) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-current={position === currentIndex ? 'true' : undefined}
                  onClick={() => {
                    goTo(position);
                    setPanel(null);
                  }}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-lg border p-3 text-left text-lg font-semibold ${
                    position === currentIndex ? 'border-neon bg-stage-raised text-neon' : 'border-stage-line bg-stage-bg'
                  }`}
                >
                  <span className="w-7 shrink-0 text-center tabular-nums text-stage-muted">{position + 1}</span>
                  <span className="min-w-0 flex-1 break-words">{entry.title}</span>
                  {entry.key && <span className="text-base text-stage-muted">{entry.key}</span>}
                </button>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </div>
  );
}
