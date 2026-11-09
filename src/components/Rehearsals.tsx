import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, Lock, MapPin, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useFeedback } from '../context/FeedbackContext';
import { deleteRehearsal, saveRehearsal, type RehearsalInput } from '../db/bandActions';
import { db, describeError, isValidDate, isValidTime, type Rehearsal } from '../db/schema';
import { Button, EmptyState, IconButton, InfoNote, Modal, PageHeader, SectionTitle } from './ui';

// ---------------------------------------------------------------------------
// Datums-Helfer: Termine werden als lokales Datum „JJJJ-MM-TT“ gespeichert, ohne Zeitzone.
// ---------------------------------------------------------------------------

const pad = (value: number) => String(value).padStart(2, '0');

function toKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function todayKey(): string {
  const now = new Date();
  return toKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function keyToDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(fromKey: string, toKeyValue: string): number {
  return Math.round((keyToDate(toKeyValue).getTime() - keyToDate(fromKey).getTime()) / 86_400_000);
}

const fmtWeekdayShort = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const fmtMonthShort = new Intl.DateTimeFormat('de-DE', { month: 'short' });
const fmtMonthYear = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const fmtLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function relativeLabel(key: string, today: string): string | null {
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff > 1 && diff <= 30) return `in ${diff} Tagen`;
  return null;
}

