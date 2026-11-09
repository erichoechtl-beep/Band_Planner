import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addBandName,
  deleteSong,
  saveBrainstormText,
  saveRehearsal,
  savePersonalNote,
  saveSong,
} from './bandActions';
import {
  applyBandData,
  autoSyncFromServer,
  decideAutoSync,
  assessImport,
  BandDataError,
  buildBandDataFile,
  db,
  fetchBandDataFromServer,
  getBandStatus,
  markExported,
  parseBandData,
  parseBandDataText,
  type BandDataFile,
} from './schema';
import { SEED_BAND_DATA } from './seedData';

function cloneSeed(): BandDataFile {
  return structuredClone(SEED_BAND_DATA);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Start-Daten', () => {
  it('befüllt eine leere Datenbank genau einmal', async () => {
    expect(await db.songs.count()).toBeGreaterThanOrEqual(3);
    expect(await db.setlists.count()).toBeGreaterThanOrEqual(1);
    expect(await db.bandNames.count()).toBeGreaterThanOrEqual(3);
    expect(await db.personalNotes.count()).toBeGreaterThanOrEqual(1);

    const songs = await db.songs.toArray();
    for (const song of songs) await deleteSong(song.id);
    db.close();
    await db.open();
    expect(await db.songs.count()).toBe(0);
  });

  it('die mitgelieferte band-data.json ist gültig', () => {
    const text = readFileSync(new URL('../../public/band-data.json', import.meta.url), 'utf8');
    expect(() => parseBandDataText(text)).not.toThrow();
  });
});

describe('Schutz persönlicher Notizen', () => {
  it('Import lässt personalNotes vollständig unangetastet', async () => {
    await savePersonalNote({ songId: 'song-major-tom', songTitle: 'Major Tom', text: 'Meine Notiz' });
    const before = await db.personalNotes.toArray();

    const incoming = cloneSeed();
    incoming.lastUpdated = '2030-01-01T00:00:00.000Z';
    incoming.songs = incoming.songs.slice(0, 1);
    incoming.setlists = [];
    await applyBandData(incoming, 'Test');

    expect(await db.songs.count()).toBe(1);
    expect(await db.personalNotes.toArray()).toEqual(before);
  });

  it('Löschen eines Songs behält die zugehörigen Notizen', async () => {
    const before = await db.personalNotes.count();
    await deleteSong('song-westerland');
    expect(await db.personalNotes.count()).toBe(before);
  });

  it('Export enthält keine persönlichen Notizen', async () => {
    const file = await buildBandDataFile();
    expect(JSON.stringify(file)).not.toContain('Delay-Pedal');
    expect(file).not.toHaveProperty('personalNotes');
  });

  it('Notizen lösen keinen Hinweis auf offene Band-Änderungen aus', async () => {
    await savePersonalNote({ songId: 'song-major-tom', songTitle: 'Major Tom', text: 'Nur für mich' });
    expect((await getBandStatus()).hasLocalChanges).toBe(false);
  });
});

describe('Export und Import', () => {
  it('überführt PDFs und Bilder verlustfrei hin und zurück', async () => {
    const image = new Uint8Array([1, 2, 3, 250, 251, 252]).buffer;
    await db.moodboard.add({ id: 'bild', title: 'Logo', mimeType: 'image/png', data: image, createdAt: '2026-02-01T00:00:00.000Z' });
    const originalPdf = await db.pdfs.get('song-westerland');

    const text = JSON.stringify(await buildBandDataFile());
    const parsed = parseBandDataText(text);
    await applyBandData(parsed, 'Test');

    const pdf = await db.pdfs.get('song-westerland');
    expect(new Uint8Array(pdf!.data)).toEqual(new Uint8Array(originalPdf!.data));
    expect((await db.songs.get('song-westerland'))?.pdfName).toBe('Westerland-Leadsheet.pdf');
    expect(new Uint8Array((await db.moodboard.get('bild'))!.data)).toEqual(new Uint8Array(image));
  });

  it('entfernt beim Import alte Songs vollständig samt PDF', async () => {
    const incoming = cloneSeed();
    incoming.songs = incoming.songs.filter((song) => song.id !== 'song-westerland');
    await applyBandData(parseBandData(incoming), 'Test');
    expect(await db.songs.get('song-westerland')).toBeUndefined();
    expect(await db.pdfs.get('song-westerland')).toBeUndefined();
    expect((await db.setlists.toArray())[0].songIds).not.toContain('song-westerland');
  });

  it('erkennt ungespeicherte Änderungen und ältere Stände', async () => {
    expect((await assessImport(cloneSeed())).isSameVersion).toBe(true);

    await addBandName('Neue Idee');
    const assessment = await assessImport(cloneSeed());
    expect(assessment.hasLocalChanges).toBe(true);
    expect(assessment.isOlder).toBe(true);

    await markExported(await buildBandDataFile());
    expect((await getBandStatus()).hasLocalChanges).toBe(false);
  });

  it('erhält den Zeitstempel beim erneuten Export ohne Änderung', async () => {
    const first = await buildBandDataFile();
    await markExported(first);
    expect((await buildBandDataFile()).lastUpdated).toBe(first.lastUpdated);
  });
});

