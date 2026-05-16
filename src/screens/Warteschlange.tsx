/* Warteschlange v2 — «Cockpit der Schicht».

   Magazine-spread design (matches Upload / Pruefen / Focus):
     • Eyebrow + clamp(36–52) PageH1 + Lead — wide breathing room
     • Hero KPI strip — total Aufträge / Paletten / Artikel / EH / ETA
     • In-Bearbeitung banner when a workflow is already active
     • Smart-sort pills (FIFO / Klein / Groß / Einfach zuerst) — single
       backend round-trip via reorderQueueTo
     • Search + status filter chips (auto-show ≥ 5 entries)
     • Native HTML5 drag-to-reorder with hairline drop-target line
     • Per-row fingerprint: mixed / single-SKU / ESKU counts, LST flags,
       level-distribution sparkbars, per-Auftrag ETA from
       estimateOrderSeconds()
     • Keyboard cockpit: j/k navigate · ⏎ start · x remove ·
       ⌘↑/⌘↓ reorder · / focus search · Esc clear search/select
     • Compact DropStrip stays so .docx anhängen never disappears
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppState } from '@/state.jsx';
import {
  Page, Topbar, Card, Eyebrow, PageH1, Lead,
  Badge, Button, EmptyState, T,
} from '@/components/ui.jsx';
import {
  estimateOrderSeconds, getDisplayLevel, LEVEL_META,
  sortPallets, formatItemTitle,
} from '@/utils/auftragHelpers.js';
import { getAuftrag } from '@/marathonApi.js';

/* ════════════════════════════════════════════════════════════════════════ */
const SORT_MODES = [
  { id: 'fifo',   label: 'FIFO',           hint: 'Reihenfolge wie hochgeladen' },
  { id: 'small',  label: 'Klein zuerst',   hint: 'Wenige Paletten zuerst' },
  { id: 'large',  label: 'Groß zuerst',    hint: 'Viele Paletten zuerst' },
  { id: 'simple', label: 'Einfach zuerst', hint: 'Wenig ESKU & Single-SKU zuerst' },
];

const FILTER_MODES = [
  { id: 'all',  label: 'Alle' },
  { id: 'ok',   label: 'Validiert' },
  { id: 'warn', label: 'Warnungen' },
  { id: 'err',  label: 'Fehler' },
];

const LST_OHNE_FULL  = /\bohne\s+(?:sepa[-\s]*)?lastschrift(?:text)?\b/i;
const LST_FULL_POS   = /\b(?:sepa[-\s]*)?lastschrift(?:text)?\b/i;
const LST_SEPA_DRUCK = /\bsepa[-\s]*druck\b/i;

