import Dexie, { type Table, type Transaction } from 'dexie';
import { arrayBufferToBase64, base64ToArrayBuffer, looksLikePdf, UserFacingError } from '../lib/files';
import { isValidDuration } from '../lib/time';
import { SEED_BAND_DATA, SEED_PERSONAL_NOTES } from './seedData';

// ---------------------------------------------------------------------------
// Tabellen
// ---------------------------------------------------------------------------

export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm: number | null;
  tuning: string;
  /** Format MM:SS oder leer */
  duration: string;
  structure: string;
  chords: string;
  /** Dateiname des verknüpften PDFs; die Binärdaten liegen getrennt in `pdfs`. */
  pdfName: string | null;
}

export interface Setlist {
  id: string;
  name: string;
  songIds: string[];
}

export interface BandName {
  id: string;
  name: string;
  upvotes: number;
  downvotes: number;
}

// Binärdaten liegen bewusst als ArrayBuffer vor: Blobs in IndexedDB sind auf iOS-Geräten unzuverlässig.
export interface MoodboardItem {
  id: string;
  title: string;
  mimeType: string;
  data: ArrayBuffer;
  createdAt: string;
}

export interface SongPdf {
  songId: string;
  name: string;
  data: ArrayBuffer;
}

/** Gerätespezifisch – gehört nicht zu den Band-Daten und wird nie exportiert oder überschrieben. */
export interface PersonalNote {
  id: string;
  songId: string;
  /** Kopie des Titels, damit eine Notiz lesbar bleibt, falls der Song aus den Band-Daten verschwindet. */
  songTitle: string;
  text: string;
  updatedAt: string;
}

interface MetaEntry {
  key: MetaKey;
  value: string | boolean | null;
}

type MetaKey = 'bandDataUpdatedAt' | 'hasLocalChanges' | 'lastExportedAt' | 'lastSyncedAt' | 'lastSyncSource';

// ---------------------------------------------------------------------------
// Dateiformat band-data.json
// ---------------------------------------------------------------------------

export const BAND_DATA_FORMAT = 'band-planner';
export const BAND_DATA_VERSION = 1;
export const BAND_DATA_FILE_NAME = 'band-data.json';

export interface SongFile extends Omit<Song, 'pdfName'> {
  pdf: { name: string; base64: string } | null;
}

export interface MoodboardFile {
  id: string;
  title: string;
  mimeType: string;
  base64: string;
  createdAt: string;
}

export interface BandDataFile {
  format: typeof BAND_DATA_FORMAT;
  schemaVersion: number;
  lastUpdated: string;
  songs: SongFile[];
  setlists: Setlist[];
  bandNames: BandName[];
  moodboard: MoodboardFile[];
}

/** Die Band-Daten sind ungültig oder nicht erreichbar. */
export class BandDataError extends UserFacingError {}

// ---------------------------------------------------------------------------
// Datenbank & Seed
// ---------------------------------------------------------------------------

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // crypto.randomUUID fehlt ohne HTTPS (z. B. Test im Heimnetz über http://192.168.…)
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function toTableRecords(file: BandDataFile) {
  const songs: Song[] = [];
  const pdfs: SongPdf[] = [];
  for (const { pdf, ...song } of file.songs) {
    songs.push({ ...song, pdfName: pdf?.name ?? null });
    if (pdf) pdfs.push({ songId: song.id, name: pdf.name, data: base64ToArrayBuffer(pdf.base64) });
  }
  const moodboard: MoodboardItem[] = file.moodboard.map(({ base64, ...item }) => ({
    ...item,
    data: base64ToArrayBuffer(base64),
  }));
  return { songs, pdfs, setlists: file.setlists, bandNames: file.bandNames, moodboard };
}

