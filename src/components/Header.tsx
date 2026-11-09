import { Database, Lightbulb, ListMusic, Lock, Music, StickyNote, Unlock, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAdmin } from '../context/AdminContext';

export type TabId = 'setlists' | 'songs' | 'brainstorming' | 'notizen' | 'sync';

export const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'setlists', label: 'Setlists', icon: ListMusic },
  { id: 'songs', label: 'Songs & PDFs', icon: Music },
  { id: 'brainstorming', label: 'Band-Brainstorming', icon: Lightbulb },
  { id: 'notizen', label: 'Persönliche Notizen', icon: StickyNote },
  { id: 'sync', label: 'Daten-Sync', icon: Database },
];

export function StatusBar() {
  const { isOnline } = useAdmin();
  return (
    <div
      role="status"
      className={`flex min-h-7 items-center justify-center gap-2 px-3 py-1 text-center text-xs font-semibold sm:text-sm ${
        isOnline ? 'bg-neon-strong/15 text-neon' : 'bg-warn/15 text-warn'
      }`}
    >
      {isOnline ? <Wifi className="h-4 w-4 shrink-0" aria-hidden /> : <WifiOff className="h-4 w-4 shrink-0" aria-hidden />}
      {isOnline ? 'Online – Einsatzbereit' : 'Offline-Modus – Alle Daten lokal gespeichert'}
    </div>
  );
}

function ModeToggle() {
  const { isAdmin, setMode } = useAdmin();
  const baseClass = 'flex min-h-touch flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-bold transition-colors sm:flex-none';
  return (
    <div role="group" aria-label="Modus wählen" className="flex w-full gap-1 rounded-lg border border-stage-line bg-stage-bg p-1 sm:w-auto">
      <button
        type="button"
        aria-pressed={!isAdmin}
        onClick={() => setMode('stage')}
        className={`${baseClass} ${!isAdmin ? 'bg-neon text-stage-bg' : 'text-stage-muted hover:text-stage-text'}`}
      >
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        Bühnen-Modus (Nur Lesen)
      </button>
      <button
        type="button"
        aria-pressed={isAdmin}
        onClick={() => setMode('admin')}
        className={`${baseClass} ${isAdmin ? 'bg-signal text-stage-bg' : 'text-stage-muted hover:text-stage-text'}`}
      >
        <Unlock className="h-4 w-4 shrink-0" aria-hidden />
        Admin-Bearbeitungsmodus
      </button>
    </div>
  );
}

export function Header({ activeTab, onSelectTab }: { activeTab: TabId; onSelectTab: (tab: TabId) => void }) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Auf schmalen Displays bleibt der aktive Reiter sichtbar.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [activeTab]);

  // Statusleiste und Reiter bleiben beim Scrollen stehen, der Modus-Schalter nicht:
  // So bleibt am Handy genug Platz für den Inhalt.
  return (
    <>
      <div className="sticky top-0 z-40 bg-stage-surface pt-safe">
        <StatusBar />
      </div>
      <header className="bg-stage-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2">
          <h1 className="text-xl font-extrabold tracking-tight">
            Band <span className="text-neon">Planner</span>
          </h1>
          <ModeToggle />
        </div>
      </header>
      <div className="sticky top-[calc(1.75rem+env(safe-area-inset-top))] z-30 border-b border-stage-line bg-stage-surface">
        <nav aria-label="Hauptnavigation" className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = id === activeTab;
            return (
              <button
                key={id}
                ref={isActive ? activeRef : undefined}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(id)}
                className={`flex min-h-touch shrink-0 items-center gap-2 border-b-[3px] px-3 py-2 text-sm font-semibold transition-colors sm:text-base ${
                  isActive ? 'border-neon text-stage-text' : 'border-transparent text-stage-muted hover:text-stage-text'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-neon' : ''}`} aria-hidden />
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
