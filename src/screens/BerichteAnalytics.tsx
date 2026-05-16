/* BerichteAnalytics — four magazine-style analytics widgets that
   live UNDER the Report Studio section of Berichte. They derive from
   `/api/reports/aggregates`, NOT from the local history slice, so the
   numbers cover up to 90 days regardless of how the user has scoped
   their export. Polling at 30s keeps the view feeling live.

   Sections:
     1. Format-Verteilung — CSS-only concentric radial bars per level
     2. Aktivität (Heatmap) — GitHub-style 30-day calendar grid
     3. Einheiten pro Level (7T) — recharts stacked bar
     4. Rollen-Durchsatz (14T) — recharts mini area sparkline grid (one per active level)

   Color palette is sourced from auftragHelpers.LEVEL_META so the
   chrome stays in lockstep with Pruefen / Focus / Historie. */

import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { getReportsAggregates } from '@/marathonApi.js';
import { LEVEL_META } from '@/utils/auftragHelpers.js';
import { StudioFrame, T } from '@/components/ui.jsx';
import type {
  DailyLevelBucket, HeatmapCell, LevelBucket, ReportsAggregates,
} from '@/types/api';

const POLL_MS = 30_000;
const ALL_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;
type Level = (typeof ALL_LEVELS)[number];

/* Range chips for the analytics block — independent from the export
   date range above, so the user can pick e.g. last 14d of analytics
   while still preparing a current-month xlsx export. */
const RANGE_OPTIONS = [
  { id: 7,  label: '7 T'  },
  { id: 14, label: '14 T' },
  { id: 30, label: '30 T' },
  { id: 60, label: '60 T' },
  { id: 90, label: '90 T' },
];

/* ════════════════════════════════════════════════════════════════════ */
export default function BerichteAnalytics() {
  const [days, setDays] = useState(30);
  const [activeLevels, setActiveLevels] = useState<Set<Level>>(
    () => new Set(ALL_LEVELS),
  );

  /* The level-filter param goes to the backend so e.g. byLevel for the
     radial and rollenByDay for the sparkline-grid only contain the
     active levels. Keeping the API stateless here lets us cache by the
     full key. Sort the set so the query key is stable across orderings. */
  const levelsParam = useMemo(() => {
    if (activeLevels.size === ALL_LEVELS.length) return undefined;
    return [...activeLevels].sort((a, b) => a - b).join(',');
  }, [activeLevels]);

  const aggregatesQ = useQuery({
    queryKey: ['reports-aggregates', days, levelsParam ?? 'all'],
    queryFn:  () => getReportsAggregates({ days, levels: levelsParam }),
    refetchInterval: POLL_MS,
    staleTime: POLL_MS / 2,
  });

  const data = aggregatesQ.data;
  const loading = aggregatesQ.isLoading;

  const toggleLevel = (lvl: Level) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) {
        /* Don't allow zero — a fully-empty filter would 200 with no data
           and the user would think the screen is broken. */
        if (next.size === 1) return prev;
        next.delete(lvl);
      } else {
        next.add(lvl);
      }
      return next;
    });
  };
  const toggleAll = () => {
    setActiveLevels((prev) =>
      prev.size === ALL_LEVELS.length ? new Set([1]) : new Set(ALL_LEVELS),
    );
  };

  return (
    <StudioFrame
      bare
      gap={16}
      label="Analytik · Letzte Aufträge"
      status={loading ? 'lädt…' : days === 30 ? '30 TAGE' : `${days} TAGE`}
      style={{ marginTop: 16 }}
    >
      <FilterRow
        days={days}
        onPickDays={setDays}
        activeLevels={activeLevels}
        onToggleLevel={toggleLevel}
        onToggleAll={toggleAll}
      />

      {/* Sections stack full-width — each visualization gets the breathing
          room it needs, and the radial-vs-heatmap side-by-side that looked
          cramped is gone. */}
      <Panel title="Format-Verteilung">
        <FormatBars data={data?.byLevel || []} loading={loading} />
      </Panel>

      <Panel title={`Aktivität (${days}T)`}>
        <ActivityHeatmap cells={data?.heatmap || []} loading={loading} />
      </Panel>

      <Panel title="Einheiten pro Level (7 Tage)">
        <LevelStackBar
          rows={data?.dailyByLevel || []}
          activeLevels={activeLevels}
          loading={loading}
        />
      </Panel>

      <Panel title="Rollen-Durchsatz (14 Tage)">
        <RollenSparklineGrid
          rows={data?.rollenByDay || []}
          activeLevels={activeLevels}
          loading={loading}
        />
      </Panel>
    </StudioFrame>
  );
}

