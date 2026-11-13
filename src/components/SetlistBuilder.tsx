import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  GripVertical,
  ListMusic,
  MicVocal,
  Music,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import { addSongToSetlist, createSetlist, deleteSetlist, renameSetlist, setSetlistSongs, setSongStatus } from '../db/bandActions';
import { db, describeError, SONG_STATUSES, type Setlist, type Song, type SongStatus } from '../db/schema';
import { groupByStatus, reorderWithinGroup, resolveSongs, STATUS_LABEL, STATUS_SHORT } from '../lib/setlist';
import { formatTotalDuration, sumDurations } from '../lib/time';
import { PlaylistModal } from './Playlist';
import { NoteButton } from './SongNotes';
import { Badge, Button, EmptyState, IconButton, InfoNote, Modal, PageHeader } from './ui';


const STATUS_STYLE: Record<SongStatus, { icon: LucideIcon; color: string; dot: string; description: string }> = {
  fix: { icon: CircleCheck, color: 'text-ok', dot: 'bg-ok', description: 'Wird gespielt' },
  offen: { icon: CircleHelp, color: 'text-warn', dot: 'bg-warn', description: 'Noch nicht entschieden' },
  raus: { icon: CircleMinus, color: 'text-stage-subtle', dot: 'bg-stage-strong', description: 'Steht zur Wahl, wird nicht gespielt' },
};

function SetlistMeta({ setlist, songsById, compact = false }: { setlist: Setlist; songsById: Map<string, Song>; compact?: boolean }) {
  const groups = groupByStatus(setlist, resolveSongs(setlist, songsById));
  const fix = sumDurations(groups.fix.map((song) => song.duration));
  const offen = sumDurations(groups.offen.map((song) => song.duration));
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-stage-muted">
      <span className="font-semibold tabular-nums text-brand">{formatTotalDuration(fix.seconds)}</span>
      <span aria-hidden>·</span>
      <span>
        {groups.fix.length} {groups.fix.length === 1 ? 'Song fix' : 'Songs fix'}
      </span>
      {groups.offen.length > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="text-warn">
            {groups.offen.length} in Abklärung{offen.seconds > 0 && !compact ? ` (+${formatTotalDuration(offen.seconds)})` : ''}
          </span>
        </>
      )}
      {!compact && fix.missing > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="text-warn">{fix.missing} ohne Dauer</span>
        </>
      )}
    </span>
  );
}

/** Spalten der Song-Liste: auf breiten Bildschirmen tabellarisch, auf dem Handy unter dem Titel. */
function SongColumns({ song }: { song: Song }) {
  return (
    <>
      <span className="hidden w-14 font-mono text-sm font-semibold text-brand sm:block">{song.key || '–'}</span>
      <span className="hidden w-14 text-sm tabular-nums text-accent sm:block">{song.bpm ?? '–'}</span>
      <span className="hidden w-24 truncate text-sm font-medium lg:block">{song.leadVocals || <span className="font-normal text-stage-subtle">–</span>}</span>
      <span className="hidden w-12 text-right text-sm tabular-nums text-stage-muted sm:block">{song.duration || '–'}</span>
    </>
  );
}

function SongTitleCell({ song, position, muted }: { song: Song; position: number | null; muted: boolean }) {
  return (
    <>
      <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-stage-subtle">
        {position === null ? '–' : String(position).padStart(2, '0')}
      </span>
      <span className="min-w-0 flex-1 py-2">
        <span className={`block truncate font-medium ${muted ? 'text-stage-muted' : ''}`}>{song.title}</span>
        {song.artist && <span className="hidden truncate text-xs text-stage-subtle sm:block">{song.artist}</span>}
        <span className="mt-0.5 flex flex-wrap gap-1.5 sm:hidden">
          {song.key && <Badge tone="green">{song.key}</Badge>}
          {song.bpm !== null && <Badge tone="cyan">{song.bpm} BPM</Badge>}
          {song.leadVocals && (
            <Badge>
              <MicVocal className="h-3 w-3" aria-hidden /> {song.leadVocals}
            </Badge>
          )}
          {song.duration && <Badge>{song.duration}</Badge>}
        </span>
        {song.leadVocals && <span className="mt-0.5 hidden truncate text-xs font-medium text-stage-muted sm:block lg:hidden">Lead: {song.leadVocals}</span>}
      </span>
    </>
  );
}

