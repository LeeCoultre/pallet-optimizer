// @ts-nocheck — incremental TS migration: file renamed to .tsx, strict typing pending
import { useState, useRef, useCallback } from 'react';
import { PALLET } from '../data/boxes';

const SCALE = 2.5; // px per cm — 120cm → 300px, 80cm → 200px
const PAD = 16;

const SPLIT_MODES = [
  { id: 'none', label: 'No zones' },
  { id: 'half-x', label: 'Half (left/right)' },
  { id: 'half-y', label: 'Half (front/back)' },
  { id: 'quadrants', label: 'Quadrants' },
];

function computeZoneRects(mode, splitX, splitY) {
  const L = PALLET.length;
  const W = PALLET.width;
  const sx = Math.min(Math.max(splitX, 10), L - 10);
  const sy = Math.min(Math.max(splitY, 10), W - 10);

  if (mode === 'half-x') {
    return [
      { id: 'A', rect: { x: 0, y: 0, l: sx, w: W } },
      { id: 'B', rect: { x: sx, y: 0, l: L - sx, w: W } },
    ];
  }
  if (mode === 'half-y') {
    return [
      { id: 'A', rect: { x: 0, y: 0, l: L, w: sy } },
      { id: 'B', rect: { x: 0, y: sy, l: L, w: W - sy } },
    ];
  }
  if (mode === 'quadrants') {
    return [
      { id: 'A', rect: { x: 0, y: 0, l: sx, w: sy } },
      { id: 'B', rect: { x: sx, y: 0, l: L - sx, w: sy } },
      { id: 'C', rect: { x: 0, y: sy, l: sx, w: W - sy } },
      { id: 'D', rect: { x: sx, y: sy, l: L - sx, w: W - sy } },
    ];
  }
  return [];
}

const ZONE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
const ZONE_OPACITIES = ['33', '33', '33', '33'];

