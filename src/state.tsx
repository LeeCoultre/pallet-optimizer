/* ─────────────────────────────────────────────────────────────────────────
   Marathon — central app state (Sprint 1: server-backed via TanStack Query).
   Same useAppState() shape as the localStorage version it replaced — UI
   doesn't need to know about the swap.

   Conceptual model:
     - queue   = backend rows where status='queued' or 'error'
     - current = backend row where status='in_progress' AND assigned_to == me
     - history = backend /api/history items
   ───────────────────────────────────────────────────────────────────────── */

import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import mammoth from 'mammoth';
import {
  parseLagerauftragText, validateParsing,
} from './utils/parseLagerauftrag.js';
import { sortPallets } from './utils/auftragHelpers.js';
import {
  listAuftraege, createAuftrag, getAuftrag, deleteAuftrag, reorderQueue as apiReorder,
  startAuftrag, updateProgress, completeAuftrag, cancelAuftrag,
  getHistory, deleteHistoryEntry, getMe,
  ApiError,
} from './marathonApi';
import type {
  AuftragDetail,
  AuftragSummary,
  AuftragReorderItem,
  CompletedKeys,
  PalletTimings,
  UUID,
  WorkflowProgressPatch,
  WorkflowStep,
} from './types/api';
import type { LegacyAuftrag, LegacyHistoryItem, UseAppStateApi } from './types/state';

// Avoid unused-import warnings for getAuftrag (kept for re-export parity).
void getAuftrag;

/* AppStateProvider remains a marker — TanStack Query is mounted in main.jsx.
   We keep the wrapper so existing imports don't break. */
const Ctx = createContext(true);

export function AppStateProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={true}>{children}</Ctx.Provider>;
}

/* ─── Copied-codes localStorage helpers ──────────────────────────────────
   `copiedKeys` is a per-pallet+item bitset that drives the green chip
   state in Focus. Stored locally (not on the server) — it's a UX
   convenience for the active session, not data we need to audit or
   sync across devices. Survives reload but not browser-storage clears
   or device switches. Cleaned up when the Auftrag finishes/cancels. */
const CK_PREFIX = 'marathon.copiedKeys.';
const CK_KEY = (auftragId: UUID) => `${CK_PREFIX}${auftragId}`;