/** Befüllt eine neue, leere Datenbank mit den deutschen Start-Daten. */
async function seedDatabase(tx: Transaction): Promise<void> {
  const records = toTableRecords(SEED_BAND_DATA);
  await tx.table('songs').bulkAdd(records.songs);
  await tx.table('pdfs').bulkAdd(records.pdfs);
  await tx.table('setlists').bulkAdd(records.setlists);
  await tx.table('bandNames').bulkAdd(records.bandNames);
  await tx.table('moodboard').bulkAdd(records.moodboard);
  await tx.table('personalNotes').bulkAdd(SEED_PERSONAL_NOTES);
  const meta: MetaEntry[] = [
    { key: 'bandDataUpdatedAt', value: SEED_BAND_DATA.lastUpdated },
    { key: 'hasLocalChanges', value: false },
    { key: 'lastSyncSource', value: 'Start-Daten' },
  ];
  await tx.table('meta').bulkPut(meta);
}

class BandDatabase extends Dexie {
  songs!: Table<Song, string>;
  setlists!: Table<Setlist, string>;
  bandNames!: Table<BandName, string>;
  moodboard!: Table<MoodboardItem, string>;
  pdfs!: Table<SongPdf, string>;
  personalNotes!: Table<PersonalNote, string>;
  meta!: Table<MetaEntry, MetaKey>;

  constructor() {
    super('band-planner');
    this.version(1).stores({
      songs: 'id, title',
      setlists: 'id, name',
      bandNames: 'id, name',
      moodboard: 'id, createdAt',
      pdfs: 'songId',
      personalNotes: 'id, songId, updatedAt',
      meta: 'key',
    });
    // „populate“ läuft genau einmal beim Anlegen der Datenbank. Löscht der Admin später
    // alle Songs, kommen die Beispieldaten also nicht zurück.
    this.on('populate', (tx) => seedDatabase(tx));
  }
}

export const db = new BandDatabase();

/** Alle Tabellen, die zum geteilten Band-Stand gehören. `personalNotes` fehlt hier absichtlich. */
function bandTables() {
  return [db.songs, db.pdfs, db.setlists, db.bandNames, db.moodboard, db.meta];
}