describe('Admin-Aktionen', () => {
  it('Löschen entfernt den Song aus Setlists und das PDF', async () => {
    await deleteSong('song-westerland');
    expect((await db.setlists.toArray())[0].songIds).not.toContain('song-westerland');
    expect(await db.pdfs.get('song-westerland')).toBeUndefined();
  });

  it('Speichern behält das PDF und kann es entfernen', async () => {
    const song = (await db.songs.get('song-westerland'))!;
    const { id, pdfName, ...input } = song;
    expect(pdfName).not.toBeNull();
    await saveSong(id, { ...input, bpm: 180 }, { kind: 'keep' });
    expect((await db.songs.get(id))?.pdfName).toBe(pdfName);
    expect(await db.pdfs.get(id)).toBeDefined();

    await saveSong(id, input, { kind: 'remove' });
    expect((await db.songs.get(id))?.pdfName).toBeNull();
    expect(await db.pdfs.get(id)).toBeUndefined();
  });
});

describe('Validierung mit deutschen Meldungen', () => {
  it('lehnt kaputtes JSON ab', () => {
    expect(() => parseBandDataText('{ kaputt')).toThrow('keine gültige JSON-Datei');
  });

  it('lehnt fremde Dateien ab', () => {
    expect(() => parseBandDataText('{"hallo":"welt"}')).toThrow('keine Band-Planner-Datei');
    expect(() => parseBandDataText('[1,2,3]')).toThrow(BandDataError);
  });

  it('lehnt Dateien neuerer App-Versionen ab', () => {
    expect(() => parseBandData({ ...cloneSeed(), schemaVersion: 99 })).toThrow('neueren App-Version');
  });

  it('benennt fehlerhafte Einträge', () => {
    const wrongDuration = cloneSeed();
    wrongDuration.songs[0].duration = '3 Minuten';
    expect(() => parseBandData(wrongDuration)).toThrow('Tage wie diese');

    const fakePdf = cloneSeed();
    fakePdf.songs[0].pdf = { name: 'x.pdf', base64: btoa('kein pdf') };
    expect(() => parseBandData(fakePdf)).toThrow('kein PDF');

    const brokenBase64 = cloneSeed();
    brokenBase64.moodboard = [{ id: 'a', title: '', mimeType: 'image/png', base64: '***', createdAt: '' }];
    expect(() => parseBandData(brokenBase64)).toThrow('beschädigt');

    const duplicate = cloneSeed();
    duplicate.songs[1].id = duplicate.songs[0].id;
    expect(() => parseBandData(duplicate)).toThrow('doppelt');
  });

  it('bereinigt Setlist-Verweise auf fehlende Songs', () => {
    const file = cloneSeed();
    file.setlists[0].songIds = ['song-major-tom', 'gibt-es-nicht', 'song-major-tom'];
    expect(parseBandData(file).setlists[0].songIds).toEqual(['song-major-tom']);
  });

  it('lässt den alten Stand bei ungültiger Datei unverändert', async () => {
    const before = await db.songs.count();
    expect(() => parseBandDataText('{"format":"band-planner"}')).toThrow();
    expect(await db.songs.count()).toBe(before);
  });
});

describe('GitHub-Sync', () => {
  it('meldet offline eine verständliche Fehlermeldung ohne Netzabruf', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: false });
    await expect(fetchBandDataFromServer()).rejects.toThrow('offline');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ruft den relativen Pfad ohne Cache ab', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(cloneSeed())));
    vi.stubGlobal('fetch', fetchMock);
    await fetchBandDataFromServer();
    expect(fetchMock).toHaveBeenCalledWith('./band-data.json', { cache: 'no-store' });
  });

  it('meldet 404, Netzfehler und HTML-Antworten verständlich', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nicht da', { status: 404 })));
    await expect(fetchBandDataFromServer()).rejects.toThrow('keine band-data.json');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fetchBandDataFromServer()).rejects.toThrow('nicht erreichbar');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>')));
    await expect(fetchBandDataFromServer()).rejects.toThrow('keine gültige JSON-Datei');
  });
});

