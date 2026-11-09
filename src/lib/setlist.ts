import type { Setlist, Song, SongStatus } from '../db/schema';

export const STATUS_LABEL: Record<SongStatus, string> = {
  fix: 'Fix in Setlist',
  offen: 'In Abklärung',
  raus: 'Nicht in Setlist',
};

export const STATUS_SHORT: Record<SongStatus, string> = {
  fix: 'Fix',
  offen: 'Abklärung',
  raus: 'Raus',
};

export function statusOf(setlist: Setlist, songId: string): SongStatus {
  return setlist.songStatus?.[songId] ?? 'fix';
}

export function resolveSongs(setlist: Setlist, songsById: Map<string, Song>): Song[] {
  return setlist.songIds.flatMap((id) => songsById.get(id) ?? []);
}

/** Songs für die Bühne: erst alle fixen, danach die in Abklärung – jeweils in Setlist-Reihenfolge. */
export function playableSongIds(setlist: Setlist): string[] {
  const fix = setlist.songIds.filter((id) => statusOf(setlist, id) === 'fix');
  const offen = setlist.songIds.filter((id) => statusOf(setlist, id) === 'offen');
  return [...fix, ...offen];
}

export function groupByStatus(setlist: Setlist, songs: Song[]): Record<SongStatus, Song[]> {
  const groups: Record<SongStatus, Song[]> = { fix: [], offen: [], raus: [] };
  for (const song of songs) groups[statusOf(setlist, song.id)].push(song);
  return groups;
}

/**
 * Sortiert innerhalb einer Statusgruppe um und behält die Position der übrigen Songs bei.
 * `groupOrder` ist die neue Reihenfolge der Gruppe.
 */
export function reorderWithinGroup(allIds: string[], groupOrder: string[]): string[] {
  const members = new Set(groupOrder);
  const queue = [...groupOrder];
  return allIds.map((id) => (members.has(id) ? queue.shift()! : id));
}
