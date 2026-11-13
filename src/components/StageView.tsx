import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  Drum,
  FileText,
  Guitar,
  ListOrdered,
  Lock,
  Maximize,
  MicVocal,
  Minimize,
  Minus,
  Music2,
  Plus,
  RotateCcw,
  StickyNote,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import { setSongStatus } from '../db/bandActions';
import { db, describeError, SONG_STATUSES, type Setlist, type Song, type SongStatus } from '../db/schema';
import { playableSongIds, STATUS_LABEL, STATUS_SHORT, statusOf } from '../lib/setlist';
import { parseDuration } from '../lib/time';
import { formatSemitones, transposeSong } from '../lib/transpose';
import { ThemeButton } from './Header';
import { PdfViewer } from './PdfViewer';
import { SongNotes } from './SongNotes';
import { Button, IconButton, Modal, StructureFlow } from './ui';

/** Hält das Display an, solange die Probeansicht offen ist (falls das Gerät es unterstützt). */
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

const STATUS_STYLE: Record<SongStatus, { icon: LucideIcon; active: string; text: string }> = {
  fix: { icon: CircleCheck, active: 'bg-ok text-on-fill', text: 'text-ok' },
  offen: { icon: CircleHelp, active: 'bg-warn text-on-fill', text: 'text-warn' },
  raus: { icon: CircleMinus, active: 'bg-stage-strong text-stage-text', text: 'text-stage-muted' },
};

