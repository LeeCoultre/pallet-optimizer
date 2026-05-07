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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../state.jsx';
import {
  focusItemView, sortItemsForPallet, distributeEinzelneSku,
  enrichItemDims, getDisplayLevel, LEVEL_META,
} from '../utils/auftragHelpers.js';
import { lookupSkuDimensions } from '../marathonApi.js';
import { detectWiederholt } from '../utils/wiederholtLogic.js';
import { Page, Topbar, Button, Badge, T } from '../components/ui.jsx';
import PalletInterlude, { resetSkipCount } from '../components/PalletInterlude.jsx';
import AuftragFinaleStage from '../components/AuftragFinaleStage.jsx';

const SCHNELL_KEY = 'marathon.focus.schnellmodus';

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
  const [wiederholt, setWiederholt] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [flashUse,   setFlashUse]   = useState(null);
  const [interlude,  setInterlude]  = useState(null);
  const [finale,     setFinale]     = useState(false);
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

  /* copiedKeys derived from server-persisted current.copiedKeys. */
  const copiedKeys = useMemo(
    () => new Set(Object.keys(current?.copiedKeys || {})),
    [current?.copiedKeys],
  );

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
    const out = [];
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

  const onCopyArtikelCode = useCallback(() => {
    if (!item?.code) return;
    copyToClipboard(item.code);
    setCopiedCode(item.code);
    markCodeCopied(palletIdx, itemIdx);
  }, [item, palletIdx, itemIdx, markCodeCopied]);

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

  /* Reset transient flash markers on every item change. */
  useEffect(() => {
    setCopiedCode(null);
    setFlashUse(null);
  }, [palletIdx, itemIdx]);

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

  /* Keyboard handler. */
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
  }, [wiederholt, interlude, finale, handleFertig, goNextItem, goPrevItem,
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
            <Button variant="ghost" size="sm" onClick={onExit}
                    title="Focus-Modus verlassen">
              Verlassen
            </Button>
          </span>
        }
      />

      {/* main fills the gap between Topbar (60) and StickyBar (~96). The
          single hero card is centred vertically — the page itself never
          scrolls. min-height 0 lets flex children shrink past content. */}
      <main style={{
        minHeight: 'calc(100vh - 60px - 96px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 32px',
        overflow: 'hidden',
      }}>
        <ArticleHeroCard
          item={item}
          palletId={pallet.id}
          itemIdx={itemIdx}
          itemCount={pallet.items.length}
          copiedCode={copiedCode}
          flashUse={flashUse}
          onCopyCode={onCopyArtikelCode}
          onCopyUse={onCopyUseItem}
        />
      </main>

      <FocusStickyBar
        pallets={rawPallets}
        palletStates={palletStates}
        palletTimings={current?.palletTimings}
        palletIdx={palletIdx}
        itemIdx={itemIdx}
        copiedKeys={copiedKeys}
        allPalletCopied={allPalletCopied}
        blockMessage={blockMessage}
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
        onPickItem={(i) => setCurrentItemIdx(i)}
        onPickPallet={(i) => {
          if (i === palletIdx) return;
          if (i > palletIdx && !allPalletCopied) { alert(blockMessage()); return; }
          if (i > palletIdx) setInterlude(buildInterludePayload(palletIdx));
          setCurrentPalletIdx(i);
        }}
      />

      <WiederholtOverlay
        hit={wiederholt}
        onDismiss={() => setWiederholt(null)}
      />

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
}) {
  const cat = item.levelMeta || LEVEL_META[1];
  const haloColor = cat.color || T.accent.main;
  const noVal = item.placementFlags?.includes?.('NO_VALID_PLACEMENT');

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 1080,
      padding: '24px 28px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 18,
      boxShadow: '0 1px 3px rgba(17,24,39,0.03), 0 16px 40px -22px rgba(17,24,39,0.08)',
      overflow: 'hidden',
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
        {/* Top mini-row — position eyebrow on left, badges on right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}>
          <PositionEyebrow palletId={palletId} itemIdx={itemIdx} itemCount={itemCount} />
          <span style={{ flex: 1 }} />
          <LevelChip level={item.level} cat={cat} />
          {item.isEsku && <Badge tone="accent">ESKU</Badge>}
          {item.lst && (
            <Badge tone={item.lst === 'mit LST' ? 'accent' : 'neutral'}>{item.lst}</Badge>
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
          <ArticleColumn item={item} />
          <span style={{ background: T.border.primary, alignSelf: 'stretch' }} />
          <CodesColumn
            item={item}
            copiedCode={copiedCode}
            flashUse={flashUse}
            onCopyCode={onCopyCode}
            onCopyUse={onCopyUse}
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
function ArticleColumn({ item }) {
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
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          fontFamily: T.font.mono,
          fontSize: 'clamp(20px, 2.4vw, 28px)',
          fontWeight: 600,
          color: T.accent.main,
          letterSpacing: '-0.018em',
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>{perCarton.value} {perCarton.unit}</span>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 'clamp(11px, 1vw, 13px)',
            fontWeight: 600,
            color: T.text.subtle,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}>
            / Karton
          </span>
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
function CodesColumn({ item, copiedCode, flashUse, onCopyCode, onCopyUse }) {
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

function CodeRow({ label, kbd, value, copied, onCopy, size, accent }) {
  const isDominant = size === 'dominant';
  const valueFont = isDominant
    ? 'clamp(30px, 3.6vw, 46px)'
    : 'clamp(15px, 1.4vw, 18px)';
  const valueWeight = isDominant ? 600 : 500;

  return (
    <button
      type="button"
      onClick={onCopy}
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
  pallets, palletStates, palletTimings, palletIdx, itemIdx,
  copiedKeys, allPalletCopied,
  overallPct, overallPos, totalArticles, missingCopies,
  canPrev, canNext,
  onPrev, onNext, onFertig,
  onPickItem, onPickPallet,
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
      background: 'rgba(255, 255, 255, 0.94)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderTop: `1px solid ${T.border.primary}`,
      marginLeft: 'var(--sidebar-width)',
    }}>
      {/* 2px overall progress hairline */}
      <div style={{ height: 2, background: 'rgba(15,23,42,0.04)' }}>
        <div style={{
          height: '100%',
          width: `${Math.max(0, Math.min(1, overallPct)) * 100}%`,
          background: T.accent.main,
          transition: 'width 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>

      {/* Pallet flow strip — full timeline of pallets, each rendered
          as a multi-layer pill (status · ID · counter · level fingerprint)
          with stepper connectors between them. The current pallet's
          item chips live next to it inside the flow itself. */}
      <div style={{
        padding: '10px 32px',
        borderBottom: `1px solid ${T.border.subtle}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        maxWidth: 1180,
        margin: '0 auto',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        <PalletFlow
          pallets={pallets}
          palletStates={palletStates}
          palletTimings={palletTimings}
          currentIdx={palletIdx}
          itemIdx={itemIdx}
          copiedKeys={copiedKeys}
          allPalletCopied={allPalletCopied}
          onPickPallet={onPickPallet}
          onPickItem={onPickItem}
        />
      </div>

      {/* Action row */}
      <div style={{
        padding: '10px 32px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        maxWidth: 1080,
        margin: '0 auto',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: dotColor,
            boxShadow: `0 0 0 3px ${dotColor}22`,
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

        <span style={{ flex: 1 }} />

        <span style={{
          fontSize: 11.5,
          color: T.text.faint,
          fontFamily: T.font.mono,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {overallPos} / {totalArticles}
        </span>

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
function PalletFlow({
  pallets, palletStates, currentIdx, itemIdx,
  copiedKeys, allPalletCopied,
  onPickPallet, onPickItem,
}) {
  if (!pallets?.length) return null;
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0,
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
        return (
          <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            {i > 0 && <PalletConnector done={i <= currentIdx} />}
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

function PalletConnector({ done }) {
  return (
    <span aria-hidden style={{
      display: 'inline-block',
      width: 18, height: 1,
      background: done ? T.status.success.main : T.border.primary,
      flexShrink: 0,
      transition: 'background 320ms cubic-bezier(0.16, 1, 0.3, 1)',
    }} />
  );
}

function PalletNode({
  pallet, palletIdx, state, blocked, total, copied,
  isEsku, hasFlag, currentItemIdx, copiedKeys,
  onPickPallet, onPickItem,
}) {
  const styles = {
    done:    { bg: T.status.success.bg, border: T.status.success.border,
               text: T.status.success.text, sub: T.status.success.text },
    current: { bg: T.accent.bg,         border: T.accent.main,
               text: T.accent.text,     sub: T.accent.text },
    todo:    { bg: T.bg.surface2,       border: T.border.primary,
               text: T.text.faint,      sub: T.text.faint },
  }[state];
  const isCurrent = state === 'current';
  const counter = isCurrent ? `${copied}/${total}` : `${total}`;

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: isCurrent ? 7 : 0,
        padding: isCurrent ? '7px 10px 8px' : '5px 10px',
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: 10,
        opacity: blocked ? 0.55 : 1,
        flexShrink: 0,
        transition: 'background 240ms ease, border-color 240ms ease',
      }}
    >
      {/* Header row */}
      <div
        onClick={blocked ? undefined : onPickPallet}
        title={blocked
          ? 'Erst alle Codes der aktuellen Palette kopieren'
          : `Palette ${pallet.id} · ${isCurrent ? `${copied}/${total} kopiert` : `${total} Artikel`}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: blocked ? 'not-allowed' : 'pointer',
          fontFamily: T.font.mono,
          fontSize: 10.5,
          fontWeight: isCurrent ? 600 : 500,
          color: styles.text,
          letterSpacing: '-0.005em',
        }}
      >
        {state === 'done' && (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.5l2 2 5-5.5" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {state === 'current' && (
          <span className="mr-pulse" style={{
            width: 5, height: 5, borderRadius: '50%', background: T.accent.main,
          }} />
        )}
        {state === 'todo' && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            border: `1px solid ${T.border.strong}`,
          }} />
        )}
        <span>{pallet.id}</span>
        <span style={{
          color: styles.sub,
          opacity: 0.7,
          fontSize: 10,
          fontWeight: 500,
          marginLeft: 2,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {counter}
        </span>
        {isEsku && (
          <span
            title="Pallet enthält ESKU-Artikel"
            style={{
              fontSize: 9,
              color: T.accent.main,
              opacity: state === 'todo' ? 0.55 : 1,
              marginLeft: 2,
            }}
          >⬢</span>
        )}
        {hasFlag && (
          <span
            title="Pallet hat OVERLOAD oder Platzierungs-Flags"
            style={{
              width: 5, height: 5, borderRadius: '50%',
              background: T.status.warn.main,
              boxShadow: `0 0 0 2px ${T.status.warn.main}26`,
              marginLeft: 2,
            }}
          />
        )}
      </div>

      {/* Body — numbered chip strip ONLY on the current pallet so each
          item is individually visible, addressable, and click-jumpable.
          Done/todo pallets stay compact (header-only) — the count is
          enough context for non-active pallets. */}
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
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'nowrap',
      gap: 4,
      maxWidth: '100%',
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',
      paddingBottom: 1,
    }}>
      {items.map((item, j) => {
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
            isActive={isActive}
            isCopied={isCopied}
            isEsku={isEsku}
            hasFlag={hasFlag}
            onClick={() => onPick?.(j)}
            title={`Artikel ${j + 1} · L${lvl} ${meta.shortName || meta.name}` +
                   (isEsku ? ' · ⬢ ESKU' : '') +
                   (isCopied ? ' · ✓ kopiert' : ' · noch zu kopieren')}
          />
        );
      })}
    </div>
  );
}

