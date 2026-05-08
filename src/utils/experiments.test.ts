/* Vitest — experiments.js opt-in feature-flag store. */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const STORAGE_KEY = 'marathon.experiments';

/* happy-dom in vitest 4 ships a stub localStorage that only has the
   `[]`-indexer but not the canonical Storage methods. Replace with a
   Map-backed polyfill before importing the module under test, so
   experiments.js's window.localStorage.getItem/setItem calls work. */
beforeAll(() => {
  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); },
      clear() { store.clear(); },
      get length() { return store.size; },
      key(i) { return [...store.keys()][i] ?? null; },
    },
  });
});

let mod;
beforeAll(async () => {
  mod = await import('./experiments.js');
});

beforeEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
});
afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
});

const getExperiment = (k) => mod.getExperiment(k);
const setExperiment = (k, v) => mod.setExperiment(k, v);
const EXPERIMENT_DEFAULTS = () => mod.EXPERIMENT_DEFAULTS;
const EXPERIMENT_META = () => mod.EXPERIMENT_META;

describe('experiments registry', () => {
  it('EXPERIMENT_DEFAULTS has dynamicIsland=false (default OFF)', () => {
    expect(EXPERIMENT_DEFAULTS().dynamicIsland).toBe(false);
  });

  it('EXPERIMENT_META carries label + description for each defaulted flag', () => {
    const defs = EXPERIMENT_DEFAULTS();
    const meta = EXPERIMENT_META();
    for (const key of Object.keys(defs)) {
      expect(meta[key]).toBeDefined();
      expect(meta[key].label).toBeTruthy();
      expect(meta[key].description).toBeTruthy();
    }
  });
});

describe('getExperiment / setExperiment round-trip', () => {
  it('getExperiment returns default when nothing in storage', () => {
    expect(getExperiment('dynamicIsland')).toBe(false);
  });

  it('setExperiment persists value, getExperiment reads it back', () => {
    setExperiment('dynamicIsland', true);
    expect(getExperiment('dynamicIsland')).toBe(true);
  });

  it('setExperiment writes valid JSON to localStorage', () => {
    setExperiment('dynamicIsland', true);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw)).toMatchObject({ dynamicIsland: true });
  });

  it('falls back to default when stored JSON is corrupt', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ not valid json');
    expect(getExperiment('dynamicIsland')).toBe(false);
  });

  it('an unknown key returns undefined (not in DEFAULTS)', () => {
    expect(getExperiment('madeUp')).toBeUndefined();
  });
});