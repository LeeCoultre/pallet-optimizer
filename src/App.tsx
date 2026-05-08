/* Marathon root — wraps content in AppShell (with persistent sidebar)
   and routes between Workspace (Upload/Pruefen/Focus/Abschluss based on
   current Auftrag step), Historie, and Einstellungen. */

import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { AppStateProvider, useAppState } from './state';
import { AppShell } from './components/AppShell.jsx';
import DynamicIsland from './components/DynamicIsland.jsx';
import { useExperiment } from './utils/experiments';
import { CommandPalette } from './components/CommandPalette.jsx';
import { T } from './components/ui';

/* Workspace screens load eagerly — they're the warehouse worker's
   critical path (Upload → Pruefen → Focus → Abschluss). Anything else
   (Historie, Admin, Suche, etc.) is lazy-loaded the first time the
   user opens it: dropping ~70% of JS off the initial bundle. */
import UploadScreen from './screens/Upload.jsx';
import PruefenScreen from './screens/Pruefen.jsx';
import FocusScreen from './screens/Focus.jsx';
import AbschlussScreen from './screens/Abschluss.jsx';

const HistorieScreen       = lazy(() => import('./screens/Historie.jsx'));
const EinstellungenScreen  = lazy(() => import('./screens/Einstellungen.jsx'));
const AdminScreen          = lazy(() => import('./screens/Admin.jsx'));
const SucheScreen          = lazy(() => import('./screens/Suche.jsx'));
const LiveAktivitaetScreen = lazy(() => import('./screens/LiveAktivitaet.jsx'));
const BerichteScreen       = lazy(() => import('./screens/Berichte.jsx'));
const WarteschlangeScreen  = lazy(() => import('./screens/Warteschlange.jsx'));

/* Legacy localStorage keys from the pre-backend era. Stale data left
   in old browsers; harmless but pollutes devtools. One-shot cleanup. */
const LEGACY_KEYS = [
  'marathon.queue.v1',
  'marathon.current.v1',
  'marathon.history.v1',
];

function ScreenFallback() {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: T.text.faint,
      fontSize: 13,
      letterSpacing: 0.4,
    }}>
      Lädt…
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ScreenFallback />}>{children}</Suspense>;
}

export default function App() {
  useEffect(() => {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  }, []);
  // Experimental floating pill — opt-in via Einstellungen → Experimente.
  // Gated here so the component never even mounts (and never starts its
  // 1Hz tick / connection probe) until the user has explicitly enabled it.
  const [islandEnabled] = useExperiment('dynamicIsland');
  return (
    <AppStateProvider>
      <Router />
      {islandEnabled && <DynamicIsland />}
    </AppStateProvider>
  );
}

function Router() {
  const { current } = useAppState();
  const [route, setRoute] = useState('workspace');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sucheInitialQuery, setSucheInitialQuery] = useState('');

  /* When a new Auftrag becomes current, jump back to Workspace so the user
     sees Pruefen / Focus / Abschluss instead of staying on Historie. */
  useEffect(() => {
    if (current) setRoute('workspace');
    // We only re-trigger when identity/step changes, not on every render of
    // the (heavy) `current` object — eslint-disable is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.step]);

  /* Global Cmd/Ctrl+K → Command Palette. Keep the listener on document
     so it fires regardless of which child has focus, except when typing
     in an input/textarea/contenteditable (those keep their own ⌘K). */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const meta  = isMac ? e.metaKey : e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        const editable = t?.isContentEditable;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [paletteOpen]);

  return (
    <>
      <AppShell
        route={route}
        onRoute={setRoute}
        onOpenCommand={() => setPaletteOpen(true)}
      >
        {route === 'workspace'     && <Workspace onRoute={setRoute} />}
        {route === 'warteschlange' && <LazyRoute><WarteschlangeScreen onRoute={setRoute} /></LazyRoute>}
        {route === 'suche'         && <LazyRoute><SucheScreen initialQuery={sucheInitialQuery} /></LazyRoute>}
        {route === 'historie'      && <LazyRoute><HistorieScreen /></LazyRoute>}
        {route === 'live'          && <LazyRoute><LiveAktivitaetScreen /></LazyRoute>}
        {route === 'berichte'      && <LazyRoute><BerichteScreen /></LazyRoute>}
        {route === 'einstellungen' && <LazyRoute><EinstellungenScreen onRoute={setRoute} /></LazyRoute>}
        {route === 'admin'         && <LazyRoute><AdminScreen /></LazyRoute>}
      </AppShell>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onRoute={(r: string, opts?: { query?: string }) => {
          if (r === 'suche' && opts?.query) {
            setSucheInitialQuery(opts.query);
          }
          setRoute(r);
          setPaletteOpen(false);
        }}
      />
    </>
  );
}

function Workspace({ onRoute }: { onRoute: (r: string) => void }) {
  const { current } = useAppState();
  if (!current) return <UploadScreen onRoute={onRoute} />;
  switch (current.step) {
    case 'upload':    return <UploadScreen onRoute={onRoute} />;
    case 'pruefen':   return <PruefenScreen />;
    case 'focus':     return <FocusScreen />;
    case 'abschluss': return <AbschlussScreen />;
    default:          return <PruefenScreen />;
  }
}
