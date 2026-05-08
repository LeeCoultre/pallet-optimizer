// @ts-nocheck — legacy pallet-optimizer component (pre-Marathon); not in active code path
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
import { LEVEL_META } from '@/utils/auftragHelpers.js';

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
        padding: '16px 16px',
        background: T.bg.surface,
        border: `1px solid ${T.border.primary}`,
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(17,24,39,0.02), 0 6px 16px -12px rgba(17,24,39,0.05)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: T.font.ui,
        transition: 'border-color 160ms, box-shadow 160ms, transform 160ms',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accentBorder;
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(17,24,39,0.04), 0 12px 28px -16px rgba(17,24,39,0.10)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.border.primary;
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(17,24,39,0.02), 0 6px 16px -12px rgba(17,24,39,0.05)';
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

        {/* Headline — type-tag + content (2-line hierarchy) */}
        <SplitHeadline
          headline={story.headline}
          tone={story.tone}
          tagSize={9.5}
          contentSize={14}
        />

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

/* ─── SplitHeadline ──────────────────────────────────────────────────
   Splits a story headline by the " · " separator into a tone-colored
   uppercase tag (top line) + primary content (bottom line). When the
   headline has no separator, the whole phrase becomes the content
   line and the tag is omitted.

   Tone palette maps story tone → tag color. Warn = amber, accent =
   orange, cool = deep blue, danger = red. Neutral keeps primary.
   ──────────────────────────────────────────────────────────────────── */
const TONE_TAG_COLOR = {
  warn:    T.status.warn.text,
  accent:  T.accent.text,
  cool:    '#1E40AF',
  special: T.text.primary,
  danger:  T.status.danger.text,
  neutral: T.text.subtle,
};

function SplitHeadline({ headline, tone, tagSize = 10, contentSize = 14 }) {
  if (!headline) return null;
  const parts = headline.split(' · ');
  const hasSplit = parts.length >= 2;
  const tag = hasSplit ? parts[0] : null;
  const content = hasSplit ? parts.slice(1).join(' · ') : headline;
  const tagColor = TONE_TAG_COLOR[tone] || T.text.subtle;

  return (
    <div style={{ minWidth: 0 }}>
      {tag && (
        <div style={{
          fontSize: tagSize,
          fontWeight: 700,
          color: tagColor,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontFamily: T.font.mono,
          lineHeight: 1.1,
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {tag}
        </div>
      )}
      <div style={{
        fontSize: contentSize,
        fontWeight: 600,
        color: T.text.primary,
        letterSpacing: '-0.012em',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {content}
      </div>
    </div>
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