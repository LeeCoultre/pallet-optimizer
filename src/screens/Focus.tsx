/* Focus — Schritt 03. Single-article workflow.

   Visual ethos: the page does NOT scroll. One hero card holds every
   fact about the current article; pallet/item state is folded into a
   thin progress strip inside the StickyBar. No StepperBar — the
   workflow stepper is hidden because Focus IS the focused state.

   Card layout (Apple-clean, hairline-bordered, soft shadow):

     ┌─ ArticleHeroCard ────────────────────────────────────────┐
     │ [01 / 12 · PAL003]      [L1 Thermorollen] [ESKU][flags]  │
     │                                                          │
     │ ┌─ Article (LEFT) ──────┐ │ ┌─ Codes (RIGHT) ────────┐   │
     │ │ THERMOROLLE           │ │ │ ARTIKEL-CODE  · C      │   │
     │ │ 57 × 18 · 20 Rollen   │ │ │ X0010197UP   ← dominant │   │
     │ │                       │ │ │ ─────                  │   │
     │ │ MENGE                 │ │ │ USE-ITEM      · U      │   │
     │ │ 25  Kartons           │ │ │ 4006381234567 ← quiet  │   │
     │ │ → 500 Rollen gesamt   │ │ │                        │   │
     │ └───────────────────────┘ │ └────────────────────────┘   │
     └──────────────────────────────────────────────────────────┘

     ┌─ FocusStickyBar (fixed bottom) ─────────────────────────┐
     │ [P01•][P02•][P03●][...]   │   [1✓ 2✓ 3● 4 5 6 7 ...]    │
     │ ●  Bereit · PAL003 · 5/12   ← 5/12 →   [Artikel ✓]      │
     └──────────────────────────────────────────────────────────┘

   Persistence: copiedKeys is server-backed via /api/auftraege/.../
   progress copied_keys JSONB. Reload no longer wipes chip state. */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppState } from '@/state.jsx';
import {
  focusItemView, sortItemsForPallet, distributeEinzelneSku,
  enrichItemDims, getDisplayLevel, LEVEL_META, formatItemTitle,
} from '@/utils/auftragHelpers.js';
import { lookupSkuDimensions } from '@/marathonApi.js';
import { detectWiederholt } from '@/utils/wiederholtLogic.js';
import { Page, Topbar, Button, Badge, StudioFrame, T } from '@/components/ui.jsx';
import PalletInterlude, { resetSkipCount } from '@/components/PalletInterlude.jsx';
import AuftragFinaleStage from '@/components/AuftragFinaleStage.jsx';

const SCHNELL_KEY = 'marathon.focus.schnellmodus';

/* Short, human-readable pallet name. Files come in with id like
   "P1-B1" / "P2-B3"; the "-B…" suffix is the docx box number, which
   workers don't need on screen. Prefer `pallet.number` (always set by
   the parser) and fall back to stripping the suffix. Accepts either
   a pallet object or a raw id string. */
