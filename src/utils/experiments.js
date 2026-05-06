/* ─────────────────────────────────────────────────────────────────────────
   experiments — opt-in feature flags persisted in localStorage.

   Used for features that are still being shaped or that change the
   workspace in a way the operator should consciously turn on. Defaults
   are conservative (off) so a fresh install gets a stable, familiar
   workflow; users flip individual experiments on from Einstellungen.

   Storage shape (single key, JSON):
     localStorage['marathon.experiments'] = { dynamicIsland: true, ... }

   Mid-render reads of localStorage are slow on some browsers; the hook
   caches the value in component state and listens for a synthetic
   `marathon-experiments-change` event so any open Einstellungen tab
   updates the App.jsx gate live without a page refresh.
   ───────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'marathon.experiments';
const CHANGE_EVENT = 'marathon-experiments-change';

/* Defaults — every experiment must be listed here so the registry of
   available toggles is grep-able from one place. Add new experiments
   by appending an entry; the rest of the codebase pulls from this. */
export const EXPERIMENT_DEFAULTS = {
  dynamicIsland: false,
};

export const EXPERIMENT_META = {
  dynamicIsland: {
    label: 'Dynamic Island',
    description:
      'Schwebende Pille oben in der Mitte mit Live-Status zum aktuellen Schritt — Headline, Auslastung, Next-Item, Verbindungsstatus. Hover für Compact, Klick für volle Info.',
    badge: 'Experimentell',
  },
};

function readAll() {
  if (typeof window === 'undefined') return { ...EXPERIMENT_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EXPERIMENT_DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...EXPERIMENT_DEFAULTS, ...parsed };
  } catch {
    return { ...EXPERIMENT_DEFAULTS };
  }
}

function writeAll(next) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* quota / private-mode — silently ignore, the in-memory state still works */
  }
}

export function getExperiment(key) {
  return readAll()[key] ?? EXPERIMENT_DEFAULTS[key];
}

export function setExperiment(key, value) {
  const all = readAll();
  all[key] = value;
  writeAll(all);
}

/* React hook — `[value, setValue]` for a single experiment.
   Subscribes to the synthetic change event so toggling from the
   Settings page propagates to gating components on the same tab. */
export function useExperiment(key) {
  const [value, setValue] = useState(() => getExperiment(key));

  useEffect(() => {
    const onChange = () => setValue(getExperiment(key));
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(CHANGE_EVENT, onChange);
    // Also listen for cross-tab changes (storage event).
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setValue(getExperiment(key));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);

  const update = useCallback((next) => {
    setExperiment(key, next);
    setValue(next);
  }, [key]);

  return [value, update];
}