/* ─── Filter row ────────────────────────────────────────────────────── */

function FilterRow({
  days, onPickDays, activeLevels, onToggleLevel, onToggleAll,
}: {
  days: number;
  onPickDays: (d: number) => void;
  activeLevels: Set<Level>;
  onToggleLevel: (lvl: Level) => void;
  onToggleAll: () => void;
}) {
  const allOn = activeLevels.size === ALL_LEVELS.length;
  return (
    <div style={{
      padding: '14px 18px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.md,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 14,
      alignItems: 'center',
    }}>
      <MonoLabel>Zeitraum</MonoLabel>
      <div style={{ display: 'flex', gap: 4 }}>
        {RANGE_OPTIONS.map((opt) => (
          <Chip
            key={opt.id}
            active={days === opt.id}
            onClick={() => onPickDays(opt.id)}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
      <div style={{ width: 1, height: 24, background: T.border.primary }} />
      <MonoLabel>Level</MonoLabel>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Chip
          active={allOn}
          onClick={onToggleAll}
          dim={!allOn}
          title={allOn ? 'Nur Level 1' : 'Alle Level zeigen'}
        >
          Alle
        </Chip>
        {ALL_LEVELS.map((lvl) => {
          const meta = LEVEL_META[lvl];
          const active = activeLevels.has(lvl);
          return (
            <Chip
              key={lvl}
              active={active}
              onClick={() => onToggleLevel(lvl)}
              accentColor={meta.color}
              dim={!active}
              title={meta.name}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: meta.color, display: 'inline-block', marginRight: 6,
              }} />
              L{lvl} {meta.shortName}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10.5,
      fontFamily: T.font.mono,
      fontWeight: 600,
      color: T.text.subtle,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
    }}>{children}</span>
  );
}

function Chip({
  active, dim, accentColor, onClick, title, children,
}: {
  active?: boolean;
  dim?: boolean;
  accentColor?: string;
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const bg = active
    ? (accentColor ? `${hex(accentColor)}1A` : T.accent.bg)
    : T.bg.surface3;
  const border = active
    ? (accentColor ?? T.accent.border)
    : T.border.primary;
  const text = active
    ? (accentColor ?? T.accent.text)
    : (dim ? T.text.faint : T.text.secondary);
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '5px 11px',
        fontSize: 12,
        fontFamily: T.font.mono,
        fontWeight: 600,
        background: bg,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: T.radius.full,
        cursor: 'pointer',
        letterSpacing: '0.02em',
        display: 'inline-flex',
        alignItems: 'center',
        transition: 'background 120ms, color 120ms, border-color 120ms',
      }}
    >
      {children}
    </button>
  );
}

/* Treat the LEVEL_META hex codes as opaque strings — we never derive
   alpha values, but recharts/inline-styles need predictable forms. */
function hex(s: string): string { return s; }

/* ─── Panel wrapper ───────────────────────────────────────────────── */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '20px 22px 22px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.md,
    }}>
      <div style={{
        fontSize: 11,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        marginBottom: 14,
      }}>{title}</div>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   1. Format-Verteilung — horizontal level bars
   ════════════════════════════════════════════════════════════════════
   Concentric radial-bars looked dense in theory but with one dominant
   level (L1 Thermo regularly ~85-90%) the remaining six rings collapse
   into unreadable hairlines. Horizontal bars solve both problems:
   • absolute units are readable next to each name
   • bar lengths use max(units), not total, so even tiny levels visibly
     register
   • the percentage of total still appears as a numeric tail
   Headline Σ + Top-Level sit in a left-aligned hero row above the bars. */