function ListHead({ editable }: { editable: boolean }) {
  return (
    <div className="eyebrow hidden items-center gap-2 px-2 pb-1 sm:flex" aria-hidden>
      {editable && <span className="w-12" />}
      <span className="w-7 text-center">#</span>
      <span className="flex-1">Titel</span>
      <span className="w-14">Tonart</span>
      <span className="w-14">BPM</span>
      <span className="hidden w-24 lg:block">Lead</span>
      <span className="w-12 text-right">Dauer</span>
      <span className="w-12 text-center">Notiz</span>
      {editable && <span className="w-12 sm:w-[7.5rem]" />}
    </div>
  );
}

/** Status-Knopf mit Menü: fix, in Abklärung, nicht in Setlist – oder ganz entfernen. */
function StatusMenu({ status, songTitle, onSelect, onRemove }: { status: SongStatus; songTitle: string; onSelect: (status: SongStatus) => void; onRemove: () => void }) {
  const [open, setOpen] = useState<'down' | 'up' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { icon: Icon, color } = STATUS_STYLE[status];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setOpen(null);
    const rect = ref.current?.getBoundingClientRect();
    // Unten im Bild klappt das Menü nach oben auf, damit es nicht unter der Navigationsleiste verschwindet.
    setOpen(rect && window.innerHeight - rect.bottom < 300 ? 'up' : 'down');
  };

  const choose = (action: () => void) => {
    setOpen(null);
    action();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-label={`Status von „${songTitle}“: ${STATUS_LABEL[status]}`}
        title="Status ändern"
        className={`flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors hover:bg-stage-raised sm:w-[7.5rem] sm:justify-start sm:border sm:border-stage-line sm:px-2.5 ${color}`}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden />
        <span className="hidden flex-1 truncate text-left sm:inline">{STATUS_SHORT[status]}</span>
        <ChevronDown className="hidden h-4 w-4 shrink-0 text-stage-subtle sm:block" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Status für „${songTitle}“`}
          className={`absolute right-0 z-40 w-64 rounded-xl border border-stage-line bg-stage-surface p-1 shadow-pop ${open === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {SONG_STATUSES.map((option) => {
            const style = STATUS_STYLE[option];
            const OptionIcon = style.icon;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={option === status}
                onClick={() => choose(() => onSelect(option))}
                className={`flex min-h-touch w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-stage-raised ${option === status ? 'bg-stage-raised' : ''}`}
              >
                <OptionIcon className={`h-5 w-5 shrink-0 ${style.color}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{STATUS_LABEL[option]}</span>
                  <span className="block text-xs text-stage-muted">{style.description}</span>
                </span>
                {option === status && <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />}
              </button>
            );
          })}
          <div className="my-1 border-t border-stage-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(onRemove)}
            className="flex min-h-touch w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <X className="h-5 w-5 shrink-0" aria-hidden />
            Aus der Setlist entfernen
          </button>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  song: Song;
  status: SongStatus;
  position: number | null;
  hasNote: boolean;
  editable: boolean;
  onStatus: (status: SongStatus) => void;
  onRemove: () => void;
  handle?: ReactNode;
}

function RowContent({ song, status, position, hasNote, editable, onStatus, onRemove, handle }: RowProps) {
  return (
    <div className="flex min-h-touch items-center gap-1 sm:gap-2">
      {handle}
      <SongTitleCell song={song} position={position} muted={status === 'raus'} />
      <SongColumns song={song} />
      <NoteButton song={song} hasNote={hasNote} />
      {editable && <StatusMenu status={status} songTitle={song.title} onSelect={onStatus} onRemove={onRemove} />}
    </div>
  );
}

function SortableSongRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.song.id });
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      aria-label={`„${props.song.title}“ verschieben`}
      title="Ziehen zum Sortieren"
      className="flex h-12 w-12 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-stage-subtle hover:text-stage-text active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-5 w-5" aria-hidden />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      data-setlist-row={props.song.title}
      data-status={props.status}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-lg border bg-stage-surface ${isDragging ? 'relative z-10 border-brand shadow-pop' : 'border-transparent hover:border-stage-line'}`}
    >
      <RowContent {...props} handle={handle} />
    </li>
  );
}

interface SectionProps {
  setlist: Setlist;
  status: SongStatus;
  songs: Song[];
  startAt: number | null;
  editable: boolean;
  noteSongIds: Set<string>;
  collapsible?: boolean;
}

function StatusSection({ setlist, status, songs, startAt, editable, noteSongIds, collapsible = false }: SectionProps) {
  const { toast } = useFeedback();
  const [collapsed, setCollapsed] = useState(collapsible);
  // Sofortiges Umsortieren in der Anzeige, bis die Datenbank bestätigt hat – verhindert ein Zurückspringen.
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  useEffect(() => setOptimistic(null), [setlist.songIds]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 80, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (songs.length === 0) return null;
  const byId = new Map(songs.map((song) => [song.id, song]));
  const shown = optimistic ? optimistic.flatMap((id) => byId.get(id) ?? []) : songs;
  const { seconds } = sumDurations(shown.map((song) => song.duration));
  const style = STATUS_STYLE[status];

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = shown.map((song) => song.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOptimistic(next);
    try {
      await setSetlistSongs(setlist.id, reorderWithinGroup(setlist.songIds, next));
    } catch (error) {
      setOptimistic(null);
      toast(describeError(error), 'error');
    }
  };

  const rowProps = (song: Song, index: number): RowProps => ({
    song,
    status,
    position: startAt === null ? null : startAt + index,
    hasNote: noteSongIds.has(song.id),
    editable,
    onStatus: (next) => run(() => setSongStatus(setlist.id, song.id, next)),
    onRemove: () => run(() => setSetlistSongs(setlist.id, setlist.songIds.filter((id) => id !== song.id))),
  });

  const heading = (
    <span className="flex min-w-0 items-center gap-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
      <span className="font-semibold">{STATUS_LABEL[status]}</span>
      <span className="text-sm font-normal text-stage-muted">
        {songs.length} {songs.length === 1 ? 'Song' : 'Songs'}
        {seconds > 0 && status !== 'raus' ? ` · ${formatTotalDuration(seconds)}` : ''}
      </span>
    </span>
  );

  return (
    <section aria-label={STATUS_LABEL[status]} className="pt-3 first:pt-1">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          className="flex min-h-touch w-full items-center justify-between gap-2 rounded-lg px-2 text-left hover:bg-stage-raised"
        >
          {heading}
          <ChevronDown className={`h-5 w-5 shrink-0 text-stage-subtle transition-transform ${collapsed ? '' : 'rotate-180'}`} aria-hidden />
        </button>
      ) : (
        <h4 className="flex min-h-10 items-center px-2">{heading}</h4>
      )}

      {!collapsed &&
        (editable ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={shown.map((song) => song.id)} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col gap-0.5">
                {shown.map((song, index) => (
                  <SortableSongRow key={song.id} {...rowProps(song, index)} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        ) : (
          <ol className="flex flex-col divide-y divide-stage-line/60">
            {shown.map((song, index) => (
              <li key={song.id} data-setlist-row={song.title} data-status={status} className="px-1">
                <RowContent {...rowProps(song, index)} />
              </li>
            ))}
          </ol>
        ))}
    </section>
  );
}

function AddSongsModal({ setlist, songs, onClose }: { setlist: Setlist; songs: Song[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [search, setSearch] = useState('');
  const [addAs, setAddAs] = useState<SongStatus>('fix');
  const term = search.trim().toLocaleLowerCase('de');
  const candidates = songs
    .filter((song) => !setlist.songIds.includes(song.id))
    .filter((song) => !term || `${song.title} ${song.artist}`.toLocaleLowerCase('de').includes(term))
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));

  const add = async (song: Song) => {
    try {
      await addSongToSetlist(setlist.id, song.id, addAs);
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <Modal title="Songs hinzufügen" subtitle={setlist.name} onClose={onClose}>
      <div className="flex min-h-full flex-col gap-3 p-5">
        <div>
          <span className="field-label">Hinzufügen als</span>
          <div role="group" aria-label="Status für neue Songs" className="grid grid-cols-3 gap-1 rounded-lg border border-stage-line bg-stage-bg p-1">
            {SONG_STATUSES.map((option) => {
              const style = STATUS_STYLE[option];
              const OptionIcon = style.icon;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={addAs === option}
                  onClick={() => setAddAs(option)}
                  className={`flex min-h-touch items-center justify-center gap-1.5 rounded-md px-2 text-sm font-semibold transition-colors ${
                    addAs === option ? 'bg-stage-surface shadow-panel' : 'text-stage-muted hover:text-stage-text'
                  }`}
                >
                  <OptionIcon className={`h-4 w-4 shrink-0 ${style.color}`} aria-hidden />
                  {STATUS_SHORT[option]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-stage-subtle" aria-hidden />
          <input
            className="field pl-11"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Song suchen …"
            aria-label="Songs durchsuchen"
          />
        </div>
        {candidates.length === 0 && (
          <p className="py-8 text-center text-sm text-stage-muted">
            {songs.length === 0 ? 'Lege zuerst im Bereich „Songs & PDFs“ einen Song an.' : 'Keine weiteren Songs verfügbar.'}
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {candidates.map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => add(song)}
                aria-label={`„${song.title}“ als ${STATUS_LABEL[addAs]} hinzufügen`}
                className="flex min-h-touch w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-stage-raised"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <Plus className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{song.title}</span>
                  {song.artist && <span className="block truncate text-sm text-stage-muted">{song.artist}</span>}
                </span>
                {song.key && <span className="font-mono text-sm text-brand">{song.key}</span>}
                {song.duration && <span className="w-12 text-right text-sm tabular-nums text-stage-muted">{song.duration}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="sticky bottom-0 mt-auto bg-stage-surface pt-2">
          <Button variant="primary" icon={Check} onClick={onClose} className="w-full">
            Fertig
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SetlistDetail({ setlist, songsById, onStartStage }: { setlist: Setlist; songsById: Map<string, Song>; onStartStage: () => void }) {
  const { isAdmin } = useAdmin();
  const { toast, confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const noteSongIds = useLiveQuery(async () => new Set((await db.personalNotes.toArray()).map((note) => note.songId)), [], new Set<string>());

  const songs = resolveSongs(setlist, songsById);
  const groups = groupByStatus(setlist, songs);
  const playable = groups.fix.length + groups.offen.length;

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    const name = editingName?.trim();
    if (!name) return;
    try {
      await renameSetlist(setlist.id, name);
      setEditingName(null);
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  const remove = async () => {
    const confirmed = await confirm({
      title: 'Setlist löschen?',
      message: `„${setlist.name}“ wird gelöscht. Die Songs selbst bleiben erhalten.`,
      confirmLabel: 'Setlist löschen',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteSetlist(setlist.id);
      toast('Setlist gelöscht.');
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <div className="card min-w-0">
      <div className="flex flex-col gap-4 border-b border-stage-line p-4 sm:flex-row sm:items-center sm:p-5">
        {editingName !== null && isAdmin ? (
          <form onSubmit={saveName} className="flex min-w-0 flex-1 gap-2">
            <input className="field font-semibold" value={editingName} onChange={(event) => setEditingName(event.target.value)} aria-label="Name der Setlist" autoFocus />
            <IconButton icon={Check} label="Namen speichern" variant="primary" type="submit" disabled={!editingName.trim()} />
            <IconButton icon={X} label="Abbrechen" onClick={() => setEditingName(null)} />
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Setlist</p>
              <h3 className="break-words text-xl font-bold tracking-tight sm:text-2xl">{setlist.name}</h3>
              <SetlistMeta setlist={setlist} songsById={songsById} />
            </div>
            {isAdmin && (
              <div className="flex shrink-0">
                <IconButton icon={Pencil} label="Setlist umbenennen" onClick={() => setEditingName(setlist.name)} />
                <IconButton icon={Trash2} label="Setlist löschen" variant="danger" onClick={remove} />
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:shrink-0">
          <Button variant="primary" icon={Play} onClick={onStartStage} disabled={playable === 0}>
            Probeansicht starten
          </Button>
          <Button icon={Music} onClick={() => setPlaylistOpen(true)} disabled={songs.length === 0} aria-label="Als Playlist (Spotify, Apple Music)" title="Als Playlist für Spotify oder Apple Music">
            Playlist
          </Button>
        </div>
      </div>

      <div className="p-2 sm:p-3">
        {songs.length === 0 ? (
          <div className="p-2">
            <EmptyState icon={ListMusic} title="Diese Setlist ist leer">
              {isAdmin ? 'Füge die ersten Songs hinzu.' : 'Der Admin hat hier noch keine Songs eingetragen.'}
            </EmptyState>
          </div>
        ) : (
          <>
            <ListHead editable={isAdmin} />
            <StatusSection setlist={setlist} status="fix" songs={groups.fix} startAt={1} editable={isAdmin} noteSongIds={noteSongIds} />
            <StatusSection setlist={setlist} status="offen" songs={groups.offen} startAt={groups.fix.length + 1} editable={isAdmin} noteSongIds={noteSongIds} />
            <StatusSection setlist={setlist} status="raus" songs={groups.raus} startAt={null} editable={isAdmin} noteSongIds={noteSongIds} collapsible />
          </>
        )}

        {isAdmin && (
          <Button variant="ghost" icon={Plus} onClick={() => setAdding(true)} className="mt-2 w-full justify-start text-brand hover:text-brand">
            Songs hinzufügen
          </Button>
        )}
      </div>

      {playlistOpen && <PlaylistModal setlist={setlist} songsById={songsById} onClose={() => setPlaylistOpen(false)} />}
      {adding && <AddSongsModal setlist={setlist} songs={[...songsById.values()]} onClose={() => setAdding(false)} />}
    </div>
  );
}

export function SetlistBuilder({ onStartStage }: { onStartStage: (setlistId: string) => void }) {
  const { isAdmin } = useAdmin();
  const { toast } = useFeedback();
  const setlists = useLiveQuery(() => db.setlists.toArray(), []);
  const songs = useLiveQuery(() => db.songs.toArray(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);

  const songsById = useMemo(() => new Map((songs ?? []).map((song) => [song.id, song])), [songs]);

  if (!setlists || !songs) return null;

  const sorted = [...setlists].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const selected = sorted.find((setlist) => setlist.id === selectedId) ?? sorted[0] ?? null;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName?.trim();
    if (!name) return;
    try {
      setSelectedId(await createSetlist(name));
      setNewName(null);
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <section>
      <PageHeader
        title="Setlists"
        description="Konzertabläufe planen und auf der Bühne abrufen."
        action={
          isAdmin &&
          newName === null && (
            <Button variant="primary" icon={Plus} onClick={() => setNewName('')}>
              Neue Setlist
            </Button>
          )
        }
      />

      {isAdmin && newName !== null && (
        <form onSubmit={create} className="card mb-4 flex gap-2 p-3">
          <input className="field" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Name, z. B. Acoustic Set" aria-label="Name der neuen Setlist" autoFocus />
          <IconButton icon={Check} label="Setlist anlegen" variant="primary" type="submit" disabled={!newName.trim()} />
          <IconButton icon={X} label="Abbrechen" onClick={() => setNewName(null)} />
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState icon={ListMusic} title="Noch keine Setlists">
          {isAdmin ? 'Erstelle mit „Neue Setlist“ die erste Setlist.' : 'Lade im Bereich „Daten-Sync“ den aktuellen Band-Stand.'}
        </EmptyState>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
          {/* Handy: waagerecht wischbar, ab Desktop als Seitenleiste */}
          <ul
            className={`no-scrollbar -mx-4 gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 ${sorted.length > 1 ? 'flex' : 'hidden'}`}
            aria-label="Setlists"
          >
            {sorted.map((setlist) => {
              const isActive = setlist.id === selected?.id;
              return (
                <li key={setlist.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => setSelectedId(setlist.id)}
                    className={`flex min-h-touch w-full flex-col justify-center rounded-lg border px-3 py-2 text-left transition-colors ${
                      isActive ? 'border-stage-strong bg-stage-raised' : 'border-stage-line bg-stage-surface hover:bg-stage-raised lg:border-transparent lg:bg-transparent'
                    }`}
                  >
                    <span className={`block max-w-56 truncate text-sm font-semibold ${isActive ? 'text-stage-text' : 'text-stage-muted'}`}>{setlist.name}</span>
                    <span className="hidden lg:block">
                      <SetlistMeta setlist={setlist} songsById={songsById} compact />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && <SetlistDetail key={selected.id} setlist={selected} songsById={songsById} onStartStage={() => onStartStage(selected.id)} />}
        </div>
      )}

      {!isAdmin && sorted.length > 0 && (
        <div className="mt-6">
          <InfoNote icon={ListMusic} tone="amber">
            Nur Lesen – Reihenfolge und Status pflegt der Admin. Den gelben Zettel kannst du immer nutzen: Deine Notizen bleiben auf diesem Gerät.
          </InfoNote>
        </div>
      )}
    </section>
  );
}
