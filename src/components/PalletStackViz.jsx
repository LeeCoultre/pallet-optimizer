/* PalletStackViz — vertical 6-level stack of one EUR pallet.
   Bottom = Level 1 (Thermorollen), Top = Level 6 (Tachorollen).
   Layer height = volume on that level (cartons normalized).
   Hover any layer for tooltip with carton count + weight + volume.

   Two sizes:
     "row"  — compact 36×72 inline cell, no labels (used in pallet table)
     "card" — full 180×320 with axis labels + ESKU markers (expanded view) */

import { useState } from 'react';
import { LEVEL_META } from '../utils/auftragHelpers.js';
import { T } from './ui.jsx';

const PALLET_VOL_M3   = 1.59;
const PALLET_WEIGHT_KG = 700;

export default function PalletStackViz({ palletState, size = 'row', onClick }) {
  const W = size === 'card' ? 130 : 36;        // narrower so card fits 220px column with legend
  const H = size === 'card' ? 280 : 72;
  const showLabels = size === 'card';

  const ps = palletState;
  if (!ps) {
    return (
      <div style={{
        width: W, height: H,
        background: T.bg.surface3,
        borderRadius: T.radius.sm,
      }} />
    );
  }

  // Compute volume per level (cm³)
  const volByLevel = {};
  for (let lvl = 1; lvl <= 6; lvl++) {
    const items = ps.byLevel?.[lvl] || [];
    volByLevel[lvl] = items.reduce((s, x) => s + (x.volCm3 || 0), 0);
  }
  const palletVolCm3 = PALLET_VOL_M3 * 1e6;
  const totalUsed = Object.values(volByLevel).reduce((s, v) => s + v, 0);
  // Each level's height is proportional to its share of pallet capacity (capped at 100%)
  const levelHeights = {};
  for (let lvl = 1; lvl <= 6; lvl++) {
    levelHeights[lvl] = Math.min(1, volByLevel[lvl] / palletVolCm3) * H;
  }

  const overloadW = ps.overloadFlags?.has?.('OVERLOAD-W');
  const overloadV = ps.overloadFlags?.has?.('OVERLOAD-V');
  const noValid = (ps.byLevel ? Object.values(ps.byLevel) : [])
    .flat()
    .some((x) => x.item?.placementMeta?.flags?.includes?.('NO_VALID_PLACEMENT'));

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: showLabels ? 'column' : 'row',  // stack legend BELOW in card mode
        gap: showLabels ? 12 : 0,
        alignItems: 'flex-start',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <StackPyramid
        width={W}
        height={H}
        levelHeights={levelHeights}
        volByLevel={volByLevel}
        palletState={ps}
        showLabels={showLabels}
        outline={overloadW || overloadV ? T.status.danger.main : T.border.strong}
      />

      {showLabels && (
        <Legend palletState={ps} totalVol={totalUsed} width={W} />
      )}

      {(overloadW || overloadV || noValid) && (
        <div style={{
          position: 'absolute',
          top: -6, right: -6,
          width: 16, height: 16,
          borderRadius: '50%',
          background: noValid ? '#DC2626' : T.status.warn.main,
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}>
          !
        </div>
      )}
    </div>
  );
}

/* ─── Pyramid SVG ─────────────────────────────────────────────────────── */
function StackPyramid({ width, height, levelHeights, volByLevel, palletState, showLabels, outline }) {
  const [hover, setHover] = useState(null);
  // Stack bottom-up: Level 1 at the bottom, Level 6 at the top
  let yCursor = height;
  const layers = [];
  for (let lvl = 1; lvl <= 6; lvl++) {
    const h = levelHeights[lvl];
    if (h <= 0) continue;
    yCursor -= h;
    layers.push({ lvl, y: yCursor, h });
  }

  // Empty space outline
  const emptyY = 0;
  const emptyH = layers.length === 0 ? height : layers[layers.length - 1].y;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={width}
        height={height}
        style={{
          display: 'block',
          background: T.bg.surface,
          border: `1px solid ${outline}`,
          borderRadius: 4,
          overflow: 'visible',
        }}
      >
        {/* Empty space — dashed border on top */}
        {emptyH > 0 && (
          <rect
            x={0}
            y={emptyY}
            width={width}
            height={emptyH}
            fill={T.bg.surface3}
            opacity={0.4}
          />
        )}

        {/* Pallet base — small dark line at bottom */}
        <rect
          x={0}
          y={height - 1}
          width={width}
          height={1}
          fill={T.text.faint}
        />

        {layers.map(({ lvl, y, h }) => {
          const meta = LEVEL_META[lvl];
          const isHover = hover === lvl;
          const items = palletState.byLevel?.[lvl] || [];
          const eskuCount = items.filter((x) => x.source === 'esku').length;
          return (
            <g
              key={lvl}
              onMouseEnter={() => setHover(lvl)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'help' }}
            >
              <rect
                x={0}
                y={y}
                width={width}
                height={h}
                fill={meta.color}
                opacity={isHover ? 1 : 0.85}
                stroke={isHover ? '#000' : 'transparent'}
                strokeWidth={1}
              />
              {/* ESKU dot indicators on the right edge */}
              {eskuCount > 0 && showLabels && h >= 12 && (
                <text
                  x={width - 6}
                  y={y + h / 2 + 3}
                  textAnchor="end"
                  fontSize={9}
                  fontFamily={T.font.mono}
                  fill="#fff"
                  fontWeight={700}
                >
                  +{eskuCount}
                </text>
              )}
              {showLabels && h >= 16 && (
                <text
                  x={6}
                  y={y + h / 2 + 3}
                  fontSize={10}
                  fontFamily={T.font.ui}
                  fill="#fff"
                  fontWeight={600}
                >
                  L{lvl}
                </text>
              )}
            </g>
          );
        })}

        {/* Empty top dashed line */}
        {emptyH > 4 && (
          <line
            x1={0}
            x2={width}
            y1={emptyH}
            y2={emptyH}
            stroke={T.text.faint}
            strokeDasharray="2 3"
            strokeWidth={1}
          />
        )}
      </svg>

      {hover && (
        <Tooltip
          level={hover}
          volCm3={volByLevel[hover]}
          items={palletState.byLevel?.[hover] || []}
          x={width + 6}
          y={layers.find((l) => l.lvl === hover)?.y ?? 0}
        />
      )}
    </div>
  );
}

