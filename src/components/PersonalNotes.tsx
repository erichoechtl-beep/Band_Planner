import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Save, ShieldCheck, StickyNote, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from '../context/FeedbackContext';
import { deletePersonalNote, savePersonalNote } from '../db/bandActions';
import { db, describeError, type PersonalNote } from '../db/schema';
import { Button, EmptyState, IconButton, InfoNote, PageHeader } from './ui';

interface SongRef {
  id: string;
  title: string;
}

function NoteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const { toast } = useFeedback();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onSave(text.trim());
      setText('');
    } catch (error) {
      // Der eingegebene Text bleibt stehen, damit bei einem Fehler nichts verloren geht.
      toast(describeError(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="field min-h-24"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="z. B. Gitarre: Delay-Pedal im 2. Refrain aktivieren"
        aria-label="Notiztext"
        autoFocus={onCancel !== undefined}
      />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        )}
        <Button variant="primary" icon={onCancel ? Save : Plus} disabled={!text.trim() || busy} onClick={submit}>
          {onCancel ? 'Speichern' : 'Notiz hinzufügen'}
        </Button>
      </div>
    </div>
  );
}

function NoteItem({ note, song }: { note: PersonalNote; song: SongRef | null }) {
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);

  const remove = async () => {
    const confirmed = await confirm({
      title: 'Notiz löschen?',
      message: 'Diese Notiz gibt es nur auf diesem Gerät. Sie kann nicht wiederhergestellt werden.',
      confirmLabel: 'Notiz löschen',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deletePersonalNote(note.id);
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  if (editing) {
    return (
      <NoteEditor
        initial={note.text}
        onCancel={() => setEditing(false)}
        onSave={async (text) => {
          await savePersonalNote({ id: note.id, songId: note.songId, songTitle: song?.title ?? note.songTitle, text });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="group flex items-start gap-1 rounded-lg border-l-2 border-warn/60 bg-stage-bg py-1 pl-3 pr-1">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words py-2.5 text-[15px]">{note.text}</p>
      <IconButton icon={Pencil} label="Notiz bearbeiten" onClick={() => setEditing(true)} />
      <IconButton icon={Trash2} label="Notiz löschen" variant="danger" onClick={remove} />
    </div>
  );
}

/** Notizen zu einem Song – in allen Modi bearbeitbar, weil sie nur dieses Gerät betreffen. */
export function SongNotes({ song }: { song: SongRef }) {
  const notes = useLiveQuery(() => db.personalNotes.where('songId').equals(song.id).sortBy('updatedAt'), [song.id]);

  return (
    <div className="flex flex-col gap-2">
      {notes?.map((note) => <NoteItem key={note.id} note={note} song={song} />)}
      <NoteEditor initial="" onSave={(text) => savePersonalNote({ songId: song.id, songTitle: song.title, text })} />
    </div>
  );
}

export function PersonalNotes() {
  const songs = useLiveQuery(() => db.songs.toArray(), []);
  const notes = useLiveQuery(() => db.personalNotes.toArray(), []);
  const [openFor, setOpenFor] = useState<string | null>(null);

  if (!songs || !notes) return null;

  const sortedSongs = [...songs].sort((a, b) => a.title.localeCompare(b.title, 'de'));
  const knownIds = new Set(songs.map((song) => song.id));
  const orphans = notes.filter((note) => !knownIds.has(note.songId));

  return (
    <section>
      <PageHeader title="Persönliche Notizen" description="Deine eigenen Hinweise zu jedem Song – auch im Bühnen-Modus bearbeitbar." />
      <div className="mb-6">
        <InfoNote icon={ShieldCheck}>
          Deine Notizen liegen nur auf diesem Gerät. Ein Band-Sync oder Datei-Import überschreibt sie nie – sie werden aber auch nicht mit der Band
          geteilt.
        </InfoNote>
      </div>

      {sortedSongs.length === 0 && orphans.length === 0 && (
        <EmptyState icon={StickyNote} title="Noch keine Songs vorhanden">
          Sobald Songs in den Band-Daten liegen, kannst du hier eigene Notizen dazu anlegen.
        </EmptyState>
      )}

      <div className="card divide-y divide-stage-line">
        {sortedSongs.map((song) => {
          const songNotes = notes.filter((note) => note.songId === song.id);
          const isOpen = openFor === song.id;
          return (
            <article key={song.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{song.title}</h3>
                  <p className="text-sm text-stage-subtle">
                    {songNotes.length === 0 ? 'Keine Notizen' : `${songNotes.length} ${songNotes.length === 1 ? 'Notiz' : 'Notizen'}`}
                  </p>
                </div>
                <Button variant={isOpen ? 'secondary' : 'ghost'} icon={isOpen ? undefined : songNotes.length > 0 ? Pencil : Plus} onClick={() => setOpenFor(isOpen ? null : song.id)}>
                  {isOpen ? 'Fertig' : songNotes.length > 0 ? 'Bearbeiten' : 'Notiz anlegen'}
                </Button>
              </div>
              {isOpen ? (
                <div className="mt-3">
                  <SongNotes song={song} />
                </div>
              ) : (
                songNotes.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {songNotes.map((note) => (
                      <p key={note.id} className="whitespace-pre-wrap break-words rounded-lg border-l-2 border-warn/60 bg-stage-bg px-3 py-2.5 text-[15px]">
                        {note.text}
                      </p>
                    ))}
                  </div>
                )
              )}
            </article>
          );
        })}
      </div>

      {orphans.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold tracking-tight">Notizen zu entfernten Songs</h3>
          <p className="mb-3 mt-1 text-sm text-stage-muted">
            Diese Songs sind nicht mehr in den Band-Daten. Deine Notizen bleiben trotzdem erhalten, bis du sie selbst löschst.
          </p>
          <div className="card divide-y divide-stage-line">
            {orphans.map((note) => (
              <article key={note.id} className="p-4">
                <h4 className="mb-2 text-sm font-semibold text-stage-muted">{note.songTitle}</h4>
                <NoteItem note={note} song={null} />
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