const titleOf = (rehearsal: Rehearsal) => rehearsal.title.trim() || 'Probe';
const sortRehearsals = (a: Rehearsal, b: Rehearsal) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const TITLE_SUGGESTIONS = ['Probe', 'Generalprobe', 'Auftritt', 'Soundcheck', 'Aufnahme'];

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function DateBlock({ dateKey, highlight = false }: { dateKey: string; highlight?: boolean }) {
  const date = keyToDate(dateKey);
  return (
    <div
      className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-lg py-1.5 leading-tight ${
        highlight ? 'bg-brand text-on-fill' : 'bg-stage-raised text-stage-text'
      }`}
      aria-hidden
    >
      <span className={`text-[11px] font-semibold uppercase ${highlight ? '' : 'text-stage-muted'}`}>{fmtWeekdayShort.format(date)}</span>
      <span className="text-xl font-bold tabular-nums">{date.getDate()}</span>
      <span className={`text-[11px] font-medium ${highlight ? '' : 'text-stage-muted'}`}>{fmtMonthShort.format(date)}</span>
    </div>
  );
}

function RehearsalDetails({ rehearsal, today }: { rehearsal: Rehearsal; today: string }) {
  const relative = relativeLabel(rehearsal.date, today);
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-x-2 font-semibold">
        {titleOf(rehearsal)}
        {relative && <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-xs font-semibold text-brand">{relative}</span>}
      </p>
      <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-stage-muted">
        {rehearsal.time && (
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {rehearsal.time} Uhr
          </span>
        )}
        {rehearsal.location && (
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{rehearsal.location}</span>
          </span>
        )}
      </p>
      {rehearsal.note && <p className="mt-1 whitespace-pre-wrap text-sm">{rehearsal.note}</p>}
    </div>
  );
}

function RehearsalRow({ rehearsal, today, onEdit }: { rehearsal: Rehearsal; today: string; onEdit?: () => void }) {
  const label = `${titleOf(rehearsal)} am ${fmtLong.format(keyToDate(rehearsal.date))}${rehearsal.time ? `, ${rehearsal.time} Uhr` : ''}`;
  const content = (
    <>
      <DateBlock dateKey={rehearsal.date} highlight={rehearsal.date === today} />
      <RehearsalDetails rehearsal={rehearsal} today={today} />
      {onEdit && <ChevronRight className="h-5 w-5 shrink-0 text-stage-subtle" aria-hidden />}
    </>
  );
  return (
    <li>
      {onEdit ? (
        <button type="button" onClick={onEdit} aria-label={`Bearbeiten: ${label}`} className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-stage-raised sm:px-4">
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-3 py-3 sm:px-4" aria-label={label}>
          {content}
        </div>
      )}
    </li>
  );
}

function NextRehearsal({ rehearsal, today }: { rehearsal: Rehearsal; today: string }) {
  const relative = relativeLabel(rehearsal.date, today);
  return (
    <section aria-label="Nächster Termin" className="card mb-6 overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand text-on-fill">
            <CalendarDays className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Nächster Termin{relative ? ` · ${relative}` : ''}</p>
            <p className="text-xl font-bold tracking-tight sm:text-2xl">{fmtLong.format(keyToDate(rehearsal.date))}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-[15px] text-stage-muted">
              <span className="font-semibold text-stage-text">{titleOf(rehearsal)}</span>
              {rehearsal.time && <span>{rehearsal.time} Uhr</span>}
              {rehearsal.location && <span>{rehearsal.location}</span>}
            </p>
          </div>
        </div>
      </div>
      {rehearsal.note && <p className="whitespace-pre-wrap border-t border-stage-line bg-stage-raised/50 px-4 py-3 text-[15px] sm:px-5">{rehearsal.note}</p>}
    </section>
  );
}

interface CalendarProps {
  month: { year: number; monthIndex: number };
  onMonthChange: (month: { year: number; monthIndex: number }) => void;
  datesWithEntries: Set<string>;
  selected: string | null;
  onSelect: (key: string) => void;
  today: string;
}

function MonthCalendar({ month, onMonthChange, datesWithEntries, selected, onSelect, today }: CalendarProps) {
  const { year, monthIndex } = month;
  const first = new Date(year, monthIndex, 1);
  const leading = (first.getDay() + 6) % 7; // Woche beginnt am Montag
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const shift = (delta: number) => {
    const next = new Date(year, monthIndex + delta, 1);
    onMonthChange({ year: next.getFullYear(), monthIndex: next.getMonth() });
  };
  const now = keyToDate(today);
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === monthIndex;

  return (
    <div className="card p-2 sm:p-4">
      <div className="mb-2 flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Vorheriger Monat" onClick={() => shift(-1)} />
        <h3 className="flex-1 text-center text-lg font-semibold" aria-live="polite">
          {fmtMonthYear.format(first)}
        </h3>
        {!isCurrentMonth && (
          <Button variant="ghost" onClick={() => onMonthChange({ year: now.getFullYear(), monthIndex: now.getMonth() })} className="px-3">
            Heute
          </Button>
        )}
        <IconButton icon={ChevronRight} label="Nächster Monat" onClick={() => shift(1)} />
      </div>
      <div className="grid grid-cols-7 text-center" role="grid" aria-label={`Kalender ${fmtMonthYear.format(first)}`}>
        {WEEKDAYS.map((day) => (
          <div key={day} className="eyebrow pb-1.5" role="columnheader">
            {day}
          </div>
        ))}
        {Array.from({ length: leading }, (_, index) => (
          <div key={`leer-${index}`} aria-hidden />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const key = toKey(year, monthIndex, day);
          const hasEntry = datesWithEntries.has(key);
          const isToday = key === today;
          const isSelected = key === selected;
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${fmtLong.format(keyToDate(key))}${hasEntry ? ', Termin' : ''}`}
              onClick={() => onSelect(key)}
              className="flex h-12 min-w-0 items-center justify-center"
            >
              <span
                className={`relative flex h-10 w-10 items-center justify-center rounded-full text-[15px] tabular-nums transition-colors ${
                  hasEntry && key < today
                    ? 'bg-brand/15 font-semibold text-brand'
                    : hasEntry
                    ? 'bg-brand font-bold text-on-fill'
                    : isSelected
                      ? 'bg-stage-hover font-semibold'
                      : 'hover:bg-stage-raised'
                } ${isToday ? 'ring-2 ring-brand ring-offset-2 ring-offset-stage-surface' : ''} ${isSelected && hasEntry ? 'ring-2 ring-stage-text ring-offset-2 ring-offset-stage-surface' : ''}`}
              >
                {day}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bearbeiten
// ---------------------------------------------------------------------------

function RehearsalEditor({ rehearsal, initialDate, onClose }: { rehearsal: Rehearsal | null; initialDate: string; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const [form, setForm] = useState<RehearsalInput>(
    rehearsal
      ? { date: rehearsal.date, time: rehearsal.time, title: rehearsal.title, location: rehearsal.location, note: rehearsal.note }
      : { date: initialDate, time: '19:00', title: 'Probe', location: '', note: '' },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof RehearsalInput>(key: K, value: RehearsalInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValidDate(form.date)) return setError('Bitte wähle ein gültiges Datum.');
    if (form.time && !isValidTime(form.time)) return setError('Bitte gib die Uhrzeit im Format HH:MM ein oder lass sie leer.');
    setSaving(true);
    try {
      await saveRehearsal(rehearsal?.id ?? null, {
        date: form.date,
        time: form.time,
        title: form.title.trim(),
        location: form.location.trim(),
        note: form.note.trim(),
      });
      toast(rehearsal ? 'Termin gespeichert.' : 'Termin hinzugefügt.');
      onClose();
    } catch (saveError) {
      setError(describeError(saveError));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!rehearsal) return;
    const confirmed = await confirm({
      title: 'Termin löschen?',
      message: `${titleOf(rehearsal)} am ${fmtLong.format(keyToDate(rehearsal.date))} wird aus dem Kalender entfernt.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteRehearsal(rehearsal.id);
      toast('Termin gelöscht.');
      onClose();
    } catch (deleteError) {
      toast(describeError(deleteError), 'error');
    }
  };

  return (
    <Modal title={rehearsal ? 'Termin bearbeiten' : 'Neuer Termin'} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">Datum *</span>
            <input type="date" className="field" value={form.date} onChange={(event) => set('date', event.target.value)} required />
          </label>
          <label className="block">
            <span className="field-label">Uhrzeit</span>
            <input type="time" className="field" value={form.time} onChange={(event) => set('time', event.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="field-label">Art des Termins</span>
          <input className="field" list="termin-arten" value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="Probe" />
          <datalist id="termin-arten">
            {TITLE_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="field-label">Ort</span>
          <input className="field" value={form.location} onChange={(event) => set('location', event.target.value)} placeholder="z. B. Proberaum" />
        </label>
        <label className="block">
          <span className="field-label">Notiz</span>
          <textarea className="field min-h-24" value={form.note} onChange={(event) => set('note', event.target.value)} placeholder="z. B. Neue Songs üben, Kabel mitbringen" />
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {rehearsal && (
            <Button variant="danger" icon={Trash2} onClick={remove}>
              Löschen
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              Speichern
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Seite
// ---------------------------------------------------------------------------

export function Rehearsals() {
  const { isAdmin } = useAdmin();
  const rehearsals = useLiveQuery(() => db.rehearsals.toArray(), []);
  const today = todayKey();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ rehearsal: Rehearsal | null; date: string } | null>(null);
  const [showPast, setShowPast] = useState(false);

  const sorted = useMemo(() => [...(rehearsals ?? [])].sort(sortRehearsals), [rehearsals]);
  const datesWithEntries = useMemo(() => new Set(sorted.map((entry) => entry.date)), [sorted]);
  if (!rehearsals) return null;

  const upcoming = sorted.filter((entry) => entry.date >= today);
  const past = sorted.filter((entry) => entry.date < today).reverse();
  const next = upcoming[0];
  const selectedEntries = selected ? sorted.filter((entry) => entry.date === selected) : [];
  const edit = isAdmin ? (rehearsal: Rehearsal) => () => setEditing({ rehearsal, date: rehearsal.date }) : undefined;

  return (
    <div>
      <PageHeader
        title="Probenkalender"
        description={upcoming.length === 0 ? 'Proben, Auftritte und andere Band-Termine.' : `${upcoming.length} ${upcoming.length === 1 ? 'anstehender Termin' : 'anstehende Termine'}`}
        action={
          isAdmin && (
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ rehearsal: null, date: selected && selected >= today ? selected : today })}>
              Termin hinzufügen
            </Button>
          )
        }
      />

      {next && <NextRehearsal rehearsal={next} today={today} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-8">
        <section aria-label="Monatskalender" className="space-y-3">
          <MonthCalendar month={month} onMonthChange={setMonth} datesWithEntries={datesWithEntries} selected={selected} onSelect={setSelected} today={today} />
          {selected && (
            <div className="card p-3 sm:p-4" aria-live="polite">
              <p className="mb-2 font-semibold">{fmtLong.format(keyToDate(selected))}</p>
              {selectedEntries.length > 0 ? (
                <ul className="-mx-3 divide-y divide-stage-line sm:-mx-4">
                  {selectedEntries.map((entry) => (
                    <RehearsalRow key={entry.id} rehearsal={entry} today={today} onEdit={edit?.(entry)} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stage-muted">An diesem Tag ist nichts geplant.</p>
              )}
              {isAdmin && (
                <Button icon={CalendarPlus} onClick={() => setEditing({ rehearsal: null, date: selected })} className="mt-3 w-full">
                  Termin an diesem Tag
                </Button>
              )}
            </div>
          )}
        </section>

        <section>
          <SectionTitle>Anstehende Termine</SectionTitle>
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Keine anstehenden Termine">
              {isAdmin ? 'Lege mit „Termin hinzufügen“ die nächste Probe an – oder tippe im Kalender auf einen Tag.' : 'Sobald der Admin Proben einträgt, erscheinen sie hier.'}
            </EmptyState>
          ) : (
            <ul className="card divide-y divide-stage-line">
              {upcoming.map((entry) => (
                <RehearsalRow key={entry.id} rehearsal={entry} today={today} onEdit={edit?.(entry)} />
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <div className="mt-4">
              <Button variant="ghost" onClick={() => setShowPast(!showPast)} aria-expanded={showPast} className="px-3">
                {showPast ? 'Vergangene Termine ausblenden' : `Vergangene Termine anzeigen (${past.length})`}
              </Button>
              {showPast && (
                <ul className="card mt-2 divide-y divide-stage-line opacity-80">
                  {past.map((entry) => (
                    <RehearsalRow key={entry.id} rehearsal={entry} today={today} onEdit={edit?.(entry)} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {!isAdmin && (
            <div className="mt-4">
              <InfoNote icon={Lock} tone="amber">
                Nur Lesen – Termine pflegt der Admin im Admin-Bearbeitungsmodus.
              </InfoNote>
            </div>
          )}
        </section>
      </div>

      {editing && <RehearsalEditor rehearsal={editing.rehearsal} initialDate={editing.date} onClose={() => setEditing(null)} />}
    </div>
  );
}
