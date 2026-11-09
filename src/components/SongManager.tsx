import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, FileText, MicVocal, Music, Pencil, Plus, Save, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { VOCALISTS } from '../config';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import { deleteSong, saveSong, type PdfChange } from '../db/bandActions';
import { db, describeError, type Song } from '../db/schema';
import { formatBytes, looksLikePdf } from '../lib/files';
import { isValidDuration } from '../lib/time';
import { transposeSong } from '../lib/transpose';
import { PdfViewer } from './PdfViewer';
import { SongNotes } from './SongNotes';
import { TransposeTool } from './TransposeTool';
import { Badge, Button, EmptyState, IconButton, Modal, PageHeader, Stat, StructureFlow } from './ui';

const KEY_SUGGESTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
const MAX_PDF_BYTES = 30 * 1024 * 1024;

interface FormState {
  title: string;
  artist: string;
  key: string;
  bpm: string;
  leadVocals: string;
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
    leadVocals: song?.leadVocals ?? '',
    duration: song?.duration ?? '',
    structure: song?.structure ?? '',
    chords: song?.chords ?? '',
  };
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="eyebrow mb-3">{title}</legend>
      {children}
    </fieldset>
  );
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
          tuning: song?.tuning ?? '',
          leadVocals: form.leadVocals,
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
      <p className="mt-1.5 text-sm font-medium text-danger" role="alert">
        {errors[field]}
      </p>
    );

  return (
    <Modal title={song ? 'Song bearbeiten' : 'Neuer Song'} subtitle={song?.title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-8 p-5" noValidate>
        <FormSection title="Allgemein">
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
        </FormSection>

        <FormSection title="Musikalische Angaben">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="field-label" htmlFor="song-key">
                Tonart
              </label>
              <input id="song-key" className="field font-mono" list="key-suggestions" value={form.key} onChange={update('key')} placeholder="Am" autoComplete="off" />
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
              <input id="song-bpm" className="field tabular-nums" inputMode="numeric" value={form.bpm} onChange={update('bpm')} placeholder="120" />
              {fieldError('bpm')}
            </div>
            <div>
              <label className="field-label" htmlFor="song-lead">
                Lead Vocals
              </label>
              <select id="song-lead" className="field" value={form.leadVocals} onChange={(event) => setForm((current) => ({ ...current, leadVocals: event.target.value }))}>
                <option value="">– keine Angabe –</option>
                {[...VOCALISTS, ...(form.leadVocals && !(VOCALISTS as readonly string[]).includes(form.leadVocals) ? [form.leadVocals] : [])].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="song-duration">
                Dauer (MM:SS)
              </label>
              <input id="song-duration" className="field tabular-nums" inputMode="numeric" value={form.duration} onChange={update('duration')} placeholder="03:45" />
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
            <p className="mt-1.5 text-xs text-stage-subtle">Teile mit → trennen. Akkorde in Klammern werden beim Transponieren mit umgerechnet.</p>
          </div>
        </FormSection>

        <FormSection title="Akkorde & Leadsheet">
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
          </div>

          <div>
            <span className="field-label">PDF-Leadsheet</span>
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-stage-strong bg-stage-bg p-2 pl-3">
              <FileText className={`h-5 w-5 shrink-0 ${currentPdfName ? 'text-accent' : 'text-stage-subtle'}`} aria-hidden />
              <span className={`min-w-0 flex-1 truncate text-sm ${currentPdfName ? 'font-medium' : 'text-stage-muted'}`}>
                {currentPdfName ?? 'Kein PDF verknüpft'}
              </span>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                aria-label="PDF-Datei auswählen"
                onChange={(event) => handlePdf(event.target.files?.[0])}
              />
              {currentPdfName && <IconButton icon={Trash2} label="PDF entfernen" variant="danger" onClick={() => setPdfChange({ kind: 'remove' })} />}
              <Button icon={Upload} onClick={() => fileInput.current?.click()}>
                {currentPdfName ? 'Ersetzen' : 'PDF hochladen'}
              </Button>
            </div>
            {fieldError('pdf')}
          </div>
        </FormSection>

        <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-stage-line bg-stage-surface px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
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

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </section>
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
    <Modal
      title={song.title}
      subtitle={song.artist || undefined}
      onClose={onClose}
      headerExtra={isAdmin && <IconButton icon={Pencil} label="Bearbeiten" onClick={onEdit} />}
    >
      <div className="flex flex-col gap-6 p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Tonart" value={shown.key || '–'} tone="green" />
          <Stat label="Tempo" value={song.bpm !== null ? `${song.bpm} BPM` : '–'} tone="cyan" />
          <Stat label="Lead Vocals" value={song.leadVocals || '–'} />
          <Stat label="Dauer" value={song.duration || '–'} />
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <TransposeTool semitones={semitones} originalKey={song.key} transposedKey={shown.key} onChange={setSemitones} />
          {song.pdfName && (
            <Button variant="accent" icon={FileText} onClick={() => setShowPdf(true)} className="sm:h-auto">
              PDF-Leadsheet öffnen
            </Button>
          )}
        </div>

        {shown.structure && (
          <DetailSection title="Song-Ablauf">
            <StructureFlow structure={shown.structure} />
          </DetailSection>
        )}

        {shown.chords && (
          <DetailSection title="Akkorde">
            <pre className="overflow-x-auto rounded-xl border border-stage-line bg-stage-bg p-4 font-mono text-[15px] leading-relaxed">{shown.chords}</pre>
          </DetailSection>
        )}

        <DetailSection title="Meine Notizen · nur auf diesem Gerät">
          <SongNotes song={song} />
        </DetailSection>

        {isAdmin && (
          <div className="flex flex-wrap justify-between gap-2 border-t border-stage-line pt-5">
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
  const pdfCount = songs.filter((song) => song.pdfName).length;

  return (
    <section>
      <PageHeader
        title="Songs & PDFs"
        description={songs.length > 0 ? `${songs.length} Songs im Repertoire · ${pdfCount} mit Leadsheet` : 'Repertoire mit Tonart, Tempo, Ablauf und Leadsheets.'}
        action={
          isAdmin && (
            <Button variant="primary" icon={Plus} onClick={() => setEditor({ song: null })}>
              Neuer Song
            </Button>
          )
        }
      />

      {songs.length === 0 ? (
        <EmptyState icon={Music} title="Noch keine Songs">
          {isAdmin ? 'Lege mit „Neuer Song“ den ersten Song an.' : 'Lade im Bereich „Daten-Sync“ den aktuellen Band-Stand.'}
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-stage-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-stage-subtle" aria-hidden />
              <input
                className="field pl-11"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Titel oder Interpret suchen …"
                aria-label="Songs durchsuchen"
              />
            </div>
          </div>

          <div className="eyebrow hidden items-center gap-3 border-b border-stage-line px-5 py-2.5 sm:flex" aria-hidden>
            <span className="flex-1">Titel</span>
            <span className="w-14">Tonart</span>
            <span className="w-16">BPM</span>
            <span className="hidden w-24 md:block">Lead Vocals</span>
            <span className="w-12 text-right">Dauer</span>
            <span className="w-5" />
          </div>

          {filtered.length === 0 && <p className="py-10 text-center text-sm text-stage-muted">Kein Song passt zu „{search}“.</p>}

          <ul className="divide-y divide-stage-line">
            {filtered.map((song) => (
              <li key={song.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(song.id)}
                  className="flex min-h-touch w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-stage-raised"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{song.title}</span>
                      {song.pdfName && <FileText className="h-4 w-4 shrink-0 text-accent" aria-label="mit PDF" />}
                    </span>
                    {song.artist && <span className="block truncate text-sm text-stage-muted">{song.artist}</span>}
                    <span className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
                      {song.key && <Badge tone="green">{song.key}</Badge>}
                      {song.bpm !== null && <Badge tone="cyan">{song.bpm} BPM</Badge>}
                      {song.leadVocals && (
                        <Badge>
                          <MicVocal className="h-3 w-3" aria-hidden /> {song.leadVocals}
                        </Badge>
                      )}
                      {song.duration && <Badge>{song.duration}</Badge>}
                    </span>
                  </span>
                  <span className="hidden w-14 font-mono text-sm font-semibold text-brand sm:block">{song.key || '–'}</span>
                  <span className="hidden w-16 text-sm tabular-nums text-accent sm:block">{song.bpm ?? '–'}</span>
                  <span className="hidden w-24 truncate text-sm font-medium md:block">{song.leadVocals || <span className="font-normal text-stage-subtle">–</span>}</span>
                  <span className="hidden w-12 text-right text-sm tabular-nums text-stage-muted sm:block">{song.duration || '–'}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-stage-subtle" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && !editor && (
        <SongDetails song={selected} onClose={() => setSelectedId(null)} onEdit={() => setEditor({ song: selected })} />
      )}
      {editor && isAdmin && <SongEditor song={editor.song} onClose={() => setEditor(null)} />}
    </section>
  );
}