function readCopiedKeys(auftragId: UUID | undefined | null): Record<string, number> {
  if (!auftragId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CK_KEY(auftragId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeCopiedKeys(auftragId: UUID, obj: Record<string, number>): void {
  if (!auftragId || typeof window === 'undefined') return;
  try { window.localStorage.setItem(CK_KEY(auftragId), JSON.stringify(obj)); }
  catch { /* quota / private mode — silent */ }
}

function clearCopiedKeys(auftragId: UUID): void {
  if (!auftragId || typeof window === 'undefined') return;
  try { window.localStorage.removeItem(CK_KEY(auftragId)); }
  catch { /* ignore */ }
}

/* ─── Adapters: backend (camelCase via marathonApi) → legacy localStorage shape ── */

function toLegacy(a: AuftragDetail | AuftragSummary | null | undefined): LegacyAuftrag | null {
  if (!a) return null;
  const detail = a as Partial<AuftragDetail>;
  return {
    id:        a.id,
    fileName:  a.fileName,
    fbaCode:   a.fbaCode,
    addedAt:   a.createdAt ? Date.parse(a.createdAt) : Date.now(),
    rawText:   detail.rawText,
    parsed:    detail.parsed,
    validation: detail.validation,
    status:    a.status === 'error' ? 'error' : 'ready',
    error:     a.errorMessage,
    palletCount:  a.palletCount,
    articleCount: a.articleCount,

    startedAt:        a.startedAt  ? Date.parse(a.startedAt)  : undefined,
    finishedAt:       a.finishedAt ? Date.parse(a.finishedAt) : undefined,
    durationSec:      a.durationSec,
    step:             detail.step,
    currentPalletIdx: detail.currentPalletIdx ?? 0,
    currentItemIdx:   detail.currentItemIdx ?? 0,
    completedKeys:    detail.completedKeys ?? {},
    copiedKeys:       readCopiedKeys(a.id),
    palletTimings:    a.palletTimings ?? {},

    assignedToUserId:   a.assignedToUserId,
    assignedToUserName: a.assignedToUserName,
  };
}

function toLegacyHistory(h: AuftragSummary): LegacyHistoryItem {
  return {
    id:           h.id,
    fileName:     h.fileName,
    fbaCode:      h.fbaCode,
    startedAt:    h.startedAt  ? Date.parse(h.startedAt)  : null,
    finishedAt:   h.finishedAt ? Date.parse(h.finishedAt) : null,
    durationSec:  h.durationSec,
    palletCount:  h.palletCount,
    articleCount: h.articleCount,
    palletTimings: h.palletTimings ?? {},
    assignedToUserName: h.assignedToUserName,
  };
}

/* Parse one .docx in-browser; sort pallets so the upload result matches
   the workflow ordering used by Focus mode. */
async function parseDocxFile(file: File) {
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
    return {
      fileName: file.name, rawText, parsed: null, validation: null,
      errorMessage: String((e as Error)?.message ?? e),
    };
  }
}

/* ─────────────────────────────────────────────────────────────────────── */

const ALLOW_ANONYMOUS = import.meta.env.VITE_ALLOW_ANONYMOUS === 'true';

interface ProgressMutationArgs { id: UUID; payload: WorkflowProgressPatch }

export function useAppState(): UseAppStateApi {
  const qc = useQueryClient();
  const { isSignedIn } = useAuth();
  const effectivelySignedIn = isSignedIn || ALLOW_ANONYMOUS;

  /* ── Queries ───────────────────────────────────────────────────────── */
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: !!effectivelySignedIn,
    refetchInterval: false,
    staleTime: Infinity,
    retry: false,
  });

  const auftraegeQ = useQuery({
    queryKey: ['auftraege'],
    queryFn: listAuftraege,
    enabled: !!effectivelySignedIn,
  });

  const historyQ = useQuery({
    queryKey: ['history'],
    queryFn: () => getHistory(50, 0),
    enabled: !!effectivelySignedIn,
  });

  const all: AuftragSummary[] = auftraegeQ.data ?? [];
  const me  = meQ.data;

  const queue = useMemo(
    () => all
      .filter((a) => a.status === 'queued' || a.status === 'error')
      .map(toLegacy)
      .filter((x): x is LegacyAuftrag => x != null),
    [all],
  );

  const currentSrc = useMemo(
    () => all.find((a) => a.status === 'in_progress' && a.assignedToUserId === me?.id) ?? null,
    [all, me?.id],
  );
  const [copiedKeysVersion, setCopiedKeysVersion] = useState(0);
  const current = useMemo(
    () => toLegacy(currentSrc),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentSrc, copiedKeysVersion],
  );

  const history: LegacyHistoryItem[] = useMemo(
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
  const cancelMut  = useMutation({
    mutationFn: cancelAuftrag,
    onSuccess: (_data, id: UUID) => { clearCopiedKeys(id); invalidateAll(); },
  });
  const startMut   = useMutation({
    mutationFn: startAuftrag,
    onSuccess:  invalidateAll,
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.status === 409) alert(err.message);
      invalidateAll();
    },
  });
  const completeMut = useMutation({
    mutationFn: completeAuftrag,
    onSuccess: async (_data, id: UUID) => {
      clearCopiedKeys(id);
      invalidateAll();
      const fresh = await listAuftraege();
      const next = fresh.find((a) => a.status === 'queued');
      if (next) startMut.mutate(next.id);
    },
  });
  const deleteHistMut = useMutation({
    mutationFn: deleteHistoryEntry,
    onSuccess: invalidateAll,
  });

  const progressMut = useMutation<AuftragDetail, Error, ProgressMutationArgs, { prev?: AuftragSummary[] }>({
    mutationFn: ({ id, payload }) => updateProgress(id, payload),
    onMutate: async ({ id, payload }) => {
      await qc.cancelQueries({ queryKey: ['auftraege'] });
      const prev = qc.getQueryData<AuftragSummary[]>(['auftraege']);
      qc.setQueryData<AuftragSummary[]>(['auftraege'], (old) =>
        (old || []).map((a) => (a.id === id ? { ...a, ...(payload as Partial<AuftragSummary>) } : a)),
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['auftraege'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['auftraege'] }),
  });

  /* ── Actions (legacy useAppState() shape) ──────────────────────────── */
  const addFiles = useCallback(async (fileList: FileList | File[] | null): Promise<LegacyAuftrag[]> => {
    const files = Array.from(fileList || []).filter((f) => /\.docx$/i.test(f.name));
    if (!files.length) return [];
    const built = await Promise.all(files.map(parseDocxFile));
    const created = await Promise.all(
      built.map((p) => createMut.mutateAsync(p).catch(() => null)),
    );
    return created
      .map((c) => toLegacy(c))
      .filter((x): x is LegacyAuftrag => x != null);
  }, [createMut]);

  const removeFromQueue = useCallback((id: UUID) => removeMut.mutate(id), [removeMut]);

  const clearQueue = useCallback(() => {
    queue.forEach((q) => removeMut.mutate(q.id));
  }, [queue, removeMut]);

  const reorderQueueAction = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const next = [...queue];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const items: AuftragReorderItem[] = next.map((q, i) => ({ id: q.id, queuePosition: i }));
    qc.setQueryData<AuftragSummary[]>(['auftraege'], (old) => {
      if (!old) return old;
      const byId = new Map(old.map((a) => [a.id, a]));
      const reordered = items
        .map((it, i) => {
          const base = byId.get(it.id);
          return base ? { ...base, queuePosition: i } : null;
        })
        .filter((x): x is AuftragSummary => x != null);
      const inProgress = old.filter((a) => a.status === 'in_progress');
      return [...reordered, ...inProgress];
    });
    reorderMut.mutate(items);
  }, [queue, qc, reorderMut]);

  const reorderQueueTo = useCallback((orderedIds: UUID[]) => {
    if (!Array.isArray(orderedIds) || orderedIds.length !== queue.length) return;
    const idSet = new Set(queue.map((q) => q.id));
    if (!orderedIds.every((id) => idSet.has(id))) return;
    let changed = false;
    for (let i = 0; i < orderedIds.length; i++) {
      if (queue[i]?.id !== orderedIds[i]) { changed = true; break; }
    }
    if (!changed) return;
    const items: AuftragReorderItem[] = orderedIds.map((id, i) => ({ id, queuePosition: i }));
    qc.setQueryData<AuftragSummary[]>(['auftraege'], (old) => {
      if (!old) return old;
      const byId = new Map(old.map((a) => [a.id, a]));
      const reordered = items
        .map((it, i) => {
          const base = byId.get(it.id);
          return base ? { ...base, queuePosition: i } : null;
        })
        .filter((x): x is AuftragSummary => x != null);
      const inProgress = old.filter((a) => a.status === 'in_progress');
      return [...reordered, ...inProgress];
    });
    reorderMut.mutate(items);
  }, [queue, qc, reorderMut]);

  const startEntry = useCallback((entryId?: UUID) => {
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

  const goToStep = useCallback((step: WorkflowStep) => {
    if (current?.id) progressMut.mutate({ id: current.id, payload: { step } });
  }, [current, progressMut]);

  const setCurrentPalletIdx = useCallback((idx: number) => {
    if (!current?.id) return;
    const pId = current.parsed?.pallets?.[idx]?.id;
    const palletTimings: PalletTimings = { ...(current.palletTimings ?? {}) };
    if (pId && !palletTimings[pId]) palletTimings[pId] = { startedAt: Date.now() };
    progressMut.mutate({
      id: current.id,
      payload: { currentPalletIdx: idx, currentItemIdx: 0, palletTimings },
    });
  }, [current, progressMut]);

  const setCurrentItemIdx = useCallback((idx: number) => {
    if (current?.id) {
      progressMut.mutate({ id: current.id, payload: { currentItemIdx: idx } });
    }
  }, [current, progressMut]);

  const markCodeCopied = useCallback((palletIdx: number, itemIdx: number) => {
    if (!current?.id) return;
    const key = `${palletIdx}|${itemIdx}`;
    const prev = readCopiedKeys(current.id);
    if (prev[key]) return;
    writeCopiedKeys(current.id, { ...prev, [key]: Date.now() });
    setCopiedKeysVersion((v) => v + 1);
  }, [current?.id]);

  const completeCurrentItem = useCallback((effectiveItemsCount?: number, effectiveItem: unknown = null): boolean => {
    if (!current?.parsed) return false;
    const pallet = current.parsed.pallets[current.currentPalletIdx];
    if (!pallet) return false;
    const itemsLength = effectiveItemsCount ?? pallet.items.length;
    const item = (effectiveItem as { fnsku?: string; sku?: string } | null) || pallet.items[current.currentItemIdx];
    if (!item && effectiveItemsCount == null) return false;
    const code = (item && (item.fnsku || item.sku))
      || `pos-${current.currentItemIdx}`;
    const key = `${pallet.id}|${current.currentItemIdx}|${code}`;
    const completedKeys: CompletedKeys = { ...(current.completedKeys ?? {}), [key]: Date.now() };

    let palletTimings: PalletTimings = { ...(current.palletTimings ?? {}) };
    let nextPalletIdx = current.currentPalletIdx;
    let nextItemIdx   = current.currentItemIdx + 1;
    let didFinishAll  = false;

    if (nextItemIdx >= itemsLength) {
      const prevTiming = palletTimings[pallet.id] ?? { startedAt: Date.now() };
      palletTimings = {
        ...palletTimings,
        [pallet.id]: { ...prevTiming, finishedAt: Date.now() },
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
    (id: UUID) => deleteHistMut.mutate(id),
    [deleteHistMut],
  );

  const clearHistory = useCallback(() => {
    history.forEach((h) => deleteHistMut.mutate(h.id));
  }, [history, deleteHistMut]);

  return useMemo<UseAppStateApi>(() => ({
    queue, current, history,
    addFiles, removeFromQueue, reorderQueue: reorderQueueAction, reorderQueueTo, clearQueue,
    startEntry, goToStep,
    setCurrentPalletIdx, setCurrentItemIdx, markCodeCopied,
    completeCurrentItem, completeAndAdvance, cancelCurrent,
    removeHistoryEntry, clearHistory,
  }), [
    queue, current, history,
    addFiles, removeFromQueue, reorderQueueAction, reorderQueueTo, clearQueue,
    startEntry, goToStep,
    setCurrentPalletIdx, setCurrentItemIdx, markCodeCopied,
    completeCurrentItem, completeAndAdvance, cancelCurrent,
    removeHistoryEntry, clearHistory,
  ]);
}
