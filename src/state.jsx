/* ─────────────────────────────────────────────────────────────────────────
   Marathon — central app state (Sprint 1: server-backed via TanStack Query).
   Same useAppState() shape as the localStorage version it replaced — UI
   doesn't need to know about the swap.

   Conceptual model:
     - queue   = backend rows where status='queued' or 'error'
     - current = backend row where status='in_progress' AND assigned_to == me
     - history = backend /api/history items
   ───────────────────────────────────────────────────────────────────────── */

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import mammoth from 'mammoth';
import {
  parseLagerauftragText, validateParsing,
} from './utils/parseLagerauftrag.js';
import { sortPallets } from './utils/auftragHelpers.js';
import { getUserId } from './userId.js';
import {
  listAuftraege, createAuftrag, getAuftrag, deleteAuftrag, reorderQueue as apiReorder,
  startAuftrag, updateProgress, completeAuftrag, cancelAuftrag,
  getHistory, deleteHistoryEntry, getMe,
} from './marathonApi.js';

/* AppStateProvider remains a marker — TanStack Query is mounted in main.jsx.
   We keep the wrapper so existing imports don't break. */
const Ctx = createContext(true);

export function AppStateProvider({ children }) {
  return <Ctx.Provider value={true}>{children}</Ctx.Provider>;
}

/* ─── Adapters: backend (camelCase via marathonApi) → legacy localStorage shape ── */

function toLegacy(a) {
  if (!a) return null;
  return {
    id:        a.id,
    fileName:  a.fileName,
    fbaCode:   a.fbaCode,
    addedAt:   a.createdAt ? Date.parse(a.createdAt) : Date.now(),
    rawText:   a.rawText,
    parsed:    a.parsed,
    validation: a.validation,
    status:    a.status === 'error' ? 'error' : 'ready',
    error:     a.errorMessage,
    palletCount:  a.palletCount,
    articleCount: a.articleCount,

    /* Workflow state — populated when in_progress / completed */
    startedAt:        a.startedAt  ? Date.parse(a.startedAt)  : undefined,
    finishedAt:       a.finishedAt ? Date.parse(a.finishedAt) : undefined,
    durationSec:      a.durationSec,
    step:             a.step,
    currentPalletIdx: a.currentPalletIdx ?? 0,
    currentItemIdx:   a.currentItemIdx ?? 0,
    completedKeys:    a.completedKeys || {},
    palletTimings:    a.palletTimings || {},

    assignedToUserId:   a.assignedToUserId,
    assignedToUserName: a.assignedToUserName,
  };
}

function toLegacyHistory(h) {
  return {
    id:           h.id,
    fileName:     h.fileName,
    fbaCode:      h.fbaCode,
    startedAt:    h.startedAt  ? Date.parse(h.startedAt)  : null,
    finishedAt:   h.finishedAt ? Date.parse(h.finishedAt) : null,
    durationSec:  h.durationSec,
    palletCount:  h.palletCount,
    articleCount: h.articleCount,
    palletTimings: h.palletTimings || {},
    assignedToUserName: h.assignedToUserName,
  };
}

/* Parse one .docx in-browser; sort pallets so the upload result matches
   the workflow ordering used by Focus mode. */
async function parseDocxFile(file) {
  const buf = await file.arrayBuffer();
  let rawText = '';
  try {
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    rawText = r.value;
    const parsed = parseLagerauftragText(rawText);
    if (parsed?.pallets) parsed.pallets = sortPallets(parsed.pallets);
    const validation = validateParsing(rawText, parsed);
    return { fileName: file.name, rawText, parsed, validation, errorMessage: null };
  } catch (e) {
    return { fileName: file.name, rawText, parsed: null, validation: null,
             errorMessage: String(e?.message || e) };
  }
}

/* ─────────────────────────────────────────────────────────────────────── */

