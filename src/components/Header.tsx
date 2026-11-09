import { Database, Lightbulb, ListMusic, Lock, Music, StickyNote, Unlock, type LucideIcon } from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import { LogoMark } from './Logo';

export type TabId = 'setlists' | 'songs' | 'brainstorming' | 'notizen' | 'sync';

export const TABS: { id: TabId; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'setlists', label: 'Setlists', short: 'Setlists', icon: ListMusic },
  { id: 'songs', label: 'Songs & PDFs', short: 'Songs', icon: Music },
  { id: 'brainstorming', label: 'Band-Brainstorming', short: 'Ideen', icon: Lightbulb },
  { id: 'notizen', label: 'Persönliche Notizen', short: 'Notizen', icon: StickyNote },
  { id: 'sync', label: 'Daten-Sync', short: 'Sync', icon: Database },
];

export function StatusBar() {
  const { isOnline } = useAdmin();
  return (
    <div
      role="status"
      className={`flex h-7 items-center justify-center gap-2 border-b px-3 text-xs font-medium ${
        isOnline ? 'border-stage-line bg-stage-bg text-stage-muted' : 'border-warn/30 bg-warn/10 text-warn'
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${isOnline ? 'bg-neon shadow-[0_0_8px_#22C55E]' : 'bg-warn'}`} aria-hidden />
      {isOnline ? 'Online – Einsatzbereit' : 'Offline-Modus – Alle Daten lokal gespeichert'}
    </div>
  );
}

function ModeToggle() {
  const { isAdmin, setMode } = useAdmin();
  const base = 'flex min-h-touch items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors';
  return (
    <div role="group" aria-label="Modus wählen" className="flex shrink-0 gap-1 rounded-lg border border-stage-line bg-stage-bg p-1">
      <button
        type="button"
        aria-pressed={!isAdmin}
        aria-label="Bühnen-Modus (Nur Lesen)"
        title="Bühnen-Modus (Nur Lesen)"
        onClick={() => setMode('stage')}
        className={`${base} ${!isAdmin ? 'bg-neon/15 text-neon' : 'text-stage-muted hover:text-stage-text'}`}
      >
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        Bühne
      </button>
      <button
        type="button"
        aria-pressed={isAdmin}
        aria-label="Admin-Bearbeitungsmodus"
        title="Admin-Bearbeitungsmodus"
        onClick={() => setMode('admin')}
        className={`${base} ${isAdmin ? 'bg-signal/15 text-signal' : 'text-stage-muted hover:text-stage-text'}`}
      >
        <Unlock className="h-4 w-4 shrink-0" aria-hidden />
        Admin
      </button>
    </div>
  );
}

interface NavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

/** Kopfzeile mit Statusleiste, Logo, Modus-Schalter und – auf großen Bildschirmen – der Navigation. */
export function Header({ activeTab, onSelectTab }: NavProps) {
  const { isAdmin } = useAdmin();
  return (
    <div className="sticky top-0 z-30 pt-safe">
      <StatusBar />
      <header className="border-b border-stage-line bg-stage-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <div className="flex min-w-0 items-center gap-2.5 lg:shrink-0">
            <LogoMark className="h-8 w-8 shrink-0" />
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-[15px] font-bold tracking-tight">Band Planner</h1>
              <p className={`truncate text-xs font-medium ${isAdmin ? 'text-signal' : 'text-stage-subtle'}`}>
                <span className="lg:hidden">{isAdmin ? 'Bearbeitung aktiv' : 'Nur Lesen'}</span>
                <span className="hidden lg:inline">{isAdmin ? 'Admin-Bearbeitungsmodus' : 'Bühnen-Modus (Nur Lesen)'}</span>
              </p>
            </div>
          </div>

          <nav aria-label="Hauptnavigation" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {TABS.map(({ id, label, short, icon: Icon }) => {
              const isActive = id === activeTab;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectTab(id)}
                  className={`flex min-h-touch items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
                    isActive ? 'bg-stage-raised text-stage-text' : 'text-stage-muted hover:bg-stage-raised/60 hover:text-stage-text'
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-neon' : ''}`} aria-hidden />
                  <span className="2xl:hidden">{short}</span>
                  <span className="hidden 2xl:inline">{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="ml-auto lg:ml-0">
            <ModeToggle />
          </div>
        </div>
      </header>
    </div>
  );
}

/** Untere Navigationsleiste für Handy und Tablet – erreichbar mit dem Daumen. */
export function BottomNav({ activeTab, onSelectTab }: NavProps) {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stage-line bg-stage-surface/95 pb-safe backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-xl">
        {TABS.map(({ id, label, short, icon: Icon }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(id)}
              className={`relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isActive ? 'text-stage-text' : 'text-stage-subtle hover:text-stage-muted'
              }`}
            >
              {isActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-neon" aria-hidden />}
              <Icon className={`h-[22px] w-[22px] ${isActive ? 'text-neon' : ''}`} strokeWidth={isActive ? 2.25 : 1.9} aria-hidden />
              {short}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