/* ════════════════════════════════════════════════════════════════════════ */
export default function WarteschlangeScreen({ onRoute }) {
  const {
    queue, current,
    addFiles, startEntry,
    removeFromQueue, reorderQueue, reorderQueueTo, clearQueue,
  } = useAppState();

  const [over, setOver]               = useState(false);
  const [busy, setBusy]               = useState(false);
  const [sortMode, setSortMode]       = useState('fifo');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode]   = useState('all');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dragFromIdx, setDragFromIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [flash, setFlash]             = useState<string | null>(null);

  const inputRef  = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  /* ── enrichment per entry ──────────────────────────────────────
     Queued items arrive WITHOUT `parsed` in the list payload (server
     slims everything except the caller's active Auftrag). For counts
     we use the precomputed Summary fields; fingerprint + ETA need
     full pallets[] and gracefully degrade to null when absent. */
  const entries = useMemo(
    () => queue.map((entry) => {
      const pallets       = entry.parsed?.pallets || [];
      const eskuItems     = entry.parsed?.einzelneSkuItems || [];
      const palletCount   = entry.palletCount ?? pallets.length;
      const articleCount  = entry.articleCount
        ?? pallets.reduce((s, p) => s + (p.items?.length || 0), 0);
      const units         = entry.unitsCount ?? entry.parsed?.meta?.totalUnits ?? 0;
      const fp            = pallets.length ? computeFingerprint(pallets, eskuItems) : null;
      const etaSec        = pallets.length ? estimateOrderSeconds(pallets) : null;
      return {
        ...entry,
        _fp: fp,
        _etaSec: etaSec,
        _palletCount: palletCount,
        _articleCount: articleCount,
        _units: units,
      };
    }),
    [queue],
  );

  /* ── visible list (sort + filter + search) ───────────────────── */
  const visible = useMemo(
    () => filterAndSearch(entries, searchQuery, filterMode)
      .map((e, i) => ({ ...e, _displayIdx: i })),
    [entries, searchQuery, filterMode],
  );

  /* Keep selectedIdx in range as the visible list shrinks. */
  useEffect(() => {
    if (selectedIdx >= visible.length) {
      setSelectedIdx(Math.max(0, visible.length - 1));
    }
  }, [visible.length, selectedIdx]);

  /* Queue head — first non-error row in true queue order (NOT visible
     order). Error rows are skipped so a broken parse doesn't lock the
     shift. Used by both UI gating and Enter hotkey to enforce the rule
     that Sortieren is binding. */
  const headId = useMemo(
    () => queue.find((q) => q.status !== 'error')?.id ?? null,
    [queue],
  );

  /* Close the open Vorschau if the expanded entry left the queue. */
  useEffect(() => {
    if (expandedId && !queue.some((q) => q.id === expandedId)) {
      setExpandedId(null);
    }
  }, [queue, expandedId]);

  /* Auto-dismiss flash messages after 2.5s. */
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  /* ── totals for the hero KPI strip ───────────────────────────── */
  const totals = useMemo(
    () => entries.reduce((acc: { pallets: number; articles: number; units: number; etaSec: number }, e) => ({
      pallets:  acc.pallets  + e._palletCount,
      articles: acc.articles + e._articleCount,
      units:    acc.units    + Number(e._units || 0),
      etaSec:   acc.etaSec   + (e._etaSec ?? 0),
    }), { pallets: 0, articles: 0, units: 0, etaSec: 0 }),
    [entries],
  );

  /* ── file handling ───────────────────────────────────────────── */
  const acceptFiles = useCallback(async (fl: FileList | File[] | null) => {
    const arr = Array.from(fl || []).filter((f: File) => /\.docx$/i.test(f.name));
    if (!arr.length) return;
    setBusy(true);
    try {
      const built = await addFiles(arr);
      if (!current && queue.length === 0 && built[0]?.status === 'ready') {
        setTimeout(() => startEntry(built[0].id), 100);
      }
    } finally {
      setBusy(false);
    }
  }, [addFiles, current, queue.length, startEntry]);

  /* ── smart-sort: build a permutation, send via reorderQueueTo ── */
  const applySort = useCallback((mode) => {
    setSortMode(mode);
    if (mode === 'fifo') return;
    const sorted = sortEntries(entries, mode);
    const orderedIds = sorted.map((e) => e.id);
    reorderQueueTo(orderedIds);
  }, [entries, reorderQueueTo]);

  /* ── drag-and-drop reorder ───────────────────────────────────── */
  const onDragStart = (idx) => (e) => {
    e.dataTransfer.effectAllowed = 'move';
    /* setData is required in Firefox to actually start the drag */
    e.dataTransfer.setData('text/plain', String(idx));
    setDragFromIdx(idx);
  };
  const onDragOver = (idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragFromIdx === null) return;
    if (idx !== dragOverIdx) setDragOverIdx(idx);
  };
  const onDrop = (idx) => (e) => {
    e.preventDefault();
    if (dragFromIdx !== null && dragFromIdx !== idx) {
      const from = visible[dragFromIdx];
      const to   = visible[idx];
      const fromQ = queue.findIndex((q) => q.id === from?.id);
      const toQ   = queue.findIndex((q) => q.id === to?.id);
      if (fromQ >= 0 && toQ >= 0) reorderQueue(fromQ, toQ);
    }
    setDragFromIdx(null);
    setDragOverIdx(null);
  };
  const onDragEnd = () => {
    setDragFromIdx(null);
    setDragOverIdx(null);
  };

  /* ── keyboard cockpit ────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;

      if (e.key === '/' && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        if (document.activeElement === searchRef.current) {
          searchRef.current?.blur();
          if (searchQuery) setSearchQuery('');
          return;
        }
      }
      if (inField) return;
      if (!visible.length) return;

      /* Meta/Ctrl+Arrow checks MUST come before plain arrow keys —
         otherwise the plain branch swallows the keydown and the meta
         variant becomes dead code (caught by no-dupe-else-if). */
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
        e.preventDefault();
        const target = visible[selectedIdx];
        const idx = queue.findIndex((q) => q.id === target?.id);
        if (idx >= 0 && idx < queue.length - 1) reorderQueue(idx, idx + 1);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
        e.preventDefault();
        const target = visible[selectedIdx];
        const idx = queue.findIndex((q) => q.id === target?.id);
        if (idx > 0) reorderQueue(idx, idx - 1);
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(visible.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = visible[selectedIdx];
        if (!target || current || target.status === 'error') return;
        if (headId && target.id !== headId) {
          setFlash('Reihenfolge beachten — erst den obersten Auftrag starten.');
          return;
        }
        startEntry(target.id);
        if (onRoute) onRoute('workspace');
      } else if (e.key === 'x' || e.key === 'Delete') {
        e.preventDefault();
        const target = visible[selectedIdx];
        if (target) removeFromQueue(target.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    visible, selectedIdx, queue, current, searchQuery, headId,
    startEntry, removeFromQueue, reorderQueue, onRoute,
  ]);

  const hasQueue = entries.length > 0;
  const showToolbar = entries.length >= 2;
  const showSearchRow = entries.length >= 5;
  const noResults = hasQueue && visible.length === 0;
  const today = useMemo(() => new Date(), []);

  return (
    <Page>
      <Topbar
        crumbs={[{ label: 'Warteschlange' }]}
        right={
          <span style={{
            fontSize: 12.5,
            color: T.text.subtle,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: T.font.mono,
            letterSpacing: '0.02em',
          }}>
            {hasQueue ? `${entries.length} ${entries.length === 1 ? 'Auftrag' : 'Aufträge'}` : 'Leer'}
          </span>
        }
      />

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 40px 96px' }}>
        {/* HEADER */}
        <header style={{ marginBottom: 48 }}>
          <Eyebrow>
            Schicht · {today.toLocaleDateString('de-DE', {
              day: '2-digit', month: '2-digit', year: 'numeric',
            })}
          </Eyebrow>
          <h1 style={{
            fontFamily: T.font.ui,
            fontSize: 'clamp(36px, 2.8vw, 52px)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            color: T.text.primary,
            margin: 0,
          }}>
            Warteschlange
          </h1>
          <Lead style={{ marginTop: 16, maxWidth: 720, fontSize: 16 }}>
            Cockpit deiner Schicht. Reihenfolge entscheiden, Schwerpunkte
            erkennen, mit einem Tastendruck starten. Was oben steht, läuft
            als Nächstes.
          </Lead>
        </header>

        {/* IN-BEARBEITUNG BANNER */}
        {current && (
          <CurrentBanner current={current} onRoute={onRoute} />
        )}

        {/* HERO KPI STRIP */}
        {hasQueue && (
          <KpiStrip
            entries={entries.length}
            totals={totals}
          />
        )}

        {/* TOOLBAR (sort + clear) */}
        {showToolbar && (
          <Toolbar
            sortMode={sortMode}
            onSortMode={applySort}
            queueLen={entries.length}
            onClear={clearQueue}
          />
        )}

        {/* SEARCH + FILTER (≥5 entries) */}
        {showSearchRow && (
          <SearchFilterRow
            search={searchQuery}
            onSearch={setSearchQuery}
            filterMode={filterMode}
            onFilter={setFilterMode}
            searchRef={searchRef}
          />
        )}

        {/* DROP STRIP — always present when queue exists */}
        {hasQueue && (
          <div style={{ marginBottom: 20 }}>
            <DropStrip
              over={over}
              busy={busy}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); acceptFiles(e.dataTransfer.files); }}
            />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".docx"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { acceptFiles(e.target.files); e.target.value = ''; }}
        />

        {/* QUEUE LIST */}
        {hasQueue && !noResults && (
          <div style={{ display: 'grid', gap: 14 }}>
            {visible.map((entry, displayIdx) => (
              <QueueRowCard
                key={entry.id}
                entry={entry}
                queueIdx={queue.findIndex((q) => q.id === entry.id)}
                isHead={entry.id === headId}
                isSelected={displayIdx === selectedIdx}
                hasCurrent={!!current}
                isExpanded={expandedId === entry.id}
                isDragging={dragFromIdx === displayIdx}
                isDropAbove={dragFromIdx !== null && dragOverIdx === displayIdx && dragFromIdx > displayIdx}
                isDropBelow={dragFromIdx !== null && dragOverIdx === displayIdx && dragFromIdx < displayIdx}
                onSelect={() => setSelectedIdx(displayIdx)}
                onToggleExpand={() => setExpandedId((cur) => (cur === entry.id ? null : entry.id))}
                onStart={() => {
                  if (headId && entry.id !== headId) {
                    setFlash('Reihenfolge beachten — erst den obersten Auftrag starten.');
                    return;
                  }
                  startEntry(entry.id);
                  if (onRoute) onRoute('workspace');
                }}
                onRemove={() => removeFromQueue(entry.id)}
                onUp={(() => {
                  const qi = queue.findIndex((q) => q.id === entry.id);
                  return qi > 0 ? () => reorderQueue(qi, qi - 1) : null;
                })()}
                onDown={(() => {
                  const qi = queue.findIndex((q) => q.id === entry.id);
                  return qi >= 0 && qi < queue.length - 1 ? () => reorderQueue(qi, qi + 1) : null;
                })()}
                onDragStart={onDragStart(displayIdx)}
                onDragOver={onDragOver(displayIdx)}
                onDrop={onDrop(displayIdx)}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>
        )}

        {/* NO RESULTS (search/filter cleared everything) */}
        {noResults && (
          <Card style={{ padding: '40px 32px', textAlign: 'center' }}>
            <div style={{
              fontSize: 14,
              color: T.text.subtle,
              marginBottom: 16,
            }}>
              Keine Aufträge passen zu Suche oder Filter.
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearchQuery(''); setFilterMode('all'); }}
            >
              Filter zurücksetzen
            </Button>
          </Card>
        )}

        {/* EMPTY STATE */}
        {!hasQueue && (
          <EmptyHero onClick={() => inputRef.current?.click()} busy={busy} over={over}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); acceptFiles(e.dataTransfer.files); }}
          />
        )}

        {/* KEYBOARD CHEAT-SHEET */}
        {hasQueue && <KbdHints />}
      </main>

      {/* FLASH — strict-order violation, drag-to-top hint, etc. */}
      {flash && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 32,
            transform: 'translateX(-50%)',
            padding: '12px 20px',
            background: T.text.primary,
            color: T.bg.page,
            fontFamily: T.font.ui,
            fontSize: 13,
            letterSpacing: '-0.005em',
            borderRadius: T.radius.md,
            boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
            zIndex: 1000,
          }}
        >
          {flash}
        </div>
      )}

      <style>{`
        @keyframes mr-q-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.0); }
          50%  { box-shadow: 0 0 0 6px ${T.accent.bg}; }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.0); }
        }
        @keyframes mr-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Helper computations
   ════════════════════════════════════════════════════════════════════════ */

function computeFingerprint(pallets, eskuItems) {
  let mixed = 0;
  let singleSku = 0;
  for (const p of pallets) {
    if (p.hasFourSideWarning) singleSku++;
    else mixed++;
  }

  let mitLst = 0;
  let ohneLst = 0;
  const allTitles = pallets.flatMap((p) => p.items || []).map((it) => it.title || '');
  for (const t of allTitles) {
    if (/\bmit\s+lst\b/i.test(t)) mitLst++;
    else if (/\bohne\s+lst\b/i.test(t)) ohneLst++;
    else if (LST_OHNE_FULL.test(t)) ohneLst++;
    else if (LST_FULL_POS.test(t) || LST_SEPA_DRUCK.test(t)) mitLst++;
  }

  /* Level distribution by article count (not units — articles is a better
     "shape" signal at the queue glance level). */
  const lvlCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const p of pallets) {
    for (const it of (p.items || [])) {
      const lvl = getDisplayLevel(it);
      if (lvlCounts[lvl] !== undefined) lvlCounts[lvl] += 1;
    }
  }
  for (const it of (eskuItems || [])) {
    const lvl = getDisplayLevel(it);
    if (lvlCounts[lvl] !== undefined) lvlCounts[lvl] += 1;
  }

  return {
    mixed, singleSku,
    eskuCount: (eskuItems || []).length,
    mitLst, ohneLst,
    lvlCounts,
  };
}

function complexityScore(e) {
  /* Higher = more complex. Pallets are the dominant signal; ESKU items
     and Single-SKU pallets each add a smaller bump. `_fp` may be null
     for queued entries that arrived without parsed (race with refetch
     after create), so default missing flags to 0. */
  const fp = e._fp || { eskuCount: 0, singleSku: 0 };
  return e._palletCount * 4
       + fp.eskuCount * 1.2
       + fp.singleSku * 1.5;
}

function sortEntries(entries, mode) {
  const arr = [...entries];
  if (mode === 'small')   arr.sort((a, b) => a._palletCount - b._palletCount);
  if (mode === 'large')   arr.sort((a, b) => b._palletCount - a._palletCount);
  if (mode === 'simple')  arr.sort((a, b) => complexityScore(a) - complexityScore(b));
  return arr;
}

function filterAndSearch(entries, search, filterMode) {
  let arr = entries;
  if (filterMode === 'ok') {
    arr = arr.filter((e) => e.status !== 'error'
      && (e.validation?.errorCount || 0) === 0
      && (e.validation?.warningCount || 0) === 0);
  } else if (filterMode === 'warn') {
    arr = arr.filter((e) => e.status !== 'error' && (e.validation?.warningCount || 0) > 0);
  } else if (filterMode === 'err') {
    arr = arr.filter((e) => e.status === 'error' || (e.validation?.errorCount || 0) > 0);
  }
  const q = search.trim().toLowerCase();
  if (q) {
    arr = arr.filter((e) => {
      const fba = (e.parsed?.meta?.sendungsnummer || e.parsed?.meta?.fbaCode || '').toLowerCase();
      const fn  = (e.fileName || '').toLowerCase();
      return fba.includes(q) || fn.includes(q);
    });
  }
  return arr;
}

function fmtDuration(sec) {
  if (!sec || sec < 60) return '< 1 min';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${String(r).padStart(2, '0')} min` : `${h}h`;
}

