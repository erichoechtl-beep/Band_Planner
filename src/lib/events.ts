import type { EventKind, Rehearsal } from '../db/schema';

export const KIND_LABEL: Record<EventKind, string> = {
  probe: 'Probe',
  konzert: 'Konzert',
};

/** Probe in Blau, Konzert in Orange – überall gleich. */
export const KIND_STYLE: Record<EventKind, { fill: string; soft: string; text: string; dot: string; ring: string }> = {
  probe: { fill: 'bg-brand text-on-fill', soft: 'bg-brand/10 text-brand', text: 'text-brand', dot: 'bg-brand', ring: 'ring-brand' },
  konzert: { fill: 'bg-concert text-on-fill', soft: 'bg-concert/10 text-concert', text: 'text-concert', dot: 'bg-concert', ring: 'ring-concert' },
};

/** Angezeigter Name: eigene Bezeichnung oder die Art des Termins. */
export function eventTitle(entry: Pick<Rehearsal, 'title' | 'kind'>): string {
  return entry.title.trim() || KIND_LABEL[entry.kind];
}

/** „Nächste Probe“ bzw. „Nächstes Konzert“ */
export function nextPhrase(kind: EventKind): string {
  return kind === 'konzert' ? 'Nächstes Konzert' : 'Nächste Probe';
}
