/* ─────────────────────────────────────────────────────────────────────────
   Marathon — central app state.
   Shape:
     - queue   : Auftrag[]                     (parsed, awaiting workflow)
     - current : Auftrag + workflow progress   (in active workflow)
     - history : Completed[]                   (archived)

   Persists to localStorage; survives reloads mid-workflow.
   ───────────────────────────────────────────────────────────────────────── */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import mammoth from 'mammoth';
import { parseLagerauftragText, validateParsing } from './utils/parseLagerauftrag.js';
import { sortPallets } from './utils/auftragHelpers.js';

const KEY_QUEUE   = 'marathon.queue.v1';
const KEY_CURRENT = 'marathon.current.v1';
const KEY_HISTORY = 'marathon.history.v1';

const Ctx = createContext(null);

/* ─── localStorage helpers ────────────────────────────────────────────── */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}
function remove(key) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ─── Parse a single .docx → queue entry ──────────────────────────────── */
async function parseDocx(file) {
  const id = uid();
  try {
    const buf = await file.arrayBuffer();
    const { value: rawText } = await mammoth.extractRawText({ arrayBuffer: buf });
    const parsed = parseLagerauftragText(rawText);
    const validation = validateParsing(rawText, parsed);
    return {
      id,
      fileName: file.name,
      addedAt: Date.now(),
      rawText,
      parsed,
      validation,
      status: 'ready',
    };
  } catch (e) {
    return {
      id,
      fileName: file.name,
      addedAt: Date.now(),
      status: 'error',
      error: String(e?.message || e),
    };
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
export function AppStateProvider({ children }) {
  const [queue, setQueue]     = useState(() => load(KEY_QUEUE, []));
  const [current, setCurrent] = useState(() => load(KEY_CURRENT, null));
  const [history, setHistory] = useState(() => load(KEY_HISTORY, []));

  /* Persist on change */
  useEffect(() => { save(KEY_QUEUE, queue); }, [queue]);
  useEffect(() => {
    if (current) save(KEY_CURRENT, current);
    else remove(KEY_CURRENT);
  }, [current]);
  useEffect(() => { save(KEY_HISTORY, history); }, [history]);

  /* ── Queue actions ──────────────────────────────────────────────── */
  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => /\.docx$/i.test(f.name));
    if (!files.length) return [];
    const built = await Promise.all(files.map(parseDocx));
    setQueue((q) => [...q, ...built]);
    return built;
  }, []);

  const removeFromQueue = useCallback((id) => {
    setQueue((q) => q.filter((e) => e.id !== id));
  }, []);

  const reorderQueue = useCallback((fromIdx, toIdx) => {
    setQueue((q) => {
      const next = [...q];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => setQueue([]), []);

  /* ── Workflow actions ──────────────────────────────────────────── */
  /* Start workflow with a specific entry (or first). Removes from queue.
     Pallets are sorted: easiest (fewest articles) first, Tachorollen last. */
  const startEntry = useCallback((entryId) => {
    setQueue((q) => {
      const idx = entryId
        ? q.findIndex((e) => e.id === entryId)
        : 0;
      if (idx < 0) return q;
      const entry = q[idx];
      const startedAt = Date.now();
      const sortedParsed = entry.parsed
        ? { ...entry.parsed, pallets: sortPallets(entry.parsed.pallets) }
        : entry.parsed;
      const firstPallet = sortedParsed?.pallets?.[0];
      setCurrent({
        ...entry,
        parsed: sortedParsed,
        startedAt,
        step: 'pruefen',
        completedKeys: {},
        palletTimings: firstPallet ? { [firstPallet.id]: { startedAt } } : {},
        currentPalletIdx: 0,
        currentItemIdx: 0,
      });
      return q.filter((_, i) => i !== idx);
    });
  }, []);

  const goToStep = useCallback((step) => {
    setCurrent((c) => (c ? { ...c, step } : c));
  }, []);

  const setCurrentPalletIdx = useCallback((idx) => {
    setCurrent((c) => {
      if (!c?.parsed) return c;
      const pId = c.parsed.pallets?.[idx]?.id;
      const palletTimings = { ...(c.palletTimings || {}) };
      if (pId && !palletTimings[pId]) palletTimings[pId] = { startedAt: Date.now() };
      return { ...c, currentPalletIdx: idx, currentItemIdx: 0, palletTimings };
    });
  }, []);

  const setCurrentItemIdx = useCallback((idx) => {
    setCurrent((c) => (c ? { ...c, currentItemIdx: idx } : c));
  }, []);

  /* Mark current article as fertig + advance to next.
     Returns "complete" if last article of last pallet was just marked. */
  const completeCurrentItem = useCallback(() => {
    let didFinishAll = false;
    setCurrent((c) => {
      if (!c?.parsed) return c;
      const pallet = c.parsed.pallets[c.currentPalletIdx];
      if (!pallet) return c;
      const item = pallet.items[c.currentItemIdx];
      if (!item) return c;
      const code = item.fnsku || item.sku;
      const key = `${pallet.id}|${c.currentItemIdx}|${code}`;
      const completedKeys = { ...c.completedKeys, [key]: Date.now() };

      let palletTimings = c.palletTimings || {};
      let currentPalletIdx = c.currentPalletIdx;
      let currentItemIdx = c.currentItemIdx + 1;

      if (currentItemIdx >= pallet.items.length) {
        // pallet finished — record finishedAt
        palletTimings = {
          ...palletTimings,
          [pallet.id]: {
            ...(palletTimings[pallet.id] || { startedAt: Date.now() }),
            finishedAt: Date.now(),
          },
        };
        if (currentPalletIdx + 1 < c.parsed.pallets.length) {
          currentPalletIdx += 1;
          currentItemIdx = 0;
          const nextId = c.parsed.pallets[currentPalletIdx].id;
          if (!palletTimings[nextId]) {
            palletTimings = {
              ...palletTimings,
              [nextId]: { startedAt: Date.now() },
            };
          }
        } else {
          // last pallet, last item — done!
          didFinishAll = true;
          // keep currentItemIdx at length so UI knows all done
        }
      }

      return {
        ...c,
        completedKeys, palletTimings,
        currentPalletIdx, currentItemIdx,
      };
    });
    return didFinishAll;
  }, []);

  /* Save current as completed → history; clear current; auto-start next
     in queue if any. */
  const completeAndAdvance = useCallback(() => {
    setCurrent((c) => {
      if (!c) return null;
      const pallets = c.parsed?.pallets || [];
      const articles = pallets.flatMap((p) =>
        p.items.map((it, i) => ({
          palletId: p.id, itemIdx: i,
          sku: it.sku, fnsku: it.fnsku, title: it.title,
          units: it.units, useItem: it.useItem,
          category: it.category,
        })),
      );
      const entry = {
        id: c.id,
        fbaCode: c.parsed?.meta?.sendungsnummer || c.parsed?.meta?.fbaCode || '—',
        fileName: c.fileName,
        startedAt: c.startedAt,
        finishedAt: Date.now(),
        durationSec: Math.round((Date.now() - c.startedAt) / 1000),
        palletCount: pallets.length,
        articleCount: articles.length,
        articles,
        palletTimings: c.palletTimings || {},
      };
      setHistory((h) => [entry, ...h]);
      return null;
    });

    // Auto-advance queue (also sort pallets for the next Auftrag)
    setTimeout(() => {
      setQueue((q) => {
        if (q.length === 0) return q;
        const next = q[0];
        const startedAt = Date.now();
        const sortedParsed = next.parsed
          ? { ...next.parsed, pallets: sortPallets(next.parsed.pallets) }
          : next.parsed;
        const firstPallet = sortedParsed?.pallets?.[0];
        setCurrent({
          ...next,
          parsed: sortedParsed,
          startedAt,
          step: 'pruefen',
          completedKeys: {},
          palletTimings: firstPallet ? { [firstPallet.id]: { startedAt } } : {},
          currentPalletIdx: 0,
          currentItemIdx: 0,
        });
        return q.slice(1);
      });
    }, 0);
  }, []);

  /* Cancel current workflow without saving */
  const cancelCurrent = useCallback(() => setCurrent(null), []);

  /* History actions */
  const removeHistoryEntry = useCallback((id) => {
    setHistory((h) => h.filter((e) => e.id !== id));
  }, []);
  const clearHistory = useCallback(() => setHistory([]), []);

  const value = useMemo(() => ({
    queue, current, history,
    addFiles, removeFromQueue, reorderQueue, clearQueue,
    startEntry, goToStep,
    setCurrentPalletIdx, setCurrentItemIdx,
    completeCurrentItem, completeAndAdvance, cancelCurrent,
    removeHistoryEntry, clearHistory,
  }), [
    queue, current, history,
    addFiles, removeFromQueue, reorderQueue, clearQueue,
    startEntry, goToStep,
    setCurrentPalletIdx, setCurrentItemIdx,
    completeCurrentItem, completeAndAdvance, cancelCurrent,
    removeHistoryEntry, clearHistory,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
