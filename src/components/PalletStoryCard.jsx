/* ─────────────────────────────────────────────────────────────────────────
   PalletStoryCard — replaces the Pruefen pallet table with one large card
   per pallet. Each card opens with a system-generated headline ("Größte
   Palette", "Single-SKU · 4-Seiten", "Mixed-Pyramide", ...) so the
   operator gets a story instead of a dump of cells.

   Layout (3 horizontal sections):
     ┌─────────┬──────────────────────────────┬─────────────┐
     │ Stack   │ Headline + facts + items     │ KPI gauge   │
     │ pyramid │                              │ + actions   │
     │ 100×200 │                              │             │
     └─────────┴──────────────────────────────┴─────────────┘

   Top-X items are shown as visual chips inline; "+N weitere ›" toggles
   the full list inline (no separate route, no modal — single hop).
   ───────────────────────────────────────────────────────────────────────── */

import { useState } from 'react';
import {
  formatItemTitle, getDisplayLevel, LEVEL_META,
  itemTotalVolumeCm3,
} from '../utils/auftragHelpers.js';
import PalletStackViz from './PalletStackViz.jsx';
import { Button, Badge, T } from './ui.jsx';

const TONE_PALETTE = {
  warn:    { bg: T.status.warn.bg,    border: T.status.warn.border,    text: T.status.warn.text,    chipBg: T.status.warn.bg },
  accent:  { bg: T.accent.bg,         border: T.accent.border,         text: T.accent.text,         chipBg: T.accent.bg },
  cool:    { bg: '#EFF6FF',           border: '#BFDBFE',               text: '#1E40AF',             chipBg: '#EFF6FF' },
  neutral: { bg: T.bg.surface2,       border: T.border.primary,        text: T.text.secondary,      chipBg: T.bg.surface3 },
  special: { bg: T.bg.surface2,       border: T.border.strong,         text: T.text.primary,        chipBg: T.bg.surface3 },
};

const TOP_ITEMS_VISIBLE = 4;