function Tooltip({ level, volCm3, items, x, y }) {
  const meta = LEVEL_META[level];
  const cartonCount = items.reduce((s, x) => s + (x.cartons || 0), 0);
  const weightKg = items.reduce((s, x) => s + (x.weightKg || 0), 0);
  const eskuCount = items.filter((x) => x.source === 'esku').length;
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      zIndex: 50,
      background: T.bg.surface,
      border: `1px solid ${T.border.strong}`,
      borderRadius: T.radius.sm,
      boxShadow: T.shadow.raised,
      padding: '8px 10px',
      fontSize: 11.5,
      fontFamily: T.font.ui,
      color: T.text.primary,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          width: 10, height: 10, borderRadius: 2,
          background: meta.color,
        }} />
        <strong>L{level} · {meta.name}</strong>
      </div>
      <div style={{ color: T.text.subtle, fontSize: 11 }}>
        {cartonCount} {cartonCount === 1 ? 'Karton' : 'Kartons'}
        {' · '}{weightKg.toFixed(1)} kg
        {' · '}{(volCm3 / 1e6).toFixed(3)} m³
      </div>
      {eskuCount > 0 && (
        <div style={{ color: T.accent.main, fontSize: 11, marginTop: 2, fontWeight: 600 }}>
          + {eskuCount} ESKU
        </div>
      )}
    </div>
  );
}

/* ─── Legend (right of card-size pyramid) ─────────────────────────────── */
function Legend({ palletState, totalVol, width }) {
  const ps = palletState;
  const palletVolCm3 = PALLET_VOL_M3 * 1e6;
  const fillPct = Math.min(100, Math.round((ps.volCm3 / palletVolCm3) * 100));
  const wgtPct = Math.min(100, Math.round((ps.weightKg / PALLET_WEIGHT_KG) * 100));
  const overW = ps.weightKg > PALLET_WEIGHT_KG;
  const overV = ps.volCm3 > palletVolCm3;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontSize: 11.5,
      fontFamily: T.font.ui,
      width: width || 130,
    }}>
      <Stat
        label="Volumen"
        value={`${(ps.volCm3 / 1e6).toFixed(2)} / 1.59 m³`}
        pct={fillPct}
        warning={overV}
      />
      <Stat
        label="Gewicht"
        value={`${ps.weightKg.toFixed(0)} / 700 kg`}
        pct={wgtPct}
        warning={overW}
      />
      {ps.anyEsku && (
        <div style={{
          marginTop: 2,
          padding: '3px 7px',
          background: T.accent.bg,
          borderRadius: T.radius.sm,
          color: T.accent.text,
          fontSize: 10.5,
          fontWeight: 600,
          textAlign: 'center',
        }}>
          + ESKU verteilt
        </div>
      )}
      {ps.overloadFlags?.size > 0 && (
        <div style={{
          padding: '3px 7px',
          background: T.status.danger.bg,
          border: `1px solid ${T.status.danger.border}`,
          borderRadius: T.radius.sm,
          color: T.status.danger.text,
          fontSize: 10.5,
          fontWeight: 600,
          textAlign: 'center',
        }}>
          ⚠ {[...ps.overloadFlags].join(' · ')}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, pct, warning }) {
  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 3,
      }}>
        <span style={{ color: T.text.subtle, fontWeight: 500, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{
          color: warning ? T.status.danger.text : T.text.primary,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </span>
      </div>
      <div style={{
        height: 4,
        background: T.bg.surface3,
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(100, pct)}%`,
          height: '100%',
          background: warning ? T.status.danger.main
            : pct >= 92 ? T.status.warn.main
            : T.accent.main,
          transition: 'width 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>
    </div>
  );
}
