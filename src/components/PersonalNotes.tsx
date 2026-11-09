import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Save, ShieldCheck, StickyNote, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from '../context/FeedbackContext';
import { deletePersonalNote, savePersonalNote } from '../db/bandActions';
import { db, describeError, type PersonalNote } from '../db/schema';
import { Button, EmptyState, IconButton, SectionTitle } from './ui';

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
        className="field min-h-24 text-base"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="z. B. Gitarre: Delay-Pedal im 2. Refrain aktivieren"
        aria-label="Notiztext"
        autoFocus={onCancel !== undefined}
      />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button icon={X} onClick={onCancel}>
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
    <div className="flex items-start gap-2 rounded-lg border border-stage-line bg-stage-bg p-2 pl-3">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words py-2 text-base">{note.text}</p>
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
      <NoteEditor
        initial=""
        onSave={(text) => savePersonalNote({ songId: song.id, songTitle: song.title, text })}
      />
    </div>
  );
}

export function PersonalNotes() {
  const songs = useLiveQuery(() => db.songs.toArray(), []);
  const notes = useLiveQuery(() => db.personalNotes.toArray(), []);
  const [addingFor, setAddingFor] = useState<string | null>(null);

  if (!songs || !notes) return null;

  const sortedSongs = [...songs].sort((a, b) => a.title.localeCompare(b.title, 'de'));
  const knownIds = new Set(songs.map((song) => song.id));
  const orphans = notes.filter((note) => !knownIds.has(note.songId));

  return (
    <section>
      <SectionTitle>Persönliche Notizen</SectionTitle>
      <p className="mb-4 flex items-start gap-2 rounded-lg border border-neon/40 bg-neon/10 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-neon" aria-hidden />
        Deine Notizen liegen nur auf diesem Gerät. Ein Band-Sync oder Datei-Import überschreibt sie nie – sie werden aber auch nicht
        mit der Band geteilt.
      </p>

      {sortedSongs.length === 0 && orphans.length === 0 && (
        <EmptyState icon={StickyNote} title="Noch keine Songs vorhanden">
          Sobald Songs in den Band-Daten liegen, kannst du hier eigene Notizen dazu anlegen.
        </EmptyState>
      )}

      <div className="flex flex-col gap-3">
        {sortedSongs.map((song) => {
          const songNotes = notes.filter((note) => note.songId === song.id);
          const isOpen = addingFor === song.id;
          return (
            <article key={song.id} className="card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 break-words text-lg font-bold">{song.title}</h3>
                {!isOpen && songNotes.length > 0 && (
                  <Button icon={Pencil} onClick={() => setAddingFor(song.id)}>
                    Bearbeiten
                  </Button>
                )}
                {!isOpen && songNotes.length === 0 && (
                  <Button icon={Plus} onClick={() => setAddingFor(song.id)}>
                    Notiz anlegen
                  </Button>
                )}
                {isOpen && (
                  <Button icon={X} onClick={() => setAddingFor(null)}>
                    Fertig
                  </Button>
                )}
              </div>
              {isOpen ? (
                <SongNotes song={song} />
              ) : (
                songNotes.map((note) => (
                  <p key={note.id} className="mb-1 whitespace-pre-wrap break-words rounded-lg bg-stage-bg p-3 text-base last:mb-0">
                    {note.text}
                  </p>
                ))
              )}
            </article>
          );
        })}
      </div>

      {orphans.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 text-lg font-bold">Notizen zu entfernten Songs</h3>
          <p className="mb-3 text-sm text-stage-muted">
            Diese Songs sind nicht mehr in den Band-Daten. Deine Notizen bleiben trotzdem erhalten, bis du sie selbst löschst.
          </p>
          <div className="flex flex-col gap-3">
            {orphans.map((note) => (
              <article key={note.id} className="card p-3">
                <h4 className="mb-2 font-bold text-stage-muted">{note.songTitle}</h4>
                <NoteItem note={note} song={null} />
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
