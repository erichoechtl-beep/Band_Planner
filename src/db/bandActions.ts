import { db, bandWrite, createId, type BandDocument, type PersonalNote, type Rehearsal, type Setlist, type Song, type SongStatus } from './schema';

/** Entfernt Status-Einträge zu Songs, die nicht mehr in der Setlist stehen. */
function pruneStatus(setlist: Setlist): void {
  if (!setlist.songStatus) return;
  const keep = new Set(setlist.songIds);
  for (const id of Object.keys(setlist.songStatus)) if (!keep.has(id)) delete setlist.songStatus[id];
}

export type SongInput = Omit<Song, 'id' | 'pdfName' | 'drumSheetName' | 'bassSheetName'>;

export type PdfChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; name: string; data: ArrayBuffer };

async function applyPdfChange(table: typeof db.pdfs, songId: string, change: PdfChange): Promise<void> {
  if (change.kind === 'remove') await table.delete(songId);
  if (change.kind === 'replace') await table.put({ songId, name: change.name, data: change.data });
}

function pdfNameAfter(change: PdfChange, previous: string | null): string | null {
  if (change.kind === 'replace') return change.name;
  if (change.kind === 'remove') return null;
  return previous;
}

/** Speichert einen Song samt Leadsheet-, Drum-Sheet- und Bass-Sheet-Änderung in einem Schritt. */
export function saveSong(
  id: string | null,
  input: SongInput,
  pdf: PdfChange,
  drumSheet: PdfChange = { kind: 'keep' },
  bassSheet: PdfChange = { kind: 'keep' },
): Promise<string> {
  return bandWrite(async () => {
    const songId = id ?? createId();
    const previous = id ? await db.songs.get(id) : undefined;
    await db.songs.put({
      ...input,
      id: songId,
      pdfName: pdfNameAfter(pdf, previous?.pdfName ?? null),
      drumSheetName: pdfNameAfter(drumSheet, previous?.drumSheetName ?? null),
      bassSheetName: pdfNameAfter(bassSheet, previous?.bassSheetName ?? null),
    });
    await applyPdfChange(db.pdfs, songId, pdf);
    await applyPdfChange(db.drumSheets, songId, drumSheet);
    await applyPdfChange(db.bassSheets, songId, bassSheet);
    return songId;
  });
}

/** Entfernt den Song auch aus allen Setlists. Persönliche Notizen dazu bleiben erhalten. */
export function deleteSong(id: string): Promise<void> {
  return bandWrite(async () => {
    await db.songs.delete(id);
    await db.pdfs.delete(id);
    await db.drumSheets.delete(id);
    await db.bassSheets.delete(id);
    await db.setlists.toCollection().modify((setlist) => {
      setlist.songIds = setlist.songIds.filter((songId) => songId !== id);
      pruneStatus(setlist);
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
    await db.setlists.where('id').equals(id).modify((setlist) => {
      setlist.songIds = songIds;
      pruneStatus(setlist);
    });
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

/** Gemeinsamer Freitext im Band-Brainstorming. */
export function saveBrainstormText(text: string): Promise<void> {
  return bandWrite(async () => {
    await db.meta.put({ key: 'brainstormText', value: text });
  });
}

export type RehearsalInput = Omit<Rehearsal, 'id'>;

export function saveRehearsal(id: string | null, input: RehearsalInput): Promise<string> {
  return bandWrite(async () => {
    const rehearsalId = id ?? createId();
    await db.rehearsals.put({ ...input, id: rehearsalId });
    return rehearsalId;
  });
}

export function deleteRehearsal(id: string): Promise<void> {
  return bandWrite(() => db.rehearsals.delete(id));
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

/** Hängt einen Song mit dem gewählten Status an die Setlist an. */
export function addSongToSetlist(setlistId: string, songId: string, status: SongStatus): Promise<void> {
  return bandWrite(async () => {
    await db.setlists.where('id').equals(setlistId).modify((setlist) => {
      if (!setlist.songIds.includes(songId)) setlist.songIds = [...setlist.songIds, songId];
      setlist.songStatus = { ...setlist.songStatus, [songId]: status };
    });
  });
}

/** Fix, in Abklärung oder nicht in der Setlist. */
export function setSongStatus(setlistId: string, songId: string, status: SongStatus): Promise<void> {
  return bandWrite(async () => {
    await db.setlists.where('id').equals(setlistId).modify((setlist) => {
      setlist.songStatus = { ...setlist.songStatus, [songId]: status };
    });
  });
}

export type DocumentInput = Pick<BandDocument, 'title' | 'category' | 'fileName' | 'mimeType' | 'data'>;

export function addDocument(input: DocumentInput): Promise<string> {
  return bandWrite(async () => {
    const id = createId();
    await db.documents.add({ ...input, id, size: input.data.byteLength, createdAt: new Date().toISOString() });
    return id;
  });
}

export function updateDocument(id: string, changes: Pick<BandDocument, 'title' | 'category'>): Promise<void> {
  return bandWrite(async () => {
    await db.documents.update(id, changes);
  });
}

export function deleteDocument(id: string): Promise<void> {
  return bandWrite(() => db.documents.delete(id));
}
