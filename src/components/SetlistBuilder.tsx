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
import { Check, Clock, GripVertical, ListMusic, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import { createSetlist, deleteSetlist, renameSetlist, setSetlistSongs } from '../db/bandActions';
import { db, describeError, type Setlist, type Song } from '../db/schema';
import { formatTotalDuration, sumDurations } from '../lib/time';
import { Badge, Button, EmptyState, IconButton, Modal, SectionTitle } from './ui';

function resolveSongs(setlist: Setlist, songsById: Map<string, Song>): Song[] {
  return setlist.songIds.flatMap((id) => songsById.get(id) ?? []);
}

function DurationSummary({ songs }: { songs: Song[] }) {
  const { seconds, missing } = sumDurations(songs.map((song) => song.duration));
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-sm text-stage-muted">
      <span className="inline-flex items-center gap-1 font-semibold text-neon">
        <Clock className="h-4 w-4" aria-hidden />
        {formatTotalDuration(seconds)}
      </span>
      <span>
        · {songs.length} {songs.length === 1 ? 'Song' : 'Songs'}
      </span>
      {missing > 0 && <span className="text-warn">· {missing} ohne Dauer</span>}
    </span>
  );
}

function SortableSongRow({ song, position, onRemove }: { song: Song; position: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: song.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg border bg-stage-raised p-1 pr-2 ${isDragging ? 'relative z-10 border-neon shadow-2xl' : 'border-stage-line'}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`„${song.title}“ verschieben`}
        title="Ziehen zum Sortieren"
        className="flex h-12 w-12 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-stage-muted hover:text-stage-text active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-6 w-6" aria-hidden />
      </button>
      <SongRowContent song={song} position={position} />
      <IconButton icon={X} label={`„${song.title}“ aus der Setlist entfernen`} onClick={onRemove} />
    </li>
  );
}