function fmtRel(ts) {
  if (!ts) return '';
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60)  return 'gerade eben';
  if (sec < 3600) return `vor ${Math.round(sec / 60)} min`;
  if (sec < 86400) return `vor ${Math.round(sec / 3600)} h`;
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/* ════════════════════════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════════════════════════ */

function CurrentBanner({ current, onRoute }) {
  const fba = current.parsed?.meta?.sendungsnummer
    || current.parsed?.meta?.fbaCode
    || current.fileName;
  const totalP = current.parsed?.pallets?.length || 0;
  const cur    = (current.currentPalletIdx ?? 0) + 1;
  const pct    = totalP ? Math.round(((current.currentPalletIdx ?? 0) / totalP) * 100) : 0;

  return (
    <div style={{
      marginBottom: 36,
      padding: '20px 24px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.lg,
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      gap: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Live progress hairline along the top */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0,
        height: 2,
        width: `${pct}%`,
        background: T.accent.main,
        transition: 'width 280ms cubic-bezier(0.16, 1, 0.3, 1)',
      }} />

      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: T.font.mono,
          color: T.accent.text,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: 6,
        }}>
          <span style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: T.accent.main,
            animation: 'mr-q-pulse 1800ms ease-in-out infinite',
          }} />
          In Bearbeitung
        </div>
        <div style={{
          fontFamily: T.font.mono,
          fontSize: 18,
          fontWeight: 500,
          color: T.text.primary,
          letterSpacing: '-0.01em',
        }}>
          {fba}
        </div>
        <div style={{
          marginTop: 4,
          fontSize: 13,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
        }}>
          Palette {cur} von {totalP} · {pct}% erledigt
        </div>
      </div>

      <Button
        variant="primary"
        size="md"
        onClick={() => onRoute && onRoute('workspace')}
        title="Zurück zum Workflow"
      >
        Fortsetzen
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 6h6m0 0L6 3m3 3L6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function KpiStrip({ entries, totals }) {
  return (
    <div style={{
      marginBottom: 32,
      padding: '24px 28px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.lg,
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 8,
    }}>
      <Kpi label="Aufträge" value={entries} />
      <Kpi label="Paletten" value={totals.pallets} />
      <Kpi label="Artikel"  value={totals.articles} />
      <Kpi label="Einheiten" value={totals.units.toLocaleString('de-DE')} />
      <Kpi label="Geschätzt" value={`≈ ${fmtDuration(totals.etaSec)}`} accent />
    </div>
  );
}