export default function PalletStoryCard({
  pallet,             // view-shape: { id, level, articles, units, formats, isSingleSku }
  index,              // 0-based row index
  story,              // PalletStory from buildPalletStory()
  items,              // raw enriched items list
  eskuAssigned,       // ESKU items assigned to this pallet (with placementMeta)
  palletState,        // distribute()'s palletStates[id]
  onStartFocus,       // optional callback
}) {
  const [showAllItems, setShowAllItems] = useState(false);
  const palette = TONE_PALETTE[story.tone] || TONE_PALETTE.neutral;
  const accentMeta = LEVEL_META[pallet.level] || LEVEL_META[1];

  // Combined items list — Mixed first (sorted by volume DESC, the "anchor"
  // items the operator sees first), then ESKU. We want the chips to show
  // the most informative articles, not just the first parser order.
  const allItems = [
    ...items.map((it) => ({ source: 'mixed', item: it })),
    ...eskuAssigned.map((it) => ({ source: 'esku', item: it })),
  ];
  const ranked = allItems
    .map((row) => ({ ...row, vol: itemTotalVolumeCm3(row.item) }))
    .sort((a, b) => b.vol - a.vol);
  const visibleItems = showAllItems ? ranked : ranked.slice(0, TOP_ITEMS_VISIBLE);
  const hiddenCount = ranked.length - visibleItems.length;

  return (
    <article
      id={`pallet-row-${pallet.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr 168px',
        gap: 24,
        padding: '20px 24px',
        background: T.bg.surface,
        border: `1px solid ${T.border.primary}`,
        borderRadius: T.radius.lg,
        boxShadow: T.shadow.card,
        scrollMarginTop: 80,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Tone-band on the left edge */}
      <span style={{
        position: 'absolute',
        left: 0, top: 0, bottom: 0,
        width: 4,
        background: accentMeta.color,
      }} />

      {/* ── Section 1 · Stack pyramid ─────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <PalletStackViz palletState={palletState} size="story" />
        <span style={{
          fontFamily: T.font.mono,
          fontSize: 10,
          color: T.text.faint,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          L1 · unten → oben
        </span>
      </div>

      {/* ── Section 2 · Headline + facts + items ──────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        {/* Index + Pallet-ID */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: T.font.mono,
          fontSize: 12,
          color: T.text.subtle,
        }}>
          <span style={{ color: T.text.faint }}>{String(index + 1).padStart(2, '0')}</span>
          <span style={{ color: T.text.primary, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {pallet.id}
          </span>
          <Badge color={accentMeta.color} bg={accentMeta.bg} text={accentMeta.text}>
            L{pallet.level} {accentMeta.shortName}
          </Badge>
          {eskuAssigned.length > 0 && (
            <Badge tone="accent">+{eskuAssigned.length} ESKU</Badge>
          )}
        </div>

        {/* Headline — system-generated narrative entry point */}
        <div>
          <h3 style={{
            fontFamily: 'Montserrat, Inter, system-ui, sans-serif',
            fontSize: 22,
            fontWeight: 700,
            color: palette.text,
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
            margin: 0,
            display: 'inline-block',
            padding: '4px 12px',
            background: palette.bg,
            border: `1px solid ${palette.border}`,
            borderRadius: T.radius.md,
          }}>
            {story.headline}
          </h3>
          <div style={{
            marginTop: 8,
            fontSize: 13.5,
            color: T.text.subtle,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {story.subtitle}
          </div>
        </div>

        {/* Narrative */}
        {story.narrative && (
          <p style={{
            margin: 0,
            fontSize: 13.5,
            color: T.text.secondary,
            lineHeight: 1.5,
            letterSpacing: '-0.005em',
            maxWidth: 620,
          }}>
            {story.narrative}
          </p>
        )}

        {/* Levels stripe */}
        {story.levels.length > 0 && (
          <LevelsStripe levels={story.levels} />
        )}

        {/* Top items as visual chips */}
        {visibleItems.length > 0 && (
          <div>
            <Eyebrow>{showAllItems ? 'Alle Artikel' : 'Top-Artikel'}</Eyebrow>
            <div style={{
              marginTop: 6,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}>
              {visibleItems.map((row, i) => (
                <ItemChip key={`${row.source}-${i}`} row={row} />
              ))}
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllItems(true)}
                  style={moreChipStyle}
                >
                  +{hiddenCount} weitere ›
                </button>
              )}
              {showAllItems && hiddenCount === 0 && ranked.length > TOP_ITEMS_VISIBLE && (
                <button
                  type="button"
                  onClick={() => setShowAllItems(false)}
                  style={moreChipStyle}
                >
                  weniger anzeigen
                </button>
              )}
            </div>
          </div>
        )}

        {/* Formats */}
        {pallet.formats?.length > 0 && (
          <div>
            <Eyebrow>Formate</Eyebrow>
            <div style={{
              marginTop: 6,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
            }}>
              {pallet.formats.slice(0, 5).map((f) => (
                <span key={f} style={fmtPillStyle}>{f}</span>
              ))}
              {pallet.formats.length > 5 && (
                <span style={fmtPillStyle}>+{pallet.formats.length - 5}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3 · KPI gauge + actions ───────────────────────────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <FillGauge capacity={story.capacity} />

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          width: '100%',
        }}>
          <Button
            variant="primary"
            size="sm"
            onClick={onStartFocus}
            style={{ width: '100%' }}
            title="Direkt zu diesem Auftrag in Focus springen"
          >
            Focus →
          </Button>
        </div>
      </div>
    </article>
  );
}

/* ─── Inline atoms ────────────────────────────────────────────────────── */
function Eyebrow({ children }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      color: T.text.faint,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }}>
      {children}
    </div>
  );
}

function LevelsStripe({ levels }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Eyebrow>Levels</Eyebrow>
      {/* Stacked bar */}
      <div style={{
        display: 'flex',
        height: 8,
        background: T.bg.surface3,
        borderRadius: T.radius.full,
        overflow: 'hidden',
      }}>
        {levels.map((l) => (
          <div
            key={l.level}
            title={`L${l.level} ${l.name} · ${l.units} (${Math.round(l.pct * 100)}%)`}
            style={{
              width: `${l.pct * 100}%`,
              background: l.color,
              transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        ))}
      </div>
      {/* Legend chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {levels.map((l) => (
          <span key={l.level} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11.5,
            color: T.text.secondary,
            fontVariantNumeric: 'tabular-nums',
          }}>
            <span style={{
              width: 8, height: 8,
              borderRadius: 2,
              background: l.color,
            }} />
            <span style={{ fontWeight: 500, color: T.text.primary }}>L{l.level}</span>
            <span>{l.name}</span>
            <span style={{ color: l.color, fontWeight: 600 }}>{Math.round(l.pct * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ItemChip({ row }) {
  const it = row.item;
  const lvl = getDisplayLevel(it);
  const meta = LEVEL_META[lvl] || LEVEL_META[1];
  const isEsku = row.source === 'esku';
  const cartonsHere = it.placementMeta?.cartonsHere;
  const qty = isEsku
    ? `${cartonsHere ?? it.einzelneSku?.cartonsCount ?? 1}× Karton`
    : `${(it.units || 0).toLocaleString('de-DE')} Stk`;
  const title = formatItemTitle(it.title);
  return (
    <span title={it.title} style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 10px',
      background: isEsku ? T.accent.bg : T.bg.surface2,
      border: `1px solid ${isEsku ? T.accent.border : T.border.primary}`,
      borderRadius: T.radius.full,
      fontSize: 12,
      color: T.text.primary,
      maxWidth: 280,
      lineHeight: 1.2,
    }}>
      <span title={`L${lvl} · ${meta.name}`} style={{
        width: 8, height: 8,
        borderRadius: 2,
        background: meta.color,
        flexShrink: 0,
      }} />
      <span style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontWeight: 500,
      }}>
        {title}
      </span>
      <span style={{
        color: T.text.subtle,
        fontFamily: T.font.mono,
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}>
        {qty}
      </span>
    </span>
  );
}

function FillGauge({ capacity }) {
  const pct = Math.min(1, capacity.fillPct ?? capacity.volumePct);
  const value = Math.round(pct * 100);
  const stroke = 9;
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  const dash = pct * circ;

  const color = pct > 1 ? T.status.danger.main
    : pct >= 0.95 ? T.status.warn.main
    : pct >= 0.5 ? T.accent.main
    : T.text.subtle;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        <svg width="96" height="96" viewBox="0 0 96 96"
             style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="48" cy="48" r={radius}
                  stroke={T.bg.surface3} strokeWidth={stroke} fill="none" />
          <circle cx="48" cy="48" r={radius}
                  stroke={color} strokeWidth={stroke}
                  strokeLinecap="round" fill="none"
                  strokeDasharray={`${dash} ${circ - dash}`}
                  style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.16, 1, 0.3, 1)' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            color: T.text.primary,
            letterSpacing: '-0.025em',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {value}
            <span style={{ fontSize: 12, color: T.text.subtle, marginLeft: 1 }}>%</span>
          </div>
          <div style={{
            fontSize: 10,
            color: T.text.faint,
            marginTop: 2,
            fontWeight: 500,
            letterSpacing: '0.04em',
          }}>
            VOLUMEN
          </div>
        </div>
      </div>

      {/* Vol + weight micro-row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        width: '100%',
        textAlign: 'center',
      }}>
        <KpiMini label="m³" value={capacity.volumeM3.toFixed(2)}
                 hot={capacity.volumePct >= 0.95} />
        <KpiMini label="kg" value={Math.round(capacity.weightKg)}
                 hot={capacity.weightPct >= 0.95} />
      </div>
    </div>
  );
}

function KpiMini({ label, value, hot }) {
  return (
    <div>
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: hot ? T.status.warn.text : T.text.primary,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 9.5,
        color: T.text.faint,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontFamily: T.font.mono,
        marginTop: 1,
      }}>
        {label}
      </div>
    </div>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────── */
const fmtPillStyle = {
  fontFamily: T.font.mono,
  fontSize: 11,
  padding: '2px 7px',
  background: T.bg.surface2,
  color: T.text.muted,
  border: `1px solid ${T.border.primary}`,
  borderRadius: T.radius.sm,
  letterSpacing: '-0.01em',
};

const moreChipStyle = {
  fontSize: 11.5,
  fontWeight: 600,
  padding: '4px 10px',
  background: 'transparent',
  color: T.accent.text,
  border: `1px dashed ${T.accent.border}`,
  borderRadius: T.radius.full,
  cursor: 'pointer',
  fontFamily: T.font.ui,
};
