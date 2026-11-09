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
import { Check, GripVertical, ListMusic, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import { createSetlist, deleteSetlist, renameSetlist, setSetlistSongs } from '../db/bandActions';
import { db, describeError, type Setlist, type Song } from '../db/schema';
import { formatTotalDuration, sumDurations } from '../lib/time';
import { Badge, Button, EmptyState, IconButton, InfoNote, Modal, PageHeader } from './ui';

const STANDARD_TUNING = 'Standard E';

function resolveSongs(setlist: Setlist, songsById: Map<string, Song>): Song[] {
  return setlist.songIds.flatMap((id) => songsById.get(id) ?? []);
}

function countTuningChanges(songs: Song[]): number {
  let changes = 0;
  for (let i = 1; i < songs.length; i++) {
    if ((songs[i].tuning || STANDARD_TUNING) !== (songs[i - 1].tuning || STANDARD_TUNING)) changes += 1;
  }
  return changes;
}

function SetlistMeta({ songs, compact = false }: { songs: Song[]; compact?: boolean }) {
  const { seconds, missing } = sumDurations(songs.map((song) => song.duration));
  const changes = countTuningChanges(songs);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-stage-muted">
      <span className="font-semibold tabular-nums text-neon">{formatTotalDuration(seconds)}</span>
      <span aria-hidden>·</span>
      <span>
        {songs.length} {songs.length === 1 ? 'Song' : 'Songs'}
      </span>
      {!compact && changes > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="text-warn">
            {changes} {changes === 1 ? 'Umstimmung' : 'Umstimmungen'}
          </span>
        </>
      )}
      {missing > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="text-warn">{missing} ohne Dauer</span>
        </>
      )}
    </span>
  );
}

/** Spalten der Song-Liste: auf breiten Bildschirmen tabellarisch, auf dem Handy unter dem Titel. */
function SongColumns({ song }: { song: Song }) {
  const tuning = song.tuning && song.tuning !== STANDARD_TUNING ? song.tuning : '';
  return (
    <>
      <span className="hidden w-14 font-mono text-sm font-semibold text-neon sm:block">{song.key || '–'}</span>
      <span className="hidden w-16 text-sm tabular-nums text-signal sm:block">{song.bpm ?? '–'}</span>
      <span className="hidden w-28 truncate text-sm font-medium text-warn md:block">{tuning}</span>
      <span className="hidden w-12 text-right text-sm tabular-nums text-stage-muted sm:block">{song.duration || '–'}</span>
    </>
  );
}

function SongTitleCell({ song, position }: { song: Song; position: number }) {
  const tuning = song.tuning && song.tuning !== STANDARD_TUNING ? song.tuning : '';
  return (
    <>
      <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-stage-subtle">{String(position).padStart(2, '0')}</span>
      <span className="min-w-0 flex-1 py-2">
        <span className="block truncate font-medium">{song.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-1.5 sm:hidden">
          {song.key && <Badge tone="green">{song.key}</Badge>}
          {song.bpm !== null && <Badge tone="cyan">{song.bpm} BPM</Badge>}
          {tuning && <Badge tone="amber">{tuning}</Badge>}
          {song.duration && <Badge>{song.duration}</Badge>}
        </span>
        {tuning && <span className="mt-0.5 hidden truncate text-xs font-medium text-warn sm:block md:hidden">{tuning}</span>}
      </span>
    </>
  );
}

function ListHead({ withHandle }: { withHandle: boolean }) {
  return (
    <div className="eyebrow hidden items-center gap-2 px-2 pb-2 sm:flex" aria-hidden>
      {withHandle && <span className="w-12" />}
      <span className="w-7 text-center">#</span>
      <span className="flex-1">Titel</span>
      <span className="w-14">Tonart</span>
      <span className="w-16">BPM</span>
      <span className="hidden w-28 md:block">Stimmung</span>
      <span className="w-12 text-right">Dauer</span>
      {withHandle && <span className="w-12" />}
    </div>
  );
}

function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-touch items-center gap-2 px-2 ${className}`}>{children}</div>;
}

function SortableSongRow({ song, position, onRemove }: { song: Song; position: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: song.id });
  return (
    <li
      ref={setNodeRef}
      data-setlist-row={song.title}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-lg border bg-stage-surface ${isDragging ? 'relative z-10 border-neon shadow-pop' : 'border-transparent hover:border-stage-line'}`}
    >
      <Row className="pl-0 pr-0">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`„${song.title}“ verschieben`}
          title="Ziehen zum Sortieren"
          className="flex h-12 w-12 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-stage-subtle hover:text-stage-text active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" aria-hidden />
        </button>
        <SongTitleCell song={song} position={position} />
        <SongColumns song={song} />
        <IconButton icon={X} label={`„${song.title}“ aus der Setlist entfernen`} onClick={onRemove} />
      </Row>
    </li>
  );
}