function Kpi({ label, value, accent }: { label?: React.ReactNode; value?: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.font.ui,
        fontSize: 26,
        fontWeight: 500,
        letterSpacing: '-0.02em',
        color: accent ? T.accent.text : T.text.primary,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function Toolbar({ sortMode, onSortMode, queueLen, onClear }) {
  return (
    <div style={{
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        fontFamily: T.font.mono,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginRight: 4,
      }}>
        Sortieren
      </span>
      {SORT_MODES.map((m) => (
        <SortPill
          key={m.id}
          active={sortMode === m.id}
          onClick={() => onSortMode(m.id)}
          title={m.hint}
        >
          {m.label}
        </SortPill>
      ))}
      <span style={{ flex: 1 }} />
      {queueLen >= 2 && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Alle entfernen
        </Button>
      )}
    </div>
  );
}

function SortPill({ children, active, onClick, title }: { children?: React.ReactNode; active?: boolean; onClick?: () => void; title?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 30,
        padding: '0 12px',
        fontSize: 12.5,
        fontWeight: 500,
        fontFamily: T.font.ui,
        background: active ? T.accent.bg : (hover ? T.bg.surface3 : T.bg.surface),
        border: `1px solid ${active ? T.accent.border : T.border.primary}`,
        color: active ? T.accent.text : T.text.secondary,
        borderRadius: T.radius.full,
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
    >
      {children}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function SearchFilterRow({ search, onSearch, filterMode, onFilter, searchRef }) {
  return (
    <div style={{
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    }}>
      <div style={{
        flex: '1 1 280px',
        maxWidth: 360,
        position: 'relative',
      }}>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          style={{
            position: 'absolute',
            left: 12, top: '50%',
            transform: 'translateY(-50%)',
            color: T.text.faint,
          }}
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={searchRef}
          type="text"
          placeholder="Suchen — FBA-Code oder Dateiname  ·  /"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{
            width: '100%',
            height: 36,
            padding: '0 36px 0 34px',
            fontSize: 13,
            fontFamily: T.font.ui,
            color: T.text.primary,
            background: T.bg.surface,
            border: `1px solid ${T.border.primary}`,
            borderRadius: T.radius.md,
            outline: 'none',
            transition: 'border-color 150ms',
          }}
          onFocus={(e) => { e.target.style.borderColor = T.accent.main; }}
          onBlur={(e)  => { e.target.style.borderColor = T.border.primary; }}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            title="Suche leeren"
            style={{
              position: 'absolute',
              right: 8, top: '50%',
              transform: 'translateY(-50%)',
              width: 22, height: 22,
              display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: T.radius.sm,
              color: T.text.faint,
              cursor: 'pointer',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <span style={{ flex: 1 }} />
      {FILTER_MODES.map((f) => (
        <SortPill
          key={f.id}
          active={filterMode === f.id}
          onClick={() => onFilter(f.id)}
        >
          {f.label}
        </SortPill>
      ))}
    </div>
  );
}

/* ══════ Drop strip (unchanged shape, slightly bigger paddings) ══════════ */
function DropStrip({ over, busy, onClick, onDragOver, onDragLeave, onDrop }) {
  const borderColor = over ? T.accent.main : T.border.strong;
  const bgColor = over ? T.accent.bg : T.bg.surface;
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '20px 26px',
        background: bgColor,
        border: `1px dashed ${borderColor}`,
        borderRadius: T.radius.lg,
        cursor: busy ? 'wait' : 'pointer',
        transition: 'background 200ms, border-color 200ms',
      }}
    >
      <span style={{
        width: 44, height: 44,
        borderRadius: T.radius.md,
        background: over ? '#fff' : T.bg.surface3,
        border: `1px solid ${over ? T.accent.border : T.border.primary}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: over ? T.accent.main : T.text.subtle,
        flexShrink: 0,
        transition: 'all 200ms',
      }}>
        {busy ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'mr-spin 800ms linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.2-8.55" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.text.primary }}>
          {over ? 'Datei jetzt loslassen' : busy ? 'Wird verarbeitet…' : 'Weitere Datei anhängen'}
        </div>
        <div style={{ fontSize: 13, color: T.text.subtle, marginTop: 3 }}>
          .docx · Drag &amp; Drop oder klicken
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        disabled={busy}
      >
        Datei auswählen
      </Button>
    </div>
  );
}

/* ════════ Empty state — magazine-spread, matches Upload vocabulary ═════ */
function EmptyHero({ onClick, busy, over, onDragOver, onDragLeave, onDrop }) {
  return (
    <div style={{ marginTop: 4 }}>
      {/* Sub-eyebrow — secondary hero pulse, distinct from the page-level H1 */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginBottom: 10,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent.main }} />
        Schicht beginnt
      </div>

      <h2 style={{
        margin: 0,
        fontFamily: T.font.ui,
        fontSize: 'clamp(24px, 1.9vw, 32px)',
        fontWeight: 500,
        letterSpacing: '-0.02em',
        lineHeight: 1.15,
        color: T.text.primary,
      }}>
        Lege deinen ersten Auftrag ab
      </h2>
      <p style={{
        margin: '10px 0 22px',
        fontSize: 15,
        color: T.text.muted,
        lineHeight: 1.55,
        maxWidth: 560,
      }}>
        Eine <code style={{
          fontFamily: T.font.mono,
          fontSize: 13.5,
          padding: '1px 6px',
          background: T.bg.surface3,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 4,
          color: T.text.secondary,
        }}>.docx</code>-Datei genügt — Marathon übernimmt den Rest. Mehrere
        Aufträge werden in der hier gewählten Reihenfolge abgearbeitet.
      </p>

      {/* Hero drop row — 1px hairline (matches Upload), accent on hover */}
      <div
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          minHeight: 120,
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          background: over ? T.accent.bg : T.bg.surface,
          border: `1px ${over ? 'solid' : 'dashed'} ${over ? T.accent.main : T.border.strong}`,
          borderRadius: 14,
          cursor: busy ? 'wait' : 'pointer',
          transition: 'background 240ms cubic-bezier(0.16, 1, 0.3, 1), border-color 240ms cubic-bezier(0.16, 1, 0.3, 1), transform 240ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 240ms cubic-bezier(0.16, 1, 0.3, 1)',
          transform: over ? 'scale(1.005)' : 'scale(1)',
          boxShadow: 'none',
          marginBottom: 28,
        }}
      >
        <span style={{
          width: 52, height: 52,
          flexShrink: 0,
          borderRadius: T.radius.md,
          background: over ? '#fff' : T.bg.surface3,
          border: `1px solid ${over ? T.accent.border : T.border.primary}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: over ? T.accent.main : T.text.subtle,
          transition: 'all 200ms',
        }}>
          {busy ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ animation: 'mr-spin 800ms linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.2-8.55" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <div style={{ flex: 1, lineHeight: 1.5, minWidth: 0 }}>
          <div style={{
            fontSize: 17,
            fontWeight: 500,
            color: over ? T.accent.text : T.text.primary,
            letterSpacing: '-0.01em',
          }}>
            {over ? 'Jetzt loslassen' : busy ? 'Wird verarbeitet…' : '.docx hier ablegen'}
          </div>
          <div style={{
            marginTop: 4,
            fontSize: 13,
            color: over ? T.accent.text : T.text.subtle,
            opacity: over ? 0.8 : 1,
          }}>
            Drag &amp; Drop, klicken oder mehrere Dateien gleichzeitig
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          disabled={busy}
          style={{
            padding: '9px 16px',
            fontSize: 13,
            fontWeight: 500,
            color: T.text.secondary,
            background: T.bg.surface,
            border: `1px solid ${T.border.strong}`,
            borderRadius: 6,
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: T.font.ui,
            transition: 'all 160ms',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (busy) return;
            e.currentTarget.style.borderColor = T.accent.main;
            e.currentTarget.style.color = T.accent.main;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = T.border.strong;
            e.currentTarget.style.color = T.text.secondary;
          }}
        >
          Datei wählen
        </button>
      </div>

      {/* Tips row — magazine-style 3-card grid (matches Theme-Studio + Live) */}
      <div style={{
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginBottom: 10,
      }}>
        Tipps
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
      }}>
        <TipCard
          eyebrow="Sequenziell"
          title="Mehrere Aufträge gleichzeitig"
          body="Lege mehrere .docx-Dateien auf einmal ab — sie landen in der hier sichtbaren Reihenfolge."
        />
        <TipCard
          eyebrow="Überall"
          title="Drop auf der ganzen Seite"
          body="Drag &amp; Drop funktioniert auch außerhalb dieses Felds. Sobald der Cursor die Seite betritt, öffnet sich ein Overlay."
        />
        <TipCard
          eyebrow="Reihenfolge"
          title="Smart-Sort &amp; Drag"
          body="Sobald zwei Aufträge bereit sind, kannst du sie nach Aufwand sortieren oder per Drag verschieben."
        />
      </div>
    </div>
  );
}

