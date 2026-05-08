import { useEffect, useRef } from 'react';
import { BOX_BY_ID } from '../data/boxes';

const THUMB_W = 72;
const THUMB_H = 48;
const PAL_L = 120;
const PAL_W = 80;

function LayerThumb({ layer, boxes, colorMap }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, THUMB_W, THUMB_H);

    // Pallet background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);

    const scaleX = THUMB_W / PAL_L;
    const scaleY = THUMB_H / PAL_W;

    for (const box of boxes) {
      const px = box.x * scaleX;
      const py = box.y * scaleY;
      const pw = box.l * scaleX;
      const ph = box.w * scaleY;
      ctx.fillStyle = colorMap[box.typeId] || '#888';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#00000088';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, pw, ph);
    }
  }, [boxes, colorMap]);

  return <canvas ref={canvasRef} width={THUMB_W} height={THUMB_H} className="layer-thumb" />;
}

export default function LayerNavigator({ result, activeLayer, onLayerSelect, colorMap }) {
  const scrollRef = useRef(null);

  if (!result || !result.layers || result.layers.length === 0) {
    return (
      <div className="layer-nav-empty">
        Run optimization to see layers
      </div>
    );
  }

  const { layers, placedBoxes } = result;

  const boxesByLayer = {};
  for (const b of (placedBoxes || [])) {
    const li = b.layerIndex ?? b.layer_index ?? 0;
    if (!boxesByLayer[li]) boxesByLayer[li] = [];
    boxesByLayer[li].push(b);
  }

  const kindColor = {
    pure: '#3b82f6',
    'half-split': '#8b5cf6',
    'center-cap': '#f59e0b',
    'mixed-edge': '#10b981',
  };

  const kindLabel = {
    pure: 'Pure',
    'half-split': 'Split',
    'center-cap': 'Cap',
    'mixed-edge': 'Edge',
  };

  return (
    <div className="layer-nav">
      <div className="layer-nav-header">
        <span className="layer-nav-title">Layers</span>
        <button
          className={`layer-nav-all-btn${activeLayer === null ? ' active' : ''}`}
          onClick={() => onLayerSelect(null)}
        >
          Show All
        </button>
      </div>
      <div className="layer-nav-scroll" ref={scrollRef}>
        {layers.map((layer) => {
          const zFrom = (layer.zBottom ?? layer.z?.[0] ?? 0).toFixed(1);
          const zTo = (layer.zTop ?? layer.z?.[1] ?? 0).toFixed(1);
          const layerBoxes = boxesByLayer[layer.index] || [];
          const isActive = activeLayer === layer.index;

          return (
            <div
              key={layer.index}
              className={`layer-card-thumb${isActive ? ' active' : ''}`}
              onClick={() => onLayerSelect(isActive ? null : layer.index)}
            >
              <LayerThumb
                layer={layer}
                boxes={layerBoxes}
                colorMap={colorMap}
              />
              <div className="layer-card-info">
                <div className="layer-card-num">#{layer.index}</div>
                <div className="layer-card-z">{zFrom}–{zTo}cm</div>
                <div
                  className="layer-card-kind"
                  style={{ color: kindColor[layer.kind] || '#94a3b8' }}
                >
                  {kindLabel[layer.kind] || layer.kind}
                </div>
                <div className="layer-card-count">{layer.count ?? layerBoxes.length} pcs</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}