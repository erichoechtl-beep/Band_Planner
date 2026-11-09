import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Save, StickyNote, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFeedback } from '../context/FeedbackContext';
import { deletePersonalNote, savePersonalNote } from '../db/bandActions';
import { db, describeError, type PersonalNote } from '../db/schema';
import { Button, IconButton, Modal } from './ui';

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

/** Zettel-Knopf: leuchtet gelb, wenn es zu dem Song eine eigene Notiz gibt, und öffnet die Notizen. */
export function NoteButton({ song, hasNote }: { song: SongRef; hasNote: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={hasNote ? `Meine Notiz zu „${song.title}“ anzeigen` : `Notiz zu „${song.title}“ anlegen`}
        title={hasNote ? 'Meine Notiz anzeigen' : 'Notiz anlegen'}
        className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            hasNote
              ? 'bg-amber-200 text-amber-800 shadow-[0_0_12px_rgba(251,191,36,0.6)] dark:bg-amber-400/25 dark:text-amber-300'
              : 'text-stage-subtle/60 group-hover:bg-stage-raised group-hover:text-stage-muted'
          }`}
        >
          <StickyNote className="h-[18px] w-[18px]" strokeWidth={hasNote ? 2.25 : 1.75} aria-hidden />
        </span>
      </button>
      {open && (
        <Modal title="Meine Notizen" subtitle={song.title} onClose={() => setOpen(false)}>
          <div className="space-y-3 p-5">
            <p className="text-sm text-stage-muted">Nur auf diesem Gerät gespeichert – wird nie mit der Band geteilt oder vom Sync überschrieben.</p>
            <SongNotes song={song} />
          </div>
        </Modal>
      )}
    </>
  );
}
