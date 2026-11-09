const DURATION_PATTERN = /^(\d{1,3}):([0-5]\d)$/;

export function isValidDuration(value: string): boolean {
  return DURATION_PATTERN.test(value.trim());
}

/** Wandelt „MM:SS“ in Sekunden um; null bei leerer oder ungültiger Eingabe. */
export function parseDuration(value: string): number | null {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Gesamtdauer: „42:30 Min.“ bzw. ab einer Stunde „1:05:30 Std.“ */
export function formatTotalDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss} Std.`;
  return `${minutes}:${ss} Min.`;
}

export interface SetlistDuration {
  seconds: number;
  missing: number;
}

export function sumDurations(durations: string[]): SetlistDuration {
  let seconds = 0;
  let missing = 0;
  for (const duration of durations) {
    const parsed = parseDuration(duration);
    if (parsed === null) missing += 1;
    else seconds += parsed;
  }
  return { seconds, missing };
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'unbekannt';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unbekannt';
  return date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}
