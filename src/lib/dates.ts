// Termine werden als lokales Datum „JJJJ-MM-TT“ gespeichert, ohne Zeitzone.

export const pad = (value: number) => String(value).padStart(2, '0');

export function toKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function todayKey(): string {
  const now = new Date();
  return toKey(now.getFullYear(), now.getMonth(), now.getDate());
}

export function keyToDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function daysBetween(fromKey: string, toKeyValue: string): number {
  return Math.round((keyToDate(toKeyValue).getTime() - keyToDate(fromKey).getTime()) / 86_400_000);
}

export const fmtWeekdayShort = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
export const fmtMonthShort = new Intl.DateTimeFormat('de-DE', { month: 'short' });
export const fmtMonthYear = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
export const fmtLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function relativeLabel(key: string, today: string): string | null {
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff > 1 && diff <= 30) return `in ${diff} Tagen`;
  return null;
}

