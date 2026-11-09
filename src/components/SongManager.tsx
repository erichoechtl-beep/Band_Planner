import { useLiveQuery } from 'dexie-react-hooks';
import { Clock, FileText, Music, Pencil, Plus, Save, Search, Trash2, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import { deleteSong, saveSong, type PdfChange } from '../db/bandActions';
import { db, describeError, type Song } from '../db/schema';
import { formatBytes, looksLikePdf } from '../lib/files';
import { isValidDuration } from '../lib/time';
import { transposeSong } from '../lib/transpose';
import { PdfViewer } from './PdfViewer';
import { SongNotes } from './PersonalNotes';
import { TransposeTool } from './TransposeTool';
import { Badge, Button, EmptyState, IconButton, Modal, SectionTitle } from './ui';

const KEY_SUGGESTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
const TUNING_SUGGESTIONS = ['Standard E', 'Drop D', 'Eb-Standard', 'D-Standard', 'Drop C', 'DADGAD', 'Open G'];
const MAX_PDF_BYTES = 30 * 1024 * 1024;

interface FormState {
  title: string;
  artist: string;
  key: string;
  bpm: string;
  tuning: string;
  duration: string;
  structure: string;
  chords: string;
}

function toFormState(song: Song | null): FormState {
  return {
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    key: song?.key ?? '',
    bpm: song?.bpm?.toString() ?? '',
    tuning: song?.tuning ?? 'Standard E',
    duration: song?.duration ?? '',
    structure: song?.structure ?? '',
    chords: song?.chords ?? '',
  };
}

function SongEditor({ song, onClose }: { song: Song | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [form, setForm] = useState<FormState>(() => toFormState(song));
  const [pdfChange, setPdfChange] = useState<PdfChange>({ kind: 'keep' });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'pdf', string>>>({});
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (field: keyof FormState) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const currentPdfName =
    pdfChange.kind === 'replace' ? pdfChange.name : pdfChange.kind === 'remove' ? null : song?.pdfName ?? null;

  const handlePdf = async (file: File | undefined) => {
    if (!file) return;
    setErrors((current) => ({ ...current, pdf: undefined }));
    try {
      if (file.size > MAX_PDF_BYTES) {
        setErrors((current) => ({
          ...current,
          pdf: `Die Datei ist mit ${formatBytes(file.size)} zu groß (maximal ${formatBytes(MAX_PDF_BYTES)}).`,
        }));
        return;
      }
      const data = await file.arrayBuffer();
      if (!looksLikePdf(data)) {
        setErrors((current) => ({ ...current, pdf: `„${file.name}“ ist keine gültige PDF-Datei.` }));
        return;
      }
      setPdfChange({ kind: 'replace', name: file.name, data });
    } catch {
      setErrors((current) => ({ ...current, pdf: 'Die Datei konnte nicht gelesen werden.' }));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!form.title.trim()) nextErrors.title = 'Bitte gib einen Titel ein.';
    if (form.duration.trim() && !isValidDuration(form.duration)) nextErrors.duration = 'Bitte im Format MM:SS eingeben, z. B. 03:45.';
    const bpm = form.bpm.trim() ? Number(form.bpm.replace(',', '.')) : null;
    if (bpm !== null && (!Number.isFinite(bpm) || bpm <= 0)) nextErrors.bpm = 'Das Tempo muss eine positive Zahl sein.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await saveSong(
        song?.id ?? null,
        {
          title: form.title.trim(),
          artist: form.artist.trim(),
          key: form.key.trim(),
          bpm,
          tuning: form.tuning.trim(),
          duration: form.duration.trim(),
          structure: form.structure.trim(),
          chords: form.chords.replace(/\s+$/, ''),
        },
        pdfChange,
      );
      toast(song ? 'Song gespeichert.' : 'Song angelegt.');
      onClose();
    } catch (error) {
      toast(describeError(error), 'error');
      setSaving(false);
    }
  };

  const fieldError = (field: keyof typeof errors) =>
    errors[field] && (
      <p className="mt-1 text-sm font-medium text-danger" role="alert">
        {errors[field]}
      </p>
    );

  return (
    <Modal title={song ? `„${song.title}“ bearbeiten` : 'Neuer Song'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-4" noValidate>
        <div>
          <label className="field-label" htmlFor="song-title">
            Titel *
          </label>
          <input id="song-title" className="field" value={form.title} onChange={update('title')} placeholder="z. B. Tage wie diese" />
          {fieldError('title')}
        </div>
        <div>
          <label className="field-label" htmlFor="song-artist">
            Interpret / Info
          </label>
          <input id="song-artist" className="field" value={form.artist} onChange={update('artist')} placeholder="z. B. Die Toten Hosen" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="field-label" htmlFor="song-key">
              Tonart
            </label>
            <input id="song-key" className="field" list="key-suggestions" value={form.key} onChange={update('key')} placeholder="Am" autoComplete="off" />
            <datalist id="key-suggestions">
              {KEY_SUGGESTIONS.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="field-label" htmlFor="song-bpm">
              Tempo (BPM)
            </label>
            <input id="song-bpm" className="field" inputMode="numeric" value={form.bpm} onChange={update('bpm')} placeholder="120" />
            {fieldError('bpm')}
          </div>
          <div>
            <label className="field-label" htmlFor="song-tuning">
              Stimmung
            </label>
            <input id="song-tuning" className="field" list="tuning-suggestions" value={form.tuning} onChange={update('tuning')} placeholder="Standard E" autoComplete="off" />
            <datalist id="tuning-suggestions">
              {TUNING_SUGGESTIONS.map((tuning) => (
                <option key={tuning} value={tuning} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="field-label" htmlFor="song-duration">
              Dauer (MM:SS)
            </label>
            <input id="song-duration" className="field" inputMode="numeric" value={form.duration} onChange={update('duration')} placeholder="03:45" />
            {fieldError('duration')}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="song-structure">
            Song-Ablauf
          </label>
          <input
            id="song-structure"
            className="field"
            value={form.structure}
            onChange={update('structure')}
            placeholder="Intro → Strophe → Refrain → Solo (Am) → Outro"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="song-chords">
            Akkorde / Text
          </label>
          <textarea
            id="song-chords"
            className="field min-h-48 font-mono text-sm leading-relaxed"
            value={form.chords}
            onChange={update('chords')}
            spellCheck={false}
            placeholder={'[Strophe]\nAm       F        C        G\n\nOder inline: [Am]Text [F]weiter'}
          />
          <p className="mt-1 text-xs text-stage-muted">
            Akkordzeilen und [Am]-Akkorde im Text werden beim Transponieren automatisch umgerechnet.
          </p>
        </div>

        <div>
          <span className="field-label">PDF-Leadsheet</span>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stage-line bg-stage-bg p-2">
            <span className="min-w-0 flex-1 break-words px-2 text-sm">{currentPdfName ?? 'Kein PDF verknüpft'}</span>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              aria-label="PDF-Datei auswählen"
              onChange={(event) => handlePdf(event.target.files?.[0])}
            />
            <Button icon={Upload} onClick={() => fileInput.current?.click()}>
              {currentPdfName ? 'Ersetzen' : 'PDF hochladen'}
            </Button>
            {currentPdfName && <IconButton icon={Trash2} label="PDF entfernen" variant="danger" onClick={() => setPdfChange({ kind: 'remove' })} />}
          </div>
          {fieldError('pdf')}
        </div>

        <div className="sticky bottom-0 -mx-4 -mb-4 flex justify-end gap-2 border-t border-stage-line bg-stage-surface p-4">
          <Button icon={X} onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="primary" icon={Save} disabled={saving}>
            Speichern
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SongDetails({ song, onClose, onEdit }: { song: Song; onClose: () => void; onEdit: () => void }) {
  const { isAdmin } = useAdmin();
  const { toast, confirm } = useFeedback();
  const [semitones, setSemitones] = useState(0);
  const [showPdf, setShowPdf] = useState(false);
  const shown = useMemo(() => transposeSong(song, semitones), [song, semitones]);

  const remove = async () => {
    const confirmed = await confirm({
      title: 'Song löschen?',
      message: `„${song.title}“ wird samt PDF aus den Band-Daten und allen Setlists entfernt. Persönliche Notizen bleiben erhalten.`,
      confirmLabel: 'Song löschen',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteSong(song.id);
      toast('Song gelöscht.');
      onClose();
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <Modal title={song.title} onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        {song.artist && <p className="text-lg text-stage-muted">{song.artist}</p>}

        <div className="flex flex-wrap gap-2">
          {song.bpm !== null && <Badge tone="cyan" label="BPM">{song.bpm}</Badge>}
          {song.tuning && <Badge label="Stimmung">{song.tuning}</Badge>}
          {song.duration && <Badge label="Dauer">{song.duration}</Badge>}
        </div>

        <TransposeTool semitones={semitones} originalKey={song.key} transposedKey={shown.key} onChange={setSemitones} />

        {song.pdfName && (
          <Button variant="accent" icon={FileText} onClick={() => setShowPdf(true)}>
            PDF-Leadsheet öffnen
          </Button>
        )}

        {shown.structure && (
          <div>
            <h3 className="field-label">Song-Ablauf</h3>
            <p className="break-words text-lg font-semibold text-signal">{shown.structure}</p>
          </div>
        )}

        {shown.chords && (
          <div>
            <h3 className="field-label">Akkorde</h3>
            <pre className="overflow-x-auto rounded-lg bg-stage-bg p-3 font-mono text-base leading-relaxed">{shown.chords}</pre>
          </div>
        )}

        <div>
          <h3 className="field-label">Meine Notizen (nur auf diesem Gerät)</h3>
          <SongNotes song={song} />
        </div>

        {isAdmin && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-stage-line pt-4">
            <Button variant="danger" icon={Trash2} onClick={remove}>
              Löschen
            </Button>
            <Button variant="primary" icon={Pencil} onClick={onEdit}>
              Bearbeiten
            </Button>
          </div>
        )}
      </div>

      {showPdf && <PdfViewer songId={song.id} title={song.title} onClose={() => setShowPdf(false)} />}
    </Modal>
  );
}

export function SongManager() {
  const { isAdmin } = useAdmin();
  const songs = useLiveQuery(() => db.songs.toArray(), []);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ song: Song | null } | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de');
    return (songs ?? [])
      .filter((song) => !term || `${song.title} ${song.artist}`.toLocaleLowerCase('de').includes(term))
      .sort((a, b) => a.title.localeCompare(b.title, 'de'));
  }, [songs, search]);

  if (!songs) return null;

  // Bei einem Sync kann der geöffnete Song verschwinden; der Dialog schließt sich dann von selbst.
  const selected = songs.find((song) => song.id === selectedId) ?? null;

  return (
    <section>
      <SectionTitle
        action={
          isAdmin && (
            <Button variant="primary" icon={Plus} onClick={() => setEditor({ song: null })}>
              Neuer Song
            </Button>
          )
        }
      >
        Songs &amp; PDFs
      </SectionTitle>

      {songs.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-stage-muted" aria-hidden />
          <input
            className="field pl-11"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Titel oder Interpret suchen …"
            aria-label="Songs durchsuchen"
          />
        </div>
      )}

      {songs.length === 0 && (
        <EmptyState icon={Music} title="Noch keine Songs">
          {isAdmin ? 'Lege mit „Neuer Song“ den ersten Song an.' : 'Lade im Reiter „Daten-Sync“ den aktuellen Band-Stand.'}
        </EmptyState>
      )}

      {songs.length > 0 && filtered.length === 0 && <p className="py-6 text-center text-stage-muted">Kein Song passt zu „{search}“.</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((song) => (
          <li key={song.id}>
            <button
              type="button"
              onClick={() => setSelectedId(song.id)}
              className="card flex h-full min-h-touch w-full flex-col gap-2 p-3 text-left transition-colors hover:border-signal"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block break-words text-lg font-bold leading-snug">{song.title}</span>
                  {song.artist && <span className="block text-sm text-stage-muted">{song.artist}</span>}
                </span>
                {song.pdfName && (
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-signal">
                    <FileText className="h-4 w-4" aria-hidden /> PDF
                  </span>
                )}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {song.key && <Badge tone="green" label="Tonart">{song.key}</Badge>}
                {song.bpm !== null && <Badge tone="cyan" label="BPM">{song.bpm}</Badge>}
                {song.tuning && <Badge>{song.tuning}</Badge>}
                {song.duration && (
                  <Badge>
                    <Clock className="h-3 w-3 self-center" aria-hidden /> {song.duration}
                  </Badge>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && !editor && (
        <SongDetails song={selected} onClose={() => setSelectedId(null)} onEdit={() => setEditor({ song: selected })} />
      )}
      {editor && isAdmin && <SongEditor song={editor.song} onClose={() => setEditor(null)} />}
    </section>
  );
}
