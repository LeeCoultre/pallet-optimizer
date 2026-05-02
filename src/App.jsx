/* Marathon root — wraps content in AppShell (with persistent sidebar)
   and routes between Workspace (Upload/Pruefen/Focus/Abschluss based on
   current Auftrag step), Historie, and Einstellungen. */

import { useEffect, useState } from 'react';
import { AppStateProvider, useAppState } from './state.jsx';
import { AppShell } from './components/AppShell.jsx';
import UploadScreen from './screens/Upload.jsx';
import PruefenScreen from './screens/Pruefen.jsx';
import FocusScreen from './screens/Focus.jsx';
import AbschlussScreen from './screens/Abschluss.jsx';
import HistorieScreen from './screens/Historie.jsx';
import EinstellungenScreen from './screens/Einstellungen.jsx';

/* Legacy localStorage keys from the pre-backend era. Stale data left
   in old browsers; harmless but pollutes devtools. One-shot cleanup. */
const LEGACY_KEYS = [
  'marathon.queue.v1',
  'marathon.current.v1',
  'marathon.history.v1',
];

export default function App() {
  useEffect(() => {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  }, []);
  return (
    <AppStateProvider>
      <Router />
    </AppStateProvider>
  );
}

function Router() {
  const { current } = useAppState();
  const [route, setRoute] = useState('workspace');

  /* When a new Auftrag becomes current, jump back to Workspace so the user
     sees Pruefen / Focus / Abschluss instead of staying on Historie. */
  useEffect(() => {
    if (current) setRoute('workspace');
  }, [current?.id, current?.step]);

  return (
    <AppShell route={route} onRoute={setRoute}>
      {route === 'workspace'     && <Workspace />}
      {route === 'historie'      && <HistorieScreen />}
      {route === 'einstellungen' && <EinstellungenScreen />}
    </AppShell>
  );
}

function Workspace() {
  const { current } = useAppState();
  if (!current) return <UploadScreen />;
  switch (current.step) {
    case 'pruefen':   return <PruefenScreen />;
    case 'focus':     return <FocusScreen />;
    case 'abschluss': return <AbschlussScreen />;
    default:          return <PruefenScreen />;
  }
}