/** Kompakter Umschalter für den Setlist-Status des aktuellen Songs. */
function StatusSwitch({ setlist, song }: { setlist: Setlist; song: Song }) {
  const { isAdmin } = useAdmin();
  const { toast } = useFeedback();
  const status = statusOf(setlist, song.id);

  if (!isAdmin) {
    const { icon: Icon, text } = STATUS_STYLE[status];
    return (
      <button
        type="button"
        onClick={() => toast('Den Status ändert der Admin: Menü → Admin.')}
        className={`inline-flex min-h-touch items-center gap-2 rounded-full border border-stage-line bg-stage-surface px-4 text-sm font-semibold ${text}`}
        aria-label={`Status: ${STATUS_LABEL[status]} (nur lesen)`}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
        {STATUS_LABEL[status]}
        <Lock className="h-3.5 w-3.5 text-stage-subtle" aria-hidden />
      </button>
    );
  }

  const change = async (next: SongStatus) => {
    if (next === status) return;
    try {
      await setSongStatus(setlist.id, song.id, next);
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <div role="group" aria-label="Status in der Setlist" className="inline-grid grid-cols-3 gap-1 rounded-full border border-stage-line bg-stage-surface p-1 shadow-panel">
      {SONG_STATUSES.map((option) => {
        const { icon: Icon, active } = STATUS_STYLE[option];
        const selected = option === status;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            aria-label={STATUS_LABEL[option]}
            onClick={() => change(option)}
            className={`flex min-h-touch items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors sm:px-5 ${
              selected ? active : 'text-stage-muted hover:bg-stage-raised hover:text-stage-text'
            }`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {STATUS_SHORT[option]}
          </button>
        );
      })}
    </div>
  );
}

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1 px-4 py-3.5 sm:px-5 sm:py-4">
      <span className="eyebrow">{label}</span>
      {children}
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

  // Die Reihenfolge wird beim Öffnen festgehalten: Ändert sich ein Status während der Probe,
  // bleibt der Song trotzdem an seinem Platz. Beim nächsten Öffnen gilt der neue Status.
  const [sessionIds, setSessionIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (data?.setlist && sessionIds === null) setSessionIds(playableSongIds(data.setlist));
  }, [data, sessionIds]);

  const [index, setIndex] = useState(initialIndex);
  // Transposition je Song merken, damit sie beim Vor- und Zurückblättern erhalten bleibt.
  const [transpositions, setTranspositions] = useState<Record<string, number>>({});
  const [panel, setPanel] = useState<'pdf' | 'bass' | 'drum' | 'notes' | 'list' | null>(null);

  useWakeLock();
  const fullscreen = useFullscreen();

  const songs = useMemo(() => {
    if (!data || !sessionIds) return [];
    const byId = new Map(data.songs.map((song) => [song.id, song]));
    return sessionIds.flatMap((id) => byId.get(id) ?? []);
  }, [data, sessionIds]);

  const lastIndex = songs.length - 1;
  const currentIndex = Math.min(Math.max(index, 0), Math.max(lastIndex, 0));
  const song = songs[currentIndex] ?? null;
  const nextSong = songs[currentIndex + 1] ?? null;
  const previousSong = songs[currentIndex - 1] ?? null;

  const notes = useLiveQuery(() => (song ? db.personalNotes.where('songId').equals(song.id).sortBy('updatedAt') : []), [song?.id]);

  // Richtung des letzten Blätterns – steuert die kurze Einblend-Animation.
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const indexRef = useRef(index);
  indexRef.current = currentIndex;
  const goTo = useCallback(
    (target: number) => {
      setDirection(target > indexRef.current ? 'next' : 'prev');
      setIndex(target);
      onIndexChange(target);
    },
    [onIndexChange],
  );

  // Wischen: nach links = nächster Song, nach rechts = vorheriger. Senkrechtes Scrollen bleibt unberührt.
  const swipe = useRef<{ x: number; y: number; time: number } | null>(null);
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    swipe.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY, time: Date.now() } : null;
  };

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
  const setSemitones = (value: number) => {
    if (song) setTranspositions((current) => ({ ...current, [song.id]: Math.max(-11, Math.min(11, value)) }));
  };

  if (!data || (data.setlist && !sessionIds)) return <div className="fixed inset-0 z-40 bg-stage-bg" />;

  if (!data.setlist || !song || !shown) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-stage-bg p-6 text-center">
        <Music2 className="h-10 w-10 text-stage-subtle" aria-hidden />
        <p className="text-xl font-semibold">{data.setlist ? 'In dieser Setlist ist kein Song fix oder in Abklärung.' : 'Diese Setlist gibt es nicht mehr.'}</p>
        <Button variant="primary" icon={X} onClick={onExit}>
          Zurück zu den Setlists
        </Button>
      </div>
    );
  }

  const setlist = data.setlist;
  const number = String(currentIndex + 1).padStart(2, '0');
  const beat = song.bpm ? `${(60 / song.bpm).toFixed(3)}s` : null;
  const stepButton = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-stage-muted transition-colors hover:bg-stage-raised hover:text-stage-text disabled:opacity-30';

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-stage-bg pt-safe pb-safe">
      {/* Kopf: Setlist, Position und Fortschritt als Segmente */}
      <header className="shrink-0 border-b border-stage-line bg-stage-surface">
        <div className="flex items-center gap-1 px-2 py-1.5">
          <IconButton icon={X} label="Probeansicht beenden" onClick={onExit} />
          <div className="min-w-0 flex-1 px-1 text-center">
            <div className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-stage-subtle">{setlist.name}</div>
            <div className="text-[15px] font-semibold tabular-nums">
              Song {currentIndex + 1} <span className="font-normal text-stage-subtle">von {songs.length}</span>
            </div>
          </div>
          <IconButton icon={ListOrdered} label="Setlist anzeigen" onClick={() => setPanel('list')} />
          <ThemeButton />
          {fullscreen.isSupported && (
            <IconButton icon={fullscreen.isFullscreen ? Minimize : Maximize} label={fullscreen.isFullscreen ? 'Vollbild verlassen' : 'Vollbild'} onClick={fullscreen.toggle} />
          )}
        </div>
        <div className="flex gap-[3px] px-3 pb-2" aria-hidden>
          {songs.map((entry, position) => (
            <span
              key={entry.id}
              className={`h-1 flex-1 rounded-full transition-colors ${position === currentIndex ? 'bg-brand' : position < currentIndex ? 'bg-brand/35' : 'bg-stage-line'}`}
            />
          ))}
        </div>
      </header>

      <main
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={(event) => {
          const start = swipe.current;
          swipe.current = null;
          const touch = event.changedTouches[0];
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - start.time > 700) return;
          if (dx < 0 && currentIndex < lastIndex) goTo(currentIndex + 1);
          if (dx > 0 && currentIndex > 0) goTo(currentIndex - 1);
        }}
      >
        <div
          key={song.id}
          className={`mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 ${
            direction === 'next' ? 'song-enter-next' : direction === 'prev' ? 'song-enter-prev' : ''
          }`}
        >
          {/* Song */}
          <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
            <div>
              <p className="font-mono text-sm font-semibold tracking-widest text-stage-subtle">{number}</p>
              <h2 className="mt-1 break-words text-[40px] font-bold leading-[1.04] tracking-[-0.03em] sm:text-6xl">{song.title}</h2>
              {song.artist && <p className="mt-2 text-lg text-stage-muted sm:text-xl">{song.artist}</p>}
              <div className="mt-4">
                <StatusSwitch setlist={setlist} song={song} />
              </div>
            </div>

            {/* Info-Panel: Tonart mit Transponieren, Tempo mit Puls, Lead Vocals, Dauer */}
            <section aria-label="Song-Infos" className="card grid grid-cols-2 overflow-hidden sm:grid-cols-4">
              <div className="border-b border-r border-stage-line sm:border-b-0">
                <InfoCell label="Tonart">
                  <div className="-mx-2 flex items-center">
                    <button type="button" aria-label="Einen Halbton tiefer (−1)" onClick={() => setSemitones(semitones - 1)} disabled={semitones <= -11} className={stepButton}>
                      <Minus className="h-4 w-4" aria-hidden />
                    </button>
                    <span className={`min-w-0 flex-1 text-center font-mono text-3xl font-bold leading-none sm:text-4xl ${semitones === 0 ? '' : 'text-brand'}`} aria-live="polite">
                      {shown.key || '–'}
                    </span>
                    <button type="button" aria-label="Einen Halbton höher (+1)" onClick={() => setSemitones(semitones + 1)} disabled={semitones >= 11} className={stepButton}>
                      <Plus className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  {semitones === 0 ? (
                    <span className="text-center text-xs text-stage-subtle">Original</span>
                  ) : (
                    <button type="button" onClick={() => setSemitones(0)} className="flex min-h-6 items-center justify-center gap-1 text-xs font-semibold text-brand" aria-label="Zurück zur Original-Tonart">
                      <RotateCcw className="h-3 w-3" aria-hidden />
                      {formatSemitones(semitones)} · Original {song.key}
                    </button>
                  )}
                </InfoCell>
              </div>
              <div className="border-b border-stage-line sm:border-b-0 sm:border-r">
                <InfoCell label="Tempo">
                  <span className="flex items-center gap-2.5">
                    <span className="text-3xl font-bold leading-none tabular-nums sm:text-4xl">{song.bpm ?? '–'}</span>
                    {beat && <span className="beat-dot h-2.5 w-2.5 rounded-full bg-brand" style={{ animationDuration: beat }} aria-hidden />}
                  </span>
                  <span className="text-xs text-stage-subtle">{song.bpm ? 'BPM' : 'nicht hinterlegt'}</span>
                </InfoCell>
              </div>
              <div className="border-r border-stage-line">
                <InfoCell label="Lead Vocals">
                  <span className="flex min-w-0 items-center gap-2 text-2xl font-bold leading-tight sm:text-3xl">
                    {song.leadVocals ? (
                      <>
                        <MicVocal className="h-5 w-5 shrink-0 text-stage-subtle" aria-hidden />
                        <span className="truncate">{song.leadVocals}</span>
                      </>
                    ) : (
                      <span className="text-stage-subtle">–</span>
                    )}
                  </span>
                </InfoCell>
              </div>
              <div>
                <InfoCell label="Dauer">
                  <span className="text-3xl font-bold leading-none tabular-nums sm:text-4xl">{song.duration || '–'}</span>
                  <span className="text-xs text-stage-subtle">Minuten</span>
                </InfoCell>
              </div>
            </section>

            {shown.structure && (
              <section>
                <h3 className="eyebrow mb-2">Song-Ablauf</h3>
                <StructureFlow structure={shown.structure} size="xl" />
              </section>
            )}
          </div>

          {/* Werkzeuge und Notiz – im Querformat als rechte Spalte */}
          <aside className="flex min-w-0 flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
              <Button variant="primary" icon={FileText} className="min-h-14 px-2 text-base lg:justify-start lg:px-5" disabled={!song.pdfName} onClick={() => setPanel('pdf')} aria-label={song.pdfName ? 'PDF-Leadsheet' : 'Kein PDF'}>
                <span className="lg:hidden">{song.pdfName ? 'Leadsheet' : 'Kein PDF'}</span>
                <span className="hidden lg:inline">{song.pdfName ? 'PDF-Leadsheet' : 'Kein PDF'}</span>
              </Button>
              <Button icon={Guitar} className="min-h-14 px-2 text-base lg:justify-start lg:px-5" disabled={!song.bassSheetName} onClick={() => setPanel('bass')} aria-label={song.bassSheetName ? 'Bass Sheet' : 'Kein Bass Sheet'}>
                <span className="lg:hidden">{song.bassSheetName ? 'Bass' : 'Kein Bass'}</span>
                <span className="hidden lg:inline">{song.bassSheetName ? 'Bass Sheet' : 'Kein Bass Sheet'}</span>
              </Button>
              <Button icon={Drum} className="min-h-14 px-2 text-base lg:justify-start lg:px-5" disabled={!song.drumSheetName} onClick={() => setPanel('drum')} aria-label={song.drumSheetName ? 'Drum Sheet' : 'Kein Drum Sheet'}>
                <span className="lg:hidden">{song.drumSheetName ? 'Drums' : 'Keine Drums'}</span>
                <span className="hidden lg:inline">{song.drumSheetName ? 'Drum Sheet' : 'Kein Drum Sheet'}</span>
              </Button>
              <Button icon={StickyNote} className="min-h-14 px-2 text-base lg:justify-start lg:px-5" onClick={() => setPanel('notes')}>
                Notiz{notes && notes.length > 0 ? ` (${notes.length})` : ''}
              </Button>
            </div>

            {notes && notes.length > 0 && (
              <button
                type="button"
                onClick={() => setPanel('notes')}
                className="rounded-xl border border-amber-300/70 bg-amber-100 px-4 py-3 text-left text-amber-950 shadow-panel transition-colors hover:bg-amber-200/80 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
              >
                <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">
                  <StickyNote className="h-3.5 w-3.5" aria-hidden /> Meine Notiz
                </span>
                {notes.map((note) => (
                  <span key={note.id} className="block whitespace-pre-wrap break-words text-lg font-medium leading-snug">
                    {note.text}
                  </span>
                ))}
              </button>
            )}
          </aside>
        </div>
      </main>

      {/* Fuß: Vorschau und große Blätter-Knöpfe */}
      <footer className="shrink-0 border-t border-stage-line bg-stage-surface px-3 pb-3 pt-2.5 sm:px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-2.5 flex min-h-7 items-center justify-center gap-2 px-1 text-center text-[15px]">
            {nextSong ? (
              <p className="min-w-0 truncate">
                <span className="eyebrow mr-2">Als Nächstes</span>
                <span className="font-semibold">{nextSong.title}</span>
                {nextKey && <span className="font-mono text-stage-muted"> · {nextKey}</span>}
                {nextSong.leadVocals && <span className="text-stage-muted"> · {nextSong.leadVocals}</span>}
              </p>
            ) : (
              <p className="font-semibold text-stage-muted">Letzter Song der Setlist</p>
            )}
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button
              type="button"
              disabled={!previousSong}
              onClick={() => goTo(currentIndex - 1)}
              aria-label="Vorheriger Song"
              className="flex min-h-[72px] min-w-0 items-center justify-center gap-1 rounded-2xl border border-stage-line bg-stage-raised px-2 text-lg font-semibold transition-colors hover:bg-stage-hover disabled:opacity-30 sm:min-h-20"
            >
              <ChevronLeft className="h-7 w-7 shrink-0" aria-hidden /> Zurück
            </button>
            <button
              type="button"
              disabled={!nextSong}
              onClick={() => goTo(currentIndex + 1)}
              aria-label="Nächster Song"
              className="flex min-h-[72px] min-w-0 items-center justify-center gap-1.5 rounded-2xl bg-brand px-3 text-xl font-bold text-on-fill shadow-panel transition-colors hover:bg-brand-strong disabled:bg-stage-raised disabled:text-stage-subtle disabled:shadow-none sm:min-h-20"
            >
              Weiter <ChevronRight className="h-7 w-7 shrink-0" aria-hidden />
            </button>
          </div>
        </div>
      </footer>

      {panel === 'pdf' && <PdfViewer songId={song.id} title={song.title} durationSeconds={parseDuration(song.duration)} onClose={() => setPanel(null)} />}

      {panel === 'bass' && (
        <PdfViewer
          songId={song.id}
          title={`${song.title} · Bass Sheet`}
          source="bass"
          durationSeconds={parseDuration(song.duration)}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'drum' && (
        <PdfViewer
          songId={song.id}
          title={`${song.title} · Drum Sheet`}
          source="drum"
          durationSeconds={parseDuration(song.duration)}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'notes' && (
        <Modal title="Meine Notizen" subtitle={song.title} onClose={() => setPanel(null)}>
          <div className="p-5">
            <SongNotes song={song} />
          </div>
        </Modal>
      )}

      {panel === 'list' && (
        <Modal title={setlist.name} subtitle={`${songs.length} Songs`} onClose={() => setPanel(null)}>
          <ol className="flex flex-col gap-1 p-3">
            {songs.map((entry, position) => {
              const isCurrent = position === currentIndex;
              const status = statusOf(setlist, entry.id);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => {
                      goTo(position);
                      setPanel(null);
                    }}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors ${isCurrent ? 'bg-brand/10 text-brand' : 'hover:bg-stage-raised'}`}
                  >
                    <span className={`w-7 shrink-0 text-center text-sm font-semibold tabular-nums ${isCurrent ? '' : 'text-stage-subtle'}`}>
                      {String(position + 1).padStart(2, '0')}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-base font-semibold ${status === 'raus' ? 'line-through opacity-60' : ''}`}>{entry.title}</span>
                    {status !== 'fix' && <span className={`text-xs font-semibold ${STATUS_STYLE[status].text}`}>{STATUS_SHORT[status]}</span>}
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
