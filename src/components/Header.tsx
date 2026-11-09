import { CalendarDays, Check, Database, FolderOpen, House, ListMusic, Lock, Menu, Moon, Music, Sun, Unlock, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { BAND_NAME } from '../config';
import { useAdmin, type AppMode, type Theme } from '../context/AdminContext';
import { LogoMark } from './Logo';
import { IconButton, Modal } from './ui';

export type TabId = 'start' | 'setlists' | 'songs' | 'termine' | 'medien' | 'sync';

export const TABS: { id: TabId; label: string; short: string; description: string; icon: LucideIcon }[] = [
  { id: 'start', label: 'Start', short: 'Start', description: 'Überblick: nächster Termin und Setlist', icon: House },
  { id: 'setlists', label: 'Setlists', short: 'Setlists', description: 'Konzertabläufe planen und spielen', icon: ListMusic },
  { id: 'songs', label: 'Songs & PDFs', short: 'Songs', description: 'Repertoire, Akkorde und Leadsheets', icon: Music },
  { id: 'termine', label: 'Termine', short: 'Termine', description: 'Proben und Konzerte im Kalender', icon: CalendarDays },
  { id: 'medien', label: 'Medien', short: 'Medien', description: 'Rider, Angebote, Pressetexte und Leadsheets', icon: FolderOpen },
  { id: 'sync', label: 'Daten-Sync', short: 'Sync', description: 'Band-Stand laden, exportieren, importieren', icon: Database },
];

const MODE_LABEL: Record<AppMode, string> = {
  stage: 'Bühnen-Modus (Nur Lesen)',
  admin: 'Admin-Bearbeitungsmodus',
};

const THEMES: { id: Theme; title: string; label: string; description: string; icon: LucideIcon }[] = [
  { id: 'hell', title: 'Hell', label: 'Helle Darstellung', description: 'Weiß und Blau – gut bei Tageslicht und im Proberaum', icon: Sun },
  { id: 'dunkel', title: 'Dunkel', label: 'Dunkle Darstellung', description: 'Blendet nicht auf dunklen Bühnen', icon: Moon },
];

/** Verbindungsstatus – wird nur im Bereich „Daten-Sync“ angezeigt. */
export function ConnectionStatus() {
  const { isOnline } = useAdmin();
  return (
    <p
      role="status"
      className={`mb-4 flex min-h-touch items-center gap-2.5 rounded-xl border px-4 text-sm font-medium ${
        isOnline ? 'border-stage-line bg-stage-surface text-stage-muted' : 'border-warn/30 bg-warn/10 text-warn'
      }`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isOnline ? 'bg-ok' : 'bg-warn'}`} aria-hidden />
      {isOnline ? 'Online – Einsatzbereit' : 'Offline-Modus – Alle Daten lokal gespeichert'}
    </p>
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
        aria-label={MODE_LABEL.stage}
        title={MODE_LABEL.stage}
        onClick={() => setMode('stage')}
        className={`${base} ${!isAdmin ? 'bg-stage-raised text-stage-text' : 'text-stage-muted hover:text-stage-text'}`}
      >
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        Bühne
      </button>
      <button
        type="button"
        aria-pressed={isAdmin}
        aria-label={MODE_LABEL.admin}
        title={MODE_LABEL.admin}
        onClick={() => setMode('admin')}
        className={`${base} ${isAdmin ? 'bg-brand text-on-fill' : 'text-stage-muted hover:text-stage-text'}`}
      >
        <Unlock className="h-4 w-4 shrink-0" aria-hidden />
        Admin
      </button>
    </div>
  );
}

/** Schaltet zwischen Hell und Dunkel um; zeigt das Ziel der Umschaltung. */
export function ThemeButton({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useAdmin();
  const next = THEMES.find(({ id }) => id !== theme)!;
  return <IconButton icon={next.icon} label={next.label} onClick={toggleTheme} className={className} />;
}

interface NavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

/** Kopfzeile mit Statusleiste, Logo und – je nach Bildschirm – Navigation oder Menü-Knopf. */
export function Header({ activeTab, onSelectTab }: NavProps) {
  const { isAdmin } = useAdmin();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Die Kopfzeile ist in beiden Darstellungen dunkel. */}
      <div className="theme-dark sticky top-0 z-30 bg-stage-bg pt-safe text-stage-text">
        <header className="border-b border-stage-line bg-stage-surface">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
            <button
              type="button"
              onClick={() => onSelectTab('start')}
              aria-label="Zur Startseite"
              className="flex min-h-touch min-w-0 items-center gap-3 rounded-lg text-left lg:shrink-0"
            >
              <LogoMark className="h-9 w-9 shrink-0" />
              <div className="min-w-0 leading-tight">
                <h1 className="truncate text-base font-semibold tracking-tight">
                  Band Planner <span className="font-normal text-stage-subtle">–</span> <span className="font-bold tracking-wide text-brand">{BAND_NAME}</span>
                </h1>
                <p className={`flex items-center gap-1 truncate text-xs font-medium ${isAdmin ? 'text-brand' : 'text-stage-muted'}`}>
                  {isAdmin ? <Unlock className="h-3 w-3 shrink-0" aria-hidden /> : <Lock className="h-3 w-3 shrink-0" aria-hidden />}
                  <span className="lg:hidden">{isAdmin ? 'Admin · Bearbeitung aktiv' : 'Bühne · Nur Lesen'}</span>
                  <span className="hidden lg:inline">{MODE_LABEL[isAdmin ? 'admin' : 'stage']}</span>
                </p>
              </div>
            </button>

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
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-brand' : ''}`} aria-hidden />
                    <span className="2xl:hidden">{short}</span>
                    <span className="hidden 2xl:inline">{label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="ml-auto hidden items-center gap-2 lg:ml-0 lg:flex">
              <ThemeButton />
              <ModeToggle />
            </div>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              className="ml-auto flex min-h-touch shrink-0 items-center gap-2 rounded-lg border border-stage-line bg-stage-raised px-4 text-[15px] font-semibold transition-colors hover:bg-stage-hover lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden />
              Menü
            </button>
          </div>
        </header>
      </div>

      {menuOpen && (
        <MobileMenu
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setMenuOpen(false);
            onSelectTab(tab);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}

function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="eyebrow px-1">{title}</h3>
      {children}
    </section>
  );
}

interface OptionProps {
  selected: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  ariaLabel: string;
  onClick: () => void;
}

function OptionRow({ selected, icon: Icon, title, description, ariaLabel, onClick }: OptionProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`flex min-h-[64px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected ? 'border-brand bg-brand/[0.07]' : 'border-stage-line bg-stage-surface hover:bg-stage-raised'
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-brand text-on-fill' : 'bg-stage-raised text-stage-muted'}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-stage-muted">{description}</span>
      </span>
      {selected && <Check className="h-5 w-5 shrink-0 text-brand" aria-hidden />}
    </button>
  );
}

/** Menü für Handy und Tablet: alle Bereiche mit Beschreibung, dazu Modus und Darstellung. */
function MobileMenu({ activeTab, onSelectTab, onClose }: NavProps & { onClose: () => void }) {
  const { mode, setMode, theme, setTheme } = useAdmin();

  return (
    <Modal title="Menü" onClose={onClose} size="sm">
      <div className="space-y-6 p-4">
        <MenuGroup title="Bereiche">
          <nav aria-label="Bereiche" className="overflow-hidden rounded-xl border border-stage-line bg-stage-surface">
            {TABS.map(({ id, label, description, icon: Icon }, index) => {
              const isActive = id === activeTab;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectTab(id)}
                  className={`flex min-h-[64px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    index > 0 ? 'border-t border-stage-line' : ''
                  } ${isActive ? 'bg-brand/[0.07]' : 'hover:bg-stage-raised'}`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-brand text-on-fill' : 'bg-stage-raised text-stage-muted'}`}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-semibold ${isActive ? 'text-brand' : ''}`}>{label}</span>
                    <span className="block truncate text-sm text-stage-muted">{description}</span>
                  </span>
                  {isActive && <Check className="h-5 w-5 shrink-0 text-brand" aria-hidden />}
                </button>
              );
            })}
          </nav>
        </MenuGroup>

        <MenuGroup title="Modus">
          <OptionRow
            selected={mode === 'stage'}
            icon={Lock}
            title="Bühne"
            description="Nur Lesen – nichts lässt sich versehentlich ändern"
            ariaLabel={MODE_LABEL.stage}
            onClick={() => setMode('stage')}
          />
          <OptionRow
            selected={mode === 'admin'}
            icon={Unlock}
            title="Admin"
            description="Songs, Setlists und Ideen bearbeiten"
            ariaLabel={MODE_LABEL.admin}
            onClick={() => setMode('admin')}
          />
        </MenuGroup>

        <MenuGroup title="Darstellung">
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map(({ id, title, label, icon: Icon }) => {
              const selected = theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={label}
                  onClick={() => setTheme(id)}
                  className={`flex min-h-touch items-center justify-center gap-2 rounded-xl border px-3 font-semibold transition-colors ${
                    selected ? 'border-brand bg-brand text-on-fill' : 'border-stage-line bg-stage-surface hover:bg-stage-raised'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {title}
                </button>
              );
            })}
          </div>
          <p className="px-1 text-sm text-stage-muted">{THEMES.find(({ id }) => id === theme)?.description}</p>
        </MenuGroup>
      </div>
    </Modal>
  );
}

/** Untere Navigationsleiste für Handy und Tablet – erreichbar mit dem Daumen. */
export function BottomNav({ activeTab, onSelectTab }: NavProps) {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stage-line bg-stage-surface pb-safe shadow-[0_-4px_16px_-8px_rgba(15,23,42,0.12)] lg:hidden"
    >
      <div className="mx-auto flex max-w-xl px-1">
        {TABS.map(({ id, label, short, icon: Icon }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(id)}
              className={`flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors ${
                isActive ? 'font-semibold text-brand' : 'font-medium text-stage-muted hover:text-stage-text'
              }`}
            >
              <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-brand/[0.12]' : ''}`}>
                <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.25 : 1.9} aria-hidden />
              </span>
              {short}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
