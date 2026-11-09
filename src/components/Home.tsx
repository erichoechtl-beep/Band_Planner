import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { ArrowRight, CalendarDays, Clock, FileText, FolderOpen, ListMusic, MapPin, Music, Play, RefreshCw } from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import { db, type Rehearsal } from '../db/schema';
import { fmtLong, keyToDate, relativeLabel, todayKey } from '../lib/dates';
import { eventTitle, KIND_STYLE, nextPhrase } from '../lib/events';
import { groupByStatus, resolveSongs } from '../lib/setlist';
import { formatDateTime, formatTotalDuration, sumDurations } from '../lib/time';
import type { TabId } from './Header';
import { Button } from './ui';

interface HomeProps {
  onNavigate: (tab: TabId) => void;
  onStartStage: (setlistId: string) => void;
}

function greeting(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Guten Morgen';
  if (hour >= 11 && hour < 17) return 'Hallo';
  if (hour >= 17 && hour < 23) return 'Guten Abend';
  return 'Späte Session';
}

function rehearsalLine(next: Rehearsal | undefined, today: string): string {
  if (!next) return 'Noch kein Termin im Kalender – Zeit, die nächste Probe zu planen.';
  const what = next.kind === 'konzert' ? 'Konzert' : 'Probe';
  const named = next.title.trim() ? ` (${next.title.trim()})` : '';
  const relative = relativeLabel(next.date, today);
  const time = next.time ? ` um ${next.time} Uhr` : '';
  if (relative === 'Heute') return next.kind === 'konzert' ? `Heute ist Konzert${named}${time}. Toi, toi, toi!` : `Heute ist Probe${time}. Instrumente stimmen!`;
  if (relative === 'Morgen') return `Morgen ist ${what}${named}${time}.`;
  if (relative) return `${nextPhrase(next.kind)}${named} ${relative}.`;
  return `${nextPhrase(next.kind)}${named} am ${fmtLong.format(keyToDate(next.date))}.`;
}

/** Geschwungene Notenlinien mit ein paar Noten – Dekoration für den Kopfbereich. */
function StaffArt({ className = '' }: { className?: string }) {
  const lines = [0, 1, 2, 3, 4].map((index) => 120 + index * 16);
  const wave = (y: number) => `M-20 ${y} C 140 ${y - 46}, 300 ${y + 40}, 460 ${y - 6} S 700 ${y - 40}, 760 ${y - 18}`;
  return (
    <svg viewBox="0 0 720 300" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="staff-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.35" stopColor="white" stopOpacity="0.22" />
          <stop offset="1" stopColor="white" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {lines.map((y) => (
        <path key={y} d={wave(y)} stroke="url(#staff-fade)" strokeWidth="1.25" />
      ))}
      {/* Achtelpaar mit Balken */}
      <g fill="rgb(var(--c-brand))" stroke="rgb(var(--c-brand))">
        <ellipse cx="318" cy="150" rx="10" ry="7" transform="rotate(-22 318 150)" stroke="none" />
        <ellipse cx="366" cy="138" rx="10" ry="7" transform="rotate(-22 366 138)" stroke="none" />
        <path d="M327 146 V 84 M375 134 V 72" strokeWidth="2.5" />
        <path d="M327 86 L375 74" strokeWidth="7" strokeLinecap="square" />
      </g>
      {/* Einzelne Viertel- und Achtelnoten */}
      <g fill="white" fillOpacity="0.55" stroke="white" strokeOpacity="0.55">
        <ellipse cx="470" cy="118" rx="9" ry="6.5" transform="rotate(-22 470 118)" stroke="none" />
        <path d="M478 115 V 62" strokeWidth="2.2" />
        <ellipse cx="560" cy="104" rx="9" ry="6.5" transform="rotate(-22 560 104)" stroke="none" />
        <path d="M568 101 V 48 C 576 58, 590 62, 588 80" strokeWidth="2.2" />
        <ellipse cx="226" cy="132" rx="9" ry="6.5" transform="rotate(-22 226 132)" stroke="none" fillOpacity="0.3" />
        <path d="M234 129 V 78" strokeWidth="2.2" strokeOpacity="0.3" />
      </g>
      <g fill="rgb(var(--c-accent))" fillOpacity="0.8">
        <ellipse cx="640" cy="122" rx="8" ry="6" transform="rotate(-22 640 122)" />
        <rect x="646" y="72" width="2.2" height="48" />
      </g>
    </svg>
  );
}

