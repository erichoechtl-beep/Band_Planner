import { useCallback, useEffect, useState } from 'react';
import { AutoSyncBanner, useAutoSync } from './components/AutoSync';
import { DataSync } from './components/DataSync';
import { BottomNav, Header, TABS, type TabId } from './components/Header';
import { Home } from './components/Home';
import { Media } from './components/Media';
import { Rehearsals } from './components/Rehearsals';
import { SetlistBuilder } from './components/SetlistBuilder';
import { SongManager } from './components/SongManager';
import { LiveView } from './components/LiveView';
import { StageView } from './components/StageView';

/** buehne = Probeansicht, live = Live-Ansicht (nur Leadsheets) */
type ViewMode = 'buehne' | 'live';
type Route = { kind: 'tab'; tab: TabId } | { kind: 'stage'; mode: ViewMode; setlistId: string; index: number };

// Hash-Routing funktioniert in jedem GitHub-Pages-Unterordner. Die Zurück-Taste verlässt so die
// Probeansicht, und beim Neuladen bleibt die aktuelle Song-Position erhalten.
function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if ((parts[0] === 'buehne' || parts[0] === 'live') && parts[1]) {
    const index = Number(parts[2]);
    return { kind: 'stage', mode: parts[0], setlistId: decodeURIComponent(parts[1]), index: Number.isInteger(index) && index >= 0 ? index : 0 };
  }
  // Frühere Adresse des Kalenders weiterhin unterstützen
  const target = parts[0] === 'proben' ? 'termine' : parts[0];
  const tab = TABS.find(({ id }) => id === target);
  // Ohne (oder mit veraltetem) Ziel öffnet die App auf der Startseite.
  return { kind: 'tab', tab: tab?.id ?? 'start' };
}

function stageHash(setlistId: string, index: number, mode: ViewMode = 'buehne'): string {
  return `#/${mode}/${encodeURIComponent(setlistId)}/${index}`;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  // Läuft unabhängig von der Ansicht, damit jedes Gerät neue Band-Stände sofort erhält.
  const autoSync = useAutoSync();
  const [lastTab, setLastTab] = useState<TabId>(route.kind === 'tab' ? route.tab : 'start');

  useEffect(() => {
    const update = () => {
      const next = parseHash(window.location.hash);
      setRoute(next);
      if (next.kind === 'tab') setLastTab(next.tab);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  const selectTab = useCallback((tab: TabId) => {
    window.location.hash = `#/${tab}`;
    window.scrollTo(0, 0);
  }, []);

  const startStage = useCallback((setlistId: string) => {
    window.location.hash = stageHash(setlistId, 0);
  }, []);

  const startLive = useCallback((setlistId: string, index = 0) => {
    window.location.hash = stageHash(setlistId, index, 'live');
  }, []);

  // Blättern ersetzt den Verlaufseintrag: „Zurück“ führt direkt aus der Probeansicht heraus.
  const handleStageIndex = useCallback((setlistId: string, index: number, mode: ViewMode = 'buehne') => {
    window.history.replaceState(null, '', stageHash(setlistId, index, mode));
  }, []);

  if (route.kind === 'stage' && route.mode === 'live') {
    const { setlistId, index } = route;
    return (
      <LiveView
        key={setlistId}
        setlistId={setlistId}
        initialIndex={index}
        onIndexChange={(next) => handleStageIndex(setlistId, next, 'live')}
        onExit={() => selectTab('setlists')}
      />
    );
  }

  if (route.kind === 'stage') {
    const { setlistId, index } = route;
    return (
      <StageView
        onOpenLive={(position) => startLive(setlistId, position)}
        key={setlistId}
        setlistId={setlistId}
        initialIndex={index}
        onIndexChange={(next) => handleStageIndex(setlistId, next)}
        onExit={() => selectTab('setlists')}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <Header activeTab={lastTab} onSelectTab={selectTab} />
      <AutoSyncBanner {...autoSync} />
      {/* Unten Platz für die Navigationsleiste auf Handy und Tablet */}
      <main className="mx-auto max-w-6xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 sm:pt-8 lg:pb-12">
        {route.tab === 'start' && <Home onNavigate={selectTab} onStartStage={startStage} onStartLive={(id) => startLive(id)} />}
        {route.tab === 'setlists' && <SetlistBuilder onStartStage={startStage} onStartLive={(id) => startLive(id)} />}
        {route.tab === 'songs' && <SongManager />}
        {route.tab === 'termine' && <Rehearsals />}
        {route.tab === 'medien' && <Media />}
        {route.tab === 'sync' && <DataSync />}
      </main>
      <BottomNav activeTab={lastTab} onSelectTab={selectTab} />
    </div>
  );
}
