// @ts-nocheck — legacy pallet-optimizer component (pre-Marathon); not in active code path
/* PalletMiniCard — visual-first tile for the "Übersicht" view-mode.

   Designed to be scanned with the eye, not read with the mind:
     • Stack viz is the visual hero (left rail, 64×128 thumbnail —
       colored bands tell the level story without text).
     • Soft tone-tinted border carries the state (warn/danger/accent).
       Neutral pallets keep the default gray border — they don't shout.
     • Right column: P-id (mono), level dot+shortname, then a single
       big Fill% number, a thin bar, and a weight ratio. That's it.

   Removed vs. v1: headline text, "N Art · N Eh" facts, ESKU chip
   (already shown as white dots inside stack viz), MiniGauge, levels
   mini-stripe, SplitHeadline split-tag. Übersicht is a glance, not a
   read. Story-card is one click away for everything else.
*/

import PalletStackViz from './PalletStackViz.jsx';
import { T } from './ui.jsx';
import { LEVEL_META } from '@/utils/auftragHelpers.js';

const TONE_PALETTE = {
  warn:    { color: T.status.warn.main,    stateful: true },
  danger:  { color: T.status.danger.main,  stateful: true },
  accent:  { color: T.accent.main,         stateful: true },
  cool:    { color: '#3B82F6',             stateful: true },
  special: { color: T.status.warn.main,    stateful: true },
  neutral: { color: T.border.primary,      stateful: false },
};

const PALLET_VOL_M3 = 1.59;
const PALLET_WEIGHT_KG = 700;

export default function PalletMiniCard({ pallet, story, palletState, onClick }) {
  const meta = LEVEL_META[pallet.level] || LEVEL_META[1];
  const cap = story.capacity || {};
  const fillPct = cap.fillPct ?? 0;
  const fillValue = Math.round(fillPct * 100);
  const fillColor = fillPct > 1 ? T.status.danger.text
    : fillPct >= 0.95 ? T.status.warn.text
    : T.text.primary;
  const barColor = fillPct > 1 ? T.status.danger.main
    : fillPct >= 0.95 ? T.status.warn.main
    : T.accent.main;
  const palette = TONE_PALETTE[story.tone] || TONE_PALETTE.neutral;
  const borderRest  = palette.stateful ? `${palette.color}55` : T.border.primary;
  const borderHover = palette.stateful ? `${palette.color}AA` : T.text.subtle;
  const shadowHover = palette.stateful
    ? `0 14px 32px -20px ${palette.color}66`
    : '0 12px 28px -20px rgba(17,24,39,0.18)';

  const weightKg = cap.weightKg ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      title={story.headline}
      style={{
        display: 'grid',
        gridTemplateColumns: '64px 1fr',
        gap: 16,
        padding: 16,
        background: T.bg.surface,
        border: `1px solid ${borderRest}`,
        borderRadius: 14,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: T.font.ui,
        transition: 'transform 200ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms, border-color 200ms',
        minWidth: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = shadowHover;
        e.currentTarget.style.borderColor = borderHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = borderRest;
      }}
    >
      {/* Visual hero — stack viz */}
      <PalletStackViz palletState={palletState} size="mini" />

      {/* Data column */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Identity */}
        <div style={{
          fontFamily: T.font.mono,
          fontSize: 13.5,
          fontWeight: 600,
          color: T.text.primary,
          letterSpacing: '-0.005em',
          lineHeight: 1,
        }}>
          {pallet.id}
        </div>

        <div style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}>
          <span style={{
            width: 6, height: 6,
            background: meta.color,
            borderRadius: 2,
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 9.5,
            fontWeight: 700,
            color: T.text.subtle,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            L{pallet.level} {meta.shortName}
          </span>
        </div>

        {/* Fill hero */}
        <div style={{
          marginTop: 14,
          fontFamily: T.font.mono,
          fontSize: 26,
          fontWeight: 600,
          color: fillColor,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}>
          {fillValue}
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            opacity: 0.55,
            marginLeft: 2,
          }}>%</span>
        </div>

        {/* Thin fill bar */}
        <div style={{
          marginTop: 8,
          position: 'relative',
          height: 3,
          background: T.bg.surface3,
          borderRadius: 999,
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.min(100, fillValue)}%`,
            background: barColor,
            borderRadius: 999,
            transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)',
          }} />
        </div>

        {/* Weight ratio */}
        {weightKg > 0 && (
          <div style={{
            marginTop: 8,
            fontFamily: T.font.mono,
            fontSize: 10.5,
            color: T.text.faint,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.02em',
          }}>
            {Math.round(weightKg).toLocaleString('de-DE')} / {PALLET_WEIGHT_KG} kg
          </div>
        )}
      </div>
    </button>
  );
}