function TipCard({ eyebrow, title, body }) {
  return (
    <div style={{
      padding: '16px 18px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.md,
    }}>
      <div style={{
        fontSize: 10,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.accent.text,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginBottom: 6,
      }}>
        {eyebrow}
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 500,
        color: T.text.primary,
        letterSpacing: '-0.01em',
        marginBottom: 4,
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 12.5,
        color: T.text.subtle,
        lineHeight: 1.5,
      }}>
        {body}
      </div>
    </div>
  );
}

/* ════════ Queue row card ═══════════════════════════════════════════════ */
function QueueRowCard({
  entry, queueIdx, isHead, isSelected, hasCurrent, isExpanded,
  isDragging, isDropAbove, isDropBelow,
  onSelect, onToggleExpand, onStart, onRemove, onUp, onDown,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const fba = entry.parsed?.meta?.sendungsnummer
    || entry.parsed?.meta?.fbaCode
    || entry.fileName;
  const isError = entry.status === 'error';
  const validErrors = entry.validation?.errorCount || 0;
  const validWarns  = entry.validation?.warningCount || 0;
  const fp = entry._fp;

  /* Visual state stack */
  const borderColor = isHead
    ? T.accent.main
    : isSelected
    ? T.text.primary
    : T.border.primary;
  const bg = isHead ? T.accent.bg : T.bg.surface;
  const dropLineColor = T.accent.main;

  /* Start button is reachable only on the head row; everything else is
     visually disabled with an explanatory tooltip. Error rows stay
     disabled regardless (they can't be started anyway). */
  const startEnabled = isHead && !hasCurrent && !isError;
  const startTitle = isError
    ? 'Auftrag mit Parse-Fehler kann nicht gestartet werden.'
    : hasCurrent
    ? 'Aktiver Auftrag noch nicht abgeschlossen.'
    : !isHead
    ? 'Erst die obenstehenden Aufträge starten. Reihenfolge mit ↑/↓ oder „Sortieren" anpassen.'
    : undefined;

  return (
    <div style={{ display: 'grid', gap: 0 }}>
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={() => {
        onSelect?.();
        if (!isError) onToggleExpand?.();
      }}
      style={{
        position: 'relative',
        padding: '20px 24px',
        background: bg,
        borderStyle: 'solid',
        borderColor,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: isExpanded ? 0 : 1,
        borderRadius: isExpanded
          ? `${T.radius.lg}px ${T.radius.lg}px 0 0`
          : T.radius.lg,
        boxShadow: 'none',
        opacity: isDragging ? 0.4 : 1,
        cursor: 'pointer',
        transition: 'border-color 150ms, background 150ms, box-shadow 200ms, opacity 150ms',
        display: 'grid',
        gridTemplateColumns: 'auto auto 1fr auto',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {/* Drop-target hairline */}
      {isDropAbove && (
        <div style={{
          position: 'absolute',
          top: -2, left: 8, right: 8,
          height: 2, background: dropLineColor,
          borderRadius: 1,
        }} />
      )}
      {isDropBelow && (
        <div style={{
          position: 'absolute',
          bottom: -2, left: 8, right: 8,
          height: 2, background: dropLineColor,
          borderRadius: 1,
        }} />
      )}

      {/* Drag handle */}
      <span
        title="Ziehen zum Verschieben"
        style={{
          width: 18, height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.text.faint,
          cursor: 'grab',
          flexShrink: 0,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2" cy="2"  r="1.2" />
          <circle cx="8" cy="2"  r="1.2" />
          <circle cx="2" cy="7"  r="1.2" />
          <circle cx="8" cy="7"  r="1.2" />
          <circle cx="2" cy="12" r="1.2" />
          <circle cx="8" cy="12" r="1.2" />
        </svg>
      </span>

      {/* Position number */}
      <span style={{
        flex: '0 0 36px',
        fontSize: 12.5,
        fontFamily: T.font.mono,
        color: isHead ? T.accent.text : T.text.faint,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 500,
        textAlign: 'right',
      }}>
        {String(queueIdx + 1).padStart(2, '0')}
      </span>

      {/* MAIN body */}
      <div style={{ minWidth: 0 }}>
        {/* Title row: FBA + status badges */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 6,
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 17,
            fontWeight: 500,
            color: T.text.primary,
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 320,
          }}>
            {fba}
          </span>
          {isError ? <Badge tone="danger">Parse-Fehler</Badge>
            : validErrors > 0 ? <Badge tone="danger">{validErrors} Fehler</Badge>
            : validWarns > 0 ? <Badge tone="warn">{validWarns} Warnungen</Badge>
            : <Badge tone="success">Validiert</Badge>}
          {isHead && <Badge tone="accent">Nächster</Badge>}
        </div>

        {/* Sub line: filename + relative time */}
        <div style={{
          fontSize: 12.5,
          color: T.text.faint,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 360,
          }} title={entry.fileName}>
            {entry.fileName}
          </span>
          {entry.addedAt && (
            <>
              <span style={{ color: T.border.strong }}>·</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtRel(entry.addedAt)}
              </span>
            </>
          )}
        </div>

        {/* Fingerprint row: level bars + flag pills.
            `fp` is null for queued entries whose `parsed` isn't in the
            client cache yet (list endpoint slims parsed during the
            brief window between create and refetch settle). Render
            nothing in that case — the row's other stats stay visible. */}
        {!isError && fp && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}>
            <LevelBars lvlCounts={fp.lvlCounts} />
            <FingerprintFlags fp={fp} />
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: 'flex',
          gap: 22,
          fontSize: 12.5,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
          flexWrap: 'wrap',
        }}>
          <Stat label="Paletten"  value={entry._palletCount} />
          <Stat label="Artikel"   value={entry._articleCount} />
          <Stat label="Einheiten" value={entry._units.toLocaleString('de-DE')} />
          {!isError && (
            <Stat
              label="ETA"
              value={`≈ ${fmtDuration(entry._etaSec)}`}
              accent
            />
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }} onClick={(e) => e.stopPropagation()}>
        <IconBtn onClick={onUp} disabled={!onUp} title="Nach oben">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 9l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconBtn>
        <IconBtn onClick={onDown} disabled={!onDown} title="Nach unten">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconBtn>
        <IconBtn onClick={onRemove} title="Entfernen">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </IconBtn>
        <span style={{ width: 8 }} />
        <Button
          size="sm"
          variant={startEnabled ? 'primary' : 'ghost'}
          onClick={onStart}
          disabled={!startEnabled}
          title={startTitle}
        >
          {startEnabled ? 'Starten' : 'Wählen'}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 6h6m0 0L6 3m3 3L6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
      </div>
    </div>
    {isExpanded && !isError && (
      <PalletPreviewPanel entry={entry} borderColor={borderColor} />
    )}
    </div>
  );
}

/* ════════ Pallet-Vorschau panel ════════════════════════════════════════
   Inline accordion under a queue row. Read-only — surfaces what the
   worker will see in Pruefen so they can prioritize without entering
   the workflow. Detail is lazy-fetched (queue-list payload is slim)
   and cached forever — queue rows are immutable until startEntry.
   Visually the panel reads as a continuation of the queue-row card:
   it carries the same outer border colour, snaps under the row with
   no double-border seam, and uses a flat surface tone so it doesn't
   compete with the row's accent. */
type PreviewItem = {
  title?: string;
  units?: number;
  fnsku?: string;
  sku?: string;
  ean?: string;
  level?: number;
  category?: string;
  useItem?: string | null;
};
type PreviewPallet = {
  id?: string;
  hasFourSideWarning?: boolean;
  items?: PreviewItem[];
  einzelneSkuItems?: unknown[];
};

function PalletPreviewPanel({
  entry, borderColor,
}: {
  entry: { id: string; parsed?: { pallets?: unknown[]; einzelneSkuItems?: unknown[] } | null | undefined };
  borderColor: string;
}) {
  /* Reuse Historie's ['auftrag', id] cache — same fetcher, same
     immutability assumption — so re-opening a row that was previewed
     before (or seen in Historie) hits cache without HTTP. */
  const detailQ = useQuery({
    queryKey: ['auftrag', entry.id],
    queryFn: () => getAuftrag(entry.id),
    staleTime: Infinity,
    refetchInterval: false,
    enabled: !entry.parsed?.pallets,
    initialData: entry.parsed?.pallets ? (entry as unknown as Awaited<ReturnType<typeof getAuftrag>>) : undefined,
  });

  const parsed = (detailQ.data?.parsed ?? entry.parsed) as
    | { pallets?: unknown[]; einzelneSkuItems?: unknown[] }
    | null
    | undefined;
  const pallets = (parsed?.pallets as PreviewPallet[] | undefined) || [];
  const einzelneSkuItems = (parsed?.einzelneSkuItems as unknown[]) || [];

  const sortedPallets = useMemo(
    () => (pallets.length ? (sortPallets(pallets) as PreviewPallet[]) : []),
    [pallets],
  );

  /* Shell sits flush against the row above: same border colour, no top
     border, no top radius — they read as one card. */
  const shell: React.CSSProperties = {
    borderStyle: 'solid',
    borderColor,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderBottomLeftRadius: T.radius.lg,
    borderBottomRightRadius: T.radius.lg,
    background: T.bg.surface,
    fontFamily: T.font.ui,
    overflow: 'hidden',
  };

  if (detailQ.isPending && !parsed) {
    return (
      <div style={{ ...shell, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10, color: T.text.subtle, fontSize: 13 }}>
        <Spinner /> Vorschau wird geladen…
      </div>
    );
  }
  if (detailQ.isError && !parsed) {
    return (
      <div style={{ ...shell, padding: '20px 24px', color: T.status.danger.text, fontSize: 13 }}>
        Vorschau konnte nicht geladen werden.
      </div>
    );
  }
  if (!sortedPallets.length) {
    return (
      <div style={{ ...shell, padding: '20px 24px', color: T.text.subtle, fontSize: 13 }}>
        Keine Paletten in diesem Auftrag.
      </div>
    );
  }

  const totalUnits = sortedPallets.reduce((s, p) => {
    return s + (p.items || []).reduce((u, it) => u + (Number(it.units) || 0), 0);
  }, 0);
  const totalItems = sortedPallets.reduce((s, p) => s + (p.items?.length || 0), 0);

  return (
    <div style={shell}>
      {/* Subtle separator line, then a compact summary band */}
      <div style={{
        height: 1,
        background: T.border.subtle,
        margin: '0 24px',
      }} />
      <div style={{
        padding: '14px 24px 6px',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 11,
          color: T.text.faint,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}>
          Vorschau
        </span>
        <span style={{
          fontSize: 12,
          color: T.text.faint,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.005em',
        }}>
          {sortedPallets.length} Paletten · {totalItems} Positionen · {totalUnits.toLocaleString('de-DE')} Einheiten
          {einzelneSkuItems.length > 0 && ` · ${einzelneSkuItems.length} ESKU`}
        </span>
      </div>

      <div style={{
        padding: '6px 0 8px',
        maxHeight: 460,
        overflowY: 'auto',
      }}>
        {sortedPallets.map((p, idx) => (
          <PalletPreviewSection
            key={p.id || idx}
            pallet={p}
            index={idx}
            isLast={idx === sortedPallets.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function PalletPreviewSection({
  pallet, index, isLast,
}: {
  pallet: PreviewPallet;
  index: number;
  isLast: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const items = pallet.items || [];
  const eskuOnPallet = pallet.einzelneSkuItems?.length || 0;
  const totalUnits = items.reduce((s, it) => s + (Number(it.units) || 0), 0);
  const palletLabel = pallet.id || `P${index + 1}`;

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pallet.id || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(pallet.id).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1400); },
      () => { /* clipboard denied — silent */ },
    );
  };

  return (
    <section style={{
      padding: '10px 24px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${T.border.subtle}`,
    }}>
      {/* Header row: pallet label + badges */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: items.length ? 10 : 0,
      }}>
        <span style={{
          fontFamily: T.font.mono,
          fontSize: 11,
          fontWeight: 600,
          color: T.text.faint,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.04em',
          minWidth: 22,
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <button
          onClick={copy}
          title={pallet.id ? 'Paletten-ID kopieren' : ''}
          style={{
            fontFamily: T.font.mono,
            fontSize: 13.5,
            fontWeight: 500,
            color: T.text.primary,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: pallet.id ? 'pointer' : 'default',
            letterSpacing: '-0.01em',
          }}
        >
          {palletLabel}
          {copied && (
            <span style={{ marginLeft: 8, fontSize: 11, color: T.accent.text, letterSpacing: 0 }}>
              kopiert
            </span>
          )}
        </button>
        <span style={{
          fontSize: 12,
          color: T.text.faint,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {items.length} Pos. · {totalUnits.toLocaleString('de-DE')} Einh.
        </span>
        <span style={{ flex: 1 }} />
        {pallet.hasFourSideWarning && <Badge tone="warn">4-Seiten</Badge>}
        {eskuOnPallet > 0 && <Badge tone="accent">ESKU {eskuOnPallet}</Badge>}
      </div>

      {/* Items list */}
      {items.length > 0 && (
        <ol style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gap: 0,
        }}>
          {items.map((it, i) => (
            <PalletPreviewItem key={i} item={it} />
          ))}
        </ol>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function PalletPreviewItem({ item }: { item: PreviewItem }) {
  const lvl = getDisplayLevel(item) as number;
  const meta = LEVEL_META[lvl] || LEVEL_META[1];
  const code = item.fnsku || item.sku || item.ean || '—';
  const title = formatItemTitle(item.title || '');
  const qty = Number(item.units) || 0;
  return (
    <li style={{
      display: 'grid',
      gridTemplateColumns: '24px minmax(0, 1fr) auto auto',
      alignItems: 'center',
      gap: 12,
      fontSize: 13,
      color: T.text.secondary,
      padding: '7px 0',
      borderTop: `1px solid ${T.border.subtle}`,
    }}>
      <span
        title={meta.name}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 18,
          fontFamily: T.font.mono,
          fontSize: 10.5,
          fontWeight: 600,
          borderRadius: T.radius.sm,
          background: meta.bg,
          color: meta.text,
          letterSpacing: '0.02em',
        }}
      >
        L{lvl}
      </span>
      <span
        title={item.title || ''}
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: T.text.primary,
          letterSpacing: '-0.005em',
        }}
      >
        {title || '—'}
      </span>
      <span style={{
        fontFamily: T.font.mono,
        fontSize: 11.5,
        color: T.text.faint,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {code}
      </span>
      <span style={{
        fontVariantNumeric: 'tabular-nums',
        fontFamily: T.font.mono,
        fontSize: 12,
        color: qty ? T.text.primary : T.text.faint,
        minWidth: 56,
        textAlign: 'right',
        letterSpacing: '-0.005em',
      }}>
        {qty ? `${qty.toLocaleString('de-DE')}×` : '—'}
      </span>
    </li>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function Spinner() {
  /* SVG-native rotation — avoids needing a CSS keyframe declaration. */
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <g>
        <circle cx="7" cy="7" r="5" stroke={T.border.strong} strokeWidth="1.5" opacity="0.3" />
        <path d="M12 7a5 5 0 0 0-5-5" stroke={T.accent.main} strokeWidth="1.5" strokeLinecap="round" />
        <animateTransform
          attributeName="transform"
          attributeType="XML"
          type="rotate"
          from="0 7 7"
          to="360 7 7"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function LevelBars({ lvlCounts }: { lvlCounts?: Record<string, number> }) {
  const max = Math.max(1, ...(Object.values(lvlCounts || {}) as number[]));
  const W = 6;
  const GAP = 3;
  const H = 28;
  return (
    <div
      title="Level-Verteilung (L1 Thermo · L2 Veit · L3 Öko · L4 Klebe · L5 Produktion · L6 Kernöl · L7 Tacho)"
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        height: H,
        gap: GAP,
        flexShrink: 0,
      }}
    >
      {[1, 2, 3, 4, 5, 6, 7].map((lvl) => {
        const v = lvlCounts?.[lvl] || 0;
        const h = v ? Math.max(2, Math.round((v / max) * H)) : 2;
        const meta = LEVEL_META[lvl];
        return (
          <span
            key={lvl}
            style={{
              width: W,
              height: h,
              borderRadius: 2,
              background: v ? meta.color : T.border.subtle,
              transition: 'height 200ms',
            }}
          />
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function FingerprintFlags({ fp }) {
  type Flag = { key: string; label: string; tone: 'neutral' | 'accent' | 'warn' | 'success' };
  const flags: Flag[] = [];
  if (fp.mixed > 0)
    flags.push({ key: 'mixed',  label: `${fp.mixed} Mixed`,           tone: 'neutral' });
  if (fp.singleSku > 0)
    flags.push({ key: 'single', label: `${fp.singleSku} Single-SKU`,  tone: 'neutral' });
  if (fp.eskuCount > 0)
    flags.push({ key: 'esku',   label: `${fp.eskuCount} ESKU`,        tone: 'accent' });
  if (fp.mitLst > 0)
    flags.push({ key: 'mitLst', label: `${fp.mitLst} mit LST`,        tone: 'warn' });
  if (fp.ohneLst > 0)
    flags.push({ key: 'ohne',   label: `${fp.ohneLst} ohne LST`,      tone: 'success' });

  if (!flags.length) return null;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    }}>
      {flags.map((f) => (
        <Badge key={f.key} tone={f.tone}>{f.label}</Badge>
      ))}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function Stat({ label, value, accent }: { label?: React.ReactNode; value?: React.ReactNode; accent?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ color: T.text.faint }}>{label}</span>
      <span style={{
        color: accent ? T.accent.text : T.text.secondary,
        fontWeight: 500,
      }}>
        {value}
      </span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function IconBtn({ onClick, disabled, title, active, children }: { onClick?: (e: React.MouseEvent) => void; disabled?: boolean; title?: string; active?: boolean; children?: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  const lit = !disabled && (hover || active);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 30, height: 30,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? T.bg.surface3 : lit ? T.bg.surface3 : 'transparent',
        border: '1px solid transparent',
        borderRadius: T.radius.sm,
        color: lit ? T.text.primary : T.text.subtle,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'background 150ms, color 150ms',
      }}
    >
      {children}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function KbdHints() {
  const items = [
    { k: 'j / k',  v: 'Navigieren' },
    { k: '⏎',      v: 'Starten' },
    { k: '⌘ ↑/↓', v: 'Verschieben' },
    { k: 'x',      v: 'Entfernen' },
    { k: '/',      v: 'Suche' },
  ];
  return (
    <div style={{
      marginTop: 36,
      paddingTop: 20,
      borderTop: `1px solid ${T.border.subtle}`,
      display: 'flex',
      gap: 24,
      flexWrap: 'wrap',
      fontSize: 11.5,
      color: T.text.faint,
      fontFamily: T.font.mono,
      letterSpacing: '0.04em',
    }}>
      {items.map((it) => (
        <span key={it.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Kbd>{it.k}</Kbd>
          <span>{it.v}</span>
        </span>
      ))}
    </div>
  );
}

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 22, height: 18,
      padding: '0 6px',
      fontSize: 10.5,
      fontFamily: T.font.mono,
      color: T.text.secondary,
      background: T.bg.surface3,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 3,
      lineHeight: 1,
    }}>
      {children}
    </span>
  );
}