/* Pruefen — Schritt 02. "Priority-driven hierarchy" redesign.

   Operator priorities, in order:
     1. FBA-Code  — primary anchor of the page
     2. Preflight — only if there are flags (auto-expanded)
     3. Paletten  — main content (story-cards or mini-grid)

   Supporting metrics (Übersicht, Auslastung, Levels) are demoted to
   a single compact monoline + a collapsible Levels disclosure. They
   never compete with FBA / Preflight / Paletten for attention.

   Visual decisions:
     • FBA mono 64-80px is the page's hero — nothing visually competes
       with it on the same row except a small status pill.
     • Status + duration + auto-insights live as one mono caption line
       under FBA.
     • Fingerprint row (12 colored squares) gives the operator a
       one-glance understanding of "shape" of this Auftrag.
     • Pallets section gets a STICKY toolbar at scroll — filter/toggle
       always one click away, even mid-list.
     • Page background is a subtle dot-grid for "blueprint" feel.
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppState } from '@/state.jsx';
import {
  pruefenView, distributeEinzelneSku, applyEskuOverrides, eskuOverrideKey,
  enrichItemDims,
  levelDistribution, sortItemsForPallet, LEVEL_META,
  itemTotalWeightKg,
} from '@/utils/auftragHelpers.js';
import { lookupSkuDimensions } from '@/marathonApi.js';
import {
  Page, Topbar, StepperBar, StudioFrame, Button, T,
} from '@/components/ui.jsx';
import PreflightCard from '@/components/PreflightCard.jsx';
import PalletStoryCard from '@/components/PalletStoryCard.jsx';
import PalletMiniCard from '@/components/PalletMiniCard.jsx';
import { analyzeAuftrag } from '@/utils/preflightAnalyzer.js';
import { buildPalletStory, rankPallets } from '@/utils/palletStory.js';

const AUTO_OVERVIEW_THRESHOLD = 15;

/* ════════════════════════════════════════════════════════════════════════ */
export default function PruefenScreen() {
  const { current, goToStep, cancelCurrent, moveEskuToPallet } = useAppState();
  const rawPallets = current?.parsed?.pallets || [];
  const eskuItems  = current?.parsed?.einzelneSkuItems || [];
  const eskuOverrides = current?.eskuOverrides || {};

  /* ── data: enrichment + distribution ─────────────────────────── */
  const allItems = useMemo(() => [
    ...rawPallets.flatMap((p) => p.items || []),
    ...eskuItems,
  ], [rawPallets, eskuItems]);

  const dimsQ = useQuery({
    queryKey: ['sku-dims', current?.id],
    queryFn: () => enrichItemDims(allItems, lookupSkuDimensions),
    enabled: !!current?.id && allItems.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const enrichedPallets = useMemo(() => {
    const enriched = dimsQ.data || null;
    let cursor = 0;
    const base = rawPallets.map((p) => ({
      ...p,
      items: (p.items || []).map((origIt) => {
        const fromDims = enriched ? enriched[cursor] : null;
        cursor += 1;
        return fromDims || origIt;
      }),
    }));
    return base.map((p) => ({ ...p, items: sortItemsForPallet(p.items || []) }));
  }, [rawPallets, dimsQ.data]);

  const enrichedEsku = useMemo(() => {
    if (!dimsQ.data) return eskuItems;
    const palletItemsCount = rawPallets.reduce((n, p) => n + (p.items?.length || 0), 0);
    return eskuItems.map((it, i) => dimsQ.data[palletItemsCount + i] || it);
  }, [eskuItems, rawPallets, dimsQ.data]);

  const view = useMemo(
    () => pruefenView({ ...current?.parsed, pallets: enrichedPallets }),
    [current?.parsed, enrichedPallets],
  );
  const distribution = useMemo(
    () => {
      const auto = distributeEinzelneSku(enrichedPallets, enrichedEsku);
      return applyEskuOverrides(auto, eskuOverrides, enrichedPallets);
    },
    [enrichedPallets, enrichedEsku, eskuOverrides],
  );
  const eskuDist = distribution.byPalletId;
  const palletStates = distribution.palletStates;

  const validation = current?.validation || { ok: true, errorCount: 0, warningCount: 0, issues: [] };
  const validView = {
    ok: validation.ok ?? (validation.errorCount === 0),
    errors: validation.errorCount || 0,
    warnings: validation.warningCount || 0,
  };

  /* ── Parser warnings aggregation ───────────────────────────────────
     Each parsed item may carry `parseWarnings[]` set by the strict
     classifiers in parseLagerauftrag.ts. We surface them here so the
     worker reviews them BEFORE entering Focus. High-severity ones
     block Focus until acknowledged; low/medium are informational. */
  const parseWarnings = useMemo(() => {
    const out: Array<{
      key: string;
      palletId: string;
      itemIdx: number;
      item: any;
      warnings: any[];
      maxSeverity: 'low' | 'medium' | 'high';
    }> = [];
    const addItems = (items: any[], palletId: string) => {
      items.forEach((it, idx) => {
        const ws = (it?.parseWarnings || []) as any[];
        if (!ws.length) return;
        const sev = ws.reduce((m: 'low' | 'medium' | 'high', w: any) =>
          w.severity === 'high' ? 'high'
          : (w.severity === 'medium' && m !== 'high') ? 'medium'
          : m,
        'low' as 'low' | 'medium' | 'high');
        out.push({
          key: `${palletId}|${idx}`,
          palletId,
          itemIdx: idx,
          item: it,
          warnings: ws,
          maxSeverity: sev,
        });
      });
    };
    (current?.parsed?.pallets || []).forEach((p: any) => addItems(p.items || [], p.id));
    addItems(current?.parsed?.einzelneSkuItems || [], 'ESKU');
    return out;
  }, [current?.parsed]);

  /* ── Acknowledged warnings — persisted in localStorage keyed by
     Auftrag id + item key. Worker clicks "Akzeptieren" → that item's
     warning is muted (but still visible, just no longer blocks). */
  const ackKey = `marathon.pruefen.parseAcks.${current?.id || 'none'}`;
  const [acked, setAcked] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(ackKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const ackOne = (key: string) => {
    setAcked((prev) => {
      const next = new Set(prev);
      next.add(key);
      try { localStorage.setItem(ackKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const ackAll = () => {
    setAcked((prev) => {
      const next = new Set(prev);
      parseWarnings.forEach((w) => next.add(w.key));
      try { localStorage.setItem(ackKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  /* High-severity warnings that haven't been acknowledged block Focus. */
  const blockingWarnings = parseWarnings.filter(
    (w) => w.maxSeverity === 'high' && !acked.has(w.key),
  );

  const briefing = useMemo(
    () => analyzeAuftrag({
      parsed: current?.parsed,
      validation,
      distribution,
      enrichedPallets,
      enrichedEsku,
    }),
    [current?.parsed, validation, distribution, enrichedPallets, enrichedEsku],
  );
  const hasPreflightFlags = briefing && briefing.worst !== 'ok' && briefing.flags?.length > 0;

  /* ── pallet auto-insights for the meta line under FBA ─────── */
  const insights = useMemo(
    () => buildAuftragInsights(view?.pallets || [], enrichedPallets, palletStates, eskuDist),
    [view?.pallets, enrichedPallets, palletStates, eskuDist],
  );

  /* ── pallet view-mode + filter ─────────────────────────────── */
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'story';
    const stored = localStorage.getItem('pruefen.palletViewMode');
    if (stored === 'overview' || stored === 'story') return stored;
    return rawPallets.length >= AUTO_OVERVIEW_THRESHOLD ? 'overview' : 'story';
  });
  const switchViewMode = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem('pruefen.palletViewMode', mode); } catch { /* ignore */ }
  };

  const [problemOnly, setProblemOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleJumpToPallet = (palletId) => {
    if (viewMode !== 'story') switchViewMode('story');
    setTimeout(() => {
      const el = document.getElementById(`pallet-row-${palletId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const ranking = useMemo(
    () => rankPallets(view?.pallets || [], palletStates),
    [view?.pallets, palletStates],
  );

  /* Build a per-pallet search index once — flattened searchable
     string per pallet covers id + every item's FNSKU / EAN / SKU /
     ASIN / useItem / title. Lower-cased so the query comparison is
     case-insensitive.

     Source must be the item-carrying enrichedPallets, NOT view.pallets
     (the latter is `pruefenView()` output which only carries summary
     fields like {id, level, articles}, no items). ESKU items are
     pre-distributed via `distribution.byPalletId`, so we also fold
     them in so a worker searching for an ESKU code lands on the
     correct destination pallet. */
  const palletSearchIndex = useMemo(() => {
    const idx = new Map<string, string>();
    enrichedPallets.forEach((p: any) => {
      const parts: string[] = [String(p.id || '').toLowerCase()];
      const items = [
        ...(p.items || []),
        ...(eskuDist?.[p.id] || []),
      ];
      items.forEach((it: any) => {
        if (it.fnsku)   parts.push(String(it.fnsku).toLowerCase());
        if (it.ean)     parts.push(String(it.ean).toLowerCase());
        if (it.sku)     parts.push(String(it.sku).toLowerCase());
        if (it.asin)    parts.push(String(it.asin).toLowerCase());
        if (it.useItem) parts.push(String(it.useItem).toLowerCase());
        if (it.title)   parts.push(String(it.title).toLowerCase());
      });
      idx.set(p.id, parts.join(' '));
    });
    return idx;
  }, [enrichedPallets, eskuDist]);

  const searchQ = searchQuery.trim().toLowerCase();

  const visiblePallets = useMemo(() => {
    let arr = view?.pallets || [];
    if (problemOnly) {
      arr = arr.filter((p) => {
        const st = palletStates[p.id];
        return st && Array.isArray(st.flags) && st.flags.length > 0;
      });
    }
    if (searchQ) {
      arr = arr.filter((p) => (palletSearchIndex.get(p.id) || '').includes(searchQ));
    }
    return arr;
  }, [view?.pallets, palletStates, problemOnly, searchQ, palletSearchIndex]);

  const hiddenByFilter = (view?.pallets?.length || 0) - visiblePallets.length;

  /* ── Levels disclosure (collapsed by default — secondary info) */
  const [levelsOpen, setLevelsOpen] = useState(true);

  /* ── Sticky pallets toolbar — IntersectionObserver on header ── */
  const palletsHeaderRef = useRef(null);
  const [stickyToolbar, setStickyToolbar] = useState(false);
  useEffect(() => {
    const el = palletsHeaderRef.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(
      ([entry]) => setStickyToolbar(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0, rootMargin: '-60px 0px 0px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visiblePallets.length]);

  /* ── Keyboard F → Focus. Blocked also by unacknowledged
     high-severity parser warnings — the worker must explicitly
     acknowledge ambiguous parses before moving on. */
  const focusBlocked = validView.errors > 0 || blockingWarnings.length > 0;
  const onStartFocus = () => {
    if (!focusBlocked) goToStep('focus');
  };
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable;
      /* Slash → focus the first visible search field. Works only when
         the worker isn't already typing somewhere else. */
      if (e.key === '/' && !inField && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const input = document.querySelector<HTMLInputElement>('input[data-pruefen-search]');
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
          return;
        }
      }
      if (e.key !== 'f' && e.key !== 'F') return;
      if (inField) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!focusBlocked) {
        e.preventDefault();
        goToStep('focus');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focusBlocked, goToStep]);

  if (!view) {
    return (
      <Page>
        <Topbar crumbs={[{ label: 'Workspace', muted: true }, { label: 'Auftrag prüfen' }]} />
        <main style={{ padding: '64px 32px', textAlign: 'center', color: T.text.subtle }}>
          Kein Auftrag geladen.
        </main>
      </Page>
    );
  }

  return (
    <Page>
      <PruefenStyles />
      <Topbar
        crumbs={[
          { label: 'Prüfen' },
        ]}
        right={
          <Button variant="ghost" size="sm" onClick={cancelCurrent} title="Auftrag abbrechen, zurück zur Warteschlange">
            Verlassen
          </Button>
        }
      />

      <StepperBar active="pruefen" />

      {/* Sticky toolbar — only renders when section header scrolls out */}
      <StickyPalletsToolbar
        visible={stickyToolbar}
        count={view.pallets.length}
        visibleCount={visiblePallets.length}
        problemOnly={problemOnly}
        onToggleProblem={() => setProblemOnly((v) => !v)}
        viewMode={viewMode}
        onChangeViewMode={switchViewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="mp-prf-canvas" style={{ minHeight: 'calc(100vh - 200px)' }}>
        <main style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '40px 32px 140px',
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
        }}>

          {/* PRIMARY 1+2: FBA Hero + Preflight wrapped in one «studio»
              frame — single set of corner-marks brackets both cards
              with one mono eyebrow at the top, like Upload's drop
              studio. */}
          <StudioFrame
            bare
            gap={20}
            label="Auftrags-Identität · Schritt 02"
            status={
              validView.ok && validView.warnings === 0 ? 'Validiert'
              : validView.errors > 0 ? `${validView.errors} Fehler`
              : `${validView.warnings} Warnungen`
            }
          >
            <HeroFBA
              view={view}
              stats={view.stats}
              validView={validView}
              insights={insights}
              palletStates={palletStates}
              onJumpToPallet={handleJumpToPallet}
            />

            <div style={{ animation: 'mp-prf-rise 480ms cubic-bezier(0.16,1,0.3,1) 100ms backwards' }}>
              <PreflightCard
                briefing={briefing}
                onJumpToPallet={handleJumpToPallet}
              />
            </div>
          </StudioFrame>

          {/* Parser warnings — only renders when items carry warnings.
              High-severity rows block Focus until acknowledged. */}
          {parseWarnings.length > 0 && (
            <div style={{ animation: `mp-prf-rise 480ms cubic-bezier(0.16,1,0.3,1) ${hasPreflightFlags ? 160 : 120}ms backwards` }}>
              <ParseWarningsPanel
                warnings={parseWarnings}
                acked={acked}
                onAckOne={ackOne}
                onAckAll={ackAll}
              />
            </div>
          )}

          {/* SECONDARY: collapsible Levels disclosure */}
          <div style={{ animation: `mp-prf-rise 480ms cubic-bezier(0.16,1,0.3,1) ${hasPreflightFlags ? 180 : 140}ms backwards` }}>
            <LevelsDisclosure
              pallets={enrichedPallets}
              open={levelsOpen}
              onToggle={() => setLevelsOpen((v) => !v)}
            />
          </div>

          {/* PRIMARY 3: Paletten */}
          <PalletsSection
            headerRef={palletsHeaderRef}
            pallets={view.pallets}
            visiblePallets={visiblePallets}
            enrichedPallets={enrichedPallets}
            eskuDist={eskuDist}
            eskuItems={eskuItems}
            palletStates={palletStates}
            ranking={ranking}
            viewMode={viewMode}
            onChangeViewMode={switchViewMode}
            problemOnly={problemOnly}
            onTogglProblemOnly={() => setProblemOnly((v) => !v)}
            hiddenByFilter={hiddenByFilter}
            onJumpToPallet={handleJumpToPallet}
            eskuOverrides={eskuOverrides}
            onMoveEsku={moveEskuToPallet}
            mountDelay={hasPreflightFlags ? 260 : 180}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </main>
      </div>

      <StickyBar
        validated={validView.ok}
        stats={view.stats}
        overloadCount={distribution.overloadCount}
        noValidCount={distribution.noValidCount}
        onStartFocus={onStartFocus}
        blockedReason={
          blockingWarnings.length > 0
            ? `${blockingWarnings.length} ungeklärte Parser-Warnungen zuerst akzeptieren`
            : null
        }
      />
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PARSE WARNINGS PANEL — surfaces parser-detected ambiguities per item.

   Severity stripe on the left:
     low      — quiet T.text.faint stripe; informational, auto-OK
     medium   — yellow T.status.warn.main; review recommended
     high     — red T.status.danger.main; blocks Focus until ack'd

   Each row carries: pallet/item position, item title, FNSKU/units,
   then a wrapped list of reasons. "Akzeptieren" mutes that row; "Alle
   akzeptieren" mutes everything in one go. Ack'd rows stay visible
   but with reduced opacity + ✓ chip so the worker still sees them.
   ════════════════════════════════════════════════════════════════════════ */
function ParseWarningsPanel({
  warnings, acked, onAckOne, onAckAll,
}: {
  warnings: Array<{
    key: string;
    palletId: string;
    itemIdx: number;
    item: any;
    warnings: any[];
    maxSeverity: 'low' | 'medium' | 'high';
  }>;
  acked: Set<string>;
  onAckOne: (key: string) => void;
  onAckAll: () => void;
}) {
  const counts = useMemo(() => {
    let low = 0, medium = 0, high = 0, unacked = 0;
    for (const w of warnings) {
      const sev = w.maxSeverity;
      if (sev === 'low') low += 1;
      else if (sev === 'medium') medium += 1;
      else high += 1;
      if (!acked.has(w.key)) unacked += 1;
    }
    return { low, medium, high, unacked };
  }, [warnings, acked]);

  const allAcked = counts.unacked === 0;
  const headerColor =
    counts.high > 0 && !allAcked ? T.status.danger.main
    : counts.medium > 0 && !allAcked ? T.status.warn.main
    : T.text.subtle;

  return (
    <div style={{
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Header — count summary + bulk-ack */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        borderBottom: `1px solid ${T.border.subtle}`,
        background: T.bg.surface2,
      }}>
        <span aria-hidden style={{
          width: 8, height: 8, borderRadius: '50%',
          background: headerColor,
          boxShadow: `0 0 0 3px ${headerColor}22`,
        }} />
        <span style={{
          fontFamily: T.font.mono,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: T.text.faint,
        }}>
          Parser-Warnungen
        </span>
        <span style={{
          fontFamily: T.font.mono,
          fontSize: 11.5,
          fontWeight: 600,
          color: T.text.primary,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {warnings.length}
          {counts.unacked > 0 && (
            <span style={{ color: T.text.subtle, fontWeight: 500 }}>
              {' '}· {counts.unacked} offen
            </span>
          )}
        </span>
        {counts.high > 0 && !allAcked && (
          <span style={{
            padding: '2px 8px',
            background: T.status.danger.bg,
            color: T.status.danger.text,
            border: `1px solid ${T.status.danger.border}`,
            borderRadius: 999,
            fontFamily: T.font.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}>
            Focus blockiert · {counts.high} kritisch
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!allAcked && (
          <Button variant="ghost" size="sm" onClick={onAckAll}
                  title="Alle Warnungen als gesichtet markieren">
            Alle akzeptieren
          </Button>
        )}
      </div>

      {/* List of warning rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {warnings.map((w, idx) => (
          <ParseWarningRow
            key={w.key}
            row={w}
            isAcked={acked.has(w.key)}
            isLast={idx === warnings.length - 1}
            onAck={() => onAckOne(w.key)}
          />
        ))}
      </div>
    </div>
  );
}

function ParseWarningRow({
  row, isAcked, isLast, onAck,
}: {
  row: { key: string; palletId: string; itemIdx: number; item: any; warnings: any[]; maxSeverity: 'low' | 'medium' | 'high' };
  isAcked: boolean;
  isLast: boolean;
  onAck: () => void;
}) {
  const stripeColor =
    row.maxSeverity === 'high' ? T.status.danger.main
    : row.maxSeverity === 'medium' ? T.status.warn.main
    : T.border.strong;
  const item = row.item || {};
  const title = (item.title || '').replace(/\s+/g, ' ').slice(0, 80);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '4px 1fr auto',
      gap: 0,
      borderBottom: isLast ? 'none' : `1px solid ${T.border.subtle}`,
      opacity: isAcked ? 0.5 : 1,
      transition: 'opacity 240ms ease',
    }}>
      {/* Severity stripe */}
      <span aria-hidden style={{ background: stripeColor }} />

      {/* Content */}
      <div style={{
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
      }}>
        {/* Position + title */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          minWidth: 0,
        }}>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: T.text.faint,
            flexShrink: 0,
          }}>
            {row.palletId} · #{row.itemIdx + 1}
          </span>
          <span style={{
            fontFamily: T.font.ui,
            fontSize: 13,
            fontWeight: 500,
            color: T.text.primary,
            letterSpacing: '-0.005em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}>
            {title || '—'}
          </span>
        </div>

        {/* Field values */}
        <div style={{
          display: 'flex',
          gap: 14,
          fontFamily: T.font.mono,
          fontSize: 11,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
          flexWrap: 'wrap',
        }}>
          <span>
            <span style={{ color: T.text.faint, marginRight: 4 }}>FNSKU</span>
            <span style={{ color: T.text.primary, fontWeight: 600 }}>
              {item.fnsku || '—'}
            </span>
          </span>
          <span>
            <span style={{ color: T.text.faint, marginRight: 4 }}>Menge</span>
            <span style={{ color: T.text.primary, fontWeight: 600 }}>
              {item.units ?? '—'}
            </span>
          </span>
          {item.ean && (
            <span>
              <span style={{ color: T.text.faint, marginRight: 4 }}>EAN</span>
              <span style={{ color: T.text.primary, fontWeight: 600 }}>
                {item.ean}
              </span>
            </span>
          )}
          {item.useItem && (
            <span>
              <span style={{ color: T.text.faint, marginRight: 4 }}>use_item</span>
              <span style={{ color: T.text.primary, fontWeight: 600, maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                {item.useItem}
              </span>
            </span>
          )}
        </div>

        {/* Warning reasons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
          {row.warnings.map((w: any, j: number) => {
            const sevColor =
              w.severity === 'high' ? T.status.danger.text
              : w.severity === 'medium' ? T.status.warn.text
              : T.text.subtle;
            const sevGlyph =
              w.severity === 'high' ? '✗'
              : w.severity === 'medium' ? '!'
              : '·';
            return (
              <div key={j} style={{
                fontFamily: T.font.ui,
                fontSize: 12,
                color: sevColor,
                display: 'flex',
                gap: 8,
                alignItems: 'baseline',
              }}>
                <span aria-hidden style={{
                  fontFamily: T.font.mono,
                  fontWeight: 800,
                  flexShrink: 0,
                  width: 12,
                }}>
                  {sevGlyph}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{w.field}</span>
                  {': '}{w.reason}
                  {w.original && (
                    <span style={{ marginLeft: 6, color: T.text.faint, fontFamily: T.font.mono, fontSize: 11 }}>
                      ({w.original}
                      {w.corrected && (
                        <>
                          {' → '}
                          <span style={{ color: T.text.primary, fontWeight: 600 }}>{w.corrected}</span>
                        </>
                      )}
                      )
                    </span>
                  )}
                  {w.candidates?.length > 0 && (
                    <span style={{
                      marginLeft: 6,
                      color: T.text.faint,
                      fontFamily: T.font.mono,
                      fontSize: 11,
                    }}>
                      [{w.candidates.join(', ')}]
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ack button (right gutter) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
      }}>
        {isAcked ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: T.status.success.bg,
            color: T.status.success.text,
            border: `1px solid ${T.status.success.border}`,
            borderRadius: 999,
            fontFamily: T.font.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}>
            ✓ akzeptiert
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={onAck}
                  title="Diese Warnung als gesichtet markieren">
            Akzeptieren
          </Button>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function PruefenStyles() {
  return (
    <style>{`
      .mp-prf-canvas {
        background-color: ${T.bg.page};
        background-image: radial-gradient(${T.border.primary} 1px, transparent 1px);
        background-size: 24px 24px;
        background-position: -1px -1px;
      }
      @keyframes mp-prf-rise {
        0%   { opacity: 0; transform: translateY(8px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes mp-prf-hero {
        0%   { opacity: 0; transform: scale(0.97); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes mp-prf-fp-pulse {
        0%, 100% { box-shadow: 0 0 0 0 transparent; }
        50%      { box-shadow: 0 0 0 3px var(--accent, #FF5B1F)55; }
      }
    `}</style>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   HERO FBA — primary anchor. Mega FBA mono + meta line + auto-insights
   + fingerprint row. Single elevated card on the page.
   ════════════════════════════════════════════════════════════════════════ */
function HeroFBA({ view, stats, validView, insights, palletStates, onJumpToPallet }) {
  return (
    <div style={{
      position: 'relative',
      padding: '28px 32px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 18,
      boxShadow: 'none',
      overflow: 'hidden',
      animation: 'mp-prf-hero 540ms cubic-bezier(0.16, 1, 0.3, 1) backwards',
    }}>
      {/* Soft accent radial halo top-right */}
      <div aria-hidden style={{
        position: 'absolute',
        top: -100,
        right: -100,
        width: 260,
        height: 260,
        background: `radial-gradient(circle, ${T.accent.main}0E 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* FBA — compact but still hero */}
          <div style={{
            fontFamily: T.font.mono,
            fontSize: 'clamp(28px, 3.8vw, 44px)',
            fontWeight: 500,
            color: T.text.primary,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            wordBreak: 'break-all',
          }}>
            {view.fba}
          </div>

          {/* Meta line + insights merged into one tight stack */}
          <div style={{
            marginTop: 10,
            fontSize: 12.5,
            color: T.text.subtle,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            <span style={{ fontFamily: T.font.mono }}>{view.destination}</span>
            <Dot />
            <span>{view.format}-Format</span>
            {view.createdDate && (
              <>
                <Dot />
                <span style={{ fontFamily: T.font.mono }}>
                  {view.createdDate}{view.createdTime ? ' ' + view.createdTime : ''}
                </span>
              </>
            )}
          </div>

          {insights.length > 0 && (
            <div style={{
              marginTop: 6,
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              fontSize: 11,
              color: T.text.faint,
              fontFamily: T.font.mono,
            }}>
              {insights.map((ins, i) => (
                <span key={ins.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: T.text.subtle, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {ins.label}
                  </span>
                  <span style={{ color: T.text.secondary, fontWeight: 500 }}>
                    {ins.value}
                  </span>
                  {i < insights.length - 1 && <span style={{ color: T.border.strong }}>·</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        <ReadyPill validView={validView} stats={stats} />
      </div>

      {/* Fingerprint row */}
      <FingerprintRow
        pallets={view.pallets}
        palletStates={palletStates}
        onClick={onJumpToPallet}
      />

      {/* Übersicht monoline — primary stats inside the hero card,
          separated by a hairline. Shares space with FBA and fingerprint
          so the operator sees identity + facts in one elevated block. */}
      <div style={{
        marginTop: 18,
        paddingTop: 16,
        borderTop: `1px solid ${T.border.primary}`,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        flexWrap: 'wrap',
      }}>
        <Metric value={stats.palletCount} label="Paletten" />
        <MetricSep />
        <Metric value={stats.articles} label="Artikel" />
        <MetricSep />
        <Metric value={stats.cartons.toLocaleString('de-DE')} label="Kartons" />
        <MetricSep />
        <Metric value={stats.weightKg.toLocaleString('de-DE')} label="kg" />
        <MetricSep />
        <FillMetric pct={stats.fillPct} />
      </div>
    </div>
  );
}

function Dot() {
  return <span style={{
    width: 3, height: 3,
    borderRadius: '50%',
    background: T.text.faint,
    flexShrink: 0,
  }} />;
}

function ReadyPill({ validView, stats }) {
  const tone = validView.errors > 0 ? 'danger'
    : validView.warnings > 0 ? 'warn'
    : 'success';
  const palette = T.status[tone];
  const label = validView.errors > 0 ? `${validView.errors} Fehler`
    : validView.warnings > 0 ? `${validView.warnings} Warnung${validView.warnings === 1 ? '' : 'en'}`
    : 'Bereit';
  const okPulse = tone === 'success';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 8,
      flexShrink: 0,
    }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 12px',
        borderRadius: 999,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        fontSize: 12,
        fontWeight: 500,
        color: palette.text,
        position: 'relative',
      }}>
        <span style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: palette.main,
          boxShadow: okPulse ? `0 0 0 3px ${palette.main}22` : 'none',
        }} />
        {label}
      </span>
      <span style={{
        fontSize: 11,
        fontFamily: T.font.mono,
        color: T.text.faint,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
      }}>
        ~ {formatDur(stats.durationSec)}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FINGERPRINT — 12 mini-squares, color = dominant level, top-right
   flag-dot if pallet has issues. Click → jump to pallet.
   ════════════════════════════════════════════════════════════════════════ */
function FingerprintRow({ pallets, palletStates, onClick }) {
  if (!pallets || pallets.length === 0) return null;
  return (
    <div style={{
      marginTop: 18,
      paddingTop: 16,
      borderTop: `1px solid ${T.border.primary}`,
      position: 'relative',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: T.text.faint,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontFamily: T.font.mono,
        }}>
          Fingerprint
        </span>
        <span style={{
          fontSize: 11,
          color: T.text.faint,
          fontFamily: T.font.mono,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {pallets.length} {pallets.length === 1 ? 'Palette' : 'Paletten'}
        </span>
      </div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
      }}>
        {pallets.map((p) => (
          <FingerprintCell
            key={p.id}
            pallet={p}
            state={palletStates?.[p.id]}
            onClick={() => onClick(p.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FingerprintCell({ pallet, state, onClick }) {
  const [hover, setHover] = useState(false);

  /* `pallet.level` is already pre-computed by pruefenView()
     (= primaryLevel(items) inside the view-builder), so we can use
     it directly. Earlier code tried to re-derive it from pallet.items
     which the view doesn't expose — leaving cells grey. */
  const lvl = pallet.level;
  const meta = lvl != null ? LEVEL_META[lvl] : null;
  const baseColor = meta?.color || T.bg.surface3;
  const hasFlag = state && Array.isArray(state.flags) && state.flags.length > 0;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${pallet.id} · ${meta?.name || 'Unbekannt'}${hasFlag ? ' · ' + state.flags.length + ' Hinweis(e)' : ''}`}
      style={{
        position: 'relative',
        width: 24,
        height: 24,
        background: baseColor,
        border: `1px solid ${hover ? T.text.primary : 'transparent'}`,
        borderRadius: 4,
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        transition: 'all 160ms cubic-bezier(0.16, 1, 0.3, 1)',
        transform: hover ? 'scale(1.12)' : 'scale(1)',
        opacity: hasFlag ? 1 : 0.85,
      }}
    >
      {hasFlag && (
        <span style={{
          position: 'absolute',
          top: 2,
          right: 2,
          width: 5, height: 5,
          borderRadius: '50%',
          background: T.status.warn.main,
          border: `1.5px solid ${T.bg.surface}`,
        }} />
      )}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ÜBERSICHT METRICS — atoms used inside the HeroFBA card. Visually
   share space with FBA + Fingerprint to consolidate "this Auftrag's
   identity + facts" into one elevated block.
   ════════════════════════════════════════════════════════════════════════ */

function Metric({ value, label }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 6,
      padding: '0 4px',
    }}>
      <span style={{
        fontSize: 16,
        fontWeight: 600,
        color: T.text.primary,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.012em',
      }}>
        {value}
      </span>
      <span style={{
        fontSize: 11,
        color: T.text.faint,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontFamily: T.font.mono,
      }}>
        {label}
      </span>
    </span>
  );
}

function MetricSep() {
  return (
    <span style={{
      width: 1,
      height: 18,
      background: T.border.primary,
      margin: '0 14px',
    }} />
  );
}

function FillMetric({ pct }) {
  const pctValue = Math.round(pct * 100);
  const color = pct > 1 ? T.status.danger.main
    : pct >= 0.92 ? T.status.warn.main
    : T.accent.main;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 4px',
    }}>
      <span style={{
        fontSize: 16,
        fontWeight: 600,
        color: T.text.primary,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.012em',
      }}>
        {pctValue}%
      </span>
      <span style={{
        position: 'relative',
        width: 60,
        height: 3,
        background: T.bg.surface3,
        borderRadius: 999,
        overflow: 'hidden',
      }}>
        <span style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${Math.min(100, pctValue)}%`,
          background: color,
          borderRadius: 999,
          transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </span>
      <span style={{
        fontSize: 11,
        color: T.text.faint,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontFamily: T.font.mono,
      }}>
        Auslastung
      </span>
    </span>
  );
}

interface LevelDist { level: number; units: number; pct: number; meta: { name: string; shortName?: string; color: string }; [k: string]: unknown }

function LevelsDisclosure({ pallets, open, onToggle }: { pallets: unknown[]; open: boolean; onToggle: () => void }) {
  const distribution: LevelDist[] = useMemo(() => levelDistribution(pallets), [pallets]);
  const grand = distribution.reduce((s: number, d) => s + d.units, 0);
  if (grand === 0) return null;
  const filled = distribution.filter((d) => d.units > 0).length;

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px 4px 4px',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          fontSize: 11.5,
          color: T.text.subtle,
          fontFamily: T.font.mono,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          fontWeight: 500,
          borderRadius: 4,
          transition: 'color 160ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.text.primary; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.text.subtle; }}
      >
        <span style={{
          display: 'inline-flex',
          width: 16, height: 16,
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 200ms',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M2 1l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        Levels-Verteilung · {filled} von 6 belegt
      </button>

      {open && (
        <div style={{
          marginTop: 12,
          padding: '18px 20px',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          animation: 'mp-prf-rise 320ms cubic-bezier(0.16,1,0.3,1)',
        }}>
          <div style={{
            display: 'flex',
            height: 12,
            background: T.bg.surface3,
            borderRadius: 999,
            overflow: 'hidden',
          }}>
            {distribution.map((s, i) => (
              <div
                key={s.level}
                title={`L${s.level} ${s.meta.name}: ${s.units.toLocaleString('de-DE')} (${Math.round(s.pct * 100)}%)`}
                style={{
                  width: `${s.pct * 100}%`,
                  background: s.meta.color,
                  borderRight: i < distribution.length - 1 ? `2px solid ${T.bg.surface}` : 'none',
                }}
              />
            ))}
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
          }}>
            {distribution.map((s) => (
              <span
                key={s.level}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                }}
              >
                <span style={{
                  width: 16, height: 16,
                  background: s.meta.color,
                  borderRadius: 3,
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: T.font.mono,
                  opacity: s.units > 0 ? 1 : 0.3,
                }}>
                  {s.level}
                </span>
                <span style={{ color: T.text.primary, fontWeight: 500 }}>{s.meta.name}</span>
                <span style={{
                  color: T.text.faint,
                  fontVariantNumeric: 'tabular-nums',
                  fontFamily: T.font.mono,
                }}>
                  {Math.round(s.pct * 100)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PALLETS SECTION — primary content. Section header + body.
   Header gets a ref so an IntersectionObserver upstream knows when
   to render the sticky toolbar.
   ════════════════════════════════════════════════════════════════════════ */
function PalletsSection({
  headerRef,
  pallets, visiblePallets, enrichedPallets, eskuDist, eskuItems,
  palletStates, ranking, viewMode, onChangeViewMode,
  problemOnly, onTogglProblemOnly, hiddenByFilter, onJumpToPallet,
  eskuOverrides, onMoveEsku,
  mountDelay = 0,
  searchQuery = '', onSearchChange = () => {},
}: any) {
  const total = pallets.length;
  const hasSearch = searchQuery.trim().length > 0;
  const subtitle = useMemo(() => {
    if (hasSearch) {
      return visiblePallets.length === 0
        ? `Keine Treffer für "${searchQuery}"`
        : `${visiblePallets.length} Treffer für "${searchQuery}"`;
    }
    if (problemOnly) {
      return hiddenByFilter > 0
        ? `${visiblePallets.length} mit Hinweisen · ${hiddenByFilter} ausgeblendet`
        : 'Keine problematischen Paletten';
    }
    if (eskuItems.length > 0) {
      return viewMode === 'overview'
        ? `Übersicht · ${eskuItems.length} ESKU-Kartons verteilt`
        : `Story · ${eskuItems.length} ESKU-Kartons verteilt`;
    }
    return viewMode === 'overview'
      ? 'Übersicht — Mini-Karten für schnellen Vergleich'
      : 'Story — Headline, Auslastung und Top-Artikel pro Palette';
  }, [viewMode, eskuItems.length, problemOnly, visiblePallets.length, hiddenByFilter, hasSearch, searchQuery]);

  return (
    <section style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      animation: `mp-prf-rise 480ms cubic-bezier(0.16,1,0.3,1) ${mountDelay}ms backwards`,
    }}>
      {/* Section header */}
      <div ref={headerRef} style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 22,
              fontWeight: 500,
              color: T.text.primary,
              letterSpacing: '-0.02em',
            }}>
              Paletten
            </span>
            <span style={{
              fontSize: 14,
              color: T.text.faint,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: T.font.mono,
            }}>
              {total}
            </span>
          </div>
          <div style={{
            marginTop: 4,
            fontSize: 12.5,
            color: T.text.subtle,
          }}>
            {subtitle}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <SearchInput value={searchQuery} onChange={onSearchChange} placeholder="FNSKU · EAN · Titel · P-ID" />
        <FilterChip active={problemOnly} onClick={onTogglProblemOnly} />
        <ViewModeToggle value={viewMode} onChange={onChangeViewMode} />
      </div>

      {/* Body */}
      <PalletsBody
        visiblePallets={visiblePallets}
        enrichedPallets={enrichedPallets}
        eskuDist={eskuDist}
        eskuItems={eskuItems}
        palletStates={palletStates}
        ranking={ranking}
        viewMode={viewMode}
        problemOnly={problemOnly}
        hiddenByFilter={hiddenByFilter}
        onJumpToPallet={onJumpToPallet}
        eskuOverrides={eskuOverrides}
        onMoveEsku={onMoveEsku}
      />
    </section>
  );
}

function PalletsBody({
  visiblePallets, enrichedPallets, eskuDist, eskuItems,
  palletStates, ranking, viewMode, problemOnly, hiddenByFilter,
  onJumpToPallet,
  eskuOverrides, onMoveEsku,
}) {
  if (visiblePallets.length === 0 && problemOnly) {
    return (
      <div style={{
        padding: '24px 20px',
        textAlign: 'center',
        fontSize: 13,
        color: T.status.success.text,
        background: T.status.success.bg,
        border: `1px solid ${T.status.success.border}`,
        borderRadius: 14,
      }}>
        ✓ Keine problematischen Paletten · {hiddenByFilter} ausgeblendet
      </div>
    );
  }

  if (viewMode === 'overview') {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 10,
      }}>
        {visiblePallets.map((p) => {
          const raw = enrichedPallets.find((r) => r.id === p.id);
          const eskuAssigned = sortItemsForPallet(eskuDist[p.id] || []);
          const palletState = palletStates[p.id];
          const story = buildPalletStory({
            pallet: p,
            items: raw?.items || [],
            eskuAssigned,
            palletState,
            ranking,
          });
          return (
            <PalletMiniCard
              key={p.id}
              pallet={p}
              palletState={palletState}
              story={story}
              onClick={() => onJumpToPallet(p.id)}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {visiblePallets.map((p, i) => {
        const raw = enrichedPallets.find((r) => r.id === p.id);
        const eskuAssigned = sortItemsForPallet(eskuDist[p.id] || []);
        const palletState = palletStates[p.id];
        const story = buildPalletStory({
          pallet: p,
          items: raw?.items || [],
          eskuAssigned,
          palletState,
          ranking,
        });
        return (
          <PalletStoryCard
            key={p.id}
            pallet={p}
            items={raw?.items || []}
            eskuAssigned={eskuAssigned}
            palletState={palletState}
            story={story}
            allPallets={enrichedPallets}
            palletStates={palletStates}
            eskuDist={eskuDist}
            eskuOverrides={eskuOverrides}
            onMoveEsku={onMoveEsku}
          />
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   STICKY PALLETS TOOLBAR — appears when section header scrolls past.
   ════════════════════════════════════════════════════════════════════════ */
function StickyPalletsToolbar({
  visible, count, visibleCount,
  problemOnly, onToggleProblem,
  viewMode, onChangeViewMode,
  searchQuery = '', onSearchChange = (_v: string) => {},
}: any) {
  return (
    <div style={{
      position: 'fixed',
      top: visible ? 0 : -56,
      left: 'var(--sidebar-width)',
      right: 0,
      zIndex: 30,
      padding: '10px 32px',
      background: 'var(--bg-glass-strong)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${T.border.primary}`,
      transition: 'top 280ms cubic-bezier(0.16, 1, 0.3, 1)',
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      <div style={{
        maxWidth: 1080,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{
          fontSize: 12.5,
          fontWeight: 500,
          color: T.text.primary,
          letterSpacing: '-0.005em',
        }}>
          Paletten
        </span>
        <span style={{
          fontSize: 11.5,
          color: T.text.faint,
          fontFamily: T.font.mono,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {visibleCount === count ? count : `${visibleCount} / ${count}`}
        </span>
        <span style={{ flex: 1 }} />
        <SearchInput value={searchQuery} onChange={onSearchChange} placeholder="Suchen…" compact />
        <FilterChip active={problemOnly} onClick={onToggleProblem} />
        <ViewModeToggle value={viewMode} onChange={onChangeViewMode} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SEARCH INPUT — quick filter for pallets / items in Pruefen.

   Matches across FNSKU, EAN, SKU, ASIN, useItem, title and pallet ID
   (case-insensitive substring). When the worker scans a barcode the
   pallet containing that code surfaces immediately.

   • Slash key (/) at the page level focuses the first visible input
     (handled in PruefenScreen useEffect — relies on
     data-pruefen-search attribute).
   • Esc clears the query and blurs.
   • Compact variant shrinks for the sticky toolbar's tighter row.
   ════════════════════════════════════════════════════════════════════════ */
function SearchInput({
  value, onChange, placeholder = 'Suchen…', compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const hasValue = value.length > 0;
  const ref = useRef<HTMLInputElement>(null);
  const height = compact ? 28 : 32;
  const width = compact ? 200 : 240;
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height,
      width,
      padding: '0 10px',
      background: T.bg.surface,
      border: `1px solid ${focused ? T.accent.main : T.border.primary}`,
      borderRadius: 999,
      transition: 'border-color 140ms ease, background 140ms ease',
      flexShrink: 0,
    }}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden
           style={{ color: focused || hasValue ? T.text.subtle : T.text.faint, flexShrink: 0 }}>
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        data-pruefen-search="true"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            if (hasValue) onChange('');
            else (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: compact ? 12 : 13,
          color: T.text.primary,
          fontFamily: T.font.mono,
          letterSpacing: '0.02em',
        }}
      />
      {hasValue ? (
        <button
          type="button"
          onClick={() => { onChange(''); ref.current?.focus(); }}
          title="Suche leeren (Esc)"
          aria-label="Suche leeren"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18, height: 18,
            background: 'transparent',
            border: 'none',
            color: T.text.subtle,
            cursor: 'pointer',
            padding: 0,
            borderRadius: '50%',
            transition: 'color 140ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text.subtle; }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      ) : !focused && (
        <span aria-hidden style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 16, height: 16,
          padding: '0 5px',
          fontSize: 10,
          fontFamily: T.font.mono,
          fontWeight: 600,
          color: T.text.faint,
          background: T.bg.surface2,
          border: `1px solid ${T.border.subtle}`,
          borderRadius: 3,
          letterSpacing: '0.04em',
        }}>
          /
        </span>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FILTER CHIP + VIEW TOGGLE
   ════════════════════════════════════════════════════════════════════════ */
function FilterChip({ active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        fontSize: 12,
        fontWeight: 500,
        color: active ? T.status.warn.text : T.text.subtle,
        background: active ? T.status.warn.bg : 'transparent',
        border: `1px solid ${active ? T.status.warn.border : T.border.primary}`,
        borderRadius: 999,
        cursor: 'pointer',
        fontFamily: T.font.ui,
        transition: 'all 160ms',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = T.text.subtle;
          e.currentTarget.style.color = T.text.secondary;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = T.border.primary;
          e.currentTarget.style.color = T.text.subtle;
        }
      }}
    >
      <span style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: active ? T.status.warn.main : T.text.faint,
      }} />
      Nur problematische
    </button>
  );
}

function ViewModeToggle({ value, onChange }) {
  const options = [
    { id: 'story',    label: 'Story',     icon: <StoryIcon /> },
    { id: 'overview', label: 'Übersicht', icon: <GridIcon /> },
  ];
  return (
    <div style={{
      display: 'inline-flex',
      gap: 2,
      padding: 2,
      background: T.bg.surface3,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 6,
    }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              color: active ? T.text.primary : T.text.subtle,
              background: active ? T.bg.surface : 'transparent',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: T.font.ui,
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'background 150ms, color 150ms',
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function StoryIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="9" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   STICKY BAR (bottom)
   ════════════════════════════════════════════════════════════════════════ */
function StickyBar({ validated, stats, overloadCount, noValidCount, onStartFocus, blockedReason }) {
  const hasFlags = overloadCount > 0 || noValidCount > 0;
  const isBlocked = !validated || !!blockedReason;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      padding: '12px 32px',
      background: 'var(--bg-glass-strong)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderTop: `1px solid ${T.border.primary}`,
      display: 'flex',
      marginLeft: 'var(--sidebar-width)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        maxWidth: 1080,
        margin: '0 auto',
        width: '100%',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: validated ? T.status.success.main : T.status.warn.main,
            boxShadow: `0 0 0 3px ${(validated ? T.status.success.main : T.status.warn.main) + '22'}`,
          }} />
          <span style={{
            fontSize: 12.5,
            color: T.text.primary,
            fontWeight: 500,
            letterSpacing: '-0.005em',
          }}>
            {validated ? 'Bereit' : 'Validierung erforderlich'}
          </span>
          <span style={{
            fontSize: 12,
            color: T.text.faint,
            fontFamily: T.font.mono,
            fontVariantNumeric: 'tabular-nums',
            marginLeft: 4,
          }}>
            {stats.palletCount} Pal · {stats.articles} Art
          </span>
        </span>

        {hasFlags && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11.5,
            color: T.status.warn.text,
            fontWeight: 500,
            padding: '3px 9px',
            background: T.status.warn.bg,
            borderRadius: 999,
            border: `1px solid ${T.status.warn.border}`,
          }}>
            <span style={{
              width: 5, height: 5,
              borderRadius: '50%',
              background: T.status.warn.main,
            }} />
            {overloadCount > 0 && `${overloadCount} OVERLOAD`}
            {overloadCount > 0 && noValidCount > 0 && ' · '}
            {noValidCount > 0 && `${noValidCount} NO_VALID`}
          </span>
        )}

        <span style={{ flex: 1 }} />

        <span style={{
          fontSize: 11.5,
          color: T.text.faint,
          fontFamily: T.font.mono,
          fontVariantNumeric: 'tabular-nums',
        }}>
          ~ {formatDur(stats.durationSec)}
        </span>

        <Button
          variant="primary"
          onClick={onStartFocus}
          disabled={isBlocked}
          title={
            !validated ? 'Validierungsfehler beheben'
            : blockedReason ? blockedReason
            : 'Focus-Modus starten (F)'
          }
        >
          Focus-Modus
          <Kbd>F</Kbd>
        </Button>
      </div>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      padding: '0 5px',
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      background: 'var(--bg-glass-on-accent)',
      border: '1px solid var(--bg-glass-on-accent-border)',
      borderRadius: 3,
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      marginLeft: 2,
    }}>
      {children}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   AUTO-INSIGHTS — derive presentation-quality facts from the pallet list.
   Each insight: { id, label, value }. Returned in order of importance:
     • Schwerste Palette (kg)
     • Vielfalt (most distinct articles on one pallet)
     • Knappste Palette (highest fillPct)
   We cap at 3 to keep the line visually clean.
   ════════════════════════════════════════════════════════════════════════ */
function buildAuftragInsights(pallets, enrichedPallets, palletStates, eskuDist) {
  if (!pallets || pallets.length === 0) return [];
  const out: { id: string; label: string; value: string }[] = [];

  /* Schwerste — by computed weightKg. We use enrichedPallets items
     because they carry real dim/weight data. */
  let heaviest: { id: string; weightKg: number } | null = null;
  let mostVariety: { id: string; distinctArticles: number } | null = null;
  let tightest: { id: string; fill: number } | null = null;

  for (const p of pallets) {
    const raw = enrichedPallets.find((r) => r.id === p.id);
    const items = raw?.items || [];
    const eskuAssigned = eskuDist[p.id] || [];
    const allItems = [...items, ...eskuAssigned];

    const weightKg = allItems.reduce((s, it) => s + (itemTotalWeightKg(it) || 0), 0);
    const distinctArticles = items.length;
    const state = palletStates[p.id];
    const fill = state?.capacityFraction ?? state?.fillPct ?? 0;

    if (weightKg > 0 && (!heaviest || weightKg > heaviest.weightKg)) {
      heaviest = { id: p.id, weightKg };
    }
    if (distinctArticles > 0 && (!mostVariety || distinctArticles > mostVariety.distinctArticles)) {
      mostVariety = { id: p.id, distinctArticles };
    }
    if (fill > 0 && (!tightest || fill > tightest.fill)) {
      tightest = { id: p.id, fill };
    }
  }

  if (heaviest && heaviest.weightKg >= 1) {
    out.push({
      id: 'heaviest',
      label: 'Schwerste',
      value: `${heaviest.id} · ${Math.round(heaviest.weightKg)} kg`,
    });
  }
  if (mostVariety && mostVariety.distinctArticles >= 2) {
    out.push({
      id: 'variety',
      label: 'Vielfalt',
      value: `${mostVariety.id} · ${mostVariety.distinctArticles} Art.`,
    });
  }
  if (tightest && tightest.fill > 0.7) {
    out.push({
      id: 'tightest',
      label: 'Knappste',
      value: `${tightest.id} · ${Math.round(tightest.fill * 100)}%`,
    });
  }

  return out.slice(0, 3);
}

/* ── helpers ─────────────────────────────────────────────────────────── */
function formatDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}