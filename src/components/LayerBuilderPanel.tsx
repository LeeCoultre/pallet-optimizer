// @ts-nocheck — legacy pallet-optimizer component (pre-Marathon); not in active code path
import { useState, useEffect, useMemo } from 'react';
import { singleLayerAPI } from '../api';

const PALLET = { length: 120, width: 80, palletHeight: 14.4, maxTotalHeight: 180 };

export default function LayerBuilderPanel({
  boxes,
  builderLayers,
  currentZ,
  onAddLayer,
  onRemoveLast,
  onClear,
  onPreviewChange,
  backendAvailable,
}) {
  const [selectedBoxId, setSelectedBoxId] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Group boxes by .group field for the dropdown
  const groups = useMemo(() => {
    const g = {};
    for (const b of boxes) {
      const k = b.group || 'Custom';
      if (!g[k]) g[k] = [];
      g[k].push(b);
    }
    return g;
  }, [boxes]);

  // Re-run preview whenever selected box or current Z changes
  useEffect(() => {
    if (!selectedBoxId) {
      setPreview(null);
      onPreviewChange?.(null);
      return;
    }
    const box = boxes.find((b) => b.id === selectedBoxId);
    if (!box) return;

    // Check height fits
    if (currentZ + box.height > PALLET.maxTotalHeight + 0.01) {
      setError(
        `Слой не помещается: ${(currentZ + box.height).toFixed(1)} см > ` +
          `${PALLET.maxTotalHeight} см`
      );
      setPreview(null);
      onPreviewChange?.(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    singleLayerAPI(box, PALLET, currentZ)
      .then((res) => {
        if (cancelled) return;
        const enriched = {
          ...res,
          boxId: box.id,
          boxName: box.name,
          color: box.color,
        };
        setPreview(enriched);
        onPreviewChange?.(enriched);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setPreview(null);
        onPreviewChange?.(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoxId, currentZ]);

  const handleAdd = () => {
    if (!preview) return;
    onAddLayer(preview);
    // Keep current selection so user can add another of same type quickly
    setPreview(null);
    onPreviewChange?.(null);
    setSelectedBoxId('');
  };

  const totalCount = builderLayers.reduce((s, l) => s + l.count, 0);
  const totalHeight = currentZ - PALLET.palletHeight;

  return (
    <div className="builder-panel">
      <div className="builder-header">
        <h2>🧱 Построить слоями</h2>
        <div className="builder-stats">
          <span>{builderLayers.length} слоёв</span>
          <span>·</span>
          <span>{totalCount} шт</span>
          <span>·</span>
          <span>{totalHeight.toFixed(1)} см</span>
        </div>
      </div>

      {!backendAvailable && (
        <div className="builder-warning">
          Для режима «Слоями» нужен бэкенд. Проверь сервер.
        </div>
      )}

      {/* Confirmed layers list */}
      {builderLayers.length > 0 && (
        <div className="builder-layers">
          {builderLayers.map((l, i) => (
            <div key={i} className="builder-layer-item">
              <span className="builder-layer-num">#{i + 1}</span>
              <span
                className="builder-layer-color"
                style={{ background: l.color || '#888' }}
              />
              <span className="builder-layer-name">{l.boxName}</span>
              <span className="builder-layer-headline">{l.headline}</span>
            </div>
          ))}
        </div>
      )}

      {/* Box selector */}
      <div className="builder-selector">
        <label htmlFor="builder-box-select">Добавить слой:</label>
        <select
          id="builder-box-select"
          value={selectedBoxId}
          onChange={(e) => setSelectedBoxId(e.target.value)}
          disabled={!backendAvailable}
        >
          <option value="">— выбери коробку —</option>
          {Object.entries(groups).map(([groupName, list]) => (
            <optgroup key={groupName} label={groupName}>
              {list.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Preview status */}
      {loading && <div className="builder-preview loading">Расчёт...</div>}
      {error && <div className="builder-preview error">{error}</div>}
      {preview && !loading && (
        <div className="builder-preview ready">
          <div className="builder-preview-headline">{preview.headline}</div>
          <div className="builder-preview-meta">
            высота слоя {preview.layerH.toFixed(1)} см ·
            верх z = {(currentZ + preview.layerH).toFixed(1)} см
          </div>
          <button
            className="btn-primary builder-add-btn"
            onClick={handleAdd}
          >
            + Добавить этот слой
          </button>
        </div>
      )}

      {/* Action buttons */}
      {builderLayers.length > 0 && (
        <div className="builder-actions">
          <button className="btn-secondary" onClick={onRemoveLast}>
            ← Удалить последний
          </button>
          <button className="btn-secondary" onClick={onClear}>
            ✕ Очистить всё
          </button>
        </div>
      )}
    </div>
  );
}