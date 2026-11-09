import { useLiveQuery } from 'dexie-react-hooks';
import { Image as ImageIcon, Lightbulb, Loader2, NotebookPen, Plus, Save, ThumbsDown, ThumbsUp, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import { addBandName, addMoodboardImage, deleteBandName, deleteMoodboardImage, saveBrainstormText, voteBandName } from '../db/bandActions';
import { db, describeError, type BandName, type MoodboardItem } from '../db/schema';
import { prepareImage } from '../lib/files';
import { Button, EmptyState, IconButton, Modal, PageHeader, SectionTitle } from './ui';

function useImageUrl(item: MoodboardItem): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([item.data], { type: item.mimeType }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [item.data, item.mimeType]);
  return url;
}

function BandNameRow({ entry, rank, maxVotes }: { entry: BandName; rank: number; maxVotes: number }) {
  const { isAdmin } = useAdmin();
  const { toast, confirm } = useFeedback();
  const score = entry.upvotes - entry.downvotes;
  const total = entry.upvotes + entry.downvotes;
  const share = maxVotes > 0 ? (entry.upvotes / maxVotes) * 100 : 0;

  const vote = async (direction: 'up' | 'down') => {
    try {
      await voteBandName(entry.id, direction);
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  const remove = async () => {
    const confirmed = await confirm({
      title: 'Bandnamen löschen?',
      message: `„${entry.name}“ wird von der Liste entfernt.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteBandName(entry.id);
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${rank === 1 ? 'bg-brand/15 text-brand' : 'bg-stage-raised text-stage-muted'}`}>
        {rank}
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate font-semibold">{entry.name}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 max-w-40 flex-1 overflow-hidden rounded-full bg-stage-raised" aria-hidden>
            <div className="h-full rounded-full bg-brand/70" style={{ width: `${share}%` }} />
          </div>
          <span className="text-xs tabular-nums text-stage-subtle">
            {total} {total === 1 ? 'Stimme' : 'Stimmen'}
          </span>
        </div>
      </div>
      <span
        className={`w-10 shrink-0 text-right text-lg font-bold tabular-nums ${score > 0 ? 'text-brand' : score < 0 ? 'text-danger' : 'text-stage-subtle'}`}
        aria-label={`Bewertung ${score}`}
      >
        {score > 0 ? `+${score}` : score}
      </span>
      {isAdmin ? (
        <span className="flex shrink-0 gap-1">
          <Button icon={ThumbsUp} onClick={() => vote('up')} aria-label={`Gefällt mir: ${entry.name}, ${entry.upvotes} Stimmen`} title="Gefällt mir" className="px-3 tabular-nums">
            {entry.upvotes}
          </Button>
          <Button icon={ThumbsDown} onClick={() => vote('down')} aria-label={`Gefällt mir nicht: ${entry.name}, ${entry.downvotes} Stimmen`} title="Gefällt mir nicht" className="px-3 tabular-nums">
            {entry.downvotes}
          </Button>
          <IconButton icon={Trash2} label={`„${entry.name}“ löschen`} variant="danger" onClick={remove} />
        </span>
      ) : (
        <span className="flex shrink-0 gap-3 text-sm tabular-nums text-stage-muted">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-4 w-4" aria-label="Gefällt mir" /> {entry.upvotes}
          </span>
          <span className="flex items-center gap-1">
            <ThumbsDown className="h-4 w-4" aria-label="Gefällt mir nicht" /> {entry.downvotes}
          </span>
        </span>
      )}
    </li>
  );
}

function MoodboardTile({ item, onOpen }: { item: MoodboardItem; onOpen: () => void }) {
  const url = useImageUrl(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Bild öffnen: ${item.title || 'ohne Titel'}`}
      className="group relative aspect-square w-full overflow-hidden rounded-xl border border-stage-line bg-stage-surface"
    >
      {url && <img src={url} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}
      {item.title && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-left text-sm font-medium text-white">
          {item.title}
        </span>
      )}
    </button>
  );
}

function MoodboardLightbox({ item, onClose }: { item: MoodboardItem; onClose: () => void }) {
  const { isAdmin } = useAdmin();
  const { toast, confirm } = useFeedback();
  const url = useImageUrl(item);

  const remove = async () => {
    const confirmed = await confirm({
      title: 'Bild löschen?',
      message: `„${item.title || 'Dieses Bild'}“ wird aus dem Moodboard entfernt.`,
      confirmLabel: 'Bild löschen',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteMoodboardImage(item.id);
      onClose();
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  return (
    <Modal
      title={item.title || 'Moodboard-Bild'}
      onClose={onClose}
      size="full"
      headerExtra={isAdmin && <IconButton icon={Trash2} label="Bild löschen" variant="danger" onClick={remove} />}
    >
      <div className="flex h-full items-center justify-center bg-stage-bg p-3">
        {url && <img src={url} alt={item.title} className="max-h-full max-w-full rounded-lg object-contain" />}
      </div>
    </Modal>
  );
}

/** Gemeinsamer Freitext der Band: Ideen, Links, Songwünsche. Bearbeiten nur im Admin-Modus. */
function BrainstormText() {
  const { isAdmin } = useAdmin();
  const { toast } = useFeedback();
  const stored = useLiveQuery(async () => {
    const entry = await db.meta.get('brainstormText');
    return typeof entry?.value === 'string' ? entry.value : '';
  }, []);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (stored === undefined) return null;
  const text = draft ?? stored;
  const dirty = draft !== null && draft !== stored;

  const save = async () => {
    setSaving(true);
    try {
      await saveBrainstormText(text.trim());
      setDraft(null);
      toast('Freitext gespeichert.');
    } catch (error) {
      toast(describeError(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-8">
      <SectionTitle>Freitext</SectionTitle>
      {isAdmin ? (
        <div className="card p-3 sm:p-4">
          <textarea
            className="field min-h-40 resize-y leading-relaxed"
            value={text}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ideen, Songwünsche, Links, Absprachen … alles, was die Band wissen soll."
            aria-label="Freitext"
          />
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {dirty && <span className="mr-auto text-sm font-medium text-warn">Nicht gespeicherte Änderungen</span>}
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Verwerfen
              </Button>
            )}
            <Button variant="primary" icon={Save} disabled={!dirty || saving} onClick={save}>
              Freitext speichern
            </Button>
          </div>
        </div>
      ) : stored ? (
        <div className="card whitespace-pre-wrap break-words p-4 text-[15px] leading-relaxed sm:p-5">{stored}</div>
      ) : (
        <EmptyState icon={NotebookPen} title="Noch kein Freitext">
          Hier stehen Ideen und Absprachen, sobald der Admin sie einträgt.
        </EmptyState>
      )}
    </section>
  );
}

export function BandBrainstorm() {
  const { isAdmin } = useAdmin();
  const { toast } = useFeedback();
  const bandNames = useLiveQuery(() => db.bandNames.toArray(), []);
  const moodboard = useLiveQuery(() => db.moodboard.orderBy('createdAt').reverse().toArray(), []);
  const [newName, setNewName] = useState('');
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!bandNames || !moodboard) return null;

  const ranked = [...bandNames].sort(
    (a, b) => b.upvotes - b.downvotes - (a.upvotes - a.downvotes) || a.name.localeCompare(b.name, 'de'),
  );
  const maxVotes = Math.max(0, ...bandNames.map((entry) => entry.upvotes));
  const openImage = moodboard.find((item) => item.id === openImageId) ?? null;

  const submitName = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (bandNames.some((entry) => entry.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) {
      toast(`„${name}“ steht bereits auf der Liste.`, 'error');
      return;
    }
    try {
      await addBandName(name);
      setNewName('');
    } catch (error) {
      toast(describeError(error), 'error');
    }
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let added = 0;
    for (const file of Array.from(files)) {
      try {
        const { data, mimeType } = await prepareImage(file);
        await addMoodboardImage(file.name.replace(/\.[^.]+$/, ''), mimeType, data);
        added += 1;
      } catch (error) {
        toast(describeError(error), 'error');
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
    if (added > 0) toast(added === 1 ? 'Bild hinzugefügt.' : `${added} Bilder hinzugefügt.`);
  };

  return (
    <div>
      <PageHeader title="Band-Brainstorming" description="Ideen festhalten, Namen abstimmen und den Look der Band sammeln." />

      <BrainstormText />

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle>Bandnamen</SectionTitle>
          {isAdmin && (
            <form onSubmit={submitName} className="mb-3 flex gap-2">
              <input
                className="field min-w-0"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Neuer Namensvorschlag …"
                aria-label="Neuer Namensvorschlag"
              />
              <Button type="submit" variant="primary" icon={Plus} disabled={!newName.trim()} className="shrink-0">
                Hinzufügen
              </Button>
            </form>
          )}
          {ranked.length === 0 ? (
            <EmptyState icon={Lightbulb} title="Noch keine Namensideen">
              {isAdmin ? 'Trage oben den ersten Vorschlag ein.' : 'Der Admin kann im Admin-Bearbeitungsmodus Vorschläge eintragen.'}
            </EmptyState>
          ) : (
            <ol className="card divide-y divide-stage-line">
              {ranked.map((entry, index) => (
                <BandNameRow key={entry.id} entry={entry} rank={index + 1} maxVotes={maxVotes} />
              ))}
            </ol>
          )}
          {!isAdmin && ranked.length > 0 && (
            <p className="mt-3 text-sm text-stage-subtle">Abgestimmt wird gemeinsam: Der Admin trägt die Stimmen im Admin-Bearbeitungsmodus ein.</p>
          )}
        </section>

        <section>
          <SectionTitle
            action={
              isAdmin && (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                    multiple
                    className="sr-only"
                    aria-label="Bilder auswählen"
                    onChange={(event) => uploadImages(event.target.files)}
                  />
                  <Button icon={uploading ? Loader2 : Upload} disabled={uploading} onClick={() => fileInput.current?.click()}>
                    {uploading ? 'Wird gespeichert …' : 'Bilder hochladen'}
                  </Button>
                </>
              )
            }
          >
            Moodboard
          </SectionTitle>
          {moodboard.length === 0 ? (
            <EmptyState icon={ImageIcon} title="Das Moodboard ist noch leer">
              {isAdmin ? 'Lade Logos, Bühnen-Outfits oder Design-Ideen hoch. Große Fotos werden automatisch verkleinert.' : 'Hier erscheinen Logos und Design-Ideen, sobald der Admin sie teilt.'}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {moodboard.map((item) => (
                <MoodboardTile key={item.id} item={item} onOpen={() => setOpenImageId(item.id)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {openImage && <MoodboardLightbox item={openImage} onClose={() => setOpenImageId(null)} />}
    </div>
  );
}
