/* ─────────────────────────────────────────────────────────────────────────
   PalletStoryCard — Cinematic Hero + Data Cockpit redesign.

   Visual anatomy:
     • Large background "01" decorative typo number (top-right corner)
     • Floating fill-badge pill (top-left corner, accent tint)
     • Hero block: stack viz (left, 140×180) + headline cinema (right)
     • Hairline divider → Levels full-width bar with chips
     • Hairline divider → Items as detailed 2-line rows
     • Hairline divider → Footer micro stats (m³, kg, fill%)
     • Hover-lift: translateY(-2px) + deeper shadow
     • Accent tone-rail on left edge (warn/special variants)
   ───────────────────────────────────────────────────────────────────────── */

import { useState } from 'react';
import {
  formatItemTitle, getDisplayLevel, LEVEL_META,
} from '../utils/auftragHelpers.js';
import PalletStackViz from './PalletStackViz.jsx';
import { T } from './ui.jsx';

const TOP_ITEMS_VISIBLE = 5;

export default function PalletStoryCard({
  pallet, index, story, items, eskuAssigned, palletState,
}) {
  const [showAllItems, setShowAllItems] = useState(false);
  const [hover, setHover] = useState(false);
  const accentMeta = LEVEL_META[pallet.level] || LEVEL_META[1];

  const ranked = [
    ...items.map((it) => ({ source: 'mixed', item: it })),
    ...eskuAssigned.map((it) => ({ source: 'esku', item: it })),
  ];
  const visibleItems = showAllItems ? ranked : ranked.slice(0, TOP_ITEMS_VISIBLE);
  const hiddenCount = ranked.length - visibleItems.length;

  const fillPct = Math.min(1.5, story.capacity.fillPct ?? story.capacity.volumePct);
  const fillValue = Math.round(fillPct * 100);
  const fillTone = fillPct > 1 ? T.status.danger
    : fillPct >= 0.95 ? T.status.warn
    : fillPct >= 0.5  ? null
    : null;
  const fillBadgeColor = fillTone?.main || T.accent.main;
  const fillBadgeBg = fillTone?.bg || T.accent.bg;
  const fillBadgeBorder = fillTone?.border || T.accent.border;
  const fillBadgeText = fillTone?.text || T.accent.text;

  const indexLabel = String(index + 1).padStart(2, '0');

  return (
    <article
      id={`pallet-row-${pallet.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        padding: '28px 32px 24px',
        background: T.bg.surface,
        border: `1px solid ${T.border.primary}`,
        borderRadius: 22,
        scrollMarginTop: 80,
        overflow: 'hidden',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hover
          ? '0 4px 12px rgba(17,24,39,0.04), 0 24px 48px -20px rgba(17,24,39,0.12)'
          : '0 1px 3px rgba(17,24,39,0.03), 0 12px 32px -20px rgba(17,24,39,0.06)',
        transition: 'transform 240ms cubic-bezier(0.16,1,0.3,1), box-shadow 240ms cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Decorative giant index number — top-right corner */}
      <div aria-hidden style={{
        position: 'absolute',
        top: -22,
        right: 16,
        fontFamily: T.font.mono,
        fontSize: 200,
        fontWeight: 700,
        color: T.text.primary,
        opacity: 0.025,
        letterSpacing: '-0.05em',
        lineHeight: 1,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        {indexLabel}
      </div>

      {/* Soft accent halo top-right */}
      <div aria-hidden style={{
        position: 'absolute',
        top: -120,
        right: -120,
        width: 280,
        height: 280,
        background: `radial-gradient(circle, ${accentMeta.color}08 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />

      {/* Floating fill-badge — top-left */}
      <div style={{
        position: 'absolute',
        top: 22,
        right: 32,
        zIndex: 2,
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 6,
          padding: '7px 13px',
          background: fillBadgeBg,
          border: `1px solid ${fillBadgeBorder}`,
          borderRadius: 999,
          fontFamily: T.font.mono,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{
            fontSize: 18,
            fontWeight: 700,
            color: fillBadgeColor,
            letterSpacing: '-0.025em',
            lineHeight: 1,
          }}>
            {fillValue}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginLeft: 1 }}>%</span>
          </span>
          <span style={{
            fontSize: 9.5,
            color: fillBadgeText,
            opacity: 0.7,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600,
          }}>
            FILL
          </span>
        </div>
      </div>

      {/* HERO BLOCK */}
      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: 28,
        marginRight: 110, /* leave space for fill badge */
      }}>
        {/* Stack viz */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8,
        }}>
          <PalletStackViz palletState={palletState} size="story" />
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 9.5,
            color: T.text.faint,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            unten → oben
          </span>
        </div>

        {/* Right column: header chip-row → BIG headline → narrative */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Header chips */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 11,
              color: T.text.faint,
              letterSpacing: '0.04em',
            }}>
              {indexLabel}
            </span>
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 13.5,
              color: T.text.primary,
              fontWeight: 600,
              letterSpacing: '-0.005em',
            }}>
              {pallet.id}
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 9px',
              background: accentMeta.bg,
              border: `1px solid ${accentMeta.color}30`,
              borderRadius: 999,
              fontSize: 10.5,
              fontFamily: T.font.mono,
              fontWeight: 700,
              color: accentMeta.text,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              <span style={{
                width: 7, height: 7,
                background: accentMeta.color,
                borderRadius: 2,
              }} />
              L{pallet.level} {accentMeta.shortName}
            </span>
            {eskuAssigned.length > 0 && (
              <span style={{
                fontSize: 10.5,
                color: T.accent.text,
                fontWeight: 700,
                fontFamily: T.font.mono,
                padding: '3px 9px',
                background: T.accent.bg,
                border: `1px solid ${T.accent.border}`,
                borderRadius: 999,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                +{eskuAssigned.length} ESKU
              </span>
            )}
          </div>

          {/* CINEMATIC HEADLINE — type-tag + content split */}
          <div>
            <SplitHeadlineHero headline={story.headline} tone={story.tone} />
            <div style={{
              marginTop: 8,
              fontSize: 12,
              color: T.text.subtle,
              fontFamily: T.font.mono,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}>
              {story.subtitle}
            </div>
          </div>

          {/* Narrative */}
          {story.narrative && (
            <p style={{
              margin: 0,
              fontSize: 13.5,
              color: T.text.subtle,
              lineHeight: 1.6,
              letterSpacing: '-0.005em',
              maxWidth: 580,
            }}>
              {story.narrative}
            </p>
          )}
        </div>
      </div>

      {/* DIVIDER */}
      <Divider />

      {/* LEVELS — full width visualization */}
      {story.levels.length > 0 && (
        <>
          <SectionEyebrow>Levels-Verteilung</SectionEyebrow>
          <div style={{
            marginTop: 10,
            display: 'flex',
            height: 10,
            background: T.bg.surface3,
            borderRadius: 999,
            overflow: 'hidden',
          }}>
            {story.levels.map((l) => (
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
          <div style={{
            marginTop: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            {story.levels.map((l) => (
              <span key={l.level} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
                fontFamily: T.font.ui,
              }}>
                <span style={{
                  width: 9, height: 9,
                  borderRadius: 2,
                  background: l.color,
                }} />
                <span style={{ color: T.text.primary, fontWeight: 500 }}>
                  L{l.level}
                </span>
                <span style={{ color: T.text.subtle }}>{l.name}</span>
                <span style={{
                  color: l.color,
                  fontWeight: 700,
                  fontFamily: T.font.mono,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {Math.round(l.pct * 100)}%
                </span>
              </span>
            ))}
          </div>

          <Divider />
        </>
      )}

      {/* ITEMS */}
      {visibleItems.length > 0 && (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginBottom: 10,
          }}>
            <SectionEyebrow>Artikel</SectionEyebrow>
            <span style={{
              fontSize: 11,
              color: T.text.faint,
              fontFamily: T.font.mono,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {showAllItems ? ranked.length : `${visibleItems.length}${hiddenCount > 0 ? ' / ' + ranked.length : ''}`}
            </span>
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}>
            {visibleItems.map((row, i) => (
              <ItemRow
                key={`${row.source}-${i}`}
                row={row}
                isLast={i === visibleItems.length - 1}
              />
            ))}
          </div>

          {(hiddenCount > 0 || (showAllItems && ranked.length > TOP_ITEMS_VISIBLE)) && (
            <button
              type="button"
              onClick={() => setShowAllItems((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 12,
                padding: '6px 12px',
                fontSize: 11.5,
                fontWeight: 500,
                color: T.text.subtle,
                background: 'transparent',
                border: `1px solid ${T.border.primary}`,
                borderRadius: 999,
                cursor: 'pointer',
                fontFamily: T.font.ui,
                letterSpacing: '-0.005em',
                transition: 'all 160ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = T.text.subtle;
                e.currentTarget.style.color = T.text.primary;
                e.currentTarget.style.background = T.bg.surface2;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = T.border.primary;
                e.currentTarget.style.color = T.text.subtle;
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {showAllItems ? 'weniger anzeigen' : `+${hiddenCount} weitere`}
            </button>
          )}

          <Divider />
        </>
      )}

      {/* FOOTER — micro stats */}
      <div style={{
        display: 'flex',
        gap: 28,
        flexWrap: 'wrap',
        fontFamily: T.font.mono,
      }}>
        <FooterStat
          value={story.capacity.volumeM3.toFixed(2)}
          unit="m³"
          label="Volumen"
          hot={story.capacity.volumePct >= 0.95}
        />
        <FooterStat
          value={Math.round(story.capacity.weightKg).toLocaleString('de-DE')}
          unit="kg"
          label="Gewicht"
          hot={story.capacity.weightPct >= 0.95}
        />
        <FooterStat
          value={fillValue}
          unit="%"
          label="Auslastung"
          hot={fillPct > 1}
        />
        {pallet.formats?.length > 0 && (
          <FooterStat
            value={pallet.formats.length}
            unit=""
            label={`Format${pallet.formats.length === 1 ? '' : 'e'}`}
          />
        )}
      </div>
    </article>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */

/* ─── SplitHeadlineHero ──────────────────────────────────────────────
   Cinematic version of SplitHeadline (used by PalletMiniCard). Splits
   the story headline by " · " into a tone-colored tag (top) and a
   large content phrase (bottom). When no separator, the whole
   headline becomes the big content line.
   ──────────────────────────────────────────────────────────────────── */
const TONE_TAG_COLOR_HERO = {
  warn:    T.status.warn.text,
  accent:  T.accent.text,
  cool:    '#1E40AF',
  special: T.text.primary,
  danger:  T.status.danger.text,
  neutral: T.text.subtle,
};

function SplitHeadlineHero({ headline, tone }) {
  if (!headline) return null;
  const parts = headline.split(' · ');
  const hasSplit = parts.length >= 2;
  const tag = hasSplit ? parts[0] : null;
  const content = hasSplit ? parts.slice(1).join(' · ') : headline;
  const tagColor = TONE_TAG_COLOR_HERO[tone] || T.text.subtle;

  return (
    <div>
      {tag && (
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: tagColor,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          fontFamily: T.font.mono,
          lineHeight: 1.1,
          marginBottom: 8,
        }}>
          {tag}
        </div>
      )}
      <h3 style={{
        margin: 0,
        fontSize: 'clamp(24px, 2.8vw, 32px)',
        fontWeight: 500,
        color: T.text.primary,
        letterSpacing: '-0.028em',
        lineHeight: 1.08,
      }}>
        {content}
      </h3>
    </div>
  );
}

function SectionEyebrow({ children }) {
  return (
    <span style={{
      fontSize: 9.5,
      fontWeight: 700,
      color: T.text.faint,
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
      fontFamily: T.font.mono,
    }}>
      {children}
    </span>
  );
}

function Divider() {
  return (
    <div style={{
      height: 1,
      background: T.border.primary,
      margin: '20px 0',
    }} />
  );
}

function ItemRow({ row, isLast }) {
  const it = row.item;
  const lvl = getDisplayLevel(it);
  const meta = LEVEL_META[lvl] || LEVEL_META[1];
  const isEsku = row.source === 'esku';
  const cartonsHere = it.placementMeta?.cartonsHere;
  const qty = isEsku
    ? (cartonsHere ?? it.einzelneSku?.cartonsCount ?? 1)
    : (it.units || 0);
  const qtyUnit = isEsku ? 'Karton' : 'Stk';
  const title = formatItemTitle(it.title);
  const [hover, setHover] = useState(false);

  return (
    <div
      title={it.title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '12px 1fr auto auto',
        alignItems: 'center',
        gap: 14,
        padding: '12px 4px',
        borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
        background: hover ? T.bg.surface2 : 'transparent',
        borderRadius: 6,
        margin: '0 -4px',
        paddingLeft: 12,
        paddingRight: 12,
        transition: 'background 140ms',
      }}
    >
      <span title={`L${lvl} · ${meta.name}`} style={{
        width: 10, height: 10,
        borderRadius: 2,
        background: meta.color,
        flexShrink: 0,
      }} />

      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13.5,
          fontWeight: 500,
          color: T.text.primary,
          letterSpacing: '-0.005em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{
          marginTop: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 10.5,
          color: T.text.faint,
          fontFamily: T.font.mono,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}>
          <span>L{lvl} {meta.shortName}</span>
          {isEsku && (
            <>
              <span style={{ color: T.border.strong }}>·</span>
              <span style={{ color: T.accent.text }}>ESKU</span>
            </>
          )}
        </div>
      </div>

      <div style={{
        textAlign: 'right',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          color: T.text.primary,
          fontFamily: T.font.mono,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          {qty.toLocaleString('de-DE')}
        </div>
        <div style={{
          marginTop: 4,
          fontSize: 9.5,
          color: T.text.faint,
          fontFamily: T.font.mono,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}>
          {qtyUnit}
        </div>
      </div>
    </div>
  );
}

function FooterStat({ value, unit, label, hot }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 3,
      }}>
        <span style={{
          fontSize: 16,
          fontWeight: 600,
          color: hot ? T.status.warn.text : T.text.primary,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          {value}
        </span>
        {unit && (
          <span style={{
            fontSize: 11,
            color: hot ? T.status.warn.text : T.text.faint,
            fontWeight: 500,
            opacity: 0.85,
          }}>
            {unit}
          </span>
        )}
      </div>
      <div style={{
        fontSize: 9.5,
        color: T.text.faint,
        fontFamily: T.font.mono,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontWeight: 600,
      }}>
        {label}
      </div>
    </div>
  );
}
