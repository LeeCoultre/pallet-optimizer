/* Historie v2 — «Archiv & Performance».

   Magazine-spread design (matches Upload / Pruefen / Focus / Live):
     • Eyebrow + clamp(36–52) H1 + Lead — wide breathing room
     • Hero KPI strip (5 numbers): Aufträge / Paletten / Artikel / Gesamt /
       Ø-Dauer — throughput surfaces as the headline metric
     • «Bestleistungen» — 3 record cards (schnellster Auftrag, beste
       Min/Palette, beste Min/Artikel), clickable to jump to that row
     • 14-Tage Trend — daily completion sparkline + Ø-duration mini-tick,
       hover-tooltip with date and totals
     • Toolbar — search · date-range pills (Heute / Woche / Monat / Alle) ·
       sort dropdown · xlsx export (calls existing downloadAuftraegeXlsx)
     • Per-user breakdown bar — appears when >1 user in scope; click pill
       to filter feed
     • Card-row v2 — FBA hero, pallet-timings sparkline, comparison
       badge (−18% vs Ø / +22% vs Ø), throughput EH/min, user-pill
     • Expanded detail — timing-Gantt for Palettenzeiten + lazy articles
     • Keyboard cockpit — j/k navigate · Enter expand · / focus search ·
       e export

   Backend unchanged — all analytics computed client-side from existing
   /api/history Summary fields. Detail (parsed pallets) is still
   lazy-fetched on row open via /api/auftraege/{id}.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../state.jsx';
import { getAuftrag, downloadAuftraegeXlsx } from '../marathonApi.js';
import {
  Page, Topbar, Card, Eyebrow, Lead, EmptyState, Button, Badge, T,
} from '../components/ui.jsx';
import { LEVEL_META, getDisplayLevel } from '../utils/auftragHelpers.js';

const RANGE_PRESETS = [
  { id: 'today', label: 'Heute' },
  { id: 'week',  label: 'Woche' },
  { id: 'month', label: 'Monat' },
  { id: 'all',   label: 'Alle' },
];

const SORT_OPTIONS = [
  { id: 'newest',   label: 'Neueste' },
  { id: 'oldest',   label: 'Älteste' },
  { id: 'longest',  label: 'Längste Dauer' },
  { id: 'shortest', label: 'Kürzeste Dauer' },
  { id: 'pallets',  label: 'Meiste Paletten' },
];

const TREND_DAYS = 14;

/* ════════════════════════════════════════════════════════════════════════ */
export default function HistorieScreen() {
  const { history, removeHistoryEntry, clearHistory } = useAppState();

  const [openId, setOpenId]       = useState(null);
  const [search, setSearch]       = useState('');
  const [range, setRange]         = useState('all');
  const [sort, setSort]           = useState('newest');
  const [userFilter, setUserFilter] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [exporting, setExporting] = useState(false);

  const searchRef = useRef(null);

  /* Enrich each entry with throughput + comparison values. */
  const enriched = useMemo(
    () => history.map((h) => {
      const minPerPallet  = h.palletCount  > 0 ? h.durationSec / h.palletCount  / 60 : null;
      const minPerArticle = h.articleCount > 0 ? h.durationSec / h.articleCount / 60 : null;
      const ehPerMin      = h.durationSec > 0
        ? (sumUnitsFromTimings(h)
           ?? estimateUnitsFromArticles(h.articleCount))
          / (h.durationSec / 60)
        : null;
      return {
        ...h,
        _minPerPallet: minPerPallet,
        _minPerArticle: minPerArticle,
        _ehPerMin: ehPerMin,
      };
    }),
    [history],
  );

  /* Personal medians (over the entire history scope, not just visible). */
  const stats = useMemo(() => {
    if (!enriched.length) return { medianDur: 0, medianMinPerPallet: 0, medianMinPerArticle: 0 };
    return {
      medianDur:           median(enriched.map((e) => e.durationSec).filter(Boolean)),
      medianMinPerPallet:  median(enriched.map((e) => e._minPerPallet).filter((v) => v != null)),
      medianMinPerArticle: median(enriched.map((e) => e._minPerArticle).filter((v) => v != null)),
    };
  }, [enriched]);

  /* Personal records — across full history, not filtered. */
  const records = useMemo(() => computeRecords(enriched), [enriched]);

  /* Per-user breakdown across full history scope. */
  const userBreakdown = useMemo(() => {
    const m = new Map();
    for (const e of enriched) {
      const u = e.assignedToUserName || '—';
      m.set(u, (m.get(u) || 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [enriched]);

  /* Date-range filter helper. */
  const rangeStart = useMemo(() => {
    const now = new Date();
    if (range === 'today') {
      const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime();
    }
    if (range === 'week') {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - 7); return d.getTime();
    }
    if (range === 'month') {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      d.setMonth(d.getMonth() - 1); return d.getTime();
    }
    return null;
  }, [range]);

  /* Visible (filtered + sorted) list. */
  const visible = useMemo(() => {
    let arr = enriched;
    if (rangeStart != null) arr = arr.filter((e) => (e.finishedAt || 0) >= rangeStart);
    if (userFilter) arr = arr.filter((e) => (e.assignedToUserName || '—') === userFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((e) => {
        return (e.fbaCode  || '').toLowerCase().includes(q)
            || (e.fileName || '').toLowerCase().includes(q);
      });
    }
    return sortEntries(arr, sort);
  }, [enriched, rangeStart, userFilter, search, sort]);

  /* Visible KPIs (recompute over filter scope so the strip mirrors what
     the user sees in the list, not the entire archive). */
  const totals = useMemo(() => {
    const t = visible.reduce((acc, h) => ({
      orders:   acc.orders + 1,
      pallets:  acc.pallets + (h.palletCount || 0),
      articles: acc.articles + (h.articleCount || 0),
      seconds:  acc.seconds + (h.durationSec || 0),
    }), { orders: 0, pallets: 0, articles: 0, seconds: 0 });
    t.avgSec = t.orders > 0 ? Math.round(t.seconds / t.orders) : 0;
    return t;
  }, [visible]);

  /* 14-day trend over full history scope. */
  const trend = useMemo(() => buildTrend(enriched, TREND_DAYS), [enriched]);

  /* Clamp selectedIdx as visible shrinks. */
  useEffect(() => {
    if (selectedIdx >= visible.length) setSelectedIdx(Math.max(0, visible.length - 1));
  }, [visible.length, selectedIdx]);

  /* Keyboard cockpit. */
  const onExport = useCallback(async () => {
    try {
      setExporting(true);
      const params = {};
      if (rangeStart) params.from = new Date(rangeStart).toISOString().slice(0, 10);
      await downloadAuftraegeXlsx(params);
    } catch (err) {
      alert('Export fehlgeschlagen: ' + (err?.message || 'unbekannter Fehler'));
    } finally {
      setExporting(false);
    }
  }, [rangeStart]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
      if (e.key === '/' && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current.blur();
        if (search) setSearch('');
        return;
      }
      if (inField) return;
      if (e.key === 'e' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!exporting) onExport();
        return;
      }
      if (!visible.length) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(visible.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = visible[selectedIdx];
        if (target) setOpenId((id) => id === target.id ? null : target.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selectedIdx, search, exporting, onExport]);

  const hasAny = enriched.length > 0;
  const noResults = hasAny && visible.length === 0;

  return (
    <Page>
      <Topbar
        crumbs={[{ label: 'Historie' }]}
        right={
          <span style={{
            fontSize: 12.5,
            color: T.text.subtle,
            fontFamily: T.font.mono,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.02em',
          }}>
            {hasAny ? `${enriched.length} Einträge im Archiv` : 'Archiv leer'}
          </span>
        }
      />

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 40px 96px' }}>
        {/* HEADER */}
        <header style={{ marginBottom: 48 }}>
          <Eyebrow>Archiv · {enriched.length} {enriched.length === 1 ? 'Auftrag' : 'Aufträge'}</Eyebrow>
          <h1 style={{
            fontFamily: T.font.ui,
            fontSize: 'clamp(36px, 2.8vw, 52px)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            color: T.text.primary,
            margin: 0,
          }}>
            Historie
          </h1>
          <Lead style={{ marginTop: 16, maxWidth: 720, fontSize: 16 }}>
            Alle abgeschlossenen Aufträge. Wer was wann geschafft hat,
            wo Rekorde gefallen sind, welcher Auftrag aus der Reihe tanzt.
            Ein Klick holt Palettenzeiten und Artikel-Details.
          </Lead>
        </header>

        {!hasAny ? (
          <EmptyState
            icon={
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M3 12a9 9 0 1 0 2.4-6.15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M3 4v4.5h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="Noch keine Aufträge abgeschlossen"
            description="Sobald du den ersten Lagerauftrag durchgearbeitet hast, erscheint er hier mit allen Details."
          />
        ) : (
          <>
            {/* HERO KPI STRIP — visible scope */}
            <KpiStrip totals={totals} />

            {/* PERSONAL RECORDS */}
            {records.fastest && (
              <RecordsRow
                records={records}
                onJump={(id) => { setOpenId(id); }}
              />
            )}

            {/* 14-DAY TREND */}
            <TrendCard trend={trend} />

            {/* TOOLBAR */}
            <Toolbar
              search={search}
              onSearch={setSearch}
              range={range}
              onRange={setRange}
              sort={sort}
              onSort={setSort}
              onExport={onExport}
              exporting={exporting}
              onClear={clearHistory}
              hasAny={hasAny}
              searchRef={searchRef}
            />

            {/* PER-USER BREAKDOWN */}
            {userBreakdown.length > 1 && (
              <UserBar
                items={userBreakdown}
                active={userFilter}
                onPick={setUserFilter}
              />
            )}

            {/* LIST */}
            {noResults ? (
              <Card style={{ padding: '40px 32px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: T.text.subtle, marginBottom: 16 }}>
                  Keine Einträge passen zu Suche oder Filter.
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearch(''); setRange('all'); setUserFilter(null); }}
                >
                  Filter zurücksetzen
                </Button>
              </Card>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {visible.map((entry, idx) => (
                  <RowCard
                    key={entry.id}
                    entry={entry}
                    idx={idx}
                    isSelected={idx === selectedIdx}
                    isOpen={openId === entry.id}
                    showUser={userBreakdown.length > 1}
                    medianDur={stats.medianDur}
                    onSelect={() => setSelectedIdx(idx)}
                    onToggle={() => {
                      setSelectedIdx(idx);
                      setOpenId(openId === entry.id ? null : entry.id);
                    }}
                    onRemove={() => removeHistoryEntry(entry.id)}
                  />
                ))}
              </div>
            )}

            <KbdHints />
          </>
        )}
      </main>
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════════════════ */
function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sumUnitsFromTimings(/* h */) {
  /* History Summary doesn't ship units; return null so the throughput
     falls back to articleCount-based estimate. */
  return null;
}
function estimateUnitsFromArticles(articleCount) {
  /* Conservative units-per-article default for archive throughput
     display only. The exact number is fine for the row badge — what
     matters is relative comparison, not absolute accuracy. */
  return (articleCount || 0) * 8;
}

function computeRecords(enriched) {
  const valid = enriched.filter((e) => (e.durationSec || 0) > 60);
  if (!valid.length) return { fastest: null, bestPerPallet: null, bestPerArticle: null };

  const fastest        = valid.reduce((best, e) => !best || e.durationSec < best.durationSec ? e : best, null);
  const bestPerPallet  = valid.filter((e) => e._minPerPallet  != null)
    .reduce((best, e) => !best || e._minPerPallet  < best._minPerPallet  ? e : best, null);
  const bestPerArticle = valid.filter((e) => e._minPerArticle != null)
    .reduce((best, e) => !best || e._minPerArticle < best._minPerArticle ? e : best, null);

  return { fastest, bestPerPallet, bestPerArticle };
}

function buildTrend(enriched, days) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    buckets.push({
      ms: d.getTime(),
      label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      shortDay: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()],
      count: 0,
      totalSec: 0,
    });
  }
  const minMs = buckets[0].ms;
  const maxMs = buckets[buckets.length - 1].ms + 86_400_000;
  for (const e of enriched) {
    const t = e.finishedAt;
    if (!t || t < minMs || t >= maxMs) continue;
    const idx = Math.floor((t - minMs) / 86_400_000);
    const b = buckets[idx];
    if (!b) continue;
    b.count += 1;
    b.totalSec += (e.durationSec || 0);
  }
  return buckets.map((b) => ({
    ...b,
    avgSec: b.count ? Math.round(b.totalSec / b.count) : 0,
  }));
}

function sortEntries(arr, sort) {
  const c = [...arr];
  if (sort === 'newest')   c.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  if (sort === 'oldest')   c.sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
  if (sort === 'longest')  c.sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0));
  if (sort === 'shortest') c.sort((a, b) => (a.durationSec || 0) - (b.durationSec || 0));
  if (sort === 'pallets')  c.sort((a, b) => (b.palletCount || 0) - (a.palletCount || 0));
  return c;
}

function fmtDurationLong(sec) {
  if (!sec || sec < 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h}h ${String(m).padStart(2, '0')} min`;
}
function fmtDurationShort(sec) {
  if (!sec || sec < 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtMmSs(sec) {
  if (sec == null || sec < 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtTimestamp(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
function fmtRelative(ms) {
  if (!ms) return '—';
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 60)    return 'gerade eben';
  if (sec < 3600)  return `vor ${Math.round(sec / 60)} min`;
  if (sec < 86400) return `vor ${Math.round(sec / 3600)} h`;
  const d = Math.round(sec / 86400);
  if (d < 7)       return `vor ${d} T`;
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/* ════════════════════════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════════════════════════ */
function KpiStrip({ totals }) {
  return (
    <div style={{
      marginBottom: 24,
      padding: '24px 28px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.lg,
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 8,
    }}>
      <Kpi label="Aufträge"  value={totals.orders} />
      <Kpi label="Paletten"  value={totals.pallets} />
      <Kpi label="Artikel"   value={totals.articles.toLocaleString('de-DE')} />
      <Kpi label="Gesamt"    value={fmtDurationLong(totals.seconds)} />
      <Kpi label="Ø Auftrag" value={totals.avgSec ? fmtDurationLong(totals.avgSec) : '—'} accent />
    </div>
  );
}
function Kpi({ label, value, accent }) {
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
function RecordsRow({ records, onJump }) {
  const cards = [
    {
      key: 'fastest',
      label: 'Schnellster Auftrag',
      icon: '🥇',
      entry: records.fastest,
      value: records.fastest ? fmtDurationShort(records.fastest.durationSec) : '—',
      sub: records.fastest ? `${records.fastest.palletCount} Paletten · ${records.fastest.articleCount} Artikel` : null,
    },
    {
      key: 'bestPallet',
      label: 'Beste Min/Palette',
      icon: '⚡',
      entry: records.bestPerPallet,
      value: records.bestPerPallet ? `${records.bestPerPallet._minPerPallet.toFixed(1)} min` : '—',
      sub: records.bestPerPallet ? `${records.bestPerPallet.palletCount} Paletten gesamt` : null,
    },
    {
      key: 'bestArticle',
      label: 'Beste Min/Artikel',
      icon: '📈',
      entry: records.bestPerArticle,
      value: records.bestPerArticle ? `${records.bestPerArticle._minPerArticle.toFixed(2)} min` : '—',
      sub: records.bestPerArticle ? `${records.bestPerArticle.articleCount} Artikel gesamt` : null,
    },
  ];
  return (
    <div style={{
      marginBottom: 24,
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 12,
    }}>
      {cards.map((c) => (
        <RecordCard
          key={c.key}
          card={c}
          onClick={c.entry ? () => onJump(c.entry.id) : null}
        />
      ))}
    </div>
  );
}

function RecordCard({ card, onClick }) {
  const [hover, setHover] = useState(false);
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '18px 20px',
        background: T.bg.surface,
        border: `1px solid ${clickable && hover ? T.accent.border : T.border.primary}`,
        borderRadius: T.radius.lg,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 160ms ease',
        boxShadow: clickable && hover ? '0 1px 3px rgba(17,24,39,0.04), 0 8px 24px -16px rgba(99,102,241,0.20)' : 'none',
        transform: clickable && hover ? 'translateY(-1px)' : 'none',
      }}
    >
      <div style={{
        display: 'flex',
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
        <span style={{ fontSize: 14 }}>{card.icon}</span>
        {card.label}
      </div>
      <div style={{
        fontFamily: T.font.ui,
        fontSize: 28,
        fontWeight: 500,
        letterSpacing: '-0.025em',
        color: T.text.primary,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>
        {card.value}
      </div>
      {card.entry && (
        <div style={{
          marginTop: 8,
          fontSize: 12.5,
          color: T.text.muted,
          fontFamily: T.font.mono,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {card.entry.fbaCode || card.entry.fileName}
        </div>
      )}
      {card.sub && (
        <div style={{
          marginTop: 4,
          fontSize: 11.5,
          color: T.text.faint,
        }}>
          {card.sub}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function TrendCard({ trend }) {
  const max = Math.max(1, ...trend.map((b) => b.count));
  const totalCount = trend.reduce((s, b) => s + b.count, 0);
  const totalSec   = trend.reduce((s, b) => s + b.totalSec, 0);
  const avgSec     = totalCount ? Math.round(totalSec / totalCount) : 0;

  return (
    <Card padding={20} style={{
      marginBottom: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: 10.5,
            fontFamily: T.font.mono,
            fontWeight: 600,
            color: T.text.subtle,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
          }}>
            14-Tage Trend
          </div>
          <div style={{
            fontSize: 12,
            color: T.text.faint,
            marginTop: 2,
          }}>
            Aufträge pro Tag · ø {avgSec ? fmtDurationLong(avgSec) : '—'} Dauer
          </div>
        </div>
        <span style={{
          fontSize: 12,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: T.font.mono,
        }}>
          {totalCount} Aufträge
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${trend.length}, 1fr)`,
        gap: 5,
        height: 80,
        alignItems: 'end',
      }}>
        {trend.map((b) => (
          <TrendBar key={b.ms} bucket={b} max={max} />
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${trend.length}, 1fr)`,
        gap: 5,
        fontSize: 10,
        fontFamily: T.font.mono,
        color: T.text.faint,
        textAlign: 'center',
      }}>
        {trend.map((b, i) => (
          <span key={b.ms}>{i % 2 === 0 ? b.label : '·'}</span>
        ))}
      </div>
    </Card>
  );
}

function TrendBar({ bucket, max }) {
  const [hover, setHover] = useState(false);
  const h = bucket.count ? Math.max(4, Math.round((bucket.count / max) * 70)) : 3;
  const isToday = (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return bucket.ms === today.getTime();
  })();
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div style={{
        height: h,
        borderRadius: 3,
        background: bucket.count
          ? (isToday ? T.accent.main : 'var(--accent)')
          : T.border.subtle,
        opacity: bucket.count
          ? (isToday ? 1 : Math.max(0.45, bucket.count / max))
          : 1,
        transition: 'opacity 160ms, transform 160ms',
        transform: hover ? 'scaleY(1.04)' : 'none',
        transformOrigin: 'bottom',
      }} />
      {hover && bucket.count > 0 && (
        <div style={{
          position: 'absolute',
          bottom: h + 6,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '5px 10px',
          fontSize: 11,
          fontFamily: T.font.mono,
          color: T.text.primary,
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: T.radius.sm,
          whiteSpace: 'nowrap',
          boxShadow: T.shadow.card,
          pointerEvents: 'none',
          zIndex: 4,
        }}>
          <div style={{ fontWeight: 600 }}>
            {bucket.shortDay}, {bucket.label}
          </div>
          <div style={{ marginTop: 3, color: T.text.subtle }}>
            {bucket.count} {bucket.count === 1 ? 'Auftrag' : 'Aufträge'} · ø {fmtDurationLong(bucket.avgSec)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function Toolbar({
  search, onSearch, range, onRange, sort, onSort,
  onExport, exporting, onClear, hasAny, searchRef,
}) {
  return (
    <div style={{
      marginBottom: 14,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 10,
    }}>
      {/* Search */}
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
          placeholder="FBA oder Dateiname  ·  /"
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

      {/* Range pills */}
      {RANGE_PRESETS.map((p) => (
        <Chip key={p.id} active={range === p.id} onClick={() => onRange(p.id)}>
          {p.label}
        </Chip>
      ))}

      <span style={{ flex: 1 }} />

      {/* Sort dropdown */}
      <SortSelect value={sort} onChange={onSort} />

      {/* Export */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onExport}
        disabled={exporting}
        title="xlsx-Export (E)"
      >
        {exporting ? 'lädt…' : 'xlsx Export'}
        {!exporting && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1.5v7m0 0L3 6m3 2.5L9 6M2 10.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </Button>

      {hasAny && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Alle löschen
        </Button>
      )}
    </div>
  );
}

function Chip({ children, active, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
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

function SortSelect({ value, onChange }) {
  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: T.text.subtle,
      fontFamily: T.font.mono,
      letterSpacing: '0.04em',
    }}>
      <span>Sort:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 30,
          padding: '0 26px 0 10px',
          fontSize: 12.5,
          fontFamily: T.font.ui,
          color: T.text.primary,
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: T.radius.full,
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'><path d='M1 1l4 4 4-4' stroke='%239CA3AF' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
function UserBar({ items, active, onPick }) {
  const total = items.reduce((s, x) => s + x.count, 0);
  return (
    <div style={{
      marginBottom: 18,
      padding: '10px 14px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.full,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
      }}>
        Operatoren
      </span>
      <UserPill
        active={active === null}
        onClick={() => onPick(null)}
        label="Alle"
        count={total}
      />
      {items.map((u) => (
        <UserPill
          key={u.name}
          active={active === u.name}
          onClick={() => onPick(active === u.name ? null : u.name)}
          label={u.name}
          count={u.count}
        />
      ))}
    </div>
  );
}

function UserPill({ active, onClick, label, count }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 24,
        padding: '0 10px',
        fontSize: 11.5,
        fontWeight: 500,
        fontFamily: T.font.ui,
        background: active ? T.accent.bg : (hover ? T.bg.surface3 : 'transparent'),
        border: `1px solid ${active ? T.accent.border : 'transparent'}`,
        color: active ? T.accent.text : T.text.secondary,
        borderRadius: T.radius.full,
        cursor: 'pointer',
        transition: 'all 150ms',
      }}
    >
      {label}
      <span style={{
        fontFamily: T.font.mono,
        fontSize: 10.5,
        color: active ? T.accent.text : T.text.faint,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {count}
      </span>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Row card — magazine-spread variant
   ════════════════════════════════════════════════════════════════════════ */
function RowCard({
  entry, idx, isSelected, isOpen, showUser, medianDur,
  onSelect, onToggle, onRemove,
}) {
  const fba = entry.fbaCode || entry.fileName;
  const palTimings = useMemo(
    () => Object.values(entry.palletTimings || {})
      .map((t) => (t.startedAt && t.finishedAt) ? Math.round((t.finishedAt - t.startedAt) / 1000) : null)
      .filter((v) => v != null),
    [entry.palletTimings],
  );
  const ehPerMin = entry._ehPerMin;
  const cmpPct = medianDur > 0 && entry.durationSec
    ? Math.round(((entry.durationSec - medianDur) / medianDur) * 100)
    : null;

  return (
    <div
      onClick={() => { onSelect(); onToggle(); }}
      style={{
        background: T.bg.surface,
        border: `1px solid ${isSelected ? T.text.primary : T.border.primary}`,
        borderRadius: T.radius.lg,
        cursor: 'pointer',
        transition: 'border-color 150ms, box-shadow 200ms',
        overflow: 'hidden',
        boxShadow: isOpen ? '0 1px 3px rgba(17,24,39,0.04), 0 16px 40px -20px rgba(17,24,39,0.18)' : 'none',
      }}
    >
      <div style={{
        padding: '20px 24px',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 16,
      }}>
        {/* Position */}
        <span style={{
          flex: '0 0 36px',
          fontSize: 12.5,
          fontFamily: T.font.mono,
          color: T.text.faint,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 500,
          textAlign: 'right',
        }}>
          {String(idx + 1).padStart(2, '0')}
        </span>

        {/* MAIN */}
        <div style={{ minWidth: 0 }}>
          {/* Title row */}
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
            {showUser && entry.assignedToUserName && (
              <Badge tone="neutral">{entry.assignedToUserName}</Badge>
            )}
            {cmpPct != null && Math.abs(cmpPct) >= 5 && (
              <ComparisonBadge pct={cmpPct} />
            )}
          </div>

          {/* Sub */}
          <div style={{
            fontSize: 12.5,
            color: T.text.faint,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}>
            <span title={entry.fileName} style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 360,
            }}>
              {entry.fileName}
            </span>
            <span style={{ color: T.border.strong }}>·</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }} title={fmtTimestamp(entry.finishedAt)}>
              {fmtRelative(entry.finishedAt)}
            </span>
          </div>

          {/* Pallet-Timings sparkline */}
          {palTimings.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <PalletSparkline timings={palTimings} totalCount={entry.palletCount} />
            </div>
          )}

          {/* Stats */}
          <div style={{
            display: 'flex',
            gap: 22,
            fontSize: 12.5,
            color: T.text.subtle,
            fontVariantNumeric: 'tabular-nums',
            flexWrap: 'wrap',
          }}>
            <Stat label="Paletten" value={entry.palletCount} />
            <Stat label="Artikel"  value={entry.articleCount} />
            <Stat label="Dauer"    value={fmtDurationShort(entry.durationSec)} accent />
            {ehPerMin != null && Number.isFinite(ehPerMin) && (
              <Stat label="EH/min" value={ehPerMin.toFixed(1)} />
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }} onClick={(e) => e.stopPropagation()}>
          <ChevronToggle open={isOpen} onClick={onToggle} />
          <IconBtn
            onClick={onRemove}
            title="Eintrag entfernen"
            danger
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </IconBtn>
        </div>
      </div>

      {/* Expanded detail */}
      {isOpen && (
        <ExpandedDetail entry={entry} onClose={() => onToggle()} />
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ color: T.text.faint }}>{label}</span>
      <span style={{
        color: accent ? T.accent.text : T.text.secondary,
        fontWeight: 500,
        fontFamily: accent ? T.font.mono : 'inherit',
      }}>
        {value}
      </span>
    </span>
  );
}

function ComparisonBadge({ pct }) {
  const faster = pct < 0;
  const palette = faster ? T.status.success : T.status.warn;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 700,
      fontFamily: T.font.mono,
      background: palette.bg,
      color: palette.text,
      border: `1px solid ${palette.border}`,
      borderRadius: T.radius.full,
      letterSpacing: '0.02em',
    }} title={`Differenz zum Median deiner Aufträge`}>
      {faster ? '−' : '+'}{Math.abs(pct)}% vs Ø
    </span>
  );
}

function PalletSparkline({ timings, totalCount }) {
  const max = Math.max(...timings, 1);
  return (
    <div
      title={`Palettenzeiten: ${timings.length} von ${totalCount} mit Daten`}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        height: 22,
        gap: 2,
      }}
    >
      {timings.map((t, i) => {
        const h = Math.max(2, Math.round((t / max) * 22));
        const isPeak = t === max && timings.length > 1;
        return (
          <span
            key={i}
            title={`${i + 1}. Palette · ${fmtMmSs(t)}`}
            style={{
              width: 5,
              height: h,
              background: isPeak ? T.status.warn.main : T.accent.main,
              opacity: isPeak ? 1 : Math.max(0.4, t / max),
              borderRadius: 1.5,
            }}
          />
        );
      })}
    </div>
  );
}

function ChevronToggle({ open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? 'Schließen' : 'Details öffnen'}
      style={{
        width: 30, height: 30,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        borderRadius: T.radius.sm,
        color: T.text.subtle,
        cursor: 'pointer',
        transition: 'transform 200ms ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function IconBtn({ children, onClick, title, danger }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 30, height: 30,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hover ? (danger ? T.status.danger.bg : T.bg.surface3) : 'transparent',
        border: 'none',
        borderRadius: T.radius.sm,
        color: hover ? (danger ? T.status.danger.text : T.text.primary) : T.text.faint,
        cursor: 'pointer',
        transition: 'background 150ms, color 150ms',
      }}
    >
      {children}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Expanded detail — Gantt timing + lazy article fetch
   ════════════════════════════════════════════════════════════════════════ */
function ExpandedDetail({ entry }) {
  const detailQ = useQuery({
    queryKey: ['auftrag', entry.id],
    queryFn: () => getAuftrag(entry.id),
    staleTime: Infinity,
    refetchInterval: false,
  });

  const articles = useMemo(() => {
    const pallets = detailQ.data?.parsed?.pallets || [];
    return pallets.flatMap((p) =>
      (p.items || []).map((it, i) => ({
        palletId: p.id,
        itemIdx:  i,
        sku:      it.sku,
        fnsku:    it.fnsku,
        title:    it.title,
        units:    it.units,
        useItem:  it.useItem,
        level:    getDisplayLevel(it),
      })),
    );
  }, [detailQ.data]);

  const palletGantt = useMemo(() => {
    /* Build [{id, level, durSec, startMs, endMs}] in pallet order. */
    const pallets = detailQ.data?.parsed?.pallets || [];
    const lookup = new Map(pallets.map((p) => [p.id, p]));
    const rows = [];
    for (const [id, t] of Object.entries(entry.palletTimings || {})) {
      if (!t.startedAt || !t.finishedAt) continue;
      const p = lookup.get(id);
      const items = p?.items || [];
      const lvl = items.length ? primaryLevelOf(items) : 1;
      rows.push({
        id,
        level: lvl,
        durSec: Math.round((t.finishedAt - t.startedAt) / 1000),
        startMs: t.startedAt,
        endMs:   t.finishedAt,
      });
    }
    rows.sort((a, b) => a.startMs - b.startMs);
    return rows;
  }, [entry.palletTimings, detailQ.data]);

  const ganttTotal = palletGantt.reduce((s, r) => s + r.durSec, 0);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        padding: '4px 24px 24px',
        background: T.bg.surface2,
        cursor: 'default',
        borderTop: `1px solid ${T.border.subtle}`,
      }}
    >
      {/* Palette-Gantt */}
      <SectionLabel
        title="Palettenzeiten"
        sub={`${palletGantt.length} von ${entry.palletCount} ${palletGantt.length === 1 ? 'Palette' : 'Paletten'} mit Daten · ${fmtDurationShort(ganttTotal)} kumuliert`}
      />
      {palletGantt.length === 0 ? (
        <div style={{
          padding: '14px 16px',
          fontSize: 12.5,
          color: T.text.faint,
          background: T.bg.surface,
          border: `1px dashed ${T.border.strong}`,
          borderRadius: T.radius.md,
          marginBottom: 24,
        }}>
          Keine Palettenzeiten erfasst.
        </div>
      ) : (
        <PalletGantt rows={palletGantt} totalSec={ganttTotal} />
      )}

      {/* Articles */}
      <div style={{ marginTop: 24 }}>
        <SectionLabel
          title="Artikel"
          sub={detailQ.isLoading ? 'lädt…' : `${articles.length} insgesamt`}
        />
        {detailQ.isError ? (
          <div style={{
            padding: '12px 14px',
            background: T.status.danger.bg,
            border: `1px solid ${T.status.danger.border}`,
            borderRadius: T.radius.md,
            color: T.status.danger.text,
            fontSize: 12.5,
          }}>
            Konnte Artikel nicht laden: {detailQ.error?.message || 'Fehler'}
          </div>
        ) : (
          <div style={{
            border: `1px solid ${T.border.primary}`,
            background: T.bg.surface,
            borderRadius: T.radius.md,
            overflow: 'hidden',
            maxHeight: 320,
            overflowY: 'auto',
          }}>
            <div style={articlesHeader}>
              <span>Palette</span>
              <span>Name</span>
              <span>Code</span>
              <span>Use-Item</span>
              <span style={{ textAlign: 'right' }}>Menge</span>
            </div>
            {detailQ.isLoading && (
              <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12.5, color: T.text.faint }}>
                Artikel werden geladen…
              </div>
            )}
            {!detailQ.isLoading && articles.length === 0 && (
              <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12.5, color: T.text.faint }}>
                Keine Artikel-Daten gespeichert.
              </div>
            )}
            {articles.slice(0, 200).map((a, j) => {
              const meta = LEVEL_META[a.level] || LEVEL_META[1];
              return (
                <div key={j} style={{
                  ...articlesRow,
                  borderBottom: j < articles.length - 1 ? `1px solid ${T.border.subtle}` : 'none',
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: T.font.mono, fontSize: 11.5 }}>
                    <span style={{
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: meta.color,
                      flexShrink: 0,
                    }} />
                    <span style={{ color: T.text.faint }}>{a.palletId}</span>
                  </span>
                  <span style={{ color: T.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title || '—'}
                  </span>
                  <span style={{ fontFamily: T.font.mono, fontSize: 11.5, color: T.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.fnsku || a.sku || '—'}
                  </span>
                  <span style={{ fontFamily: T.font.mono, fontSize: 11.5, color: T.text.subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.useItem || '—'}
                  </span>
                  <span style={{ fontWeight: 600, color: T.text.primary, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {a.units || 0}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PalletGantt({ rows, totalSec }) {
  const max = Math.max(...rows.map((r) => r.durSec), 1);
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '4px 0 8px',
    }}>
      {rows.map((r) => {
        const meta = LEVEL_META[r.level] || LEVEL_META[1];
        const widthPct = (r.durSec / max) * 100;
        const sharePct = totalSec > 0 ? (r.durSec / totalSec) * 100 : 0;
        return (
          <div key={r.id} style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 80px',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 11.5,
              fontWeight: 500,
              color: T.text.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }} title={r.id}>
              {r.id}
            </span>
            <div style={{
              position: 'relative',
              height: 18,
              background: T.bg.surface3,
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              <div
                title={`${meta.shortName} · ${fmtMmSs(r.durSec)} · ${sharePct.toFixed(0)}% Anteil`}
                style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  background: meta.color,
                  borderRadius: 4,
                  transition: 'width 320ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            </div>
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 11.5,
              fontWeight: 500,
              color: T.text.primary,
              fontVariantNumeric: 'tabular-nums',
              textAlign: 'right',
            }}>
              {fmtMmSs(r.durSec)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function primaryLevelOf(items) {
  /* Cheap inline reducer to avoid importing primaryLevel for one use. */
  const counts = {};
  for (const it of items) {
    const lvl = getDisplayLevel(it);
    counts[lvl] = (counts[lvl] || 0) + (it.units || 0);
  }
  let best = 1, bestN = -1;
  for (const [lvl, n] of Object.entries(counts)) {
    if (n > bestN) { bestN = n; best = parseInt(lvl, 10); }
  }
  return best;
}

function SectionLabel({ title, sub }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
      }}>
        {title}
      </div>
      {sub && (
        <div style={{
          fontSize: 12,
          color: T.text.faint,
          marginTop: 2,
          fontFamily: T.font.ui,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const articlesHeader = {
  display: 'grid',
  gridTemplateColumns: '90px minmax(0, 2.4fr) 1.2fr 1.2fr 70px',
  padding: '8px 14px',
  background: T.bg.surface2,
  borderBottom: `1px solid ${T.border.primary}`,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: T.font.mono,
  color: T.text.subtle,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  position: 'sticky',
  top: 0,
};

const articlesRow = {
  display: 'grid',
  gridTemplateColumns: '90px minmax(0, 2.4fr) 1.2fr 1.2fr 70px',
  padding: '9px 14px',
  fontSize: 12.5,
  color: T.text.secondary,
  alignItems: 'center',
};

/* ──────────────────────────────────────────────────────────────────────── */
function KbdHints() {
  const items = [
    { k: 'j / k', v: 'Navigieren' },
    { k: '⏎',    v: 'Details öffnen' },
    { k: '/',    v: 'Suche' },
    { k: 'e',    v: 'xlsx Export' },
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
