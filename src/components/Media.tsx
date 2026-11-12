import { useLiveQuery } from 'dexie-react-hooks';
import {
  Download,
  Drum,
  Eye,
  File,
  FilePen,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  Lock,
  Newspaper,
  Pencil,
  Receipt,
  Search,
  Trash2,
  Upload,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import { addDocument, deleteDocument, updateDocument } from '../db/bandActions';
import { db, describeError, type BandDocument, type Song } from '../db/schema';
import { downloadBlob, formatBytes } from '../lib/files';
import { statusOf } from '../lib/setlist';
import { PdfModal, PdfViewer } from './PdfViewer';
import { Badge, Button, EmptyState, IconButton, InfoNote, Modal, PageHeader, SectionTitle } from './ui';

export const DOCUMENT_CATEGORIES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'rider', label: 'Technischer Rider', icon: Wrench },
  { id: 'stageplot', label: 'Stageplot', icon: LayoutGrid },
  { id: 'angebot', label: 'Angebot', icon: Receipt },
  { id: 'presse', label: 'Pressetext', icon: Newspaper },
  { id: 'vertrag', label: 'Vertrag', icon: FilePen },
  { id: 'foto', label: 'Foto / Logo', icon: ImageIcon },
  { id: 'sonstiges', label: 'Sonstiges', icon: File },
];

const categoryOf = (id: string) => DOCUMENT_CATEGORIES.find((category) => category.id === id) ?? DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1];