/** Führt eine Admin-Änderung atomar aus und merkt sich, dass sie noch nicht exportiert wurde. */
export function bandWrite<T>(change: () => Promise<T>): Promise<T> {
  return db.transaction('rw', bandTables(), async () => {
    const result = await change();
    await db.meta.bulkPut([
      { key: 'bandDataUpdatedAt', value: new Date().toISOString() },
      { key: 'hasLocalChanges', value: true },
    ]);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface BandStatus {
  bandDataUpdatedAt: string | null;
  hasLocalChanges: boolean;
  lastExportedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncSource: string | null;
}

export async function getBandStatus(): Promise<BandStatus> {
  const entries = await db.meta.toArray();
  const value = (key: MetaKey) => entries.find((entry) => entry.key === key)?.value ?? null;
  return {
    bandDataUpdatedAt: value('bandDataUpdatedAt') as string | null,
    hasLocalChanges: value('hasLocalChanges') === true,
    lastExportedAt: value('lastExportedAt') as string | null,
    lastSyncedAt: value('lastSyncedAt') as string | null,
    lastSyncSource: value('lastSyncSource') as string | null,
  };
}

// ---------------------------------------------------------------------------
// Validierung
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireArray(root: Record<string, unknown>, field: string): unknown[] {
  const value = root[field];
  if (!Array.isArray(value)) throw new BandDataError(`In der Datei fehlt die Liste „${field}“.`);
  return value;
}

function requireString(record: Record<string, unknown>, field: string, context: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BandDataError(`${context}: Das Feld „${field}“ fehlt oder ist leer.`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, field: string, context: string): string {
  const value = record[field];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new BandDataError(`${context}: Das Feld „${field}“ muss Text sein.`);
  return value;
}

function count(record: Record<string, unknown>, field: string, context: string): number {
  const value = record[field] ?? 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BandDataError(`${context}: Das Feld „${field}“ muss eine ganze Zahl ab 0 sein.`);
  }
  return value;
}

function decodeOrThrow(base64: string, context: string): ArrayBuffer {
  try {
    return base64ToArrayBuffer(base64);
  } catch {
    throw new BandDataError(`${context}: Die eingebetteten Base64-Daten sind beschädigt.`);
  }
}

function assertUniqueIds(items: { id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) throw new BandDataError(`${label}: Die ID „${id}“ kommt doppelt vor.`);
    seen.add(id);
  }
}

function parseSong(raw: unknown, index: number): SongFile {
  const context = `Song ${index + 1}`;
  if (!isRecord(raw)) throw new BandDataError(`${context}: Eintrag ist ungültig.`);
  const label = typeof raw.title === 'string' && raw.title ? `Song „${raw.title}“` : context;

  const duration = optionalString(raw, 'duration', label);
  if (duration !== '' && !isValidDuration(duration)) {
    throw new BandDataError(`${label}: Die Dauer „${duration}“ entspricht nicht dem Format MM:SS.`);
  }
  const bpm = raw.bpm ?? null;
  if (bpm !== null && (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0)) {
    throw new BandDataError(`${label}: Das Tempo (BPM) muss eine positive Zahl sein.`);
  }

  let pdf: SongFile['pdf'] = null;
  if (raw.pdf !== undefined && raw.pdf !== null) {
    if (!isRecord(raw.pdf)) throw new BandDataError(`${label}: Die PDF-Angabe ist ungültig.`);
    const base64 = requireString(raw.pdf, 'base64', `${label} (PDF)`);
    if (!looksLikePdf(decodeOrThrow(base64, `${label} (PDF)`))) {
      throw new BandDataError(`${label}: Die eingebettete Datei ist kein PDF.`);
    }
    pdf = { name: requireString(raw.pdf, 'name', `${label} (PDF)`), base64 };
  }

  return {
    id: requireString(raw, 'id', label),
    title: requireString(raw, 'title', label),
    artist: optionalString(raw, 'artist', label),
    key: optionalString(raw, 'key', label),
    bpm,
    tuning: optionalString(raw, 'tuning', label),
    duration,
    structure: optionalString(raw, 'structure', label),
    chords: optionalString(raw, 'chords', label),
    pdf,
  };
}

function parseSetlist(raw: unknown, index: number, knownSongIds: Set<string>): Setlist {
  const context = `Setlist ${index + 1}`;
  if (!isRecord(raw)) throw new BandDataError(`${context}: Eintrag ist ungültig.`);
  if (!Array.isArray(raw.songIds)) throw new BandDataError(`${context}: Die Liste „songIds“ fehlt.`);
  // Verweise auf nicht vorhandene Songs und Dubletten werden still bereinigt.
  const songIds = [...new Set(raw.songIds)].filter(
    (id): id is string => typeof id === 'string' && knownSongIds.has(id),
  );
  return { id: requireString(raw, 'id', context), name: requireString(raw, 'name', context), songIds };
}

function parseBandName(raw: unknown, index: number): BandName {
  const context = `Bandname ${index + 1}`;
  if (!isRecord(raw)) throw new BandDataError(`${context}: Eintrag ist ungültig.`);
  return {
    id: requireString(raw, 'id', context),
    name: requireString(raw, 'name', context),
    upvotes: count(raw, 'upvotes', context),
    downvotes: count(raw, 'downvotes', context),
  };
}

function parseMoodboardItem(raw: unknown, index: number): MoodboardFile {
  const context = `Moodboard-Bild ${index + 1}`;
  if (!isRecord(raw)) throw new BandDataError(`${context}: Eintrag ist ungültig.`);
  const mimeType = requireString(raw, 'mimeType', context);
  if (!mimeType.startsWith('image/')) throw new BandDataError(`${context}: Die Datei ist kein Bild.`);
  const base64 = requireString(raw, 'base64', context);
  decodeOrThrow(base64, context);
  return {
    id: requireString(raw, 'id', context),
    title: optionalString(raw, 'title', context),
    mimeType,
    base64,
    createdAt: optionalString(raw, 'createdAt', context) || new Date(0).toISOString(),
  };
}

/** Prüft eine geladene Datei vollständig, bevor irgendetwas in die Datenbank geschrieben wird. */
export function parseBandData(raw: unknown): BandDataFile {
  if (!isRecord(raw)) throw new BandDataError('Die Datei enthält keine Band-Daten.');
  if (raw.format !== BAND_DATA_FORMAT) {
    throw new BandDataError('Das ist keine Band-Planner-Datei (Kennung „format“ fehlt oder ist falsch).');
  }
  if (typeof raw.schemaVersion !== 'number') {
    throw new BandDataError('In der Datei fehlt die Versionsangabe „schemaVersion“.');
  }
  if (raw.schemaVersion > BAND_DATA_VERSION) {
    throw new BandDataError(
      `Die Datei stammt aus einer neueren App-Version (${raw.schemaVersion}). Bitte aktualisiere zuerst die App.`,
    );
  }
  const lastUpdated = requireString(raw, 'lastUpdated', 'Datei');
  if (Number.isNaN(new Date(lastUpdated).getTime())) {
    throw new BandDataError(`Der Zeitstempel „${lastUpdated}“ ist ungültig.`);
  }

  const songs = requireArray(raw, 'songs').map(parseSong);
  assertUniqueIds(songs, 'Songs');
  const knownSongIds = new Set(songs.map((song) => song.id));
  const setlists = requireArray(raw, 'setlists').map((entry, index) => parseSetlist(entry, index, knownSongIds));
  assertUniqueIds(setlists, 'Setlists');
  const bandNames = requireArray(raw, 'bandNames').map(parseBandName);
  assertUniqueIds(bandNames, 'Bandnamen');
  const moodboard = requireArray(raw, 'moodboard').map(parseMoodboardItem);
  assertUniqueIds(moodboard, 'Moodboard');

  return { format: BAND_DATA_FORMAT, schemaVersion: BAND_DATA_VERSION, lastUpdated, songs, setlists, bandNames, moodboard };
}

export function parseBandDataText(text: string): BandDataFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BandDataError('Die Datei ist keine gültige JSON-Datei.');
  }
  return parseBandData(raw);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Liest alle Band-Tabellen und verpackt sie samt Base64-Dateien. Persönliche Notizen bleiben außen vor. */
export async function buildBandDataFile(): Promise<BandDataFile> {
  return db.transaction('r', bandTables(), async () => {
    const [songs, pdfs, setlists, bandNames, moodboard, status] = await Promise.all([
      db.songs.toArray(),
      db.pdfs.toArray(),
      db.setlists.toArray(),
      db.bandNames.toArray(),
      db.moodboard.toArray(),
      getBandStatus(),
    ]);
    const pdfBySong = new Map(pdfs.map((pdf) => [pdf.songId, pdf]));
    return {
      format: BAND_DATA_FORMAT,
      schemaVersion: BAND_DATA_VERSION,
      // Der Zeitstempel bezeichnet die letzte Änderung: Ein erneuter Export ohne Änderung
      // zählt für die Band nicht als neuer Stand.
      lastUpdated: status.bandDataUpdatedAt ?? new Date().toISOString(),
      songs: songs.map(({ pdfName: _pdfName, ...song }) => {
        const pdf = pdfBySong.get(song.id);
        return { ...song, pdf: pdf ? { name: pdf.name, base64: arrayBufferToBase64(pdf.data) } : null };
      }),
      setlists,
      bandNames,
      moodboard: moodboard.map(({ data, ...item }) => ({ ...item, base64: arrayBufferToBase64(data) })),
    };
  });
}

export async function markExported(file: BandDataFile): Promise<void> {
  await db.meta.bulkPut([
    { key: 'bandDataUpdatedAt', value: file.lastUpdated },
    { key: 'hasLocalChanges', value: false },
    { key: 'lastExportedAt', value: new Date().toISOString() },
  ]);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportAssessment {
  /** Lokal gibt es Änderungen, die noch nicht exportiert wurden und verloren gingen. */
  hasLocalChanges: boolean;
  /** Der neue Stand ist älter als der lokale. */
  isOlder: boolean;
  /** Der neue Stand entspricht dem lokalen. */
  isSameVersion: boolean;
}

export async function assessImport(file: BandDataFile): Promise<ImportAssessment> {
  const status = await getBandStatus();
  const incoming = new Date(file.lastUpdated).getTime();
  const local = status.bandDataUpdatedAt ? new Date(status.bandDataUpdatedAt).getTime() : null;
  return {
    hasLocalChanges: status.hasLocalChanges,
    isOlder: local !== null && incoming < local,
    isSameVersion: local !== null && incoming === local,
  };
}

/**
 * Ersetzt den Band-Stand atomar: Scheitert ein Schritt, bleibt der alte Stand vollständig erhalten.
 * `personalNotes` gehört nicht zum Transaktionsumfang – Dexie würde jeden Zugriff darauf ablehnen.
 */
export async function applyBandData(file: BandDataFile, source: string): Promise<void> {
  const records = toTableRecords(file);
  await db.transaction('rw', bandTables(), async () => {
    await Promise.all([db.songs.clear(), db.pdfs.clear(), db.setlists.clear(), db.bandNames.clear(), db.moodboard.clear()]);
    await db.songs.bulkAdd(records.songs);
    await db.pdfs.bulkAdd(records.pdfs);
    await db.setlists.bulkAdd(records.setlists);
    await db.bandNames.bulkAdd(records.bandNames);
    await db.moodboard.bulkAdd(records.moodboard);
    await db.meta.bulkPut([
      { key: 'bandDataUpdatedAt', value: file.lastUpdated },
      { key: 'hasLocalChanges', value: false },
      { key: 'lastSyncedAt', value: new Date().toISOString() },
      { key: 'lastSyncSource', value: source },
    ]);
  });
}

/**
 * Lädt die im Repo hinterlegte band-data.json. Der relative Pfad funktioniert in jedem Unterordner.
 * `no-store` lädt immer komplett, `no-cache` fragt per ETag nach und überträgt bei unverändertem Stand nichts.
 */
export async function fetchBandDataFromServer(cache: RequestCache = 'no-store'): Promise<BandDataFile> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new BandDataError(
      'Du bist gerade offline. Der Server-Sync braucht eine Internetverbindung – deine lokalen Daten bleiben verfügbar.',
    );
  }
  let response: Response;
  try {
    response = await fetch('./band-data.json', { cache });
  } catch {
    throw new BandDataError('Der Server ist nicht erreichbar. Bitte prüfe die Internetverbindung und versuche es erneut.');
  }
  if (response.status === 404) {
    throw new BandDataError('Auf dem Server liegt keine band-data.json. Der Admin muss sie zuerst in den public/-Ordner legen.');
  }
  if (!response.ok) {
    throw new BandDataError(`Der Server hat mit einem Fehler geantwortet (Status ${response.status}).`);
  }
  return parseBandDataText(await response.text());
}

