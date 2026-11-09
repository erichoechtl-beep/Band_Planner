import { useCallback, useEffect, useState } from 'react';
import { AutoSyncBanner, useAutoSync } from './components/AutoSync';
import { BandBrainstorm } from './components/BandBrainstorm';
import { DataSync } from './components/DataSync';
import { BottomNav, Header, TABS, type TabId } from './components/Header';
import { PersonalNotes } from './components/PersonalNotes';
import { Rehearsals } from './components/Rehearsals';
import { SetlistBuilder } from './components/SetlistBuilder';
import { SongManager } from './components/SongManager';
import { StageView } from './components/StageView';

type Route = { kind: 'tab'; tab: TabId } | { kind: 'stage'; setlistId: string; index: number };

// Hash-Routing funktioniert in jedem GitHub-Pages-Unterordner. Die Zurück-Taste verlässt so die
// Bühnenansicht, und beim Neuladen bleibt die aktuelle Song-Position erhalten.
function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'buehne' && parts[1]) {
    const index = Number(parts[2]);
    return { kind: 'stage', setlistId: decodeURIComponent(parts[1]), index: Number.isInteger(index) && index >= 0 ? index : 0 };
  }
  const tab = TABS.find(({ id }) => id === parts[0]);
  return { kind: 'tab', tab: tab?.id ?? 'setlists' };
}

function stageHash(setlistId: string, index: number): string {
  return `#/buehne/${encodeURIComponent(setlistId)}/${index}`;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  // Läuft unabhängig von der Ansicht, damit jedes Gerät neue Band-Stände sofort erhält.
  const autoSync = useAutoSync();
  const [lastTab, setLastTab] = useState<TabId>(route.kind === 'tab' ? route.tab : 'setlists');

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

  // Blättern ersetzt den Verlaufseintrag: „Zurück“ führt direkt aus der Bühnenansicht heraus.
  const handleStageIndex = useCallback((setlistId: string, index: number) => {
    window.history.replaceState(null, '', stageHash(setlistId, index));
  }, []);

  if (route.kind === 'stage') {
    const { setlistId, index } = route;
    return (
      <StageView
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
        {route.tab === 'setlists' && <SetlistBuilder onStartStage={startStage} />}
        {route.tab === 'songs' && <SongManager />}
        {route.tab === 'proben' && <Rehearsals />}
        {route.tab === 'brainstorming' && <BandBrainstorm />}
        {route.tab === 'notizen' && <PersonalNotes />}
        {route.tab === 'sync' && <DataSync />}
      </main>
      <BottomNav activeTab={lastTab} onSelectTab={selectTab} />
    </div>
  );
}