export default function ZoneEditor({ boxes, quantities, zones, onZonesChange }) {
  const [mode, setMode] = useState('none');
  const [splitX, setSplitX] = useState(PALLET.length / 2);
  const [splitY, setSplitY] = useState(PALLET.width / 2);
  const [zoneBoxMap, setZoneBoxMap] = useState({});
  const svgRef = useRef(null);
  const dragging = useRef(null);

  const activeBoxes = boxes.filter((b) => (quantities[b.id] || 0) > 0);

  const zoneRects = computeZoneRects(mode, splitX, splitY);

  const syncZones = useCallback((newRects, newMap) => {
    if (newRects.length === 0) {
      onZonesChange([]);
      return;
    }
    onZonesChange(
      newRects.map((z) => ({
        id: z.id,
        rect: z.rect,
        boxIds: newMap[z.id] || [],
      }))
    );
  }, [onZonesChange]);

  const handleModeChange = (m) => {
    setMode(m);
    const rects = computeZoneRects(m, splitX, splitY);
    syncZones(rects, zoneBoxMap);
  };

  const handleZoneBoxChange = (zoneId, boxId, checked) => {
    const updated = { ...zoneBoxMap };
    updated[zoneId] = checked
      ? [...(updated[zoneId] || []), boxId]
      : (updated[zoneId] || []).filter((id) => id !== boxId);
    setZoneBoxMap(updated);
    syncZones(zoneRects, updated);
  };

  // SVG drag to move split line
  const svgCoord = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - PAD) / SCALE,
      y: (e.clientY - rect.top - PAD) / SCALE,
    };
  };

  const onMouseDown = (e, axis) => {
    e.preventDefault();
    dragging.current = axis;
  };

  const onMouseMove = (e) => {
    if (!dragging.current) return;
    const { x, y } = svgCoord(e);
    if (dragging.current === 'x') {
      const nx = Math.round(Math.min(Math.max(x, 10), PALLET.length - 10));
      setSplitX(nx);
      const rects = computeZoneRects(mode, nx, splitY);
      syncZones(rects, zoneBoxMap);
    } else {
      const ny = Math.round(Math.min(Math.max(y, 10), PALLET.width - 10));
      setSplitY(ny);
      const rects = computeZoneRects(mode, splitX, ny);
      syncZones(rects, zoneBoxMap);
    }
  };

  const onMouseUp = () => { dragging.current = null; };

  const svgW = PALLET.length * SCALE + PAD * 2;
  const svgH = PALLET.width * SCALE + PAD * 2;

  return (
    <div className="zone-editor">
      <div className="zone-editor-title">Zone Layout</div>

      {/* Mode selector */}
      <div className="zone-mode-tabs">
        {SPLIT_MODES.map((m) => (
          <button
            key={m.id}
            className={`zone-mode-btn${mode === m.id ? ' active' : ''}`}
            onClick={() => handleModeChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* SVG pallet map */}
      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        style={{ display: 'block', cursor: dragging.current ? 'col-resize' : 'default', userSelect: 'none' }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Pallet background */}
        <rect
          x={PAD} y={PAD}
          width={PALLET.length * SCALE} height={PALLET.width * SCALE}
          fill="#1e293b" stroke="#334155" strokeWidth="1.5" rx="2"
        />

        {/* Zone fills */}
        {zoneRects.map((z, i) => (
          <rect
            key={z.id}
            x={PAD + z.rect.x * SCALE}
            y={PAD + z.rect.y * SCALE}
            width={z.rect.l * SCALE}
            height={z.rect.w * SCALE}
            fill={ZONE_COLORS[i % ZONE_COLORS.length] + '33'}
            stroke={ZONE_COLORS[i % ZONE_COLORS.length]}
            strokeWidth="1.5"
          />
        ))}

        {/* Zone labels */}
        {zoneRects.map((z, i) => (
          <text
            key={z.id + '-label'}
            x={PAD + (z.rect.x + z.rect.l / 2) * SCALE}
            y={PAD + (z.rect.y + z.rect.w / 2) * SCALE}
            textAnchor="middle" dominantBaseline="middle"
            fill={ZONE_COLORS[i % ZONE_COLORS.length]}
            fontSize="14" fontWeight="700"
          >
            {z.id}
          </text>
        ))}

        {/* Draggable split lines */}
        {(mode === 'half-x' || mode === 'quadrants') && (
          <line
            x1={PAD + splitX * SCALE} y1={PAD}
            x2={PAD + splitX * SCALE} y2={PAD + PALLET.width * SCALE}
            stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3"
            style={{ cursor: 'col-resize' }}
            onMouseDown={(e) => onMouseDown(e, 'x')}
          />
        )}
        {(mode === 'half-y' || mode === 'quadrants') && (
          <line
            x1={PAD} y1={PAD + splitY * SCALE}
            x2={PAD + PALLET.length * SCALE} y2={PAD + splitY * SCALE}
            stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3"
            style={{ cursor: 'row-resize' }}
            onMouseDown={(e) => onMouseDown(e, 'y')}
          />
        )}

        {/* Dimension labels */}
        <text x={PAD + PALLET.length * SCALE / 2} y={PAD - 5}
          textAnchor="middle" fill="#64748b" fontSize="10">
          120 cm
        </text>
        <text x={PAD - 5} y={PAD + PALLET.width * SCALE / 2}
          textAnchor="middle" fill="#64748b" fontSize="10"
          transform={`rotate(-90, ${PAD - 5}, ${PAD + PALLET.width * SCALE / 2})`}>
          80 cm
        </text>
      </svg>

      {/* Split position display */}
      {mode !== 'none' && (
        <div className="zone-split-info">
          {(mode === 'half-x' || mode === 'quadrants') && (
            <span>Split X: <strong>{splitX} cm</strong></span>
          )}
          {mode === 'quadrants' && <span> · </span>}
          {(mode === 'half-y' || mode === 'quadrants') && (
            <span>Split Y: <strong>{splitY} cm</strong></span>
          )}
        </div>
      )}

      {/* Zone assignments */}
      {zoneRects.length > 0 && activeBoxes.length > 0 && (
        <div className="zone-assignments">
          <div className="zone-assign-title">Assign box types to zones:</div>
          {zoneRects.map((z, zi) => (
            <div key={z.id} className="zone-assign-row">
              <div className="zone-assign-label" style={{ color: ZONE_COLORS[zi % ZONE_COLORS.length] }}>
                Zone {z.id}
              </div>
              <div className="zone-assign-checks">
                {activeBoxes.map((b) => (
                  <label key={b.id} className="zone-check-label">
                    <input
                      type="checkbox"
                      checked={(zoneBoxMap[z.id] || []).includes(b.id)}
                      onChange={(e) => handleZoneBoxChange(z.id, b.id, e.target.checked)}
                    />
                    <span className="swatch" style={{ background: b.color }} />
                    <span>{b.shortCode || b.name.slice(0, 8)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}