function Equalizer() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3].map((bar) => (
        <span key={bar} className="eq-bar w-[3px] rounded-full bg-brand" style={{ animationDelay: `${bar * -0.27}s` }} />
      ))}
    </span>
  );
}

function CardTitle({ icon: Icon, children, action }: { icon: typeof Music; children: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-stage-subtle">
        <Icon className="h-4 w-4" aria-hidden />
        {children}
      </h3>
      {action}
    </div>
  );
}

export function Home({ onNavigate, onStartStage }: HomeProps) {
  const { isAdmin } = useAdmin();
  const data = useLiveQuery(async () => {
    const [rehearsals, setlists, songs, documents, meta] = await Promise.all([
      db.rehearsals.toArray(),
      db.setlists.toArray(),
      db.songs.toArray(),
      db.documents.count(),
      db.meta.toArray(),
    ]);
    return { rehearsals, setlists, songs, documents, meta };
  }, []);

  if (!data) return null;

  const today = todayKey();
  const now = new Date();
  const upcoming = data.rehearsals.filter((entry) => entry.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const next = upcoming[0];
  const songsById = new Map(data.songs.map((song) => [song.id, song]));
  const setlist = [...data.setlists].sort((a, b) => a.name.localeCompare(b.name, 'de'))[0];
  const groups = setlist ? groupByStatus(setlist, resolveSongs(setlist, songsById)) : null;
  const fixDuration = groups ? sumDurations(groups.fix.map((song) => song.duration)).seconds : 0;
  const total = groups ? groups.fix.length + groups.offen.length + groups.raus.length : 0;
  const leadsheets = data.songs.filter((song) => song.pdfName).length;
  const updatedAt = data.meta.find((entry) => entry.key === 'bandDataUpdatedAt')?.value;
  const canStart = groups !== null && groups.fix.length + groups.offen.length > 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Kopfbereich: in beiden Darstellungen dunkel, mit Notenlinien als Signatur */}
      <section className="theme-dark relative overflow-hidden rounded-2xl bg-stage-bg text-stage-text shadow-pop">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,rgb(37_99_235/0.55),transparent_60%),radial-gradient(80%_80%_at_0%_100%,rgb(14_165_233/0.18),transparent_60%)]" aria-hidden />
        <StaffArt className="pointer-events-none absolute -bottom-24 -right-64 h-[17rem] w-[42rem] opacity-40 sm:bottom-auto sm:-right-10 sm:top-2 sm:h-[19rem] sm:w-[46rem] sm:opacity-100" />
        <div className="relative px-5 pb-6 pt-7 sm:px-9 sm:pb-9 sm:pt-10">
          <p className="flex items-center gap-2.5 text-sm font-medium text-stage-muted">
            <Equalizer />
            {now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h2 className="mt-4 max-w-xl text-[40px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            {greeting(now.getHours())}
            <span className="text-brand">.</span>
          </h2>
          <p className="mt-3 max-w-lg text-lg text-stage-muted sm:text-xl">{rehearsalLine(next, today)}</p>
          <div className="mt-7 flex flex-wrap gap-2">
            {setlist && (
              <Button variant="primary" icon={Play} onClick={() => onStartStage(setlist.id)} disabled={!canStart}>
                Probeansicht starten
              </Button>
            )}
            <Button icon={ListMusic} onClick={() => onNavigate('setlists')} className="border-white/10 bg-white/[0.07] hover:bg-white/[0.12]">
              Setlist ansehen
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Nächster Termin */}
        <article className="card flex flex-col p-4 sm:p-5">
          <CardTitle icon={CalendarDays}>Nächster Termin</CardTitle>
          {next ? (
            <>
              <div className="flex items-start gap-4">
                <div className={`flex w-16 shrink-0 flex-col items-center rounded-xl py-2 ${KIND_STYLE[next.kind].fill}`}>
                  <span className="text-xs font-semibold uppercase">{keyToDate(next.date).toLocaleDateString('de-DE', { weekday: 'short' })}</span>
                  <span className="text-2xl font-bold leading-none tabular-nums">{keyToDate(next.date).getDate()}</span>
                  <span className="text-xs font-medium">{keyToDate(next.date).toLocaleDateString('de-DE', { month: 'short' })}</span>
                </div>
                <div className="min-w-0">
                  <p className={`text-lg font-semibold ${KIND_STYLE[next.kind].text}`}>{eventTitle(next)}</p>
                  {relativeLabel(next.date, today) && <p className="text-sm font-semibold text-brand">{relativeLabel(next.date, today)}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-stage-muted">
                    {next.time && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> {next.time} Uhr
                      </span>
                    )}
                    {next.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden /> {next.location}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {next.note && <p className="mt-3 rounded-lg bg-stage-raised px-3 py-2 text-sm">{next.note}</p>}
              {upcoming.length > 1 && <p className="mt-3 text-sm text-stage-muted">Danach noch {upcoming.length - 1} weitere {upcoming.length === 2 ? 'Termin' : 'Termine'}.</p>}
            </>
          ) : (
            <p className="text-[15px] text-stage-muted">{isAdmin ? 'Trag die nächste Probe oder das nächste Konzert unter „Termine“ ein.' : 'Sobald der Admin einen Termin einträgt, steht er hier.'}</p>
          )}
          <Button variant="ghost" onClick={() => onNavigate('termine')} className="mt-auto justify-between self-stretch pt-4 text-brand hover:text-brand">
            Zu den Terminen
            <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
          </Button>
        </article>

        {/* Setlist */}
        <article className="card flex flex-col p-4 sm:p-5">
          <CardTitle icon={ListMusic}>Setlist</CardTitle>
          {setlist && groups ? (
            <>
              <p className="text-lg font-semibold">{setlist.name}</p>
              <p className="text-sm text-stage-muted">
                <span className="font-semibold tabular-nums text-brand">{formatTotalDuration(fixDuration)}</span> fix eingeplant
              </p>
              {total > 0 && (
                <>
                  <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-stage-raised" role="img" aria-label={`${groups.fix.length} fix, ${groups.offen.length} in Abklärung, ${groups.raus.length} nicht in der Setlist`}>
                    <span className="bg-ok" style={{ width: `${(groups.fix.length / total) * 100}%` }} />
                    <span className="bg-warn" style={{ width: `${(groups.offen.length / total) * 100}%` }} />
                    <span className="bg-stage-strong" style={{ width: `${(groups.raus.length / total) * 100}%` }} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[
                      ['Fix', groups.fix.length, 'text-ok'],
                      ['Abklärung', groups.offen.length, 'text-warn'],
                      ['Raus', groups.raus.length, 'text-stage-muted'],
                    ].map(([label, value, color]) => (
                      <div key={label as string} className="rounded-lg bg-stage-raised px-2 py-1.5">
                        <dt className="text-xs font-medium text-stage-muted">{label}</dt>
                        <dd className={`text-lg font-bold tabular-nums ${color}`}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </>
          ) : (
            <p className="text-[15px] text-stage-muted">Noch keine Setlist angelegt.</p>
          )}
          <Button variant="ghost" onClick={() => onNavigate('setlists')} className="mt-auto justify-between self-stretch pt-4 text-brand hover:text-brand">
            Zur Setlist
            <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
          </Button>
        </article>

        {/* Repertoire und Medien */}
        <article className="card flex flex-col p-4 sm:p-5 md:col-span-2 lg:col-span-1">
          <CardTitle icon={Music}>Repertoire</CardTitle>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Songs', value: data.songs.length, tab: 'songs' as TabId, icon: Music },
              { label: 'Leadsheets', value: leadsheets, tab: 'medien' as TabId, icon: FileText },
              { label: 'Dokumente', value: data.documents, tab: 'medien' as TabId, icon: FolderOpen },
            ].map(({ label, value, tab, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => onNavigate(tab)}
                className="flex min-h-touch flex-col items-start rounded-xl border border-stage-line px-3 py-2.5 text-left transition-colors hover:border-stage-strong hover:bg-stage-raised"
              >
                <Icon className="h-4 w-4 text-stage-subtle" aria-hidden />
                <span className="mt-1.5 text-2xl font-bold tabular-nums leading-none">{value}</span>
                <span className="mt-1 text-xs font-medium text-stage-muted">{label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('sync')}
            className="mt-auto flex min-h-touch items-center gap-2 pt-4 text-left text-sm text-stage-muted hover:text-stage-text"
          >
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Band-Stand vom <span className="font-medium text-stage-text">{formatDateTime(typeof updatedAt === 'string' ? updatedAt : null)}</span> · wird automatisch aktualisiert
            </span>
          </button>
        </article>
      </div>
    </div>
  );
}
