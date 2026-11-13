import { describe, expect, it } from 'vitest';
import type { Setlist, Song } from '../db/schema';
import { groupByStatus, playableSongIds, reorderWithinGroup, statusOf } from './setlist';

const setlist: Setlist = {
  id: 's1',
  name: 'Test',
  songIds: ['a', 'b', 'c', 'd', 'e'],
  songStatus: { b: 'offen', d: 'raus', e: 'offen' },
};

const song = (id: string): Song => ({ id, title: id, artist: '', key: '', bpm: null, tuning: '', leadVocals: '', duration: '', structure: '', chords: '', pdfName: null, drumSheetName: null, bassSheetName: null });

describe('Setlist-Status', () => {
  it('behandelt Songs ohne Eintrag als fix', () => {
    expect(statusOf(setlist, 'a')).toBe('fix');
    expect(statusOf({ id: 'x', name: 'Alt', songIds: ['a'] }, 'a')).toBe('fix');
  });

  it('spielt erst alle fixen Songs, dann die in Abklärung – ohne „Nicht in Setlist“', () => {
    expect(playableSongIds(setlist)).toEqual(['a', 'c', 'b', 'e']);
  });

  it('gruppiert nach Status in Setlist-Reihenfolge', () => {
    const groups = groupByStatus(setlist, setlist.songIds.map(song));
    expect(groups.fix.map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(groups.offen.map((entry) => entry.id)).toEqual(['b', 'e']);
    expect(groups.raus.map((entry) => entry.id)).toEqual(['d']);
  });

  it('sortiert nur innerhalb einer Gruppe um und lässt die anderen Songs an ihrem Platz', () => {
    expect(reorderWithinGroup(setlist.songIds, ['e', 'b'])).toEqual(['a', 'e', 'c', 'd', 'b']);
    expect(reorderWithinGroup(setlist.songIds, ['c', 'a'])).toEqual(['c', 'b', 'a', 'd', 'e']);
  });
});