function FormatBars({ data, loading }: { data: LevelBucket[]; loading: boolean }) {
  const total = data.reduce((s, b) => s + b.units, 0);
  const max = Math.max(1, ...data.map((b) => b.units));
  const topLevel = useMemo(() => {
    return [...data].sort((a, b) => b.units - a.units)[0];
  }, [data]);

  if (!loading && total === 0) {
    return <EmptyHint>Noch keine abgeschlossenen Aufträge im Zeitraum.</EmptyHint>;
  }

  return (
    <div style={{
      opacity: loading ? 0.4 : 1,
      transition: 'opacity 200ms',
    }}>
      {/* Hero stat row */}
      <div style={{
        display: 'flex',
        gap: 36,
        marginBottom: 20,
        flexWrap: 'wrap',
      }}>
        <Stat label="Einheiten Σ" value={total.toLocaleString('de-DE')} big />
        {topLevel && total > 0 && (
          <Stat
            label="Top-Level"
            value={`L${topLevel.level} ${LEVEL_META[topLevel.level].shortName}`}
            accentColor={LEVEL_META[topLevel.level].color}
          />
        )}
        <Stat
          label="Formate"
          value={String(data.filter((b) => b.units > 0).length)}
        />
      </div>

      {/* Per-level horizontal bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.map((b) => {
          const meta = LEVEL_META[b.level];
          const pct = total > 0 ? (b.units / total) * 100 : 0;
          /* Bar length normalised against the largest level's units so
             tiny levels still register a visible sliver. Pct (vs total)
             is reported as the tail number. */
          const barPct = max > 0 ? Math.min(100, (b.units / max) * 100) : 0;
          const inactive = b.units === 0;
          return (
            <div key={b.level} style={{ opacity: inactive ? 0.45 : 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                marginBottom: 5,
                fontSize: 12.5,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: meta.color,
                  display: 'inline-block',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: T.font.mono,
                  fontWeight: 600,
                  color: T.text.primary,
                  letterSpacing: '0.02em',
                  minWidth: 110,
                }}>L{b.level} {meta.shortName}</span>
                <span style={{
                  marginLeft: 'auto',
                  fontFamily: T.font.mono,
                  fontVariantNumeric: 'tabular-nums',
                  color: T.text.secondary,
                }}>
                  {b.units.toLocaleString('de-DE')}
                  <span style={{ color: T.text.faint, marginLeft: 4 }}>Einh.</span>
                  {b.rollen > 0 && (
                    <>
                      <span style={{ color: T.text.faint, margin: '0 6px' }}>·</span>
                      {b.rollen.toLocaleString('de-DE')}
                      <span style={{ color: T.text.faint, marginLeft: 4 }}>Rollen</span>
                    </>
                  )}
                </span>
                <span style={{
                  fontFamily: T.font.mono,
                  fontVariantNumeric: 'tabular-nums',
                  color: T.text.subtle,
                  minWidth: 48,
                  textAlign: 'right',
                }}>{pct.toFixed(1)}%</span>
              </div>
              <div style={{
                height: 5,
                background: T.bg.surface3,
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${barPct}%`,
                  height: '100%',
                  background: meta.color,
                  transition: 'width 320ms cubic-bezier(0.16, 1, 0.3, 1)',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Compact stat block — reused by FormatBars hero row and Heatmap summary. */
function Stat({
  label, value, big, accentColor,
}: {
  label: string;
  value: string;
  big?: boolean;
  accentColor?: string;
}) {
  return (
    <div>
      <div style={{
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontFamily: T.font.ui,
        fontSize: big ? 30 : 18,
        fontWeight: 500,
        letterSpacing: '-0.02em',
        color: accentColor ?? T.text.primary,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {accentColor && (
          <span style={{
            width: 10, height: 10, borderRadius: 2, background: accentColor,
          }} />
        )}
        {value}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   2. Activity heatmap — 30-day calendar grid
   ════════════════════════════════════════════════════════════════════
   Layout: weekday rows (Mo–So) × N columns of weeks. Empty leading
   cells pad to the first column's weekday so the grid aligns. Cell
   intensity scales linearly with completed-Auftrag count; we use the
   accent CSS var so the heatmap follows the user-picked accent. */

const WEEKDAY_LABELS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function ActivityHeatmap({ cells, loading }: { cells: HeatmapCell[]; loading: boolean }) {
  const { grid, max } = useMemo(() => buildHeatmapGrid(cells), [cells]);
  const summary = useMemo(() => {
    const totalCount = cells.reduce((s, c) => s + c.count, 0);
    const totalUnits = cells.reduce((s, c) => s + c.units, 0);
    let topDay: HeatmapCell | null = null;
    for (const c of cells) {
      if (c.count > 0 && (!topDay || c.count > topDay.count)) topDay = c;
    }
    const activeDays = cells.filter((c) => c.count > 0).length;
    return { totalCount, totalUnits, topDay, activeDays };
  }, [cells]);

  if (!loading && summary.totalCount === 0) {
    return <EmptyHint>Keine abgeschlossenen Aufträge im Zeitraum.</EmptyHint>;
  }

  return (
    <div style={{
      opacity: loading ? 0.4 : 1,
      transition: 'opacity 200ms',
    }}>
      {/* Hero summary row */}
      <div style={{
        display: 'flex',
        gap: 36,
        marginBottom: 20,
        flexWrap: 'wrap',
      }}>
        <Stat label="Aufträge Σ" value={summary.totalCount.toLocaleString('de-DE')} big />
        <Stat label="Einheiten" value={summary.totalUnits.toLocaleString('de-DE')} />
        <Stat label="Aktive Tage" value={`${summary.activeDays} / ${cells.length}`} />
        {summary.topDay && (
          <Stat
            label="Spitzentag"
            value={`${formatShortDate(summary.topDay.date)} · ${summary.topDay.count}`}
          />
        )}
      </div>

      {/* Grid — fixed-size square cells (no aspect-ratio tricks).
          --hm-cell drives both axes so weekday labels stay aligned to
          their row regardless of viewport width. The grid itself
          claims its natural width; the panel is free to leave whitespace
          to the right — that's intentional GitHub-style behavior, not
          a stretched grid. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto',
          gap: 10,
          alignItems: 'start',
          /* clamp keeps cells readable from narrow split-screen to wide
             desktop without ever ballooning. */
          ['--hm-cell' as string]: 'clamp(18px, 1.6vw, 26px)',
        }}
      >
        {/* Weekday labels — Mo / Mi / Fr / So shown (every other day).
            Heights match the cell size so they line up exactly. */}
        <div style={{
          display: 'grid',
          gridTemplateRows: 'repeat(7, var(--hm-cell))',
          rowGap: 4,
          fontFamily: T.font.mono,
          fontSize: 9.5,
          color: T.text.faint,
          letterSpacing: '0.02em',
        }}>
          {WEEKDAY_LABELS_DE.map((d, i) => (
            <span key={d} style={{
              visibility: i % 2 === 0 ? 'visible' : 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: 6,
            }}>{d}</span>
          ))}
        </div>

        <div style={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateRows: 'repeat(7, var(--hm-cell))',
          gridAutoColumns: 'var(--hm-cell)',
          gap: 4,
        }}>
          {grid.map((cell, idx) => {
            if (cell == null) {
              return <span key={`pad-${idx}`} style={{ background: 'transparent' }} />;
            }
            const intensity = max > 0 ? cell.count / max : 0;
            return (
              <span
                key={cell.date}
                title={`${formatDate(cell.date)} · ${cell.count} Aufträge · ${cell.units.toLocaleString('de-DE')} Einh.`}
                style={{
                  width: 'var(--hm-cell)',
                  height: 'var(--hm-cell)',
                  borderRadius: 3,
                  background: cellBg(intensity),
                  border: cell.count > 0
                    ? `1px solid color-mix(in srgb, var(--accent) 30%, transparent)`
                    : `1px solid ${T.border.primary}`,
                  transition: 'transform 80ms',
                  cursor: 'pointer',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Color-scale legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 14,
        fontFamily: T.font.mono,
        fontSize: 10.5,
        color: T.text.faint,
        letterSpacing: '0.06em',
      }}>
        <span>WENIG</span>
        {[0.1, 0.3, 0.55, 0.8, 1].map((i) => (
          <span key={i} style={{
            width: 14, height: 14, borderRadius: 3,
            background: cellBg(i),
            border: `1px solid color-mix(in srgb, var(--accent) 30%, transparent)`,
          }} />
        ))}
        <span>VIEL</span>
        <span style={{ marginLeft: 'auto' }}>MAX: {max} AUFTR.</span>
      </div>
    </div>
  );
}

function cellBg(intensity: number): string {
  if (intensity <= 0) return 'transparent';
  /* 4 buckets so the eye can distinguish quiet vs busy days without
     pseudo-smooth gradient noise. */
  if (intensity < 0.25) return 'color-mix(in srgb, var(--accent) 20%, transparent)';
  if (intensity < 0.5)  return 'color-mix(in srgb, var(--accent) 40%, transparent)';
  if (intensity < 0.75) return 'color-mix(in srgb, var(--accent) 65%, transparent)';
  return 'var(--accent)';
}

function buildHeatmapGrid(cells: HeatmapCell[]):
  { grid: (HeatmapCell | null)[]; max: number } {
  if (cells.length === 0) return { grid: [], max: 0 };
  /* Build a column-major grid: each "column" is a calendar week
     (Mon-Sun). Pad the first week with nulls so the first cell lands
     on its real weekday. Date.getDay returns 0=Sun..6=Sat — we want
     Mon=0..Sun=6 for German calendars. */
  const first = new Date(cells[0].date + 'T00:00:00Z');
  const firstDow = (first.getUTCDay() + 6) % 7;
  const grid: (HeatmapCell | null)[] = [];
  for (let i = 0; i < firstDow; i++) grid.push(null);
  for (const c of cells) grid.push(c);
  /* Pad trailing so the last column is complete — purely cosmetic. */
  while (grid.length % 7 !== 0) grid.push(null);
  const max = cells.reduce((m, c) => Math.max(m, c.count), 0);
  return { grid, max };
}

/* ════════════════════════════════════════════════════════════════════
   3. Level-Stack — recharts stacked bar (7 days)
   ════════════════════════════════════════════════════════════════════ */

function LevelStackBar({
  rows, activeLevels, loading,
}: {
  rows: DailyLevelBucket[];
  activeLevels: Set<Level>;
  loading: boolean;
}) {
  /* recharts wants flat row objects: { date, '1': 12, '4': 3, ... }. */
  const chartData = useMemo(
    () => rows.map((r) => {
      const out: Record<string, number | string> = { date: shortDate(r.date) };
      for (const [k, v] of Object.entries(r.values)) {
        const lvl = Number(k);
        if (activeLevels.has(lvl as Level)) out[k] = v;
      }
      return out;
    }),
    [rows, activeLevels],
  );

  const total = chartData.reduce((s, r) => {
    let dayTotal = 0;
    for (const [k, v] of Object.entries(r)) {
      if (k !== 'date' && typeof v === 'number') dayTotal += v;
    }
    return s + dayTotal;
  }, 0);

  if (!loading && total === 0) {
    return <EmptyHint>Keine Einheiten in den letzten 7 Tagen.</EmptyHint>;
  }

  const activeList = [...activeLevels].sort((a, b) => a - b);

  return (
    <div style={{
      height: 220,
      opacity: loading ? 0.4 : 1,
      transition: 'opacity 200ms',
    }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid stroke={T.border.primary} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={T.text.faint}
            tick={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke={T.text.faint}
            tick={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ fill: T.bg.surface3 }}
            contentStyle={{
              background: T.bg.surface,
              border: `1px solid ${T.border.primary}`,
              borderRadius: 6,
              fontFamily: T.font.mono,
              fontSize: 12,
            }}
            formatter={(value: number, key: string) => {
              const lvl = Number(key);
              const meta = LEVEL_META[lvl];
              return [
                `${value.toLocaleString('de-DE')} Einh.`,
                meta ? `L${lvl} ${meta.shortName}` : `L${key}`,
              ];
            }}
          />
          {activeList.map((lvl) => (
            <Bar
              key={lvl}
              dataKey={String(lvl)}
              stackId="units"
              fill={LEVEL_META[lvl].color}
              radius={[2, 2, 0, 0]}
              isAnimationActive
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   4. Rollen-Durchsatz — sparkline grid (2 × 4)
   ════════════════════════════════════════════════════════════════════
   One micro-area-chart per level that actually moved in the window.
   Skipping silent levels avoids 5 empty boxes when the warehouse
   only ran Thermo + Tacho all week. */

function RollenSparklineGrid({
  rows, activeLevels, loading,
}: {
  rows: DailyLevelBucket[];
  activeLevels: Set<Level>;
  loading: boolean;
}) {
  /* Per-level series: each level becomes [{ date, value }] over the
     14-day window. Sum across the window is the headline number. */
  const seriesByLevel = useMemo(() => {
    const map: Record<number, { date: string; value: number }[]> = {};
    const totals: Record<number, number> = {};
    for (const lvl of activeLevels) {
      map[lvl] = rows.map((r) => ({
        date: r.date,
        value: r.values[String(lvl)] || 0,
      }));
      totals[lvl] = map[lvl].reduce((s, p) => s + p.value, 0);
    }
    return { map, totals };
  }, [rows, activeLevels]);

  /* Drop silent levels. If everything is silent, show a one-liner. */
  const presentLevels = [...activeLevels]
    .filter((lvl) => seriesByLevel.totals[lvl] > 0)
    .sort((a, b) => seriesByLevel.totals[b] - seriesByLevel.totals[a]);

  if (!loading && presentLevels.length === 0) {
    return <EmptyHint>Keine Rollen-Bewegung in den letzten 14 Tagen.</EmptyHint>;
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 12,
      opacity: loading ? 0.4 : 1,
      transition: 'opacity 200ms',
    }}>
      {presentLevels.map((lvl) => {
        const meta = LEVEL_META[lvl];
        const series = seriesByLevel.map[lvl];
        const total = seriesByLevel.totals[lvl];
        return (
          <div key={lvl} style={spark.tile}>
            <div style={spark.header}>
              <span style={{
                width: 8, height: 8, borderRadius: 2, background: meta.color,
              }} />
              <span style={spark.label}>L{lvl} {meta.shortName}</span>
            </div>
            <div style={{ height: 50 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${lvl}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={meta.color} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={meta.color} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={meta.color}
                    strokeWidth={1.5}
                    fill={`url(#grad-${lvl})`}
                    isAnimationActive
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={spark.total}>
              {total.toLocaleString('de-DE')}
              <span style={{ fontSize: 10.5, fontFamily: T.font.mono, color: T.text.subtle, marginLeft: 6, fontWeight: 600 }}>
                ROLLEN
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const spark: Record<string, CSSProperties> = {
  tile: {
    padding: '10px 12px',
    background: T.bg.surface2,
    border: `1px solid ${T.border.primary}`,
    borderRadius: T.radius.sm,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginBottom: 4,
  },
  label: {
    fontFamily: T.font.mono,
    fontSize: 10.5,
    fontWeight: 600,
    color: T.text.subtle,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  total: {
    fontFamily: T.font.ui,
    fontSize: 22,
    fontWeight: 500,
    letterSpacing: '-0.02em',
    color: T.text.primary,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
    marginTop: 2,
  },
};

/* ─── tiny helpers ────────────────────────────────────────────────── */

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: T.font.mono,
      fontSize: 12,
      color: T.text.faint,
      padding: '24px 6px',
      textAlign: 'center',
      letterSpacing: '0.04em',
    }}>{children}</div>
  );
}

function shortDate(iso: string): string {
  /* Cheap: YYYY-MM-DD → DD.MM (matches German shortform in Berichte). */
  const [_, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function formatDate(iso: string): string {
  const dt = new Date(iso + 'T00:00:00Z');
  return dt.toLocaleDateString('de-DE', {
    timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatShortDate(iso: string): string {
  const dt = new Date(iso + 'T00:00:00Z');
  return dt.toLocaleDateString('de-DE', {
    timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit',
  });
}