describe('Automatischer Abgleich', () => {
  const serveFile = (file: BandDataFile) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(file)));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const newerFile = () => {
    const file = cloneSeed();
    file.lastUpdated = '2099-01-01T00:00:00.000Z';
    file.songs[0].title = 'Neu vom Server';
    return file;
  };

  it('entscheidet: neuer übernehmen, gleich/älter überspringen, bei lokalen Änderungen fragen', () => {
    expect(decideAutoSync({ hasLocalChanges: false, isOlder: false, isSameVersion: false })).toBe('apply');
    expect(decideAutoSync({ hasLocalChanges: true, isOlder: false, isSameVersion: false })).toBe('ask');
    expect(decideAutoSync({ hasLocalChanges: false, isOlder: false, isSameVersion: true })).toBe('skip');
    expect(decideAutoSync({ hasLocalChanges: true, isOlder: true, isSameVersion: false })).toBe('skip');
  });

  it('übernimmt einen neueren Server-Stand automatisch und behält persönliche Notizen', async () => {
    await savePersonalNote({ songId: 'song-major-tom', songTitle: 'Major Tom', text: 'Meine Notiz' });
    const notesBefore = await db.personalNotes.toArray();
    const file = newerFile();
    serveFile(file);
    const result = await autoSyncFromServer();
    expect(result.kind).toBe('updated');
    expect((await db.songs.get(file.songs[0].id))?.title).toBe('Neu vom Server');
    expect((await getBandStatus()).bandDataUpdatedAt).toBe(file.lastUpdated);
    expect(await db.personalNotes.toArray()).toEqual(notesBefore);
  });

  it('fragt per ETag nach und lässt einen gleichen Stand unverändert', async () => {
    const fetchMock = serveFile(cloneSeed());
    expect((await autoSyncFromServer()).kind).toBe('current');
    expect(fetchMock).toHaveBeenCalledWith('./band-data.json', { cache: 'no-cache' });
  });

  it('überschreibt keine lokalen, nicht exportierten Änderungen', async () => {
    await addBandName('Lokale Idee');
    const file = newerFile();
    serveFile(file);
    const result = await autoSyncFromServer();
    expect(result.kind).toBe('conflict');
    expect((await db.songs.get(file.songs[0].id))?.title).not.toBe('Neu vom Server');
    expect((await db.bandNames.toArray()).some((name) => name.name === 'Lokale Idee')).toBe(true);
  });
});

describe('Probenkalender und Freitext', () => {
  it('exportiert und importiert Termine und Freitext verlustfrei', async () => {
    await saveRehearsal(null, { date: '2026-12-03', time: '19:30', title: 'Probe', location: 'Proberaum', note: 'Neue Songs' });
    await saveBrainstormText('Mehr Zugaben einplanen');
    expect((await getBandStatus()).hasLocalChanges).toBe(true);
    const exported = await buildBandDataFile();
    expect(exported.rehearsals).toHaveLength(1);
    expect(exported.brainstormText).toBe('Mehr Zugaben einplanen');

    const parsed = parseBandDataText(JSON.stringify({ ...exported, lastUpdated: '2099-01-01T00:00:00.000Z' }));
    await db.rehearsals.clear();
    await db.meta.put({ key: 'brainstormText', value: '' });
    await applyBandData(parsed, 'Test');
    expect((await db.rehearsals.toArray())[0]).toMatchObject({ date: '2026-12-03', time: '19:30', location: 'Proberaum' });
    expect((await db.meta.get('brainstormText'))?.value).toBe('Mehr Zugaben einplanen');
  });

  it('akzeptiert ältere Dateien ohne Termine und Freitext', () => {
    const { rehearsals: _r, brainstormText: _t, ...older } = cloneSeed();
    const parsed = parseBandData(older);
    expect(parsed.rehearsals).toEqual([]);
    expect(parsed.brainstormText).toBe('');
  });

  it('meldet ungültige Termine auf Deutsch', () => {
    const file = cloneSeed() as unknown as Record<string, unknown>;
    file.rehearsals = [{ id: 'r1', date: '2026-02-30' }];
    expect(() => parseBandData(file)).toThrow('Probentermin 1: Das Datum „2026-02-30“');
    file.rehearsals = [{ id: 'r1', date: '2026-02-03', time: '25:00' }];
    expect(() => parseBandData(file)).toThrow('Die Uhrzeit „25:00“');
  });

  it('übernimmt beim Upgrade einer bestehenden Datenbank alle Daten', async () => {
    db.close();
    await Dexie.delete('band-planner');
    const old = new Dexie('band-planner');
    old.version(1).stores({ songs: 'id, title', setlists: 'id, name', bandNames: 'id, name', moodboard: 'id, createdAt', pdfs: 'songId', personalNotes: 'id, songId, updatedAt', meta: 'key' });
    await old.open();
    await old.table('songs').add({ id: 'song-alt', title: 'Alter Song', artist: '', key: '', bpm: null, tuning: '', duration: '', structure: '', chords: '', pdfName: null });
    old.close();

    await db.open();
    expect(await db.songs.toArray()).toEqual([expect.objectContaining({ id: 'song-alt', title: 'Alter Song' })]);
    expect(await db.rehearsals.count()).toBe(0);
    expect((await buildBandDataFile()).brainstormText).toBe('');
  });
});