export type AutoSyncDecision = 'skip' | 'apply' | 'ask';

/**
 * Entscheidet, was mit einem Server-Stand passiert: Neuere Stände werden übernommen,
 * außer es gibt lokale, nicht exportierte Änderungen – dann wird gefragt.
 */
export function decideAutoSync(assessment: ImportAssessment): AutoSyncDecision {
  if (assessment.isSameVersion || assessment.isOlder) return 'skip';
  return assessment.hasLocalChanges ? 'ask' : 'apply';
}

export type AutoSyncResult =
  | { kind: 'current' }
  | { kind: 'updated'; file: BandDataFile }
  | { kind: 'conflict'; file: BandDataFile };

/** Prüft den Server auf einen neueren Band-Stand und übernimmt ihn, wenn dabei nichts verloren geht. */
export async function autoSyncFromServer(): Promise<AutoSyncResult> {
  const file = await fetchBandDataFromServer('no-cache');
  const decision = decideAutoSync(await assessImport(file));
  if (decision === 'skip') return { kind: 'current' };
  if (decision === 'ask') return { kind: 'conflict', file };
  await applyBandData(file, 'Automatisch vom Server');
  return { kind: 'updated', file };
}

// ---------------------------------------------------------------------------
// Fehlertexte
// ---------------------------------------------------------------------------

export function describeError(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  const candidate = error as { name?: string; inner?: { name?: string } } | null;
  if (candidate?.name === 'QuotaExceededError' || candidate?.inner?.name === 'QuotaExceededError') {
    return 'Der Speicher dieses Geräts ist voll. Bitte gib Speicherplatz frei und versuche es erneut.';
  }
  return 'Die Daten konnten nicht verarbeitet werden. Bitte versuche es erneut.';
}
