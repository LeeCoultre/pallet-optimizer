// @ts-nocheck — incremental TS migration: file renamed to .tsx, strict typing pending
const fmt = (n) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

export default function InstructionsPanel({
  mode, layers, zones, unplaced, quantities, stats, colorMap,
  // Lock-related props (optional)
  placedBoxes = [],
  lockedZones = [],
  onLock,
  onUnlock,
  onClearLocks,
  boxesById = {},
}) {
  const requested = Object.values(quantities).reduce((a, b) => a + (b || 0), 0);
  const unplacedCount = Object.values(unplaced || {}).reduce((a, b) => a + b, 0);
  const placedCount = stats?.totalBoxes ?? 0;
  const allFit = unplacedCount === 0 && requested > 0;
  const noInput = requested === 0;

  // Lockable types in the current (un-locked) result.
  // Group new placed boxes by type so user can lock any of them as a zone.
  const lockableByType = {};
  for (const b of placedBoxes) {
    const tid = b.typeId || b.type_id;
    if (b._locked) continue;  // already locked
    (lockableByType[tid] = lockableByType[tid] || []).push(b);
  }
  const lockableTypes = Object.entries(lockableByType);

  return (
    <aside className="instructions">
      <div className="instructions-header">
        <h2>Assembly Guide</h2>
        {mode && !noInput && (
          <span className={`mode-tag mode-${mode}`}>
            {mode === 'column-hybrid' ? 'zones' : 'layers'}
          </span>
        )}
      </div>

      {noInput && (
        <div className="instr-empty">
          Add box quantities on the left — an assembly guide will appear here.
        </div>
      )}

      {!noInput && (
        <div className={`instr-banner ${allFit ? 'ok' : 'warn'}`}>
          {allFit ? (
            <>
              <span className="instr-icon">✓</span>
              <span>
                All fit: <strong>{placedCount}/{requested}</strong>{' '}
                {mode === 'column-hybrid'
                  ? `in ${zones.length} zone${zones.length !== 1 ? 's' : ''}`
                  : `in ${layers.length} layer${layers.length !== 1 ? 's' : ''}`}
              </span>
            </>
          ) : (
            <>
              <span className="instr-icon">⚠</span>
              <div>
                <div><strong>{unplacedCount}</strong> box{unplacedCount !== 1 ? 'es' : ''} don't fit:</div>
                <ul className="instr-unplaced">
                  {Object.entries(unplaced || {}).map(([id, n]) => (
                    <li key={id}>
                      <span className="swatch" style={{ background: colorMap?.[id] || '#888' }} />
                      {id}: <strong>{n}</strong> pcs
                    </li>
                  ))}
                </ul>
                <div className="instr-hint">Use a second pallet or reduce quantities.</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── LOCKED ZONES (immutable, green-outlined) ── */}
      {lockedZones.length > 0 && (
        <div className="locked-zones-section">
          <div className="locked-zones-head">
            <h3>🔒 Locked zones</h3>
            {onClearLocks && (
              <button className="btn-icon" onClick={onClearLocks} title="Unlock all">
                Unlock all
              </button>
            )}
          </div>
          <div className="locked-zones-hint">
            These zones are frozen. Change qty or add new types and click <strong>Optimize</strong> to fill above.
          </div>
          <ul className="locked-zones-list">
            {lockedZones.map((z) => {
              const box = boxesById[z.typeId] || {};
              return (
                <li key={z.id} className="locked-zone-card">
                  <span className="swatch" style={{ background: colorMap?.[z.typeId] || '#888' }} />
                  <div className="locked-zone-info">
                    <div className="locked-zone-name">{box.name || z.typeId}</div>
                    <div className="locked-zone-meta">
                      {z.qty} pcs · {fmt(z.bbox.l)}×{fmt(z.bbox.w)}×{fmt(z.bbox.h)} cm
                      · z={fmt(z.bbox.z)}–{fmt(z.bbox.z + z.bbox.h)}
                    </div>
                  </div>
                  {onUnlock && (
                    <button
                      className="btn-icon btn-unlock"
                      onClick={() => onUnlock(z.id)}
                      title="Unlock — boxes return to leftover pool"
                    >
                      🔓
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── LOCK CURRENT ZONES (one button per type in fresh result) ── */}
      {onLock && lockableTypes.length > 0 && !noInput && (
        <div className="lockable-zones-section">
          <div className="lockable-head">
            <h3>Freeze a zone</h3>
            <span className="lockable-hint">Lock to keep when adding more boxes</span>
          </div>
          <ul className="lockable-list">
            {lockableTypes.map(([tid, bs]) => {
              const box = boxesById[tid] || {};
              const zMin = Math.min(...bs.map((b) => b.z));
              const zMax = Math.max(...bs.map((b) => b.z + b.h));
              return (
                <li key={tid} className="lockable-row">
                  <span className="swatch" style={{ background: colorMap?.[tid] || '#888' }} />
                  <div className="lockable-info">
                    <div className="lockable-name">{box.name || tid}</div>
                    <div className="lockable-meta">
                      {bs.length} pcs · z={fmt(zMin)}–{fmt(zMax)} cm
                    </div>
                  </div>
                  <button
                    className="btn-lock"
                    onClick={() => onLock(tid)}
                    title="Lock this zone — won't move when re-optimizing"
                  >
                    🔒 Lock
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ZONES mode (column-hybrid) */}
      {mode === 'column-hybrid' && zones.length > 0 && (
        <ol className="zone-card-list">
          {zones.map((z) => <ZoneCard key={z.id} zone={z} colorMap={colorMap} />)}
        </ol>
      )}

      {/* LAYERS mode */}
      {mode !== 'column-hybrid' && layers.length > 0 && (
        <ol className="layer-list">
          {layers.map((l) => <LayerCard key={l.index} layer={l} colorMap={colorMap} />)}
        </ol>
      )}
    </aside>
  );
}

function ZoneCard({ zone, colorMap }) {
  const typeId = zone.typeId || zone.type_id;
  const color = colorMap?.[typeId] || zone.type?.color || '#334155';
  const ori = zone.orientation || {};
  const rect = zone.rect || {};
  const grid = zone.grid || {};
  const kindLabel = (ori.kind === 'flat' || zone.kind === 'flat') ? 'flat' : 'on edge';

  return (
    <li className="zone-card" style={{ borderLeftColor: color }}>
      <div className="zone-card-head">
        <span className="zone-id">Zone {zone.id}</span>
        <span className="zone-kind">{kindLabel}</span>
        <span className="zone-boxes">{zone.boxes} pcs</span>
      </div>
      <div className="zone-card-body">
        <div className="zone-type-line">
          <span className="swatch" style={{ background: color }} />
          <strong>{zone.type?.name || typeId}</strong>
        </div>
        <div className="zone-grid-line">
          Grid <strong>{grid.cols} × {grid.rows}</strong> per tier
          · <strong>{zone.tiers}</strong> tier{zone.tiers !== 1 ? 's' : ''}
        </div>
        <div className="zone-meta">
          Zone: {fmt(rect.l || 0)} × {fmt(rect.w || 0)} cm · height {fmt(zone.zTop || zone.z_top || 0)} cm
        </div>
      </div>
    </li>
  );
}

function LayerCard({ layer, colorMap }) {
  const zFrom = fmt(layer.zBottom ?? layer.z?.[0] ?? 0);
  const zTo = fmt(layer.zTop ?? layer.z?.[1] ?? 0);
  const breakdown = layer.typeBreakdown || layer.type_breakdown || {};
  const desc = layer.description || {};
  const zonesDesc = desc.zones || [];

  const primaryId = Object.keys(breakdown)[0];
  const primaryColor = colorMap?.[primaryId] || '#334155';

  const kindLabels = {
    pure: 'Pure layer',
    'half-split': 'Two zones',
    'center-cap': 'Cap',
    'mixed-edge': 'Flat + edge',
  };

  return (
    <li className="layer-card" style={{ borderLeftColor: primaryColor }}>
      <div className="layer-head">
        <span className="layer-num">Layer {layer.index}</span>
        <span className="layer-z">{zFrom}–{zTo} cm</span>
        <span className={`layer-kind kind-${layer.kind}`}>
          {kindLabels[layer.kind] || layer.kind}
        </span>
      </div>
      <div className="layer-headline">
        {Object.entries(breakdown).map(([id, n]) => (
          <span key={id} className="type-chip">
            <span className="swatch" style={{ background: colorMap?.[id] || '#888' }} />
            <strong>{n}</strong>&nbsp;×&nbsp;{id}
          </span>
        ))}
      </div>
      {desc.headline && <div className="layer-headline-text">{desc.headline}</div>}
      {desc.body && <div className="layer-body">{desc.body}</div>}
      {zonesDesc.length > 0 && (
        <ul className="zone-list">
          {zonesDesc.map((z, i) => (
            <li key={i}>
              <span className="zone-label">{z.label}</span>
              <span className="zone-text">{z.text}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}