function shortPalletId(p) {
  if (!p) return '';
  if (typeof p === 'string') {
    const m = p.match(/^([A-Za-z]+\d+)/);
    return m ? m[1] : p;
  }
  if (typeof p.number === 'number') return `P${p.number}`;
  return shortPalletId(p.id || '');
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function FocusScreen() {
  const {
    current,
    setCurrentPalletIdx, setCurrentItemIdx, markCodeCopied,
    completeCurrentItem, cancelCurrent, goToStep,
  } = useAppState();

  /* Async dim/weight enrichment (cached 5min, same key as Pruefen). */
  const sourcePallets = current?.parsed?.pallets || [];
  const rawEsku       = current?.parsed?.einzelneSkuItems || [];
  const allItems = useMemo(
    () => [...sourcePallets.flatMap((p) => p.items || []), ...rawEsku],
    [sourcePallets, rawEsku],
  );
  const dimsQ = useQuery({
    queryKey: ['sku-dims', current?.id],
    queryFn: () => enrichItemDims(allItems, lookupSkuDimensions),
    enabled: !!current?.id && allItems.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const enrichedSourcePallets = useMemo(() => {
    const enriched = dimsQ.data || null;
    let cursor = 0;
    return sourcePallets.map((p) => ({
      ...p,
      items: (p.items || []).map((origIt) => {
        const fromDims = enriched ? enriched[cursor] : null;
        cursor += 1;
        return fromDims || origIt;
      }),
    }));
  }, [sourcePallets, dimsQ.data]);
  const enrichedEsku = useMemo(() => {
    if (!dimsQ.data) return rawEsku;
    const palletItemsCount = sourcePallets.reduce((n, p) => n + (p.items?.length || 0), 0);
    return rawEsku.map((it, i) => dimsQ.data[palletItemsCount + i] || it);
  }, [rawEsku, sourcePallets, dimsQ.data]);
  const distribution = useMemo(
    () => distributeEinzelneSku(enrichedSourcePallets, enrichedEsku),
    [enrichedSourcePallets, enrichedEsku],
  );
  const palletStates = distribution.palletStates;

  const rawPallets = useMemo(
    () => enrichedSourcePallets.map((p) => {
      const sortedMixed = sortItemsForPallet(p.items || []);
      const sortedEsku  = sortItemsForPallet(distribution.byPalletId[p.id] || []);
      return { ...p, items: [...sortedMixed, ...sortedEsku] };
    }),
    [enrichedSourcePallets, distribution],
  );

  const palletIdx = Math.min(current?.currentPalletIdx ?? 0, Math.max(0, rawPallets.length - 1));
  const itemIdx   = current?.currentItemIdx ?? 0;
  const completedKeysObj = current?.completedKeys || {};

  const rawPallet = rawPallets[palletIdx];
  const rawItem   = rawPallet?.items?.[Math.min(itemIdx, (rawPallet?.items?.length || 1) - 1)];
  const pallet = rawPallet ? {
    id: rawPallet.id,
    items: rawPallet.items.map(focusItemView),
  } : null;
  const item = rawItem ? focusItemView(rawItem) : null;

  /* ── view-only state ── */
  const [wiederholt, setWiederholt] = useState<{ code?: string; units?: number; palletId?: string; name?: string } | null>(null);
  const [flashUse,   setFlashUse]   = useState<unknown | null>(null);
  const [interlude,  setInterlude]  = useState<{ id: string; itemCount: number; weightKg: unknown; volCm3: unknown; durationMs: number; nextPallet: unknown } | null>(null);
  const [finale,     setFinale]     = useState(false);
  /* «Zen»-Modus — Klick auf den freien Bereich (oder Z-Taste) blendet
     alles bis auf das Wesentliche aus: Artikelname, Menge, Codes. */
  const [zen,        setZen]        = useState(false);
  /* Whether the finale is "armed" — set true the moment the worker
     clicks Fertig on the last item of the last pallet. Without this
     gate the all-done detection effect would also trigger when the
     worker navigates back to Focus from Abschluss (cursor is past last
     item from a previous completion → effect would re-fire and bounce
     them right back to Abschluss). */
  const [finalePending, setFinalePending] = useState(false);

  const [schnellmodus, setSchnellmodus] = useState(() => {
    try { return localStorage.getItem(SCHNELL_KEY) === '1'; } catch { return false; }
  });
  const reducedMotion = useReducedMotion();

  /* Overlay state — full list of every pallet + its articles. */
  const [palletListOpen, setPalletListOpen] = useState(false);

  /* Local display-order override for pallets. Null = use the parser
     order. When the worker drags-to-reorder, we store an array of
     pallet IDs in the desired display order. The override applies to
     the displayed strip only — the workflow state (currentPalletIdx,
     copiedKeys, palletStates) stays tied to rawPallets by id, and we
     remap indices at the PalletFlow boundary. */
  const [palletOrderOverride, setPalletOrderOverride] = useState<string[] | null>(null);

  /* Per-pallet article order override (palletId → array of ORIGINAL
     item indices in display order). Same idea as the pallet override
     but at item granularity, applied only inside the Liste overlay
     and propagated to the chip strip / workflow via index remap. */
  const [articleOrderOverride, setArticleOrderOverride] =
    useState<Record<string, number[]>>({});

  /* copiedKeys derived from server-persisted current.copiedKeys. */
  const copiedKeys = useMemo(
    () => new Set(Object.keys(current?.copiedKeys || {})),
    [current?.copiedKeys],
  );

  /* Apply BOTH overrides:
       1. pallet-level: reorder the pallets array
       2. article-level: reorder items inside each pallet
     Either override is dropped silently if it's stale (size mismatch,
     missing id, etc.) so the UI stays consistent with the workflow. */
  const displayPallets = useMemo(() => {
    /* Step 1 — pallet order */
    let base: typeof rawPallets;
    if (!palletOrderOverride || palletOrderOverride.length !== rawPallets.length) {
      base = rawPallets;
    } else {
      const byId = new Map(rawPallets.map((p) => [p.id, p]));
      const out: typeof rawPallets = [];
      for (const id of palletOrderOverride) {
        const p = byId.get(id);
        if (p) out.push(p);
      }
      base = out.length === rawPallets.length ? out : rawPallets;
    }
    /* Step 2 — article order within each pallet */
    return base.map((p) => {
      const order = articleOrderOverride[p.id];
      const items = p.items || [];
      if (!order || order.length !== items.length) return p;
      const reordered = order.map((i) => items[i]).filter(Boolean);
      if (reordered.length !== items.length) return p;
      return { ...p, items: reordered };
    });
  }, [rawPallets, palletOrderOverride, articleOrderOverride]);

  /* origIdx → displayIdx — used to remap copiedKeys + currentPalletIdx
     into PalletFlow's display coordinates. */
  const origToDisplayIdx = useMemo(() => {
    const m = new Map<number, number>();
    rawPallets.forEach((p, origIdx) => {
      m.set(origIdx, displayPallets.findIndex((d) => d.id === p.id));
    });
    return m;
  }, [rawPallets, displayPallets]);

  /* Helpers to translate item indices through the per-pallet article
     order override. origItemIdx → displayItemIdx for chip strip;
     displayItemIdx → origItemIdx when the user clicks a chip. */
  const articleOrigToDisplay = (palletId: string, origItemIdx: number) => {
    const order = articleOrderOverride[palletId];
    return order ? order.indexOf(origItemIdx) : origItemIdx;
  };
  const articleDisplayToOrig = (palletId: string, displayItemIdx: number) => {
    const order = articleOrderOverride[palletId];
    return order ? order[displayItemIdx] ?? displayItemIdx : displayItemIdx;
  };

  const displayCopiedKeys = useMemo(() => {
    const out = new Set<string>();
    copiedKeys.forEach((k) => {
      const [oi, ii] = k.split('|');
      const origPalletIdx = +oi;
      const origItemIdx = +ii;
      const displayPalletIdx = origToDisplayIdx.get(origPalletIdx);
      if (displayPalletIdx == null || displayPalletIdx < 0) return;
      const palletId = rawPallets[origPalletIdx]?.id;
      if (!palletId) return;
      const displayItemIdx = articleOrigToDisplay(palletId, origItemIdx);
      if (displayItemIdx < 0) return;
      out.add(`${displayPalletIdx}|${displayItemIdx}`);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copiedKeys, origToDisplayIdx, articleOrderOverride, rawPallets]);

  const displayCurrentIdx = origToDisplayIdx.get(palletIdx) ?? palletIdx;
  const currentPalletId = rawPallets[palletIdx]?.id || '';
  const displayCurrentItemIdx = articleOrigToDisplay(currentPalletId, itemIdx);

  /* Stable callback for the chip strip — keeps NumberedChip's React.memo
     effective. Re-binds only when the active pallet id (translation key)
     or the override map changes. */
  const handlePickItem = useCallback((displayItemIdx: number) => {
    const order = articleOrderOverride[currentPalletId];
    const rawIdx = order ? (order[displayItemIdx] ?? displayItemIdx) : displayItemIdx;
    setCurrentItemIdx(rawIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPalletId, articleOrderOverride, setCurrentItemIdx]);

  /* Totals + position. */
  const totalArticles  = rawPallets.reduce((s, p) => s + p.items.length, 0);
  const completedCount = Object.keys(completedKeysObj).length;
  const overallPct     = totalArticles > 0 ? completedCount / totalArticles : 0;

  let articlesBefore = 0;
  for (let i = 0; i < palletIdx; i++) articlesBefore += rawPallets[i].items.length;
  const overallPos = articlesBefore + itemIdx + 1;

  /* Gating */
  const missingCopies = useMemo(() => {
    if (!rawPallet) return [];
    const out: number[] = [];
    for (let i = 0; i < rawPallet.items.length; i++) {
      if (!copiedKeys.has(`${palletIdx}|${i}`)) out.push(i);
    }
    return out;
  }, [rawPallet, palletIdx, copiedKeys]);
  const allPalletCopied   = missingCopies.length === 0;
  const isLastItemOfPallet = rawPallet && itemIdx === rawPallet.items.length - 1;
  const blockMessage = useCallback(() =>
    `Bitte zuerst alle Artikel-Codes der aktuellen Palette kopieren ` +
    `(${missingCopies.length} fehlen noch), bevor du diese Palette abschließt.`,
  [missingCopies.length]);

  const buildInterludePayload = useCallback((idx) => {
    const p = rawPallets[idx];
    if (!p) return null;
    const ps = palletStates?.[p.id];
    const timing = current?.palletTimings?.[p.id];
    const durationMs = (timing?.startedAt && timing?.finishedAt)
      ? (timing.finishedAt - timing.startedAt)
      : (timing?.startedAt ? Date.now() - timing.startedAt : 0);
    /* Pass the FULL next-pallet object so the checkpoint can render
       its level-fingerprint preview using the same vocabulary as the
       StickyBar flow (LEVEL_META colors + per-item cells). */
    const nextPallet = rawPallets[idx + 1] || null;
    return {
      id: p.id,
      itemCount: p.items.length,
      weightKg: ps?.weightKg || 0,
      volCm3:   ps?.volCm3   || 0,
      durationMs,
      nextPallet,
    };
  }, [rawPallets, palletStates, current?.palletTimings]);

  /* ── Navigation ── */
  const goNextItem = useCallback(() => {
    if (!rawPallet) return;
    if (itemIdx + 1 < rawPallet.items.length) {
      setCurrentItemIdx(itemIdx + 1);
      return;
    }
    if (palletIdx + 1 < rawPallets.length) {
      if (!allPalletCopied) {
        alert(blockMessage());
        return;
      }
      setInterlude(buildInterludePayload(palletIdx));
      setCurrentPalletIdx(palletIdx + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPallet, itemIdx, palletIdx, rawPallets, allPalletCopied,
      setCurrentItemIdx, setCurrentPalletIdx, buildInterludePayload]);

  const goPrevItem = useCallback(() => {
    if (itemIdx > 0) { setCurrentItemIdx(itemIdx - 1); return; }
    if (palletIdx > 0) {
      const prevLen = rawPallets[palletIdx - 1].items.length;
      setCurrentPalletIdx(palletIdx - 1);
      setTimeout(() => setCurrentItemIdx(prevLen - 1), 0);
    }
  }, [itemIdx, palletIdx, rawPallets, setCurrentItemIdx, setCurrentPalletIdx]);

  const handleFertig = useCallback(() => {
    if (!rawPallet || !rawItem) return;
    if (isLastItemOfPallet && !allPalletCopied) {
      alert(blockMessage());
      return;
    }
    const wasLastOfPallet = isLastItemOfPallet;
    const wasLastOfAuftrag = wasLastOfPallet && palletIdx === rawPallets.length - 1;
    const hit = detectWiederholt(rawPallets, palletIdx, itemIdx);

    completeCurrentItem(rawPallet.items.length, rawItem);

    if (wasLastOfPallet && !wasLastOfAuftrag) {
      setInterlude(buildInterludePayload(palletIdx));
    }
    if (wasLastOfAuftrag) {
      setFinalePending(true);   // arm the finale gate
    }
    if (hit) setWiederholt(hit);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPallet, rawItem, rawPallets, palletIdx, itemIdx, isLastItemOfPallet,
      allPalletCopied, completeCurrentItem, buildInterludePayload]);

  /* Re-copy pulse — bumps a counter every time the worker copies the
     Artikel-Code while it's already marked kopiert. The Hero card
     uses the counter as an animation key to replay the flash even
     on identical consecutive re-copies. */
  const [reCopyTick, setReCopyTick] = useState(0);

  const onCopyArtikelCode = useCallback(() => {
    if (!item?.code) return;
    copyToClipboard(item.code);
    const wasAlreadyCopied = copiedKeys.has(`${palletIdx}|${itemIdx}`);
    if (wasAlreadyCopied) setReCopyTick((n) => n + 1);
    markCodeCopied(palletIdx, itemIdx);
  }, [item, palletIdx, itemIdx, markCodeCopied, copiedKeys]);

  const onCopyUseItem = useCallback(() => {
    if (!item?.useItem) return;
    copyToClipboard(item.useItem);
    setFlashUse(item.useItem);
    setTimeout(() => setFlashUse(null), 1200);
  }, [item]);

  const toggleSchnell = useCallback(() => {
    setSchnellmodus((v) => {
      const next = !v;
      try { localStorage.setItem(SCHNELL_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  /* Reset only flashUse on item change — copiedCode is now derived from
     persistent copiedKeys (localStorage) below, so it survives navigation
     and returns to previously-copied articles still read as "kopiert". */
  useEffect(() => {
    setFlashUse(null);
  }, [palletIdx, itemIdx]);

  /* Persistent copy-state for the Artikel-Code card on the hero — true
     whenever this exact position (pallet + item) is in copiedKeys.
     Position-keyed only — never compare by code string, otherwise an
     identical article reused on a later pallet would inherit the prior
     pallet's green state. The localStorage write in markCodeCopied
     bumps copiedKeysVersion which immediately re-derives this. */
  const codeCopied = copiedKeys.has(`${palletIdx}|${itemIdx}`);

  /* Wiederholt auto-dismiss */
  useEffect(() => {
    if (!wiederholt) return undefined;
    const t = setTimeout(() => setWiederholt(null), 5000);
    return () => clearTimeout(t);
  }, [wiederholt]);

  /* All-done detection — fires ONLY when finalePending was armed by
     handleFertig on the last item. Re-mounting Focus (e.g. via "Focus"
     breadcrumb from Abschluss) starts with finalePending=false → the
     finale stays closed and the worker can review their work. */
  useEffect(() => {
    if (!finalePending) return undefined;
    if (!rawPallets.length) return undefined;
    const isLastPallet = palletIdx === rawPallets.length - 1;
    const lastP = rawPallets[rawPallets.length - 1];
    const isPastLast = itemIdx >= (lastP?.items?.length || 0);
    if (isLastPallet && isPastLast && !wiederholt && !finale) {
      const t = setTimeout(() => {
        setFinale(true);
        setFinalePending(false);
      }, 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [finalePending, palletIdx, itemIdx, rawPallets, wiederholt, finale]);

  /* Reset interlude skip counter on Auftrag change. */
  useEffect(() => { resetSkipCount(); }, [current?.id]);

  /* Keyboard handler — gated by Shell mode.

     Shell ON  → all workflow hotkeys live (Space/Enter Fertig, ←/→
                 nav, ↑/↓ pallet jump, C copy code, U copy use-item).
     Shell OFF → only the Wiederholt dialog's dismiss keys are wired.
                 Worker is expected to use mouse clicks; this keeps
                 the toggle semantically meaningful (fast vs. careful)
                 instead of "Shell" being a no-op cosmetic state. */
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      if (t?.isContentEditable) return;
      if (interlude || finale) return;
      if (wiederholt) {
        if (['Escape', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          setWiederholt(null);
        }
        return;
      }
      /* Zen-Modus toggle — works regardless of Shell, since it's a UI
         layer concern, not a workflow key. Esc exits zen too. */
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        setZen((v) => !v);
        return;
      }
      if (zen && e.key === 'Escape') {
        e.preventDefault();
        setZen(false);
        return;
      }
      if (!schnellmodus) return;          // Shell OFF — workflow keys disabled
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleFertig(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNextItem(); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrevItem(); return; }
      if (e.key === 'ArrowDown')  {
        e.preventDefault();
        if (palletIdx + 1 < rawPallets.length) {
          if (!allPalletCopied) { alert(blockMessage()); return; }
          setInterlude(buildInterludePayload(palletIdx));
          setCurrentPalletIdx(palletIdx + 1);
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (palletIdx > 0) setCurrentPalletIdx(palletIdx - 1);
        return;
      }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); onCopyArtikelCode(); return; }
      if (e.key === 'u' || e.key === 'U') { e.preventDefault(); onCopyUseItem(); return; }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiederholt, interlude, finale, zen, schnellmodus, handleFertig, goNextItem, goPrevItem,
      onCopyArtikelCode, onCopyUseItem, palletIdx, allPalletCopied, rawPallets]);

  /* Auftrag totals — used by AuftragFinaleStage. */
  const totals = useMemo(() => {
    const palletCount = rawPallets.length;
    const itemCount = totalArticles;
    let weightKg = 0, volCm3 = 0;
    for (const p of rawPallets) {
      const ps = palletStates?.[p.id];
      weightKg += ps?.weightKg || 0;
      volCm3   += ps?.volCm3   || 0;
    }
    const startedAt = current?.startedAt || Date.now();
    const durationMs = Math.max(0, Date.now() - startedAt);
    return { palletCount, itemCount, weightKg, volCm3, durationMs };
  }, [rawPallets, palletStates, totalArticles, current?.startedAt]);

  const onExit = () => {
    if (window.confirm('Auftrag verlassen? Fortschritt bleibt gespeichert.')) {
      cancelCurrent();
    }
  };

  /* ── Empty state ── */
  if (!pallet || !item) {
    return (
      <Page>
        <Topbar
          crumbs={[
            { label: 'Workspace', muted: true },
            { label: 'Focus' },
          ]}
        />
        <main style={{ padding: '64px 32px', textAlign: 'center', color: T.text.subtle }}>
          Kein Auftrag geladen.
        </main>
      </Page>
    );
  }

  return (
    <Page>
      {/* Topbar — fades in zen mode but stays mounted so layout
          (sticky offset, scroll calc) doesn't jump on toggle. */}
      <div style={{
        opacity: zen ? 0 : 1,
        pointerEvents: zen ? 'none' : 'auto',
        transition: 'opacity 240ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <Topbar
          crumbs={[
            { label: 'Prüfen', muted: true,
              onClick: () => goToStep('pruefen'),
              title: 'Zurück zu Prüfen' },
            { label: 'Focus' },
          ]}
          right={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ShellToggle on={schnellmodus} onToggle={toggleSchnell} />
              <Button variant="danger" size="sm" onClick={onExit}
                      title="Focus-Modus verlassen">
                Verlassen
              </Button>
            </span>
          }
        />
      </div>

      {/* main fills the gap between Topbar bottom and StickyBar top.
          Click on the empty background here toggles Zen mode — the
          target check ensures only the bare-main background triggers,
          not bubbled clicks from the article card or pallet flow. */}
      <main
        onClick={(e) => { if (e.target === e.currentTarget) setZen((v) => !v); }}
        style={{
          minHeight: 'calc(100vh - 60px - 98px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 32px 96px',
        }}
      >
        {/* Studio frame brackets BOTH the article hero AND the pallet
            flow — single set of corner-marks + one mono eyebrow at top.
            In zen mode the eyebrow + corner-marks fade out (StudioFrame
            handles that internally via `zen` prop). */}
        <StudioFrame
          bare
          gap={zen ? 0 : 20}
          zen={zen}
          label={`Aktueller Artikel · ${shortPalletId(pallet)}`}
          status={`${String(itemIdx + 1).padStart(2, '0')} / ${String(pallet.items.length).padStart(2, '0')}`}
          style={{ width: '100%', maxWidth: 1080 }}
          contentStyle={{ transition: 'gap 240ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <ArticleHeroCard
            item={item}
            palletId={shortPalletId(pallet)}
            itemIdx={itemIdx}
            itemCount={pallet.items.length}
            copiedCode={codeCopied ? item?.code : null}
            flashUse={flashUse}
            onCopyCode={onCopyArtikelCode}
            onCopyUse={onCopyUseItem}
            zen={zen}
            reCopyTick={reCopyTick}
          />

          {/* Pallet flow — collapses out of view in zen mode (height 0
              + opacity 0) so only the article hero remains on screen.
              Visual shell mirrors ArticleHeroCard: same surface bg,
              same 1px hairline border, same 18px radius, no shadow —
              so the worker reads the two as a paired panel. */}
          <div style={{
            padding: '14px 22px 16px',
            background: T.bg.surface,
            borderRadius: 18,
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            opacity: zen ? 0 : 1,
            maxHeight: zen ? 0 : 220,
            paddingTop: zen ? 0 : 14,
            paddingBottom: zen ? 0 : 16,
            border: zen ? '1px solid transparent' : `1px solid ${T.border.primary}`,
            pointerEvents: zen ? 'none' : 'auto',
            overflow: 'hidden',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            transition: 'opacity 240ms cubic-bezier(0.16, 1, 0.3, 1), max-height 320ms cubic-bezier(0.16, 1, 0.3, 1), padding 240ms ease, border-color 240ms ease',
          }}>
            {!zen && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                minHeight: 30,
              }}>
                <span style={{
                  fontFamily: T.font.mono,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: T.text.faint,
                }}>
                  Pallet Flow
                </span>
                <ViewListButton onClick={() => setPalletListOpen(true)} />
              </div>
            )}
            <PalletFlow
              pallets={displayPallets}
              palletStates={palletStates}
              palletTimings={current?.palletTimings}
              currentIdx={displayCurrentIdx}
              itemIdx={displayCurrentItemIdx}
              copiedKeys={displayCopiedKeys}
              allPalletCopied={allPalletCopied}
              onPickPallet={(displayIdx) => {
                const target = displayPallets[displayIdx];
                if (!target) return;
                const i = rawPallets.findIndex((p) => p.id === target.id);
                if (i < 0 || i === palletIdx) return;
                if (i > palletIdx && !allPalletCopied) { alert(blockMessage()); return; }
                if (i > palletIdx) setInterlude(buildInterludePayload(palletIdx));
                setCurrentPalletIdx(i);
              }}
              onPickItem={handlePickItem}
              onReorder={(fromIdx, toIdx) => {
                if (fromIdx === toIdx) return;
                setPalletOrderOverride((prev) => {
                  const ids = prev || rawPallets.map((p) => p.id);
                  if (fromIdx < 0 || toIdx < 0
                      || fromIdx >= ids.length || toIdx >= ids.length) return prev;
                  const arr = [...ids];
                  const [moved] = arr.splice(fromIdx, 1);
                  arr.splice(toIdx, 0, moved);
                  return arr;
                });
              }}
            />
          </div>

          {/* Zen-mode dot strip — minimal visual cue of the current
              pallet's articles while the full Pallet Flow is hidden.
              Position-only: copied=green, active=accent, todo=outline. */}
          {zen && (
            <ZenItemDots
              items={displayPallets[displayCurrentIdx]?.items || []}
              palletDisplayIdx={displayCurrentIdx}
              currentDisplayItemIdx={displayCurrentItemIdx}
              copiedKeys={displayCopiedKeys}
              onPick={handlePickItem}
            />
          )}
        </StudioFrame>
      </main>

      <FocusStickyBar
        pallets={rawPallets}
        palletIdx={palletIdx}
        itemIdx={itemIdx}
        overallPct={overallPct}
        overallPos={overallPos}
        totalArticles={totalArticles}
        missingCopies={missingCopies.length}
        canPrev={!(palletIdx === 0 && itemIdx === 0)}
        canNext={(itemIdx + 1 < rawPallet.items.length)
                 || (palletIdx + 1 < rawPallets.length && allPalletCopied)}
        onPrev={goPrevItem}
        onNext={goNextItem}
        onFertig={handleFertig}
        zen={zen}
      />

      <WiederholtOverlay
        hit={wiederholt}
        onDismiss={() => setWiederholt(null)}
      />

      {palletListOpen && (
        <PalletListOverlay
          pallets={displayPallets}
          rawPallets={rawPallets}
          currentRawIdx={palletIdx}
          currentRawItemIdx={itemIdx}
          copiedKeys={copiedKeys}
          articleOrderOverride={articleOrderOverride}
          onReorderArticles={(palletId, fromIdx, toIdx) => {
            if (fromIdx === toIdx) return;
            setArticleOrderOverride((prev) => {
              const pal = rawPallets.find((p) => p.id === palletId);
              if (!pal) return prev;
              const count = pal.items?.length || 0;
              const order = prev[palletId] || Array.from({ length: count }, (_, i) => i);
              if (fromIdx < 0 || toIdx < 0
                  || fromIdx >= order.length || toIdx >= order.length) return prev;
              const arr = [...order];
              const [moved] = arr.splice(fromIdx, 1);
              arr.splice(toIdx, 0, moved);
              return { ...prev, [palletId]: arr };
            });
          }}
          onClose={() => setPalletListOpen(false)}
        />
      )}

      {interlude && (
        <PalletInterlude
          pallet={interlude}
          nextPallet={interlude.nextPallet}
          reducedMotion={reducedMotion}
          onComplete={() => setInterlude(null)}
        />
      )}

      {finale && (
        <AuftragFinaleStage
          totals={totals}
          reducedMotion={reducedMotion}
          schnellmodus={schnellmodus}
          onComplete={() => goToStep('abschluss')}
        />
      )}
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ARTICLE HERO CARD — single elevated card, two columns:
     LEFT  — article: name + format/rollen + Menge with breakdown.
     RIGHT — codes:   Artikel-Code (dominant) + Use-Item (quiet).

   Mirrors the HeroFBA visual language from Pruefen: T.bg.surface,
   1px hairline, soft shadow, subtle accent halo top-right. The
   divider between columns is a hairline.
   ════════════════════════════════════════════════════════════════════════ */
function ArticleHeroCard({
  item, palletId, itemIdx, itemCount,
  copiedCode, flashUse, onCopyCode, onCopyUse,
  zen = false,
  compact = false,
  reCopyTick = 0,
}) {
  const cat = item.levelMeta || LEVEL_META[1];
  const haloColor = cat.color || T.accent.main;
  const noVal = item.placementFlags?.includes?.('NO_VALID_PLACEMENT');

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 1080,
      padding: compact ? '14px 20px' : '24px 28px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 18,
      boxShadow: 'none',
      overflow: 'hidden',
      transition: 'padding 240ms cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Soft accent radial halo */}
      <div aria-hidden style={{
        position: 'absolute',
        top: -120, right: -120,
        width: 280, height: 280,
        background: `radial-gradient(circle, ${haloColor}10 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        {/* Top mini-row — position eyebrow on left, badges on right.
            In zen mode the row collapses (height 0) so the article name
            anchors to the card's top padding. */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: zen ? 0 : 20,
          maxHeight: zen ? 0 : 60,
          opacity: zen ? 0 : 1,
          overflow: 'hidden',
          pointerEvents: zen ? 'none' : 'auto',
          transition: 'opacity 200ms ease, max-height 280ms cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <PositionEyebrow palletId={palletId} itemIdx={itemIdx} itemCount={itemCount} />
          <span style={{ flex: 1 }} />
          <LevelChip level={item.level} cat={cat} />
          {item.isEsku && <Badge tone="accent">ESKU</Badge>}
          {item.lst && (
            <Badge tone={item.lst === 'mit LST' ? 'accent' : 'success'}>{item.lst}</Badge>
          )}
          {noVal && <Badge tone="danger">NO_VALID_PLACEMENT</Badge>}
          {!noVal && item.placementFlags?.length > 0 && (
            <Badge tone="warn">{item.placementFlags.join(' · ')}</Badge>
          )}
        </div>

        {/* Two columns — article LEFT, codes RIGHT */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1px 1.05fr',
          gap: 28,
          alignItems: 'stretch',
        }}>
          <ArticleColumn item={item} zen={zen} />
          <span style={{ background: T.border.primary, alignSelf: 'stretch' }} />
          <CodesColumn
            item={item}
            copiedCode={copiedCode}
            flashUse={flashUse}
            onCopyCode={onCopyCode}
            onCopyUse={onCopyUse}
            reCopyTick={reCopyTick}
          />
        </div>
      </div>
    </div>
  );
}

function PositionEyebrow({ palletId, itemIdx, itemCount }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 8,
      fontFamily: T.font.mono,
      fontSize: 11,
      fontWeight: 600,
      color: T.text.subtle,
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
    }}>
      <span style={{ color: T.text.primary, fontVariantNumeric: 'tabular-nums' }}>
        {String(itemIdx + 1).padStart(2, '0')}
        <span style={{ color: T.text.faint, fontWeight: 500 }}>
          &nbsp;/ {String(itemCount).padStart(2, '0')}
        </span>
      </span>
      <span style={{ color: T.border.strong, fontWeight: 400 }}>·</span>
      <span style={{ fontWeight: 500 }}>{palletId}</span>
    </span>
  );
}

function LevelChip({ level, cat }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 9px',
      background: cat.bg,
      color: cat.text,
      border: `1px solid ${cat.color}40`,
      borderRadius: 999,
      fontFamily: T.font.mono,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color }} />
      L{level} · {cat.name}
    </span>
  );
}

/* ── LEFT — article column ─────────────────────────────────────────── */
function ArticleColumn({ item, zen = false }) {
  const perCarton = !item.isEsku
    ? (item.rollen ? { value: item.rollen, unit: item.rollenUnit || 'Rollen' } : null)
    : (item.eskuPacksPerCarton != null
        ? { value: item.eskuPacksPerCarton, unit: 'Einheiten' }
        : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {/* TWIN HEADLINE — article name + per-Karton fact at near-equal weight */}
      <h1 style={{
        margin: 0,
        fontFamily: T.font.ui,
        fontSize: 'clamp(24px, 2.8vw, 34px)',
        fontWeight: 500,
        letterSpacing: '-0.022em',
        lineHeight: 1.1,
        color: T.text.primary,
      }}>
        {item.name}
      </h1>

      {perCarton && (
        <div style={{
          fontFamily: T.font.mono,
          fontSize: 'clamp(20px, 2.4vw, 28px)',
          fontWeight: 600,
          color: T.accent.main,
          letterSpacing: '-0.018em',
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {perCarton.value} {perCarton.unit}
        </div>
      )}

      {/* Hairline divider */}
      <div style={{ height: 1, background: T.border.subtle, margin: '12px 0 6px' }} />

      {/* Menge — number is hero of the column */}
      <div>
        <div style={{
          fontSize: 10.5,
          fontWeight: 600,
          fontFamily: T.font.mono,
          color: T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          marginBottom: 8,
          opacity: zen ? 0 : 1,
          maxHeight: zen ? 0 : 24,
          overflow: 'hidden',
          transition: 'opacity 200ms ease, max-height 240ms cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 240ms ease',
        }}>
          {item.isEsku ? 'FBA-Kartons' : 'Menge'}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
        }}>
          <span style={{
            fontFamily: T.font.ui,
            fontSize: 'clamp(48px, 6vw, 72px)',
            fontWeight: 500,
            letterSpacing: '-0.04em',
            lineHeight: 0.94,
            color: T.text.primary,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {item.isEsku ? item.eskuCartons : item.units}
          </span>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 'clamp(15px, 1.6vw, 20px)',
            fontWeight: 600,
            color: T.text.subtle,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}>
            Kartons
          </span>
        </div>
        {!item.isEsku && item.rollen && (
          <div style={{
            marginTop: 10,
            fontSize: 13, fontFamily: T.font.mono, color: T.text.subtle,
            opacity: zen ? 0 : 1,
            maxHeight: zen ? 0 : 30,
            overflow: 'hidden',
            transition: 'opacity 200ms ease, max-height 240ms cubic-bezier(0.16, 1, 0.3, 1), margin-top 240ms ease',
          }}>
            →&nbsp;
            <span style={{ color: T.text.primary, fontWeight: 500 }}>
              {(item.units * item.rollen).toLocaleString('de-DE')}
            </span>{' '}
            {item.rollenUnit || 'Rollen'} gesamt
          </div>
        )}
        {item.isEsku && (
          <div style={{
            marginTop: 10,
            fontSize: 13, fontFamily: T.font.mono, color: T.text.subtle,
            opacity: zen ? 0 : 1,
            maxHeight: zen ? 0 : 30,
            overflow: 'hidden',
            transition: 'opacity 200ms ease, max-height 240ms cubic-bezier(0.16, 1, 0.3, 1), margin-top 240ms ease',
          }}>
            {item.units.toLocaleString('de-DE')} Einheiten gesamt
          </div>
        )}
      </div>
    </div>
  );
}


/* ── RIGHT — codes column. Artikel-Code dominates over Use-Item.
   Vertically centred via space-around so the column doesn't pool the
   left column's leftover height into a void below Use-Item. */
function CodesColumn({ item, copiedCode, flashUse, onCopyCode, onCopyUse, reCopyTick = 0 }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-around',
      gap: 14,
      minWidth: 0,
      paddingLeft: 4,
      height: '100%',
    }}>
      {/* PRIMARY — Artikel-Code (dominant) */}
      <CodeRow
        label="Artikel-Code"
        kbd="C"
        value={item.code}
        copied={copiedCode != null && copiedCode === item.code}
        onCopy={onCopyCode}
        size="dominant"
        reCopyTick={reCopyTick}
      />

      <div style={{ height: 1, background: T.border.subtle }} />

      {/* SECONDARY — Use-Item (quiet) */}
      <CodeRow
        label="Use-Item"
        kbd="U"
        value={item.useItem}
        copied={flashUse != null && flashUse === item.useItem}
        onCopy={onCopyUse}
        size="quiet"
        accent
      />
    </div>
  );
}

function CodeRow({ label, kbd, value, copied, onCopy, size, accent, reCopyTick = 0 }: { label: React.ReactNode; kbd?: string; value: string; copied?: boolean; onCopy: () => void; size?: 'dominant' | 'compact' | 'quiet'; accent?: boolean; reCopyTick?: number }) {
  const isDominant = size === 'dominant';
  const valueFont = isDominant
    ? 'clamp(30px, 3.6vw, 46px)'
    : 'clamp(15px, 1.4vw, 18px)';
  const valueWeight = isDominant ? 600 : 500;

  return (
    <button
      type="button"
      onClick={onCopy}
      /* Bump key on every re-copy so the flash animation replays even
         if the same code is copied twice in a row. */
      key={`code-${reCopyTick}`}
      className={reCopyTick > 0 ? 'mr-recopy-flash' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isDominant ? 10 : 6,
        padding: '10px 14px',
        margin: '-10px -14px',
        background: copied ? T.status.success.bg : 'transparent',
        border: `1.5px solid ${copied ? T.status.success.main : 'transparent'}`,
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: T.font.ui,
        transition: 'border-color 240ms cubic-bezier(0.16, 1, 0.3, 1), background 240ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 10.5,
          fontWeight: 600,
          fontFamily: T.font.mono,
          color: copied ? T.status.success.text : T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
        }}>
          {label}
        </span>
        <Kbd>{kbd}</Kbd>
        <span style={{ flex: 1 }} />
        {copied ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10.5, fontFamily: T.font.mono, fontWeight: 600,
            color: T.status.success.text,
            letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.5l2 2 5-5.5" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Kopiert
          </span>
        ) : (
          <span style={{
            fontSize: 10.5, fontFamily: T.font.mono, color: T.text.faint,
            letterSpacing: '0.04em',
          }}>
            klick zum Kopieren
          </span>
        )}
      </div>

      {/* Value — dominant for Artikel-Code, quiet for Use-Item */}
      <div style={{
        fontFamily: T.font.mono,
        fontSize: valueFont,
        fontWeight: valueWeight,
        color: copied ? T.status.success.text
          : accent ? T.accent.text : T.text.primary,
        letterSpacing: '-0.016em',
        lineHeight: 1.1,
        wordBreak: 'break-word',
        transition: 'color 200ms ease',
      }}>
        {value || '—'}
      </div>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   STICKY BAR — chip strip on top, status + actions below.
   ════════════════════════════════════════════════════════════════════════ */
function FocusStickyBar({
  pallets, palletIdx, itemIdx,
  overallPct, overallPos, totalArticles, missingCopies,
  canPrev, canNext,
  onPrev, onNext, onFertig,
  zen = false,
}) {
  const isReady  = missingCopies === 0;
  const dotColor = isReady ? T.status.success.main : T.status.warn.main;
  const palletId = pallets?.[palletIdx]?.id || '—';
  const totalInPallet = pallets?.[palletIdx]?.items?.length || 0;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      background: zen ? 'var(--bg-glass-soft)' : 'var(--bg-glass-strong)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderTop: zen ? '1px solid transparent' : `1px solid ${T.border.primary}`,
      marginLeft: 'var(--sidebar-width)',
      transition: 'background 240ms ease, border-color 240ms ease',
    }}>
      {/* 2px overall progress hairline */}
      <div style={{ height: 2, background: 'var(--bg-glass-edge)' }}>
        <div style={{
          height: '100%',
          width: `${Math.max(0, Math.min(1, overallPct)) * 100}%`,
          background: T.accent.main,
          transition: 'width 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>

      {/* Action row — in zen mode the status block + spacer + position
          counter are taken out of flow (display: none), and the row
          container switches to justify-content: center, so the
          [Zurück · Fertig · Weiter] cluster sits in the middle of the
          available width. Snap rather than transitioned, but the
          surrounding chrome already fades smoothly so the swap is
          masked. */}
      <div style={{
        padding: '10px 32px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: zen ? 'center' : 'flex-start',
        gap: 14,
        maxWidth: 1080,
        margin: '0 auto',
      }}>
        {!zen && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: dotColor,
              boxShadow: `0 0 0 3px ${dotColor}22`,
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 12.5,
              color: T.text.primary,
              fontWeight: 500,
              letterSpacing: '-0.005em',
            }}>
              {isReady ? 'Bereit' : `${missingCopies} Code${missingCopies === 1 ? '' : 's'} fehlen`}
            </span>
            <span style={{
              fontSize: 12, color: T.text.faint,
              fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums',
              marginLeft: 4,
            }}>
              {palletId} · {itemIdx + 1}/{totalInPallet}
            </span>
          </span>
        )}

        {!zen && <span style={{ flex: 1 }} />}

        {!zen && (
          <span style={{
            fontSize: 11.5,
            color: T.text.faint,
            fontFamily: T.font.mono,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {overallPos} / {totalArticles}
          </span>
        )}

        <Button variant="ghost" size="sm" onClick={onPrev} disabled={!canPrev}
                title="Vorheriger Artikel (←)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L4 7l5-4" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Zurück
        </Button>

        <Button variant="primary" onClick={onFertig}
                title="Artikel abschließen (Space oder Enter)">
          Artikel abschließen
          <Kbd onPrimary>Space</Kbd>
        </Button>

        <Button variant="ghost" size="sm" onClick={onNext} disabled={!canNext}
                title="Nächster Artikel (→)">
          Weiter
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Button>
      </div>
    </div>
  );
}

/* PalletPills — pallet flow with stepper-style connectors.
   Each pill shows: state-icon · pallet ID · counter (item count for
   done/todo, "x/y" copy progress for current). Connector hairlines
   between pills turn green as the worker crosses pallets, giving a
   horizontal "progress chain" feel without adding vertical noise. */
/* ════════════════════════════════════════════════════════════════════════
   PALLET FLOW — full timeline of pallets in one strip.

   Each pallet is a multi-layer "node" showing every fact at a glance:
     • Header row    : state-icon · ID · counter · ESKU mark · flag dot
     • Fingerprint   : one cell per item, coloured by physical level,
                       opacity by copy-state. Cells of the CURRENT pallet
                       are clickable for jump-to-item (replaces the old
                       separate numbered-chip strip).
   Stepper-style hairline connectors between nodes turn green as the
   worker crosses each pallet, so the chain itself reads as progress.
   ════════════════════════════════════════════════════════════════════════ */
interface PalletStateInfo { anyEsku?: boolean; overloadFlags?: Set<string>; [k: string]: unknown }
interface FocusPalletItem { level?: number; placementMeta?: { flags?: unknown[] }; [k: string]: unknown }
interface PalletFlowProps {
  pallets: Array<{ id: string; items?: FocusPalletItem[]; [k: string]: unknown }>;
  palletStates?: Record<string, PalletStateInfo>;
  palletTimings?: unknown;
  currentIdx: number;
  itemIdx: number;
  copiedKeys: Set<string>;
  allPalletCopied: boolean;
  onPickPallet: (idx: number) => void;
  onPickItem: (palletIdx: number, itemIdx: number) => void;
  onReorder?: (fromIdx: number, toIdx: number) => void;
}

function PalletFlow({
  pallets, palletStates, currentIdx, itemIdx,
  copiedKeys, allPalletCopied,
  onPickPallet, onPickItem, onReorder,
}: PalletFlowProps) {
  /* Drag-and-drop reorder — always live in the compact strip. The
     cards are draggable silently; visual cues only appear DURING a
     drag (source dimmed, target outlined) so the resting state stays
     clean. */
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dndEnabled = !!onReorder;

  if (!pallets?.length) return null;
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    }}>
      {pallets.map((p, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
        const blocked = i > currentIdx && !allPalletCopied;
        const total = p.items?.length || 0;
        let copied = 0;
        for (let j = 0; j < total; j++) {
          if (copiedKeys?.has?.(`${i}|${j}`)) copied += 1;
        }
        const ps = palletStates?.[p.id];
        const isEsku = !!ps?.anyEsku;
        const hasFlag = !!(
          (ps?.overloadFlags && ps.overloadFlags.size > 0)
          || (p.items || []).some((it) => (it.placementMeta?.flags || []).length > 0)
        );
        const isDragSource = dragFromIdx === i;
        const isDragTarget = dragOverIdx === i && dragFromIdx !== null && dragFromIdx !== i;
        return (
          <span
            key={p.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 0,
              borderRadius: 14,
              cursor: dndEnabled ? 'grab' : 'default',
              opacity: isDragSource ? 0.4 : 1,
              boxShadow: isDragTarget
                ? `inset 0 0 0 2px ${T.accent.main}`
                : 'none',
              transition: 'opacity 160ms ease, box-shadow 160ms ease',
            }}
            draggable={dndEnabled}
            onDragStart={dndEnabled ? (e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i));
              setDragFromIdx(i);
            } : undefined}
            onDragOver={dndEnabled ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragFromIdx === null) return;
              if (i !== dragOverIdx) setDragOverIdx(i);
            } : undefined}
            onDrop={dndEnabled ? (e) => {
              e.preventDefault();
              if (dragFromIdx !== null && dragFromIdx !== i) {
                onReorder?.(dragFromIdx, i);
              }
              setDragFromIdx(null);
              setDragOverIdx(null);
            } : undefined}
            onDragEnd={dndEnabled ? () => {
              setDragFromIdx(null);
              setDragOverIdx(null);
            } : undefined}
          >
            <PalletNode
              pallet={p}
              palletIdx={i}
              state={state}
              blocked={blocked}
              total={total}
              copied={copied}
              isEsku={isEsku}
              hasFlag={hasFlag}
              currentItemIdx={state === 'current' ? itemIdx : -1}
              copiedKeys={copiedKeys}
              onPickPallet={() => onPickPallet?.(i)}
              onPickItem={onPickItem}
            />
          </span>
        );
      })}
    </div>
  );
}

/* ZenItemDots — minimal article progress strip shown only in zen
   mode (full Pallet Flow is hidden). One dot per item of the
   CURRENT pallet: green = kopiert, accent = aktiv, outline = todo.
   Click to jump. Centered, low-profile, fades in with zen. */
function ZenItemDots({ items, palletDisplayIdx, currentDisplayItemIdx, copiedKeys, onPick }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      paddingTop: 26,
      opacity: 0.85,
      animation: 'mr-rise 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      {items.map((_, j) => {
        const isCopied = copiedKeys?.has?.(`${palletDisplayIdx}|${j}`);
        const isActive = j === currentDisplayItemIdx;
        const size = isActive ? 16 : 11;
        return (
          <button
            key={j}
            type="button"
            onClick={() => onPick?.(j)}
            title={`Artikel ${j + 1}${isCopied ? ' · ✓ kopiert' : ''}`}
            aria-label={`Artikel ${j + 1}`}
            aria-current={isActive ? 'true' : undefined}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: size,
              height: size,
              borderRadius: '50%',
              background: isActive
                ? T.accent.main
                : (isCopied ? T.status.success.main : 'transparent'),
              border: (!isActive && !isCopied)
                ? `1.75px solid ${T.border.strong}`
                : 'none',
              boxShadow: isActive
                ? `0 0 0 4px ${T.accent.main}20`
                : 'none',
              transition: 'width 200ms ease, height 200ms ease, background 200ms ease, box-shadow 200ms ease',
            }}
          />
        );
      })}
    </div>
  );
}

/* ViewListButton — opens the full-pallet overview overlay. Solid
   accent border + list icon so it reads as a primary action. */
function ViewListButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Alle Paletten und Artikel als Liste anzeigen"
      style={{
        height: 30,
        paddingInline: 12,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: `1.5px solid ${T.accent.main}`,
        background: T.bg.surface,
        borderRadius: 8,
        cursor: 'pointer',
        color: T.accent.main,
        fontFamily: T.font.mono,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        transition: 'background 200ms ease, color 200ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = T.accent.main;
        e.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = T.bg.surface;
        e.currentTarget.style.color = T.accent.main;
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 4h10M3 8h10M3 12h10"/>
        <circle cx="1.5" cy="4" r="0.6" fill="currentColor" stroke="none"/>
        <circle cx="1.5" cy="8" r="0.6" fill="currentColor" stroke="none"/>
        <circle cx="1.5" cy="12" r="0.6" fill="currentColor" stroke="none"/>
      </svg>
      <span>Liste</span>
    </button>
  );
}

function PalletNode({
  pallet, palletIdx, state, blocked, total, copied,
  isEsku, hasFlag, currentItemIdx, copiedKeys,
  onPickPallet, onPickItem,
}) {
  const STATE_STYLES = {
    done:    { bg: T.status.success.bg, border: T.status.success.border,
               text: T.status.success.text, sub: T.status.success.text,
               accent: T.status.success.main },
    current: { bg: T.accent.bg,         border: T.accent.main,
               text: T.accent.text,     sub: T.accent.text,
               accent: T.accent.main },
    todo:    { bg: T.bg.surface,        border: T.border.primary,
               text: T.text.subtle,     sub: T.text.faint,
               accent: T.border.strong },
  };
  /* Positional vs visual state separation:
       - `isCurrent` (positional) — worker is on this pallet right now;
         drives chip strip + larger font.
       - `visualState` — bg/border/text colors + status icon. Switches
         to 'done' (green) the moment all items are copied, even before
         the worker advances; gives instant "ready to next" feedback. */
  const isCurrent  = state === 'current';
  const allCopied  = total > 0 && copied === total;
  const visualState = (state === 'done' || allCopied)
    ? 'done'
    : isCurrent ? 'current' : 'todo';
  const styles    = STATE_STYLES[visualState];
  const showCheck = visualState === 'done';
  const showRing  = visualState === 'todo';
  const shortId   = shortPalletId(pallet);
  const tooltip   = blocked
    ? 'Erst alle Codes der aktuellen Palette kopieren'
    : `Palette ${shortId} · ${isCurrent ? `${copied}/${total} kopiert` : `${total} Artikel`}`;
  const clickable = blocked ? undefined : onPickPallet;

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: isCurrent ? 14 : 8,
        padding: isCurrent ? '10px 16px' : '10px 14px',
        /* Current pallet gets a strong identity — bg tint (accent or
           green if allCopied) hugged in a fully-rounded pill so the
           worker can never confuse it with the neighbours. Others
           stay transparent. */
        background: isCurrent ? styles.bg : 'transparent',
        border: 'none',
        borderRadius: 999,
        opacity: blocked ? 0.45 : (isCurrent ? 1 : 0.55),
        flexShrink: 0,
        boxShadow: 'none',
        transition: 'background 240ms ease, opacity 240ms ease',
      }}
    >
      {/* Header — state-icon (done/todo only) + ID + badges */}
      <div
        onClick={clickable}
        title={tooltip}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: blocked ? 'not-allowed' : 'pointer',
          fontFamily: T.font.mono,
        }}
      >
        {showCheck && (
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            background: styles.accent,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.5l2 2 5-5.5" stroke="#fff" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        )}
        {showRing && (
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            border: `1.5px solid ${styles.accent}`, flexShrink: 0,
          }} />
        )}

        {/* ID — back inside the container, dominant label */}
        <span style={{
          fontSize: isCurrent ? 22 : 19,
          fontWeight: isCurrent ? 700 : visualState === 'done' ? 600 : 500,
          color: styles.text,
          letterSpacing: '-0.01em',
        }}>
          {shortId}
        </span>

        {isEsku && (
          <span
            title="Pallet enthält ESKU-Artikel"
            style={{
              fontSize: 11,
              color: styles.accent,
              opacity: visualState === 'todo' ? 0.6 : 1,
            }}
          >⬢</span>
        )}
        {hasFlag && (
          <span
            title="Pallet hat OVERLOAD oder Platzierungs-Flags"
            aria-hidden
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: T.status.warn.main,
              boxShadow: `0 0 0 2.5px ${T.status.warn.main}26`,
            }}
          />
        )}
      </div>

      {isCurrent && (
        <NumberedChipStrip
          items={pallet.items || []}
          palletIdx={palletIdx}
          currentItemIdx={currentItemIdx}
          copiedKeys={copiedKeys}
          onPick={onPickItem}
        />
      )}
    </div>
  );
}

/* NumberedChipStrip — one chip per item on the current pallet.
   Red bg = code not copied yet, green bg = copied, accent border =
   active item. Each chip is clickable to jump. ESKU items get a
   dashed border. Items with placement flags get a tiny warn dot. */
function NumberedChipStrip({ items, palletIdx, currentItemIdx, copiedKeys, onPick }) {
  if (!items.length) return null;
  /* Bucket consecutive items that share the same `useItem` into the
     same container — one visual unit per repeating SKU. Items without
     a useItem each get their own bucket (no accidental clustering). */
  const groupKey = (it) => (it?.useItem ? `u:${it.useItem}` : null);
  const groups: { key: string | null; from: number; items: typeof items }[] = [];
  items.forEach((item, j) => {
    const k = groupKey(item);
    const last = groups[groups.length - 1];
    if (last && k != null && last.key === k) {
      last.items.push(item);
    } else {
      groups.push({ key: k, from: j, items: [item] });
    }
  });
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'nowrap',
      alignItems: 'center',
      gap: 10,
    }}>
      {groups.map((g) => {
        const isCluster = g.items.length > 1;
        return (
        <div
          key={g.from}
          title={isCluster
            ? `${g.items.length}× gleicher Use-Item`
            : undefined}
          style={{
            display: 'inline-flex',
            flexWrap: 'nowrap',
            gap: 6,
            /* Clusters get a clearly visible capsule — deeper surface
               bg + bolder border — so the operator reads each group
               of same-useItem chips as one unit at a glance. */
            padding: isCluster ? 4 : 0,
            background: isCluster ? T.bg.surface3 : 'transparent',
            border: isCluster ? `1.5px solid ${T.border.strong}` : 'none',
            borderRadius: 999,
          }}
        >
          {g.items.map((item, gi) => {
            const j = g.from + gi;
            const isCopied = copiedKeys?.has?.(`${palletIdx}|${j}`);
            const isActive = j === currentItemIdx;
            const isEsku = item.isEinzelneSku === true;
            const hasFlag = (item.placementMeta?.flags || []).length > 0;
            const lvl = item.level || getDisplayLevel(item) || 1;
            const meta = LEVEL_META[lvl] || LEVEL_META[1];
            return (
              <NumberedChip
                key={j}
                idx={j + 1}
                itemIdx={j}
                isActive={isActive}
                isCopied={isCopied}
                isEsku={isEsku}
                hasFlag={hasFlag}
                levelMeta={meta}
                onPick={onPick}
                title={`Artikel ${j + 1} · L${lvl} ${meta.shortName || meta.name}` +
                       (isEsku ? ' · ⬢ ESKU' : '') +
                       (isCopied ? ' · ✓ kopiert' : ' · noch zu kopieren')}
              />
            );
          })}
        </div>
        );
      })}
    </div>
  );
}

const NumberedChip = memo(function NumberedChip({
  idx, itemIdx, isActive, isCopied, isEsku, hasFlag, levelMeta, onPick, title,
}: {
  idx: number;
  itemIdx: number;
  isActive: boolean;
  isCopied: boolean;
  isEsku: boolean;
  hasFlag: boolean;
  levelMeta: { color: string; bg: string; text: string; [k: string]: unknown };
  onPick?: (itemIdx: number) => void;
  title: string;
}) {
  /* Coloring rules:
       active  → filled accent, white number, bold — the selected chip
       copied  → green tinted (Artikel-Code wurde kopiert)
       todo    → level-color soft (tinted bg + colored border + text)
     ESKU shifts border style to dashed; flags → tiny warn dot.
     Wrapped in React.memo — when the worker advances an item only the
     chips whose isActive/isCopied actually flipped re-render, instead
     of the entire strip rebuilding on every state change. */
  const meta = levelMeta || LEVEL_META[1];
  let color: string, fontWeight: number, bg: string, border: string;
  if (isActive) {
    color = '#fff';
    fontWeight = 700;
    bg = T.accent.main;
    border = T.accent.main;
  } else if (isCopied) {
    color = T.status.success.text;
    fontWeight = 600;
    bg = T.status.success.bg;
    border = T.status.success.border;
  } else {
    color = meta.text;
    fontWeight = 600;
    bg = meta.bg;
    border = meta.color;
  }

  const handleClick = useCallback(() => {
    onPick?.(itemIdx);
  }, [onPick, itemIdx]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      style={{
        position: 'relative',
        minWidth: 28,
        height: 28,
        padding: '0 6px',
        background: bg,
        border: `1.5px ${isEsku ? 'dashed' : 'solid'} ${border}`,
        borderRadius: 999,
        color,
        fontFamily: T.font.mono,
        fontSize: 12.5,
        fontWeight,
        textDecoration: 'none',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.005em',
        cursor: 'pointer',
        transition: 'color 200ms ease, background 200ms ease, border-color 200ms ease, transform 160ms ease',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: isActive
          ? `0 1px 2px rgba(17,24,39,0.06), 0 4px 12px -4px ${T.accent.main}55`
          : 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.transform = 'none';
      }}
    >
      {idx}
      {hasFlag && (
        <span aria-hidden style={{
          position: 'absolute',
          top: -3, right: -3,
          width: 7, height: 7, borderRadius: '50%',
          background: T.status.warn.main,
          border: '1.5px solid #fff',
        }} />
      )}
    </button>
  );
});

/* ════════════════════════════════════════════════════════════════════════
   Wiederholt overlay
   ════════════════════════════════════════════════════════════════════════ */
/* ArticleDetailPanel — expanded info bound to a list row in
   PalletListOverlay. Shows the full title, every code we have, the
   units, and any placement notes. Read-only audit view. */
function ArticleDetailPanel({ item, level, levelMeta }) {
  const codes: Array<[string, string | null | undefined]> = [
    ['Artikel-Code', item.code],
    ['Use-Item',     item.useItem],
    ['FNSKU',        item.fnsku],
    ['SKU',          item.sku],
    ['EAN',          item.ean],
    ['ASIN',         item.asin],
  ];
  const visibleCodes = codes.filter(([, v]) => v);
  const lstLabel = item.lst || null;
  const flags    = (item.placementMeta?.flags || item.placementFlags || []) as unknown[];
  return (
    <div style={{
      padding: '12px 16px 16px 32px',
      background: T.bg.surface2,
      borderTop: `1px dashed ${T.border.subtle}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Full title */}
      <div>
        <div style={{
          fontFamily: T.font.mono,
          fontSize: 10,
          fontWeight: 600,
          color: T.text.faint,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          Titel
        </div>
        <div style={{
          fontSize: 13.5,
          color: T.text.primary,
          lineHeight: 1.45,
          letterSpacing: '-0.005em',
          wordBreak: 'break-word',
        }}>
          {item.title || '—'}
        </div>
      </div>

      {/* Codes — key/value grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '8px 18px',
      }}>
        {visibleCodes.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: T.font.mono,
              fontSize: 10,
              fontWeight: 600,
              color: T.text.faint,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}>
              {k}
            </div>
            <div style={{
              fontFamily: T.font.mono,
              fontSize: 13,
              fontWeight: 500,
              color: T.text.primary,
              wordBreak: 'break-all',
            }}>
              {String(v)}
            </div>
          </div>
        ))}
      </div>

      {/* Meta row — level + units + LST + flags */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 10px',
        alignItems: 'center',
      }}>
        <span style={{
          fontFamily: T.font.mono,
          fontSize: 10.5,
          fontWeight: 600,
          padding: '2px 7px',
          background: levelMeta.bg,
          color: levelMeta.text,
          border: `1px solid ${levelMeta.color}40`,
          borderRadius: 999,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          L{level} {levelMeta.name}
        </span>
        {item.units != null && (
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            background: T.bg.surface,
            color: T.text.primary,
            border: `1px solid ${T.border.primary}`,
            borderRadius: 999,
          }}>
            × {item.units} Stück
          </span>
        )}
        {item.isEinzelneSku && (
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            background: T.accent.bg,
            color: T.accent.text,
            border: `1px solid ${T.accent.main}40`,
            borderRadius: 999,
          }}>
            ⬢ ESKU
          </span>
        )}
        {lstLabel && (
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            background: T.bg.surface,
            color: T.text.subtle,
            border: `1px solid ${T.border.primary}`,
            borderRadius: 999,
          }}>
            {lstLabel}
          </span>
        )}
        {flags.length > 0 && flags.map((f, k) => (
          <span key={k} style={{
            fontFamily: T.font.mono,
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            background: T.status.warn.bg,
            color: T.status.warn.text,
            border: `1px solid ${T.status.warn.main}40`,
            borderRadius: 999,
          }}>
            {String(f)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* PalletListOverlay — full-screen modal listing every pallet and its
   articles. Worker uses it as an audit/overview and as a sandbox to
   rearrange article order: each row is draggable inside its pallet
   section, drops re-emit through onReorderArticles. Current article
   gets an accent rail + tint so the worker keeps orientation. */
function PalletListOverlay({
  pallets, rawPallets,
  currentRawIdx, currentRawItemIdx,
  copiedKeys,
  articleOrderOverride,
  onReorderArticles,
  onClose,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const currentPalletId = rawPallets[currentRawIdx]?.id;

  /* DnD scoped to (palletId, displayIdx). We only allow reordering
     within a single pallet — cross-pallet drops fall back to no-op. */
  const [dragInfo, setDragInfo]       = useState<{ palletId: string; from: number } | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ palletId: string; idx: number } | null>(null);

  /* Row-expand state — clicking a row toggles a detail panel that
     shows every code, units, and placement notes for the article. */
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const toggleExpanded = (key: string) =>
    setExpandedKey((prev) => (prev === key ? null : key));
  const onItemDragStart = (palletId, from) => (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${palletId}|${from}`);
    setDragInfo({ palletId, from });
  };
  const onItemDragOver = (palletId, idx) => (e) => {
    if (!dragInfo || dragInfo.palletId !== palletId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOverInfo || dragOverInfo.palletId !== palletId || dragOverInfo.idx !== idx) {
      setDragOverInfo({ palletId, idx });
    }
  };
  const onItemDrop = (palletId, idx) => (e) => {
    e.preventDefault();
    if (dragInfo && dragInfo.palletId === palletId && dragInfo.from !== idx) {
      onReorderArticles?.(palletId, dragInfo.from, idx);
    }
    setDragInfo(null);
    setDragOverInfo(null);
  };
  const onItemDragEnd = () => {
    setDragInfo(null);
    setDragOverInfo(null);
  };
  return (
    <div onClick={onClose} style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(17, 24, 39, 0.42)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '6vh 24px 32px',
      cursor: 'pointer',
      backdropFilter: 'blur(2px)',
      animation: 'wiederholt-bg-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 920,
          width: '100%',
          maxHeight: '88vh',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 18,
          boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 24px 56px -20px rgba(17,24,39,0.20)',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'default',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '18px 24px 14px',
          borderBottom: `1px solid ${T.border.primary}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h2 style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: T.text.primary,
              letterSpacing: '-0.01em',
            }}>
              Alle Paletten · Liste
            </h2>
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 11,
              fontWeight: 600,
              color: T.text.faint,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}>
              {pallets.length} Paletten
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Schließen"
            aria-label="Schließen"
            style={{
              all: 'unset',
              width: 30, height: 30,
              display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${T.border.primary}`,
              borderRadius: 8,
              cursor: 'pointer',
              color: T.text.subtle,
              transition: 'border-color 200ms ease, color 200ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = T.accent.main;
              e.currentTarget.style.color = T.accent.main;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = T.border.primary;
              e.currentTarget.style.color = T.text.subtle;
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 24px 22px',
          WebkitOverflowScrolling: 'touch',
        }}>
          {pallets.map((p) => {
            const origIdx = rawPallets.findIndex((rp) => rp.id === p.id);
            const items = p.items || [];
            const total = items.length;
            let copied = 0;
            for (let j = 0; j < total; j++) {
              if (copiedKeys?.has?.(`${origIdx}|${j}`)) copied += 1;
            }
            const isCurrent = p.id === currentPalletId;
            const allCopied = total > 0 && copied === total;
            return (
              <section key={p.id} style={{ marginTop: 14 }}>
                {/* Pallet header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${T.border.subtle}`,
                }}>
                  <span style={{
                    fontFamily: T.font.mono,
                    fontSize: 17,
                    fontWeight: 700,
                    color: isCurrent ? T.accent.main : T.text.primary,
                    letterSpacing: '-0.01em',
                  }}>
                    {shortPalletId(p)}
                  </span>
                  <span style={{
                    fontFamily: T.font.mono,
                    fontSize: 11,
                    fontWeight: 500,
                    color: T.text.faint,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {copied} / {total} kopiert
                  </span>
                  {isCurrent && (
                    <span style={{
                      fontFamily: T.font.mono,
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.accent.main,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}>
                      Aktuell
                    </span>
                  )}
                  {allCopied && !isCurrent && (
                    <span style={{
                      fontFamily: T.font.mono,
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.status.success.text,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}>
                      ✓ Fertig
                    </span>
                  )}
                </div>

                {/* Items list — drag rows to reorder within this pallet */}
                <ul style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  {items.map((it, j) => {
                    const articleOrder = articleOrderOverride[p.id];
                    const origItemIdx  = articleOrder ? articleOrder[j] : j;
                    const isCopiedItem = copiedKeys?.has?.(`${origIdx}|${origItemIdx}`);
                    const isActiveItem = isCurrent && origItemIdx === currentRawItemIdx;
                    const lvl = it.level || getDisplayLevel(it) || 1;
                    const meta = LEVEL_META[lvl] || LEVEL_META[1];
                    const units = it.units;
                    const rowKey = `${p.id}|${origItemIdx}`;
                    const isExpanded = expandedKey === rowKey;
                    const isDragSrc = !!dragInfo && dragInfo.palletId === p.id && dragInfo.from === j;
                    const isDragTgt = !!dragInfo && !!dragOverInfo
                                      && dragOverInfo.palletId === p.id && dragOverInfo.idx === j
                                      && dragInfo.palletId === p.id && dragInfo.from !== j;
                    return (
                      <li
                        key={`${origItemIdx}-${it.code || it.fnsku || j}`}
                        style={{
                          listStyle: 'none',
                          borderBottom: `1px dashed ${T.border.subtle}`,
                          background: isActiveItem ? T.accent.bg : 'transparent',
                          borderLeft: isActiveItem
                            ? `3px solid ${T.accent.main}`
                            : '3px solid transparent',
                          transition: 'background 160ms ease',
                        }}
                      >
                        {/* Row — draggable + clickable to expand */}
                        <div
                          draggable
                          onClick={() => toggleExpanded(rowKey)}
                          onDragStart={onItemDragStart(p.id, j)}
                          onDragOver={onItemDragOver(p.id, j)}
                          onDrop={onItemDrop(p.id, j)}
                          onDragEnd={onItemDragEnd}
                          style={{
                            position: 'relative',
                            display: 'grid',
                            gridTemplateColumns: '18px 30px 64px minmax(80px, auto) 1fr minmax(120px, auto) 22px',
                            alignItems: 'center',
                            gap: 12,
                            padding: '8px 8px 8px 7px',
                            opacity: isDragSrc ? 0.4 : (isCopiedItem && !isActiveItem ? 0.75 : 1),
                            boxShadow: isDragTgt ? `inset 0 2px 0 ${T.accent.main}` : 'none',
                            cursor: 'grab',
                            transition: 'opacity 160ms ease, box-shadow 160ms ease',
                          }}
                        >
                          {/* Drag handle */}
                          <span aria-hidden style={{
                            display: 'inline-grid',
                            gridTemplateColumns: 'repeat(2, 3px)',
                            gridAutoRows: '3px',
                            gap: 2,
                            color: T.text.faint,
                            justifySelf: 'center',
                          }}>
                            {Array.from({ length: 6 }).map((_, k) => (
                              <span key={k} style={{
                                width: 3, height: 3, borderRadius: '50%',
                                background: 'currentColor',
                              }} />
                            ))}
                          </span>

                          {/* Position number */}
                          <span style={{
                            fontFamily: T.font.mono,
                            fontSize: 11,
                            color: isActiveItem ? T.accent.main : T.text.faint,
                            fontWeight: isActiveItem ? 700 : 500,
                            fontVariantNumeric: 'tabular-nums',
                            textAlign: 'right',
                          }}>
                            {String(j + 1).padStart(2, '0')}
                          </span>

                          {/* Units / Menge */}
                          <span
                            title={units != null ? `${units} Stück` : 'Menge nicht erkannt'}
                            style={{
                              fontFamily: T.font.mono,
                              fontSize: 12,
                              fontWeight: 600,
                              color: units != null ? T.text.primary : T.text.faint,
                              fontVariantNumeric: 'tabular-nums',
                              textAlign: 'right',
                            }}
                          >
                            {units != null ? `× ${units}` : '—'}
                          </span>

                          {/* Level pill */}
                          <span style={{
                            fontFamily: T.font.mono,
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: '2px 7px',
                            background: meta.bg,
                            color: meta.text,
                            border: `1px solid ${meta.color}40`,
                            borderRadius: 999,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            justifySelf: 'start',
                            whiteSpace: 'nowrap',
                          }}>
                            L{lvl} {meta.shortName || meta.name}
                          </span>

                          {/* Title — single line by default; full text
                             appears in the expanded panel + via tooltip. */}
                          <span style={{
                            fontSize: 13,
                            fontWeight: isActiveItem ? 600 : 400,
                            color: T.text.primary,
                            letterSpacing: '-0.005em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }} title={it.title || ''}>
                            {formatItemTitle(it.title || '—')}
                          </span>

                          {/* Code */}
                          <span style={{
                            fontFamily: T.font.mono,
                            fontSize: 12,
                            color: T.text.subtle,
                            textAlign: 'right',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }} title={it.code || it.useItem || it.fnsku || ''}>
                            {it.code || it.useItem || it.fnsku || '—'}
                          </span>

                          {/* Status indicator (✓ if copied) OR chevron
                             when expanded. Status wins — copy state is
                             primary signal. */}
                          <span aria-hidden style={{
                            width: 18, height: 18, borderRadius: '50%',
                            border: isCopiedItem ? 'none' : `1.5px solid ${T.border.strong}`,
                            background: isCopiedItem ? T.status.success.main : 'transparent',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            justifySelf: 'center',
                            color: isCopiedItem ? '#fff' : T.text.faint,
                            transform: isExpanded ? 'rotate(180deg)' : 'none',
                            transition: 'transform 200ms ease',
                          }}>
                            {isCopiedItem ? (
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6.5l2 2 5-5.5" stroke="currentColor" strokeWidth="2"
                                      strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            ) : (
                              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6"
                                      strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                        </div>

                        {/* Detail panel — opens on row click */}
                        {isExpanded && (
                          <ArticleDetailPanel
                            item={it}
                            level={lvl}
                            levelMeta={meta}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WiederholtOverlay({ hit, onDismiss }) {
  if (!hit) return null;
  return (
    <div onClick={onDismiss} style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(17, 24, 39, 0.32)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      cursor: 'pointer',
      animation: 'wiederholt-bg-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 560,
          width: '100%',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 18,
          boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 24px 56px -20px rgba(17,24,39,0.20)',
          padding: '28px 32px 24px',
          cursor: 'default',
          animation: 'wiederholt-card-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <Badge tone="warn">Wiederholung erkannt</Badge>

        <h2 style={{
          marginTop: 14, marginBottom: 4,
          fontSize: 20, fontWeight: 500, color: T.text.primary,
          letterSpacing: '-0.02em',
        }}>
          Dieser Artikel kommt erneut vor
        </h2>
        <p style={{
          margin: 0,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: T.text.subtle,
          fontFamily: T.font.mono,
          letterSpacing: '0.02em',
        }}>
          auf Palette {shortPalletId(hit.palletId)}
        </p>

        {/* Hero — code (mono, large) + units (numeric, accent) so the
            worker spots both at a glance without parsing prose. */}
        <div style={{
          marginTop: 22,
          padding: '20px 22px',
          background: T.bg.surface2,
          border: `1px solid ${T.border.subtle}`,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 18,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{
              fontSize: 10.5,
              fontWeight: 600,
              fontFamily: T.font.mono,
              color: T.text.faint,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
            }}>
              Artikel-Code
            </span>
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 'clamp(24px, 3vw, 32px)',
              fontWeight: 500,
              color: T.text.primary,
              letterSpacing: '-0.022em',
              lineHeight: 1,
              wordBreak: 'break-all',
            }}>
              {hit.code}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <span style={{
              fontSize: 10.5,
              fontWeight: 600,
              fontFamily: T.font.mono,
              color: T.text.faint,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
            }}>
              Menge
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 6,
              fontFamily: T.font.mono,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}>
              <span style={{
                fontSize: 'clamp(28px, 3.6vw, 40px)',
                fontWeight: 600,
                color: T.status.warn.main,
                letterSpacing: '-0.025em',
              }}>
                {hit.units}
              </span>
              <span style={{
                fontSize: 13,
                fontWeight: 500,
                color: T.text.subtle,
                textTransform: 'uppercase',
                letterSpacing: '0.10em',
              }}>
                Stück
              </span>
            </span>
          </div>
        </div>

        <div style={{
          marginTop: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
        }}>
          <span style={{ fontSize: 11.5, color: T.text.subtle,
                         fontFamily: T.font.mono, letterSpacing: '0.04em' }}>
            <Kbd>Esc</Kbd> zum Schließen
          </span>
          <Button variant="primary" size="sm" onClick={onDismiss}>Verstanden</Button>
        </div>
      </div>

      <style>{`
        @keyframes wiederholt-bg-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes wiederholt-card-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Atoms
   ════════════════════════════════════════════════════════════════════════ */
function ShellToggle({ on, onToggle }) {
  /* onMouseDown preventDefault avoids focus-steal: without it, clicking
     the toggle puts focus on the button, and the next Space press would
     re-fire the click instead of running handleFertig. The keyboard
     handler in Focus.jsx already preventDefaults Space at the document
     level, but a focused button can synthesise a click on keyup which
     bypasses that guard. Keeping focus on document = hotkeys keep
     working as the worker expects. */
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { onToggle(); e.currentTarget.blur(); }}
      title={on
        ? 'Shell-Modus an — Animationen verkürzt'
        : 'Shell-Modus aus — vollständige Übergänge'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 22,
        padding: '0 10px',
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: on ? T.accent.text : T.text.subtle,
        background: on ? T.accent.bg : 'transparent',
        border: `1px solid ${on ? T.accent.border : T.border.primary}`,
        borderRadius: 999,
        cursor: 'pointer',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: on ? T.accent.main : T.text.faint,
      }} />
      Shell
    </button>
  );
}

function Kbd({ children, onPrimary }: { children?: React.ReactNode; onPrimary?: boolean }) {
  return (
    <kbd style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18, height: 16,
      padding: '0 5px',
      fontSize: 10, fontFamily: T.font.mono, fontWeight: 600,
      color: onPrimary ? '#fff' : T.text.subtle,
      background: onPrimary ? 'var(--bg-glass-on-accent)' : T.bg.surface,
      border: `1px solid ${onPrimary ? 'var(--bg-glass-on-accent-border)' : T.border.primary}`,
      borderRadius: 3,
      lineHeight: 1,
      letterSpacing: '0.04em',
    }}>{children}</kbd>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Hooks
   ════════════════════════════════════════════════════════════════════════ */
function useReducedMotion() {
  const [v, setV] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setV(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener?.(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener?.(onChange);
    };
  }, []);
  return v;
}

/* ── Clipboard helpers ── */
function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    /* ignore */
  }
}