/** Jede Datei landet in der band-data.json – große Dateien würden den Sync für alle ausbremsen. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.svg,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.txt,.rtf';

const isPdf = (doc: Pick<BandDocument, 'mimeType' | 'fileName'>) => doc.mimeType === 'application/pdf' || /\.pdf$/i.test(doc.fileName);
const isImage = (doc: Pick<BandDocument, 'mimeType'>) => doc.mimeType.startsWith('image/');

function fileTypeLabel(doc: Pick<BandDocument, 'mimeType' | 'fileName'>): string {
  const extension = /\.([a-z0-9]+)$/i.exec(doc.fileName)?.[1];
  return extension ? extension.toUpperCase() : 'Datei';
}

function fileIcon(doc: Pick<BandDocument, 'mimeType' | 'fileName'>): LucideIcon {
  if (isPdf(doc)) return FileText;
  if (isImage(doc)) return ImageIcon;
  if (/\.(xlsx?|ods|csv)$/i.test(doc.fileName)) return FileSpreadsheet;
  return File;
}

/** Ordnet eine Datei anhand des Namens einer Kategorie zu – lässt sich vor dem Speichern ändern. */
export function guessCategory(fileName: string, mimeType: string): string {
  const name = fileName.toLocaleLowerCase('de');
  if (/rider|technik|tech/.test(name)) return 'rider';
  if (/stage ?plot|bühnenplan|buehnenplan|stageplan/.test(name)) return 'stageplot';
  if (/angebot|offer|quote|kalkulation|preis/.test(name)) return 'angebot';
  if (/press|epk|info|bio/.test(name)) return 'presse';
  if (/vertrag|contract|vereinbarung/.test(name)) return 'vertrag';
  if (mimeType.startsWith('image/') || /logo|foto|photo/.test(name)) return 'foto';
  return 'sonstiges';
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) || date.getTime() === 0 ? '' : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ImagePreview({ doc, onClose }: { doc: BandDocument; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([doc.data], { type: doc.mimeType }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [doc.data, doc.mimeType]);
  return (
    <Modal title={doc.title} subtitle={categoryOf(doc.category).label} onClose={onClose} size="full">
      <div className="flex h-full items-center justify-center bg-stage-bg p-3">
        {url && <img src={url} alt={doc.title} className="max-h-full max-w-full rounded-lg object-contain" />}
      </div>
    </Modal>
  );
}

interface EditorState {
  doc: BandDocument | null;
  file: File | null;
}

function DocumentEditor({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const { doc, file } = state;
  const [title, setTitle] = useState(doc?.title ?? file?.name.replace(/\.[^.]+$/, '') ?? '');
  const [category, setCategory] = useState(doc?.category ?? (file ? guessCategory(file.name, file.type) : 'sonstiges'));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError('Bitte gib dem Dokument einen Titel.');
    setSaving(true);
    try {
      if (doc) {
        await updateDocument(doc.id, { title: title.trim(), category });
        toast('Dokument gespeichert.');
      } else if (file) {
        await addDocument({
          title: title.trim(),
          category,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: await file.arrayBuffer(),
        });
        toast('Dokument hochgeladen.');
      }
      onClose();
    } catch (saveError) {
      setError(describeError(saveError));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!doc) return;
    const confirmed = await confirm({
      title: 'Dokument löschen?',
      message: `„${doc.title}“ wird aus den Medien entfernt.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteDocument(doc.id);
      toast('Dokument gelöscht.');
      onClose();
    } catch (deleteError) {
      toast(describeError(deleteError), 'error');
    }
  };

  const info = doc ?? (file ? { fileName: file.name, mimeType: file.type, size: file.size } : null);

  return (
    <Modal title={doc ? 'Dokument bearbeiten' : 'Dokument hochladen'} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5" noValidate>
        {info && (
          <p className="flex items-center gap-3 rounded-lg bg-stage-raised px-3 py-2.5 text-sm">
            <FileText className="h-5 w-5 shrink-0 text-stage-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{info.fileName}</span>
            <span className="shrink-0 tabular-nums text-stage-muted">{formatBytes(info.size)}</span>
          </p>
        )}
        <label className="block">
          <span className="field-label">Titel *</span>
          <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="z. B. Technischer Rider 2026" autoFocus />
        </label>
        <fieldset>
          <legend className="field-label">Kategorie</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {DOCUMENT_CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
                className={`flex min-h-touch items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors ${
                  category === id ? 'border-brand bg-brand/[0.08] text-brand' : 'border-stage-line hover:bg-stage-raised'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {doc && (
            <Button variant="danger" icon={Trash2} onClick={remove}>
              Löschen
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {doc ? 'Speichern' : 'Hochladen'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function DocumentRow({ doc, onOpen, onEdit }: { doc: BandDocument; onOpen: () => void; onEdit?: () => void }) {
  const Icon = fileIcon(doc);
  const category = categoryOf(doc.category);
  const viewable = isPdf(doc) || isImage(doc);
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-1 text-left">
        <span className="block truncate font-semibold">{doc.title}</span>
        <span className="mt-0.5 block truncate text-sm font-medium">{category.label}</span>
        <span className="block truncate text-sm tabular-nums text-stage-muted">
          {fileTypeLabel(doc)} · {formatBytes(doc.size)}
          {formatDate(doc.createdAt) && <span className="hidden sm:inline"> · {formatDate(doc.createdAt)}</span>}
        </span>
      </button>
      {viewable && <IconButton icon={Eye} label={`„${doc.title}“ ansehen`} onClick={onOpen} />}
      <IconButton icon={Download} label={`„${doc.title}“ herunterladen`} onClick={() => downloadBlob(new Blob([doc.data], { type: doc.mimeType }), doc.fileName)} />
      {onEdit && <IconButton icon={Pencil} label={`„${doc.title}“ bearbeiten`} onClick={onEdit} />}
    </li>
  );
}

interface LeadsheetEntry {
  song: Song;
  setlists: { name: string; status: string }[];
}

type SongPdfKind = 'leadsheet' | 'drum';
const SONG_PDF_LABEL: Record<SongPdfKind, string> = { leadsheet: 'Leadsheet', drum: 'Drum Sheet' };

function LeadsheetRow({ entry, kind, onOpen }: { entry: LeadsheetEntry; kind: SongPdfKind; onOpen: () => void }) {
  const { song, setlists } = entry;
  const Icon = kind === 'drum' ? Drum : FileText;
  const download = async () => {
    const pdf = await (kind === 'drum' ? db.drumSheets : db.pdfs).get(song.id);
    if (pdf) downloadBlob(new Blob([pdf.data], { type: 'application/pdf' }), pdf.name);
  };
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-1 text-left">
        <span className="block truncate font-semibold">{song.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-stage-muted">
          {song.artist && <span className="mr-1">{song.artist}</span>}
          {setlists.length === 0 ? (
            <span className="text-stage-subtle">in keiner Setlist</span>
          ) : (
            setlists.map(({ name, status }) => (
              <Badge key={name} tone={status === 'fix' ? 'green' : status === 'offen' ? 'amber' : 'neutral'}>
                {name}
                {status === 'offen' ? ' · Abklärung' : status === 'raus' ? ' · raus' : ''}
              </Badge>
            ))
          )}
        </span>
      </button>
      <IconButton icon={Eye} label={`${SONG_PDF_LABEL[kind]} „${song.title}“ ansehen`} onClick={onOpen} />
      <IconButton icon={Download} label={`${SONG_PDF_LABEL[kind]} „${song.title}“ herunterladen`} onClick={download} />
    </li>
  );
}

type Filter = 'alle' | 'leadsheets' | 'drumsheets' | string;

export function Media() {
  const { isAdmin } = useAdmin();
  const { toast } = useFeedback();
  const documents = useLiveQuery(() => db.documents.orderBy('createdAt').reverse().toArray(), []);
  const songs = useLiveQuery(() => db.songs.toArray(), []);
  const setlists = useLiveQuery(() => db.setlists.toArray(), []);
  const [filter, setFilter] = useState<Filter>('alle');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [openDoc, setOpenDoc] = useState<BandDocument | null>(null);
  const [openSong, setOpenSong] = useState<{ song: Song; kind: SongPdfKind } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const songPdfs = useMemo(() => {
    const entries = (has: (song: Song) => boolean): LeadsheetEntry[] =>
      (songs ?? [])
        .filter(has)
        .sort((a, b) => a.title.localeCompare(b.title, 'de'))
        .map((song) => ({
          song,
          setlists: (setlists ?? []).filter((setlist) => setlist.songIds.includes(song.id)).map((setlist) => ({ name: setlist.name, status: statusOf(setlist, song.id) })),
        }));
    return { leadsheets: entries((song) => Boolean(song.pdfName)), drumSheets: entries((song) => Boolean(song.drumSheetName)) };
  }, [songs, setlists]);
  const { leadsheets, drumSheets } = songPdfs;

  if (!documents || !songs || !setlists) return null;

  const term = search.trim().toLocaleLowerCase('de');
  const matches = (text: string) => !term || text.toLocaleLowerCase('de').includes(term);
  const shownDocs = filter === 'leadsheets' || filter === 'drumsheets' ? [] : documents.filter((doc) => (filter === 'alle' || doc.category === filter) && matches(`${doc.title} ${doc.fileName}`));
  const shownLeadsheets = filter === 'alle' || filter === 'leadsheets' ? leadsheets.filter(({ song }) => matches(`${song.title} ${song.artist}`)) : [];
  const shownDrumSheets = filter === 'alle' || filter === 'drumsheets' ? drumSheets.filter(({ song }) => matches(`${song.title} ${song.artist}`)) : [];
  const usedCategories = DOCUMENT_CATEGORIES.filter(({ id }) => documents.some((doc) => doc.category === id));

  const pickFile = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast(`„${file.name}“ ist ${formatBytes(file.size)} groß. Erlaubt sind höchstens 10 MB pro Datei, damit der Band-Sync schnell bleibt.`, 'error');
      return;
    }
    setEditor({ doc: null, file });
  };

  const open = (doc: BandDocument) => {
    if (isPdf(doc) || isImage(doc)) setOpenDoc(doc);
    else downloadBlob(new Blob([doc.data], { type: doc.mimeType }), doc.fileName);
  };

  const chips: { id: Filter; label: string; count: number }[] = [
    { id: 'alle', label: 'Alle', count: documents.length + leadsheets.length + drumSheets.length },
    ...usedCategories.map(({ id, label }) => ({ id, label, count: documents.filter((doc) => doc.category === id).length })),
    { id: 'leadsheets', label: 'Leadsheets', count: leadsheets.length },
    { id: 'drumsheets', label: 'Drum Sheets', count: drumSheets.length },
  ];

  return (
    <section>
      <PageHeader
        title="Medien"
        description="Band-Dokumente wie Rider, Angebot oder Pressetext – und alle Leadsheets und Drum Sheets aus den Songs."
        action={
          isAdmin && (
            <>
              <input ref={fileInput} type="file" accept={ACCEPT} className="sr-only" aria-label="Datei auswählen" onChange={(event) => pickFile(event.target.files?.[0])} />
              <Button variant="primary" icon={Upload} onClick={() => fileInput.current?.click()}>
                Datei hochladen
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-stage-subtle" aria-hidden />
          <input className="field pl-11" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Medien durchsuchen …" aria-label="Medien durchsuchen" />
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Nach Art filtern">
          {chips.map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`flex min-h-touch shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
                filter === id ? 'border-brand bg-brand text-on-fill' : 'border-stage-line bg-stage-surface text-stage-muted hover:text-stage-text'
              }`}
            >
              {label}
              <span className={`tabular-nums ${filter === id ? 'opacity-80' : 'text-stage-subtle'}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {filter !== 'leadsheets' && filter !== 'drumsheets' && (
        <div className="mb-8">
          <SectionTitle>Band-Dokumente</SectionTitle>
          {shownDocs.length > 0 ? (
            <ul className="card divide-y divide-stage-line">
              {shownDocs.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} onOpen={() => open(doc)} onEdit={isAdmin ? () => setEditor({ doc, file: null }) : undefined} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={FolderOpen} title={documents.length === 0 ? 'Noch keine Dokumente' : 'Nichts gefunden'}>
              {documents.length === 0
                ? isAdmin
                  ? 'Lade Technischen Rider, Stageplot, Angebot oder Pressetext hoch – PDF, Bilder oder Office-Dateien bis 10 MB.'
                  : 'Hier erscheinen Rider, Angebote und Pressetexte, sobald der Admin sie hochlädt.'
                : 'Probiere einen anderen Suchbegriff oder Filter.'}
            </EmptyState>
          )}
        </div>
      )}

      {(filter === 'alle' || filter === 'leadsheets') && (
        <div>
          <SectionTitle>Leadsheets aus den Songs</SectionTitle>
          {shownLeadsheets.length > 0 ? (
            <ul className="card divide-y divide-stage-line">
              {shownLeadsheets.map((entry) => (
                <LeadsheetRow key={entry.song.id} entry={entry} kind="leadsheet" onOpen={() => setOpenSong({ song: entry.song, kind: 'leadsheet' })} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={FileText} title={leadsheets.length === 0 ? 'Noch keine Leadsheets' : 'Nichts gefunden'}>
              {leadsheets.length === 0 ? 'PDFs hängst du im Bereich „Songs“ direkt an einen Song an.' : 'Probiere einen anderen Suchbegriff.'}
            </EmptyState>
          )}
        </div>
      )}

      {(filter === 'alle' || filter === 'drumsheets') && (
        <div className="mt-8">
          <SectionTitle>Drum Sheets aus den Songs</SectionTitle>
          {shownDrumSheets.length > 0 ? (
            <ul className="card divide-y divide-stage-line">
              {shownDrumSheets.map((entry) => (
                <LeadsheetRow key={entry.song.id} entry={entry} kind="drum" onOpen={() => setOpenSong({ song: entry.song, kind: 'drum' })} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Drum} title={drumSheets.length === 0 ? 'Noch keine Drum Sheets' : 'Nichts gefunden'}>
              {drumSheets.length === 0 ? 'Drum Sheets lädt der Admin im Bereich „Songs“ beim jeweiligen Song hoch – genau wie Leadsheets.' : 'Probiere einen anderen Suchbegriff.'}
            </EmptyState>
          )}
        </div>
      )}

      {!isAdmin && (
        <div className="mt-6">
          <InfoNote icon={Lock} tone="amber">
            Nur Lesen – neue Dateien lädt der Admin hoch. Ansehen und Herunterladen geht immer, auch offline.
          </InfoNote>
        </div>
      )}

      {editor && <DocumentEditor state={editor} onClose={() => setEditor(null)} />}
      {openDoc && isPdf(openDoc) && <PdfModal title={openDoc.title} file={{ name: openDoc.fileName, data: openDoc.data }} onClose={() => setOpenDoc(null)} />}
      {openDoc && !isPdf(openDoc) && <ImagePreview doc={openDoc} onClose={() => setOpenDoc(null)} />}
      {openSong && (
        <PdfViewer
          songId={openSong.song.id}
          title={openSong.kind === 'drum' ? `${openSong.song.title} · Drum Sheet` : openSong.song.title}
          source={openSong.kind}
          onClose={() => setOpenSong(null)}
        />
      )}
    </section>
  );
}