function NumberedChip({ idx, isActive, isCopied, isEsku, hasFlag, onClick, title }) {
  /* Minimalist semantics — pure typography, no harsh fills:
       todo    = medium gray number, transparent bg
       copied  = faded number with strikethrough (done, no longer relevant)
       active  = accent text + accent border + slight bg (current focus)
     ESKU shifts the border style to dashed (only visible when active or
     hovered, since border is transparent otherwise). Flag → tiny corner dot. */
  let color, fontWeight, decoration, bg, border;
  if (isActive) {
    color = T.accent.text;
    fontWeight = 700;
    decoration = 'none';
    bg = T.accent.bg;
    border = T.accent.main;
  } else if (isCopied) {
    color = T.text.faint;
    fontWeight = 400;
    decoration = 'line-through';
    bg = 'transparent';
    border = 'transparent';
  } else {
    color = T.text.subtle;
    fontWeight = 500;
    decoration = 'none';
    bg = 'transparent';
    border = 'transparent';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        position: 'relative',
        minWidth: 22,
        height: 20,
        padding: '0 5px',
        background: bg,
        border: `1px ${isEsku ? 'dashed' : 'solid'} ${border}`,
        borderRadius: 4,
        color,
        fontFamily: T.font.mono,
        fontSize: 11,
        fontWeight,
        textDecoration: decoration,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.005em',
        cursor: 'pointer',
        transition: 'color 200ms ease, background 200ms ease, border-color 200ms ease',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = T.bg.surface3;
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {idx}
      {hasFlag && (
        <span aria-hidden style={{
          position: 'absolute',
          top: -2, right: -2,
          width: 5, height: 5, borderRadius: '50%',
          background: T.status.warn.main,
        }} />
      )}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Wiederholt overlay
   ════════════════════════════════════════════════════════════════════════ */
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
          maxWidth: 480,
          width: '100%',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 16,
          boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 24px 56px -20px rgba(17,24,39,0.20)',
          padding: '24px 28px',
          cursor: 'default',
          animation: 'wiederholt-card-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <Badge tone="warn">Wiederholung erkannt</Badge>

        <h2 style={{
          marginTop: 12, marginBottom: 6,
          fontSize: 18, fontWeight: 500, color: T.text.primary,
          letterSpacing: '-0.018em',
        }}>
          Dieser Artikel kommt erneut vor
        </h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: T.text.muted }}>
          Auf Palette {hit.palletId} taucht <strong style={{ fontFamily: T.font.mono, color: T.text.primary, fontWeight: 500 }}>{hit.code}</strong> mit{' '}
          <strong style={{ color: T.status.warn.main, fontWeight: 600 }}>{hit.units}</strong> Stück auf.
        </p>

        <div style={{
          marginTop: 18,
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

function Kbd({ children, onPrimary }) {
  return (
    <kbd style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18, height: 16,
      padding: '0 5px',
      fontSize: 10, fontFamily: T.font.mono, fontWeight: 600,
      color: onPrimary ? '#fff' : T.text.subtle,
      background: onPrimary ? 'rgba(255,255,255,0.18)' : T.bg.surface,
      border: `1px solid ${onPrimary ? 'rgba(255,255,255,0.30)' : T.border.primary}`,
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
