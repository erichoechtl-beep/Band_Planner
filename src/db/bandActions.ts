import { db, bandWrite, createId, type PersonalNote, type Song } from './schema';

export type SongInput = Omit<Song, 'id' | 'pdfName'>;

export type PdfChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; name: string; data: ArrayBuffer };

async function applyPdfChange(songId: string, change: PdfChange): Promise<void> {
  if (change.kind === 'remove') await db.pdfs.delete(songId);
  if (change.kind === 'replace') await db.pdfs.put({ songId, name: change.name, data: change.data });
}

function pdfNameAfter(change: PdfChange, previous: string | null): string | null {
  if (change.kind === 'replace') return change.name;
  if (change.kind === 'remove') return null;
  return previous;
}

export function saveSong(id: string | null, input: SongInput, pdf: PdfChange): Promise<string> {
  return bandWrite(async () => {
    const songId = id ?? createId();
    const previous = id ? await db.songs.get(id) : undefined;
    await db.songs.put({ ...input, id: songId, pdfName: pdfNameAfter(pdf, previous?.pdfName ?? null) });
    await applyPdfChange(songId, pdf);
    return songId;
  });
}

/** Entfernt den Song auch aus allen Setlists. Persönliche Notizen dazu bleiben erhalten. */
export function deleteSong(id: string): Promise<void> {
  return bandWrite(async () => {
    await db.songs.delete(id);
    await db.pdfs.delete(id);
    await db.setlists.toCollection().modify((setlist) => {
      setlist.songIds = setlist.songIds.filter((songId) => songId !== id);
    });
  });
}

export function createSetlist(name: string): Promise<string> {
  return bandWrite(async () => {
    const id = createId();
    await db.setlists.add({ id, name, songIds: [] });
    return id;
  });
}

export function renameSetlist(id: string, name: string): Promise<void> {
  return bandWrite(async () => {
    await db.setlists.update(id, { name });
  });
}

export function deleteSetlist(id: string): Promise<void> {
  return bandWrite(() => db.setlists.delete(id));
}

export function setSetlistSongs(id: string, songIds: string[]): Promise<void> {
  return bandWrite(async () => {
    await db.setlists.update(id, { songIds });
  });
}

export function addBandName(name: string): Promise<void> {
  return bandWrite(async () => {
    await db.bandNames.add({ id: createId(), name, upvotes: 0, downvotes: 0 });
  });
}

export function voteBandName(id: string, direction: 'up' | 'down'): Promise<void> {
  return bandWrite(async () => {
    await db.bandNames.where('id').equals(id).modify((entry) => {
      if (direction === 'up') entry.upvotes += 1;
      else entry.downvotes += 1;
    });
  });
}

export function deleteBandName(id: string): Promise<void> {
  return bandWrite(() => db.bandNames.delete(id));
}

export function addMoodboardImage(title: string, mimeType: string, data: ArrayBuffer): Promise<void> {
  return bandWrite(async () => {
    await db.moodboard.add({ id: createId(), title, mimeType, data, createdAt: new Date().toISOString() });
  });
}

export function deleteMoodboardImage(id: string): Promise<void> {
  return bandWrite(() => db.moodboard.delete(id));
}

// ---------------------------------------------------------------------------
// Persönliche Notizen: laufen absichtlich nicht über bandWrite, denn sie sind
// kein Teil des Band-Stands und lösen keinen „nicht exportiert“-Hinweis aus.
// ---------------------------------------------------------------------------

export async function savePersonalNote(note: Pick<PersonalNote, 'songId' | 'songTitle' | 'text'> & { id?: string }): Promise<void> {
  await db.personalNotes.put({
    id: note.id ?? createId(),
    songId: note.songId,
    songTitle: note.songTitle,
    text: note.text,
    updatedAt: new Date().toISOString(),
  });
}

export async function deletePersonalNote(id: string): Promise<void> {
  await db.personalNotes.delete(id);
}
