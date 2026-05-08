// @ts-nocheck — incremental TS migration: file renamed to .tsx, strict typing pending
import { useRef, useEffect, useState, useCallback } from 'react';
import { PALLET } from '../data/boxes';

const SNAP = 0.5; // cm snap grid

function snapToGrid(v) {
  return Math.round(v / SNAP) * SNAP;
}

export default function TopViewEditor({ result, activeLayer, colorMap, onResultChange, onClose }) {
  const canvasRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [toolbarPos, setToolbarPos] = useState(null);
  const dragRef = useRef(null);

  const layerBoxes = (result?.placedBoxes || []).filter(
    (b) => (b.layerIndex ?? b.layer_index) === activeLayer
  );

  // Compute scale to fit canvas
  const getScale = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return 4;
    return Math.min(canvas.width / PALLET.length, canvas.height / PALLET.width);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const scale = getScale();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pallet outline
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, PALLET.length * scale, PALLET.width * scale);

    // Grid lines (10cm)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let x = 10; x < PALLET.length; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, PALLET.width * scale);
      ctx.stroke();
    }
    for (let y = 10; y < PALLET.width; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(PALLET.length * scale, y * scale);
      ctx.stroke();
    }

    // Boxes
    for (const b of layerBoxes) {
      const px = b.x * scale;
      const py = b.y * scale;
      const pw = b.l * scale;
      const ph = b.w * scale;
      const color = colorMap[b.typeId] || '#888';
      const isSelected = b.id === selectedId;

      ctx.fillStyle = isSelected ? color + 'ee' : color + 'bb';
      ctx.fillRect(px, py, pw, ph);

      ctx.strokeStyle = isSelected ? '#fbbf24' : '#00000088';
      ctx.lineWidth = isSelected ? 2.5 : 0.8;
      ctx.strokeRect(px, py, pw, ph);

      // Stand indicator
      if (b.oriKind === 'stand') {
        ctx.strokeStyle = '#ef444488';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
      }
    }
  }, [layerBoxes, colorMap, selectedId, getScale]);

  useEffect(() => {
    draw();
  }, [draw]);

  const hitTest = (ex, ey) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = getScale();
    const cx = (ex - rect.left) / scale;
    const cy = (ey - rect.top) / scale;

    // Iterate in reverse (top of stack first visually)
    for (let i = layerBoxes.length - 1; i >= 0; i--) {
      const b = layerBoxes[i];
      if (cx >= b.x && cx <= b.x + b.l && cy >= b.y && cy <= b.y + b.w) {
        return b;
      }
    }
    return null;
  };

  const handleCanvasClick = (e) => {
    const box = hitTest(e.clientX, e.clientY);
    if (box) {
      setSelectedId(box.id);
      // Compute toolbar position
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scale = getScale();
      setToolbarPos({
        x: rect.left + (box.x + box.l / 2) * scale,
        y: rect.top + box.y * scale - 50,
      });
    } else {
      setSelectedId(null);
      setToolbarPos(null);
    }
  };

  const handleMouseDown = (e) => {
    const box = hitTest(e.clientX, e.clientY);
    if (!box || box.id !== selectedId) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = getScale();
    dragRef.current = {
      boxId: box.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: box.x,
      origY: box.y,
      scale,
    };
  };

  const handleMouseMove = (e) => {
    if (!dragRef.current) return;
    const { boxId, startX, startY, origX, origY, scale } = dragRef.current;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    const newX = snapToGrid(Math.max(0, Math.min(origX + dx, PALLET.length)));
    const newY = snapToGrid(Math.max(0, Math.min(origY + dy, PALLET.width)));

    const updated = result.placedBoxes.map((b) =>
      b.id === boxId ? { ...b, x: newX, y: newY } : b
    );
    onResultChange({ ...result, placedBoxes: updated });
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  // Toolbar actions
  const rotateBox = () => {
    if (!selectedId) return;
    const updated = result.placedBoxes.map((b) => {
      if (b.id !== selectedId) return b;
      // Swap l and w (rotate 90° in footprint)
      return { ...b, l: b.w, w: b.l };
    });
    onResultChange({ ...result, placedBoxes: updated });
    setToolbarPos(null);
  };

  const toggleKontovka = () => {
    if (!selectedId) return;
    const box = result.placedBoxes.find((b) => b.id === selectedId);
    if (!box) return;
    const newKind = box.oriKind === 'flat' ? 'stand' : 'flat';
    // When switching between flat/stand, swap h and w to reflect the rotation
    const updated = result.placedBoxes.map((b) => {
      if (b.id !== selectedId) return b;
      return { ...b, oriKind: newKind, h: b.w, w: b.h };
    });
    onResultChange({ ...result, placedBoxes: updated });
    setToolbarPos(null);
  };

  const deleteBox = () => {
    if (!selectedId) return;
    const updated = result.placedBoxes.filter((b) => b.id !== selectedId);
    onResultChange({ ...result, placedBoxes: updated });
    setSelectedId(null);
    setToolbarPos(null);
  };

  const selectedBox = layerBoxes.find((b) => b.id === selectedId);

  return (
    <div className="topview-overlay" style={{ position: 'absolute', inset: 0, background: '#020617ee', zIndex: 20 }}>
      <div className="topview-header">
        <span>2D Editor — Layer {activeLayer}</span>
        <div className="topview-hint">Click box to select · Drag to move · Snap: 0.5cm</div>
        <button className="btn-close" onClick={onClose}>✕ Close</button>
      </div>
      <div className="topview-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={Math.min(window.innerWidth - 120, 800)}
          height={Math.min(window.innerHeight - 140, 533)}
          className="topview-canvas"
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />

        {/* Floating toolbar */}
        {selectedBox && toolbarPos && (
          <div
            className="topview-toolbar"
            style={{
              position: 'fixed',
              left: toolbarPos.x,
              top: Math.max(toolbarPos.y, 60),
              transform: 'translateX(-50%)',
            }}
          >
            <button className="tbar-btn" onClick={rotateBox} title="Rotate 90°">⟳ Rotate</button>
            <button className="tbar-btn" onClick={toggleKontovka} title="Toggle edge/flat">
              {selectedBox.oriKind === 'flat' ? '↕ Stand' : '↔ Flat'}
            </button>
            <button className="tbar-btn danger" onClick={deleteBox} title="Delete">✕ Delete</button>
          </div>
        )}
      </div>

      {/* Layer stats */}
      <div className="topview-footer">
        <span>Layer {activeLayer}</span>
        <span>{layerBoxes.length} boxes</span>
        {selectedBox && (
          <span>
            Selected: {selectedBox.typeId} · {selectedBox.l}×{selectedBox.w}×{selectedBox.h}cm · {selectedBox.oriKind}
          </span>
        )}
      </div>
    </div>
  );
}