export function useAppState() {
  const qc = useQueryClient();
  const userId = getUserId();

  /* ── Queries ───────────────────────────────────────────────────────── */
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: !!userId,
    refetchInterval: false,
    staleTime: Infinity,
    retry: false,
  });

  const auftraegeQ = useQuery({
    queryKey: ['auftraege'],
    queryFn: listAuftraege,
    enabled: !!userId,
  });

  const historyQ = useQuery({
    queryKey: ['history'],
    queryFn: () => getHistory(50, 0),
    enabled: !!userId,
  });

  const all = auftraegeQ.data ?? [];
  const me  = meQ.data;

  /* Derived: queue (waiting/error rows) and current (my in_progress row) */
  const queue = useMemo(
    () => all.filter((a) => a.status === 'queued' || a.status === 'error').map(toLegacy),
    [all],
  );

  const currentSrc = useMemo(
    () => all.find((a) => a.status === 'in_progress' && a.assignedToUserId === me?.id) ?? null,
    [all, me?.id],
  );
  const current = useMemo(() => toLegacy(currentSrc), [currentSrc]);

  const history = useMemo(
    () => (historyQ.data?.items ?? []).map(toLegacyHistory),
    [historyQ.data],
  );

  /* ── Mutations ─────────────────────────────────────────────────────── */
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['auftraege'] });
    qc.invalidateQueries({ queryKey: ['history'] });
  };

  const createMut  = useMutation({ mutationFn: createAuftrag, onSuccess: invalidateAll });
  const removeMut  = useMutation({ mutationFn: deleteAuftrag, onSuccess: invalidateAll });
  const reorderMut = useMutation({ mutationFn: apiReorder,    onSuccess: invalidateAll });
  const cancelMut  = useMutation({ mutationFn: cancelAuftrag, onSuccess: invalidateAll });
  const startMut   = useMutation({
    mutationFn: startAuftrag,
    onSuccess:  invalidateAll,
    onError:    (err) => {
      /* Race: caller's UI thought current was empty but server says otherwise.
         Surface the message; refetch will sync the real state in. */
      if (err?.status === 409) alert(err.message);
      invalidateAll();
    },
  });
  const completeMut = useMutation({
    mutationFn: completeAuftrag,
    onSuccess: async () => {
      invalidateAll();
      /* Auto-start the next queued Auftrag for me. */
      const fresh = await listAuftraege();
      const next = fresh.find((a) => a.status === 'queued');
      if (next) startMut.mutate(next.id);
    },
  });
  const deleteHistMut = useMutation({
    mutationFn: deleteHistoryEntry,
    onSuccess: invalidateAll,
  });

  /* Progress writes are frequent (every "Fertig" click). Optimistic update
     keeps the UI snappy; we re-fetch the list once the server confirms. */
  const progressMut = useMutation({
    mutationFn: ({ id, payload }) => updateProgress(id, payload),
    onMutate: async ({ id, payload }) => {
      await qc.cancelQueries({ queryKey: ['auftraege'] });
      const prev = qc.getQueryData(['auftraege']);
      qc.setQueryData(['auftraege'], (old) =>
        (old || []).map((a) => (a.id === id ? { ...a, ...payload } : a)),
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['auftraege'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['auftraege'] }),
  });

  /* ── Actions (legacy useAppState() shape) ──────────────────────────── */
  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => /\.docx$/i.test(f.name));
    if (!files.length) return [];
    const built = await Promise.all(files.map(parseDocxFile));
    const created = await Promise.all(
      built.map((p) => createMut.mutateAsync(p).catch(() => null)),
    );
    return created.filter(Boolean).map(toLegacy);
  }, [createMut]);

  const removeFromQueue = useCallback((id) => removeMut.mutate(id), [removeMut]);

  const clearQueue = useCallback(() => {
    queue.forEach((q) => removeMut.mutate(q.id));
  }, [queue, removeMut]);

  /* Old signature: (fromIdx, toIdx). We translate to a list of
     {id, queuePosition} and call PATCH /reorder. */
  const reorderQueueAction = useCallback((fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const next = [...queue];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const items = next.map((q, i) => ({ id: q.id, queuePosition: i }));
    /* Optimistic: update list order immediately. */
    qc.setQueryData(['auftraege'], (old) => {
      if (!old) return old;
      const byId = new Map(old.map((a) => [a.id, a]));
      const reordered = items.map((it, i) => ({
        ...byId.get(it.id),
        queuePosition: i,
      }));
      const inProgress = old.filter((a) => a.status === 'in_progress');
      return [...reordered, ...inProgress];
    });
    reorderMut.mutate(items);
  }, [queue, qc, reorderMut]);

  const startEntry = useCallback((entryId) => {
    /* Local guard — backend has the same rule; this avoids a needless 409
       round-trip when we already know we have an active Auftrag. */
    if (current) {
      alert(
        'Du bearbeitest bereits einen Auftrag. ' +
        'Schließe ihn ab oder breche ihn ab, bevor du einen neuen startest.'
      );
      return;
    }
    const target = entryId || queue[0]?.id;
    if (target) startMut.mutate(target);
  }, [current, queue, startMut]);

  const goToStep = useCallback((step) => {
    if (current?.id) progressMut.mutate({ id: current.id, payload: { step } });
  }, [current, progressMut]);

  const setCurrentPalletIdx = useCallback((idx) => {
    if (!current?.id) return;
    const pId = current.parsed?.pallets?.[idx]?.id;
    const palletTimings = { ...(current.palletTimings || {}) };
    if (pId && !palletTimings[pId]) palletTimings[pId] = { startedAt: Date.now() };
    progressMut.mutate({
      id: current.id,
      payload: { currentPalletIdx: idx, currentItemIdx: 0, palletTimings },
    });
  }, [current, progressMut]);

  const setCurrentItemIdx = useCallback((idx) => {
    if (current?.id) {
      progressMut.mutate({ id: current.id, payload: { currentItemIdx: idx } });
    }
  }, [current, progressMut]);

  /* Mark current article fertig + advance. Returns true when last article
     of the last pallet has been completed (UI uses this to auto-navigate). */
  const completeCurrentItem = useCallback(() => {
    if (!current?.parsed) return false;
    const pallet = current.parsed.pallets[current.currentPalletIdx];
    if (!pallet) return false;
    const item = pallet.items[current.currentItemIdx];
    if (!item) return false;

    const code = item.fnsku || item.sku;
    const key = `${pallet.id}|${current.currentItemIdx}|${code}`;
    const completedKeys = { ...(current.completedKeys || {}), [key]: Date.now() };

    let palletTimings   = { ...(current.palletTimings || {}) };
    let nextPalletIdx   = current.currentPalletIdx;
    let nextItemIdx     = current.currentItemIdx + 1;
    let didFinishAll    = false;

    if (nextItemIdx >= pallet.items.length) {
      palletTimings = {
        ...palletTimings,
        [pallet.id]: {
          ...(palletTimings[pallet.id] || { startedAt: Date.now() }),
          finishedAt: Date.now(),
        },
      };
      if (nextPalletIdx + 1 < current.parsed.pallets.length) {
        nextPalletIdx += 1;
        nextItemIdx = 0;
        const nextId = current.parsed.pallets[nextPalletIdx].id;
        if (!palletTimings[nextId]) {
          palletTimings = { ...palletTimings, [nextId]: { startedAt: Date.now() } };
        }
      } else {
        didFinishAll = true;
      }
    }

    progressMut.mutate({
      id: current.id,
      payload: {
        completedKeys, palletTimings,
        currentPalletIdx: nextPalletIdx,
        currentItemIdx:   nextItemIdx,
      },
    });
    return didFinishAll;
  }, [current, progressMut]);

  const completeAndAdvance = useCallback(() => {
    if (current?.id) completeMut.mutate(current.id);
  }, [current, completeMut]);

  const cancelCurrent = useCallback(() => {
    if (current?.id) cancelMut.mutate(current.id);
  }, [current, cancelMut]);

  const removeHistoryEntry = useCallback(
    (id) => deleteHistMut.mutate(id),
    [deleteHistMut],
  );

  const clearHistory = useCallback(() => {
    history.forEach((h) => deleteHistMut.mutate(h.id));
  }, [history, deleteHistMut]);

  /* ── Public API — same shape as the old localStorage version ──────── */
  return useMemo(() => ({
    queue, current, history,
    addFiles, removeFromQueue, reorderQueue: reorderQueueAction, clearQueue,
    startEntry, goToStep,
    setCurrentPalletIdx, setCurrentItemIdx,
    completeCurrentItem, completeAndAdvance, cancelCurrent,
    removeHistoryEntry, clearHistory,
  }), [
    queue, current, history,
    addFiles, removeFromQueue, reorderQueueAction, clearQueue,
    startEntry, goToStep,
    setCurrentPalletIdx, setCurrentItemIdx,
    completeCurrentItem, completeAndAdvance, cancelCurrent,
    removeHistoryEntry, clearHistory,
  ]);
}