function AddSongsModal({ setlist, songs, onClose }: { setlist: Setlist; songs: Song[]; onClose: () => void }) {
  const { toast } = useFeedback();
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase('de');
  const candidates = songs
    .filter((song) => !setlist.songIds.includes(song.id))
    .filter((song) => !term || `${song.title} ${song.artist}`.toLocaleLowerCase('de').includes(term))
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));

  const add = async (song: Song) => {
    try {
      await setSetlistSongs(setlist.id, [...setlist.songIds, song.id]);
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <Modal title="Songs hinzufügen" subtitle={setlist.name} onClose={onClose}>
      <div className="flex min-h-full flex-col gap-3 p-5">
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
                className="flex min-h-touch w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-stage-raised"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neon/10 text-neon">
                  <Plus className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{song.title}</span>
                  {song.artist && <span className="block truncate text-sm text-stage-muted">{song.artist}</span>}
                </span>
                {song.key && <span className="font-mono text-sm text-neon">{song.key}</span>}
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
  const [editingName, setEditingName] = useState<string | null>(null);
  // Sofortiges Umsortieren in der Anzeige, bis die Datenbank bestätigt hat – verhindert ein Zurückspringen.
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

  useEffect(() => setOptimisticOrder(null), [setlist.songIds]);

  const shownSetlist = optimisticOrder ? { ...setlist, songIds: optimisticOrder } : setlist;
  const songs = resolveSongs(shownSetlist, songsById);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 80, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = songs.map((song) => song.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOptimisticOrder(next);
    try {
      await setSetlistSongs(setlist.id, next);
    } catch (error) {
      setOptimisticOrder(null);
      toast(describeError(error), 'error');
    }
  };

  const removeSong = async (songId: string) => {
    try {
      await setSetlistSongs(setlist.id, setlist.songIds.filter((id) => id !== songId));
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

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
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-stage-line p-4 sm:flex-row sm:items-center sm:p-5">
        {editingName !== null && isAdmin ? (
          <form onSubmit={saveName} className="flex min-w-0 flex-1 gap-2">
            <input
              className="field font-semibold"
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              aria-label="Name der Setlist"
              autoFocus
            />
            <IconButton icon={Check} label="Namen speichern" variant="primary" type="submit" disabled={!editingName.trim()} />
            <IconButton icon={X} label="Abbrechen" onClick={() => setEditingName(null)} />
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Setlist</p>
              <h3 className="break-words text-xl font-bold tracking-tight sm:text-2xl">{setlist.name}</h3>
              <SetlistMeta songs={songs} />
            </div>
            {isAdmin && (
              <div className="flex shrink-0">
                <IconButton icon={Pencil} label="Setlist umbenennen" onClick={() => setEditingName(setlist.name)} />
                <IconButton icon={Trash2} label="Setlist löschen" variant="danger" onClick={remove} />
              </div>
            )}
          </div>
        )}
        <Button variant="primary" icon={Play} onClick={onStartStage} disabled={songs.length === 0} className="sm:shrink-0">
          Bühnenansicht starten
        </Button>
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
            <ListHead withHandle={isAdmin} />
            {isAdmin ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={songs.map((song) => song.id)} strategy={verticalListSortingStrategy}>
                  <ol className="flex flex-col gap-0.5">
                    {songs.map((song, index) => (
                      <SortableSongRow key={song.id} song={song} position={index + 1} onRemove={() => removeSong(song.id)} />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            ) : (
              <ol className="flex flex-col divide-y divide-stage-line/60">
                {songs.map((song, index) => (
                  <li key={song.id} data-setlist-row={song.title}>
                    <Row>
                      <SongTitleCell song={song} position={index + 1} />
                      <SongColumns song={song} />
                    </Row>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        {isAdmin && (
          <Button variant="ghost" icon={Plus} onClick={() => setAdding(true)} className="mt-1 w-full justify-start text-neon hover:text-neon">
            Songs hinzufügen
          </Button>
        )}
      </div>

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
          <input
            className="field"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Name, z. B. Acoustic Set"
            aria-label="Name der neuen Setlist"
            autoFocus
          />
          <IconButton icon={Check} label="Setlist anlegen" variant="primary" type="submit" disabled={!newName.trim()} />
          <IconButton icon={X} label="Abbrechen" onClick={() => setNewName(null)} />
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState icon={ListMusic} title="Noch keine Setlists">
          {isAdmin ? 'Erstelle mit „Neue Setlist“ die erste Setlist.' : 'Lade im Bereich „Daten-Sync“ den aktuellen Band-Stand.'}
        </EmptyState>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6">
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
                      <SetlistMeta songs={resolveSongs(setlist, songsById)} compact />
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
            Nur Lesen – Änderungen an Setlists sind im Admin-Bearbeitungsmodus möglich.
          </InfoNote>
        </div>
      )}
    </section>
  );
}
