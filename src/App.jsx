import { useState, useMemo, useCallback, useRef } from 'react';
import { BOX_TYPES, BOX_BY_ID, PALLET, normalizeBox } from './data/boxes';
import { packSmart } from './utils/pack';
import { packPalletAPI, importXlsxAPI, checkBackend } from './api';
import PalletViewer from './components/PalletViewer';
import BoxInputs from './components/BoxInputs';
import StatsBar from './components/StatsBar';
import InstructionsPanel from './components/InstructionsPanel';
import ZoneEditor from './components/ZoneEditor';
import LayerNavigator from './components/LayerNavigator';
import TopViewEditor from './components/TopViewEditor';
import LayerBuilderPanel from './components/LayerBuilderPanel';
import LagerauftragParser from './components/LagerauftragParser';
import './App.css';

const initialQuantities = Object.fromEntries(BOX_TYPES.map((b) => [b.id, 0]));
const AUTO_COLORS = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
  '#06b6d4','#a855f7','#ec4899','#14b8a6','#f97316',
];

export default function App() {
  // Box library
  const [customBoxes, setCustomBoxes] = useState([]);
  const allBoxes = useMemo(() => [...BOX_TYPES, ...customBoxes], [customBoxes]);

  // Quantities
  const [quantities, setQuantities] = useState(initialQuantities);

  // User-defined zones
  const [userZones, setUserZones] = useState([]);

  // API result vs local result
  const [apiResult, setApiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [backendAvailable, setBackendAvailable] = useState(null);

  // UI state
  const [activeLayer, setActiveLayer] = useState(null);
  const [transparency, setTransparency] = useState(0.88);
  const [show2DEditor, setShow2DEditor] = useState(false);
  const [activeTab, setActiveTab] = useState('library');
  // CP-SAT mode: provably optimal but slower (~1-30s)
  const [optimalMode, setOptimalMode] = useState(false);
  // Locked zones from previous Optimize runs — immovable, act as obstacles.
  // Each: {id, typeId, qty, boxes: [...placedBox], bbox: {x,y,z,l,w,h}}
  const [lockedZones, setLockedZones] = useState([]);

  // Top-level page toggle: 'pallet' (3D viewer) | 'lagerauftrag' (docx parser)
  const [page, setPage] = useState('pallet');

  // ── Layer Builder mode ──
  // User builds the pallet layer by layer; each layer is computed via
  // /api/single-layer. builderLayers is the ordered stack; builderPreview
  // is the unconfirmed top layer being shown in 3D.
  const [builderLayers, setBuilderLayers] = useState([]);
  const [builderPreview, setBuilderPreview] = useState(null);

  const isBuilderTab = activeTab === 'builder';

  // Z-coordinate at which the next builder layer would start
  const currentBuilderZ = useMemo(
    () => PALLET.height + builderLayers.reduce((s, l) => s + l.layerH, 0),
    [builderLayers]
  );

  // Flatten builder layers + preview into a placedBoxes array for PalletViewer
  const builderPlacedBoxes = useMemo(() => {
    const confirmed = builderLayers.flatMap((layer, li) =>
      (layer.positions || []).map((p) => ({
        ...p,
        layer_index: li + 1,
        layerIndex: li + 1,
        _locked: true,
      }))
    );
    const previewBoxes =
      builderPreview && builderPreview.positions
        ? builderPreview.positions.map((p) => ({
            ...p,
            layer_index: builderLayers.length + 1,
            layerIndex: builderLayers.length + 1,
            _locked: false,
          }))
        : [];
    return [...confirmed, ...previewBoxes];
  }, [builderLayers, builderPreview]);

  // Synthetic stats object for builder mode (matches StatsBar shape)
  const builderStats = useMemo(() => {
    const totalBoxes = builderLayers.reduce((s, l) => s + l.count, 0);
    const totalHeight = Math.max(0, currentBuilderZ - PALLET.height);
    return {
      totalBoxes,
      total_boxes: totalBoxes,
      requested: totalBoxes,
      layerCount: builderLayers.length,
      layer_count: builderLayers.length,
      totalHeight,
      total_height: totalHeight,
      fillPct: 0,
      fill_pct: 0,
      efficiency: 0,
      unplaced: {},
      mode: 'builder',
    };
  }, [builderLayers, currentBuilderZ]);

  // ── Locked-zone helpers ──
  // Total qty already locked per type (used to subtract from user's qty).
  const lockedQtyByType = useMemo(() => {
    const m = {};
    for (const z of lockedZones) {
      m[z.typeId] = (m[z.typeId] || 0) + z.qty;
    }
    return m;
  }, [lockedZones]);

  // Effective qty for the optimizer = user qty − locked qty (clamped to 0).
  const effectiveQuantities = useMemo(() => {
    const out = {};
    for (const k of Object.keys(quantities)) {
      out[k] = Math.max(0, (quantities[k] || 0) - (lockedQtyByType[k] || 0));
    }
    return out;
  }, [quantities, lockedQtyByType]);

  // Live local result (instant, no API). Uses effective qty so locked
  // boxes aren't double-counted; the local packer still doesn't know
  // about obstacles, so it's only safe to display when no locks exist.
  const localResult = useMemo(
    () => packSmart(allBoxes, effectiveQuantities),
    [allBoxes, effectiveQuantities]
  );

  // Lock a zone — extract all boxes of one type from the LATEST API result
  // (snapshots their exact positions). Local-packer results aren't lockable
  // because the user might re-pack to a different layout on Optimize.
  const handleLockZone = (typeId) => {
    if (!apiResult) return;
    const zoneBoxes = (apiResult.placedBoxes || []).filter(
      (b) => (b.typeId || b.type_id) === typeId && !b._locked
    );
    if (zoneBoxes.length === 0) return;

    // Bounding box of the zone (becomes the obstacle in CP-SAT).
    const xs = zoneBoxes.map((b) => b.x);
    const ys = zoneBoxes.map((b) => b.y);
    const zs = zoneBoxes.map((b) => b.z);
    const xe = zoneBoxes.map((b) => b.x + b.l);
    const ye = zoneBoxes.map((b) => b.y + b.w);
    const ze = zoneBoxes.map((b) => b.z + b.h);
    const bbox = {
      x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs),
      l: Math.max(...xe) - Math.min(...xs),
      w: Math.max(...ye) - Math.min(...ys),
      h: Math.max(...ze) - Math.min(...zs),
    };

    // Snapshot positions deeply so further state mutations can't affect
    // them. Boxes carry the _locked flag for the renderer.
    const frozen = zoneBoxes.map((b) => ({ ...b, _locked: true }));

    setLockedZones((prev) => [
      ...prev,
      {
        id: `lock_${Date.now()}`,
        typeId,
        qty: zoneBoxes.length,
        boxes: frozen,
        bbox,
      },
    ]);
    // IMPORTANT: keep the API result around — we'll show locked boxes from
    // lockedZones state and DROP the now-stale free boxes by filtering on
    // _locked in the display memo. Setting apiResult=null caused the local
    // packer to re-render boxes at fresh positions, producing the visual
    // "slip". Instead, strip the just-locked boxes from apiResult so we
    // show locked boxes (from lockedZones) without duplicates.
    setApiResult((prev) => {
      if (!prev) return prev;
      const remaining = (prev.placedBoxes || []).filter(
        (b) => (b.typeId || b.type_id) !== typeId
      );
      return { ...prev, placedBoxes: remaining };
    });
  };

  const handleUnlockZone = (lockId) => {
    setLockedZones((prev) => prev.filter((z) => z.id !== lockId));
    // Don't touch apiResult — user can re-Optimize to refresh layout.
  };

  const handleClearLocks = () => {
    setLockedZones([]);
  };

  // ── What we display ──
  // When no locks: show baseResult as-is (apiResult or live local preview).
  // When locks exist: show locked boxes + only API-placed (CP-SAT-aware)
  // free boxes. The local preview is hidden because the local JS packer
  // ignores obstacles and would render boxes overlapping the locked region.
  const baseResult = apiResult ?? localResult;
  const result = useMemo(() => {
    if (lockedZones.length === 0) return baseResult;

    const lockedBoxes = lockedZones.flatMap((z) => z.boxes);
    // Only include FREE boxes from the latest API call (CP-SAT respected
    // the obstacles). If no API result yet, just show locked.
    const freeBoxes = apiResult
      ? (apiResult.placedBoxes || []).filter((b) => !b._locked)
      : [];

    const all = [...lockedBoxes, ...freeBoxes];

    // Renumber layer_index globally across locked + free so the
    // LayerNavigator stays consistent.
    const zKey = (b) => Math.round(b.z * 100) / 100;
    const zSet = [...new Set(all.map(zKey))].sort((a, b) => a - b);
    const zToIdx = new Map(zSet.map((z, i) => [z, i + 1]));
    const renumbered = all.map((b) => ({ ...b, layerIndex: zToIdx.get(zKey(b)) }));

    const totalH = renumbered.length
      ? Math.max(...renumbered.map((b) => b.z + b.h))
      : 0;
    const totalVol = renumbered.reduce(
      (s, b) => s + b.l * b.w * b.h, 0
    );
    const palletVol = PALLET.length * PALLET.width * Math.max(totalH, 0.001);

    // Combined unplaced = original-qty minus everything we're displaying
    const placedByType = {};
    for (const b of renumbered) {
      const tid = b.typeId || b.type_id;
      placedByType[tid] = (placedByType[tid] || 0) + 1;
    }
    const unplaced = {};
    for (const [tid, qty] of Object.entries(quantities)) {
      const diff = (qty || 0) - (placedByType[tid] || 0);
      if (diff > 0) unplaced[tid] = diff;
    }

    // Synthesise layer descriptors covering BOTH locked and free boxes
    // so the LayerNavigator can browse the whole stack consistently.
    const synthLayers = zSet.map((z, i) => {
      const ofLayer = renumbered.filter((b) => zKey(b) === z);
      const breakdown = {};
      for (const b of ofLayer) {
        const tid = b.typeId || b.type_id;
        breakdown[tid] = (breakdown[tid] || 0) + 1;
      }
      const maxH = Math.max(...ofLayer.map((b) => b.h));
      const lockedInLayer = ofLayer.some((b) => b._locked);
      return {
        index: i + 1,
        zBottom: z,
        zTop: Math.round((z + maxH) * 100) / 100,
        kind: Object.keys(breakdown).length === 1 ? 'pure' : 'mixed-edge',
        typeBreakdown: breakdown,
        description: {
          headline: `${ofLayer.length} boxes${lockedInLayer ? ' 🔒' : ''}`,
          body: Object.entries(breakdown)
            .map(([tid, n]) => `${n}× ${tid}`).join(', '),
          zones: [],
        },
        count: ofLayer.length,
      };
    });

    return {
      mode: apiResult?.mode || baseResult.mode || 'layered',
      placedBoxes: renumbered,
      layers: synthLayers,
      zones: [],
      stats: {
        totalBoxes: renumbered.length,
        requested: Object.values(quantities).reduce((s, n) => s + (n || 0), 0),
        totalHeight: Math.round(totalH * 10) / 10,
        layerCount: zSet.length,
        fillPct: palletVol > 0
          ? Math.round((totalVol / palletVol) * 1000) / 10
          : 0,
        efficiency: palletVol > 0
          ? Math.round((totalVol / palletVol) * 10000) / 10000
          : 0,
        unplaced,
        mode: apiResult?.mode || 'layered',
      },
    };
  }, [baseResult, lockedZones, apiResult, quantities]);

  // Color map for all boxes (builtin + custom).
  // Include both original IDs and their camelCase variants because the API's
  // snakeToCamel conversion transforms type_breakdown keys like
  // "therm_20r_57x35_lst" → "therm_20r_57x35Lst".
  const colorMap = useMemo(() => {
    const m = {};
    for (const t of allBoxes) {
      m[t.id] = t.color;
      const camelId = t.id.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (camelId !== t.id) m[camelId] = t.color;
    }
    return m;
  }, [allBoxes]);

  // Reset everything
  const handleReset = () => {
    const resetQty = Object.fromEntries(allBoxes.map((b) => [b.id, 0]));
    setQuantities(resetQty);
    setApiResult(null);
    setActiveLayer(null);
    setUserZones([]);
    setError(null);
  };

  // Run optimization via API (with local fallback).
  // If lockedZones exist, send them as fixed_obstacles and reduce qty
  // by what's already placed. CP-SAT mode is forced when locks exist
  // (other strategies don't support obstacles yet).
  const handleOptimize = async () => {
    const totalEffective = Object.values(effectiveQuantities).reduce((s, n) => s + (n || 0), 0);
    if (totalEffective === 0 && lockedZones.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const avail = await checkBackend();
      setBackendAvailable(avail);

      if (!avail) {
        setApiResult(localResult);
        setError('Backend offline — using local optimizer (locks ignored)');
      } else {
        // When locks exist, force CP-SAT and pass bboxes as obstacles.
        const useObstacles = lockedZones.length > 0;
        const obstacles = useObstacles
          ? lockedZones.map((z) => ({
              x: z.bbox.x, y: z.bbox.y, z: z.bbox.z,
              l: z.bbox.l, w: z.bbox.w, h: z.bbox.h,
              type_id: z.typeId,
            }))
          : [];

        const res = await packPalletAPI(
          allBoxes,
          effectiveQuantities,
          {
            length: PALLET.length,
            width: PALLET.width,
            palletHeight: PALLET.height,
            maxTotalHeight: PALLET.maxTotalHeight,
          },
          {
            maxKontovkaColumns: 3,
            zones: userZones,
            preferredMode: useObstacles || optimalMode ? 'cpsat' : 'auto',
            cpsatTimeLimitS: 30,
            fixedObstacles: obstacles,
          }
        );
        setApiResult(res);
      }
      setActiveLayer(null);
    } catch (e) {
      setError(e.message);
      setApiResult(localResult);
    } finally {
      setLoading(false);
    }
  };

  // xlsx import
  const handleXlsxImport = async (file) => {
    try {
      const res = await importXlsxAPI(file);
      if (res.boxes && res.boxes.length > 0) {
        const newBoxes = res.boxes.map((b, i) => normalizeBox({
          id: `custom_${Date.now()}_${i}`,
          name: b.name,
          shortCode: b.name.slice(0, 8),
          group: 'Imported',
          length: b.length,
          width: b.width,
          height: b.height,
          maxPerPallet: b.maxPerPallet ?? null,
          color: AUTO_COLORS[(customBoxes.length + i) % AUTO_COLORS.length],
          weightKg: null,
          topLoadLimitKg: null,
          isCustom: true,
        }));
        setCustomBoxes((prev) => [...prev, ...newBoxes]);
        setQuantities((prev) => ({
          ...prev,
          ...Object.fromEntries(newBoxes.map((b) => [b.id, 0])),
        }));
        if (res.warnings?.length) {
          setError('Import warnings: ' + res.warnings.join(' | '));
        }
      }
    } catch (e) {
      setError('Import failed: ' + e.message);
    }
  };

  // Custom box add
  const handleAddCustomBox = (boxDef) => {
    const box = normalizeBox({
      id: `custom_${Date.now()}`,
      group: 'Custom',
      shortCode: boxDef.name.slice(0, 6),
      ...boxDef,
    });
    setCustomBoxes((prev) => [...prev, box]);
    setQuantities((prev) => ({ ...prev, [box.id]: 0 }));
  };

  // Manual edit from 2D editor
  const handleResultChange = useCallback((updated) => {
    setApiResult(updated);
  }, []);

  const totalQty = Object.values(quantities).reduce((s, n) => s + (n || 0), 0);

  // Top-level: show docx parser as a separate page
  if (page === 'lagerauftrag') {
    return <LagerauftragParser onBack={() => setPage('pallet')} />;
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-logo" aria-label="Pallet Optimizer" />
          <h1>Pallet Optimizer</h1>
          <span className="subtitle">120 × 80 cm · max 180 cm</span>
          {backendAvailable === false && (
            <span className="badge badge-offline">local mode</span>
          )}
          {backendAvailable === true && (
            <span className="badge badge-online">live</span>
          )}
        </div>
        <div className="app-header-right">
          <label
            className={`optimal-mode-toggle${optimalMode ? ' active' : ''}`}
            title="CP-SAT solver: provably optimal but slower (1–30 s)&#10;Off: fast heuristic search (~0.2 s)"
          >
            <input
              type="checkbox"
              checked={optimalMode}
              onChange={(e) => setOptimalMode(e.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
            <span>Optimal&nbsp;mode</span>
          </label>
          <button
            className="btn-secondary"
            onClick={() => setPage('lagerauftrag')}
            title="Lagerauftrag .docx Parser"
            style={{ marginRight: 4 }}
          >
            📄 Lagerauftrag
          </button>
          <button className="btn-secondary" onClick={handleReset}>Reset</button>
          <button
            className={`btn-primary${loading ? ' loading' : ''}`}
            onClick={handleOptimize}
            disabled={loading || totalQty === 0}
          >
            {loading ? 'Optimizing…' : 'Optimize'}
          </button>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <div className="error-banner">
          ⚠ {error}
          <button className="error-close" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── Main 3-panel ── */}
      <div className="main">
        {/* LEFT PANEL */}
        <aside className="sidebar">
          <div className="tab-bar">
            {['library', 'session', 'zones', 'builder'].map((t) => (
              <button
                key={t}
                className={`tab-btn${activeTab === t ? ' active' : ''}`}
                onClick={() => setActiveTab(t)}
              >
                {t === 'library'
                  ? '📦 Library'
                  : t === 'session'
                  ? '🗃 Session'
                  : t === 'zones'
                  ? '🗺 Zones'
                  : '🧱 Слоями'}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {activeTab === 'library' && (
              <BoxInputs
                boxes={allBoxes}
                quantities={quantities}
                setQuantities={setQuantities}
                onAddCustom={handleAddCustomBox}
                onXlsxImport={handleXlsxImport}
                onReset={handleReset}
              />
            )}
            {activeTab === 'session' && (
              <BoxInputs
                boxes={allBoxes}
                quantities={quantities}
                setQuantities={setQuantities}
                onAddCustom={handleAddCustomBox}
                onXlsxImport={handleXlsxImport}
                onReset={handleReset}
                sessionMode
              />
            )}
            {activeTab === 'zones' && (
              <ZoneEditor
                boxes={allBoxes}
                quantities={quantities}
                zones={userZones}
                onZonesChange={setUserZones}
              />
            )}
            {activeTab === 'builder' && (
              <LayerBuilderPanel
                boxes={allBoxes}
                builderLayers={builderLayers}
                currentZ={currentBuilderZ}
                onAddLayer={(layer) => setBuilderLayers((prev) => [...prev, layer])}
                onRemoveLast={() => setBuilderLayers((prev) => prev.slice(0, -1))}
                onClear={() => {
                  setBuilderLayers([]);
                  setBuilderPreview(null);
                }}
                onPreviewChange={setBuilderPreview}
                backendAvailable={backendAvailable !== false}
              />
            )}
          </div>
        </aside>

        {/* CENTER: 3D VIEWER */}
        <section className="viewer">
          <PalletViewer
            placedBoxes={isBuilderTab ? builderPlacedBoxes : result.placedBoxes}
            colorMap={colorMap}
            activeLayer={isBuilderTab ? null : activeLayer}
            transparency={transparency}
            zones={isBuilderTab ? [] : (result.zones || [])}
          />

          {/* Viewer controls overlay */}
          <div className="viewer-controls">
            <label className="viewer-control-label">
              Opacity
              <input
                type="range" min="0.15" max="1" step="0.05"
                value={transparency}
                onChange={(e) => setTransparency(parseFloat(e.target.value))}
                className="slider"
              />
            </label>
            {result.layers?.length > 0 && activeLayer !== null && (
              <button className="btn-control" onClick={() => setActiveLayer(null)}>
                Show All Layers
              </button>
            )}
            {result.layers?.length > 0 && (
              <button
                className={`btn-control${show2DEditor ? ' active' : ''}`}
                onClick={() => {
                  if (!activeLayer && result.layers?.length > 0) {
                    setActiveLayer(result.layers[0].index);
                  }
                  setShow2DEditor((v) => !v);
                }}
              >
                {show2DEditor ? '✕ 2D Editor' : '✏ 2D Editor'}
              </button>
            )}
          </div>

          {/* 2D Editor overlay */}
          {show2DEditor && activeLayer !== null && (
            <TopViewEditor
              result={result}
              activeLayer={activeLayer}
              colorMap={colorMap}
              onResultChange={handleResultChange}
              onClose={() => setShow2DEditor(false)}
            />
          )}
        </section>

        {/* RIGHT PANEL */}
        <aside className="right-panel">
          {isBuilderTab ? (
            <div className="builder-side-info">
              <h3>Сборка слоями</h3>
              <p>
                Добавляй слои через панель слева. Каждый слой автоматически
                рассчитывается оптимально (крест-контовка для T50, плоская
                сетка для T20).
              </p>
              <ul>
                <li>Тяжёлые коробки — внизу</li>
                <li>Лёгкие — сверху</li>
                <li>Слой = идеальный прямоугольник для стрейчпленки</li>
              </ul>
            </div>
          ) : (
            <>
              <InstructionsPanel
                mode={result.mode}
                layers={result.layers || []}
                zones={result.zones || []}
                unplaced={result.stats?.unplaced || {}}
                quantities={quantities}
                stats={result.stats || {}}
                colorMap={colorMap}
                placedBoxes={baseResult.placedBoxes || []}
                lockedZones={lockedZones}
                onLock={handleLockZone}
                onUnlock={handleUnlockZone}
                onClearLocks={handleClearLocks}
                boxesById={Object.fromEntries(allBoxes.map((b) => [b.id, b]))}
              />
              <LayerNavigator
                result={result}
                activeLayer={activeLayer}
                onLayerSelect={setActiveLayer}
                colorMap={colorMap}
              />
            </>
          )}
        </aside>
      </div>

      {/* ── Footer stats ── */}
      <footer className="footer">
        <StatsBar
          stats={isBuilderTab ? builderStats : (result.stats || {})}
          quantities={isBuilderTab ? {} : quantities}
          mode={isBuilderTab ? 'builder' : result.mode}
        />
      </footer>
    </div>
  );
}
