/* ─────────────────────────────────────────────────────────────────────────
   PalletMiniCard — compact summary tile for the "Übersicht" view-mode in
   Pruefen. 3 cards per row at 1180px content width, so 3-9 pallets fit
   on one screen for quick scan. Click jumps to the full story card.

   Design: horizontal split — left column owns the mini stack pyramid,
   right column owns ID + headline + levels mini-bar + facts. A small
   ring gauge sits top-right.
   ───────────────────────────────────────────────────────────────────────── */

import PalletStackViz from './PalletStackViz.jsx';
import { T } from './ui.jsx';
import { LEVEL_META } from '../utils/auftragHelpers.js';

const TONE_BORDER = {
  warn:    T.status.warn.border,
  accent:  T.accent.main,
  cool:    '#BFDBFE',
  neutral: T.border.primary,
  special: T.border.strong,
};

export default function PalletMiniCard({ pallet, index, story, eskuAssigned, palletState, onClick }) {
  const meta = LEVEL_META[pallet.level] || LEVEL_META[1];
  const accentBorder = TONE_BORDER[story.tone] || T.border.primary;
  const fillPct = story.capacity?.fillPct ?? 0;
  const gaugeColor = fillPct > 1 ? T.status.danger.main
    : fillPct >= 0.95 ? T.status.warn.main
    : fillPct >= 0.5 ? T.accent.main
    : T.text.subtle;

  return (
    <button
      type="button"
      onClick={onClick}
      title="Klick öffnet die volle Story-Karte"
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr',
        gap: 12,
        padding: '14px 14px 14px 18px',
        background: T.bg.surface,
        border: `1px solid ${T.border.primary}`,
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: T.radius.md,
        boxShadow: T.shadow.card,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: T.font.ui,
        transition: 'border-color 160ms, box-shadow 160ms, transform 160ms',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accentBorder;
        e.currentTarget.style.boxShadow = T.shadow.raised;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.border.primary;
        e.currentTarget.style.boxShadow = T.shadow.card;
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Stack viz (row size) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PalletStackViz palletState={palletState} size="row" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        {/* Header line */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: T.font.mono,
          fontSize: 11,
          color: T.text.subtle,
        }}>
          <span style={{ color: T.text.faint }}>{String(index + 1).padStart(2, '0')}</span>
          <span style={{ color: T.text.primary, fontWeight: 600 }}>{pallet.id}</span>
          <span style={{
            fontFamily: T.font.ui,
            fontSize: 10.5,
            fontWeight: 600,
            color: meta.text,
            background: meta.bg,
            padding: '1px 6px',
            borderRadius: 4,
          }}>
            L{pallet.level}
          </span>
          {eskuAssigned?.length > 0 && (
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 10.5,
              fontWeight: 600,
              color: T.accent.text,
            }}>
              +{eskuAssigned.length}E
            </span>
          )}
          {pallet.isSingleSku && (
            <span title="Single-SKU · 4-Seiten" style={{
              fontFamily: T.font.ui,
              fontSize: 10,
              fontWeight: 700,
              color: T.status.warn.text,
            }}>S</span>
          )}
          <span style={{ flex: 1 }} />
          {/* Gauge in corner */}
          <MiniGauge pct={fillPct} color={gaugeColor} />
        </div>

        {/* Headline */}
        <div style={{
          fontFamily: 'Montserrat, Inter, system-ui, sans-serif',
          fontSize: 14,
          fontWeight: 700,
          color: T.text.primary,
          letterSpacing: '-0.015em',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {story.headline}
        </div>

        {/* Levels mini-stripe */}
        {story.levels.length > 0 && (
          <div style={{
            display: 'flex',
            height: 5,
            background: T.bg.surface3,
            borderRadius: T.radius.full,
            overflow: 'hidden',
          }}>
            {story.levels.map((l) => (
              <div
                key={l.level}
                title={`L${l.level} ${l.name} · ${Math.round(l.pct * 100)}%`}
                style={{
                  width: `${l.pct * 100}%`,
                  background: l.color,
                }}
              />
            ))}
          </div>
        )}

        {/* Facts */}
        <div style={{
          fontSize: 11.5,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.005em',
        }}>
          {pallet.articles} Art · {pallet.units.toLocaleString('de-DE')} Eh
          {fillPct > 0 && (
            <>
              <span style={{ opacity: 0.4, margin: '0 6px' }}>·</span>
              <span style={{ color: gaugeColor, fontWeight: 600 }}>
                {Math.round(fillPct * 100)}%
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

/* Minimal 32px circular gauge for mini-cards. No label inside —
   the percent text lives in the facts row. */
function MiniGauge({ pct, color }) {
  const safePct = Math.max(0, Math.min(1, pct || 0));
  const stroke = 3;
  const radius = 13;
  const circ = 2 * Math.PI * radius;
  const dash = safePct * circ;
  return (
    <span style={{
      display: 'inline-flex',
      width: 32, height: 32,
      flexShrink: 0,
    }}>
      <svg width="32" height="32" viewBox="0 0 32 32"
           style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="16" cy="16" r={radius}
                stroke={T.bg.surface3} strokeWidth={stroke} fill="none" />
        <circle cx="16" cy="16" r={radius}
                stroke={color} strokeWidth={stroke}
                strokeLinecap="round" fill="none"
                strokeDasharray={`${dash} ${circ - dash}`}
                style={{ transition: 'stroke-dasharray 400ms cubic-bezier(0.16, 1, 0.3, 1)' }} />
      </svg>
    </span>
  );
}