function SongRowContent({ song, position }: { song: Song; position: number }) {
  return (
    <>
      <span className="w-6 shrink-0 text-center text-lg font-bold tabular-nums text-stage-muted">{position}</span>
      <span className="min-w-0 flex-1 py-1">
        <span className="block break-words font-semibold leading-snug">{song.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-stage-muted">
          {song.key && <span className="font-semibold text-neon">{song.key}</span>}
          {song.bpm !== null && <span className="text-signal">{song.bpm} BPM</span>}
          {song.tuning && song.tuning !== 'Standard E' && <span className="font-semibold text-warn">{song.tuning}</span>}
          {song.duration && <span className="tabular-nums">{song.duration}</span>}
        </span>
      </span>
    </>
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
    <Modal title={`Songs zu „${setlist.name}“ hinzufügen`} onClose={onClose}>
      <div className="flex flex-col gap-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-stage-muted" aria-hidden />
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
          <p className="py-6 text-center text-stage-muted">
            {songs.length === 0 ? 'Lege zuerst im Reiter „Songs & PDFs“ einen Song an.' : 'Keine weiteren Songs verfügbar.'}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {candidates.map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => add(song)}
                className="flex min-h-touch w-full items-center gap-3 rounded-lg border border-stage-line bg-stage-raised p-3 text-left hover:border-neon"
              >
                <Plus className="h-5 w-5 shrink-0 text-neon" aria-hidden />
                <span className="min-w-0 flex-1 break-words font-semibold">{song.title}</span>
                {song.duration && <span className="text-sm tabular-nums text-stage-muted">{song.duration}</span>}
              </button>
            </li>
          ))}
        </ul>
        <Button variant="primary" icon={Check} onClick={onClose} className="sticky bottom-2">
          Fertig
        </Button>
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
    <div className="card flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {editingName !== null && isAdmin ? (
          <form onSubmit={saveName} className="flex min-w-0 flex-1 basis-64 gap-2">
            <input
              className="field font-bold"
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              aria-label="Name der Setlist"
              autoFocus
            />
            <IconButton icon={Check} label="Namen speichern" variant="primary" type="submit" disabled={!editingName.trim()} />
            <IconButton icon={X} label="Abbrechen" onClick={() => setEditingName(null)} />
          </form>
        ) : (
          <div className="min-w-0 flex-1 basis-64">
            <h3 className="break-words text-2xl font-extrabold">{setlist.name}</h3>
            <DurationSummary songs={songs} />
          </div>
        )}
        {isAdmin && editingName === null && (
          <div className="flex gap-2">
            <IconButton icon={Pencil} label="Setlist umbenennen" onClick={() => setEditingName(setlist.name)} />
            <IconButton icon={Trash2} label="Setlist löschen" variant="danger" onClick={remove} />
          </div>
        )}
      </div>

      <Button variant="primary" icon={Play} onClick={onStartStage} disabled={songs.length === 0} className="min-h-16 text-xl">
        Vollbild-Bühnenansicht starten
      </Button>

      {songs.length === 0 && (
        <EmptyState icon={ListMusic} title="Diese Setlist ist leer">
          {isAdmin ? 'Füge unten die ersten Songs hinzu.' : 'Der Admin hat hier noch keine Songs eingetragen.'}
        </EmptyState>
      )}

      {isAdmin ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={songs.map((song) => song.id)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-2">
              {songs.map((song, index) => (
                <SortableSongRow key={song.id} song={song} position={index + 1} onRemove={() => removeSong(song.id)} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <ol className="flex flex-col gap-2">
          {songs.map((song, index) => (
            <li key={song.id} className="flex min-h-touch items-center gap-2 rounded-lg border border-stage-line bg-stage-raised p-2">
              <SongRowContent song={song} position={index + 1} />
            </li>
          ))}
        </ol>
      )}

      {isAdmin && (
        <Button icon={Plus} onClick={() => setAdding(true)}>
          Songs hinzufügen
        </Button>
      )}

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
      <SectionTitle
        action={
          isAdmin &&
          newName === null && (
            <Button variant="primary" icon={Plus} onClick={() => setNewName('')}>
              Neue Setlist
            </Button>
          )
        }
      >
        Setlists
      </SectionTitle>

      {isAdmin && newName !== null && (
        <form onSubmit={create} className="card mb-4 flex gap-2 p-3">
          <input
            className="field"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="z. B. Acoustic Set"
            aria-label="Name der neuen Setlist"
            autoFocus
          />
          <IconButton icon={Check} label="Setlist anlegen" variant="primary" type="submit" disabled={!newName.trim()} />
          <IconButton icon={X} label="Abbrechen" onClick={() => setNewName(null)} />
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState icon={ListMusic} title="Noch keine Setlists">
          {isAdmin ? 'Erstelle mit „Neue Setlist“ die erste Setlist.' : 'Lade im Reiter „Daten-Sync“ den aktuellen Band-Stand.'}
        </EmptyState>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <ul className="flex flex-col gap-2">
            {sorted.map((setlist) => {
              const isActive = setlist.id === selected?.id;
              return (
                <li key={setlist.id}>
                  <button
                    type="button"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => setSelectedId(setlist.id)}
                    className={`card flex min-h-touch w-full flex-col gap-1 p-3 text-left transition-colors ${isActive ? 'border-neon bg-stage-raised' : 'hover:border-signal'}`}
                  >
                    <span className="break-words text-lg font-bold leading-snug">{setlist.name}</span>
                    <DurationSummary songs={resolveSongs(setlist, songsById)} />
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && <SetlistDetail key={selected.id} setlist={selected} songsById={songsById} onStartStage={() => onStartStage(selected.id)} />}
        </div>
      )}

      {!isAdmin && sorted.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm text-stage-muted">
          <Badge>Nur Lesen</Badge> Änderungen an Setlists sind im Admin-Bearbeitungsmodus möglich.
        </p>
      )}
    </section>
  );
}
