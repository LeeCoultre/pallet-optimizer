// @ts-nocheck — legacy pallet-optimizer component (pre-Marathon); not in active code path
import { useState, useRef } from 'react';

const AUTO_COLORS = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
  '#06b6d4','#a855f7','#ec4899','#14b8a6','#f97316',
];

export default function BoxInputs({
  boxes, quantities, setQuantities,
  onAddCustom, onXlsxImport, onReset,
  sessionMode = false,
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBox, setNewBox] = useState({ name: '', length: '', width: '', height: '', color: AUTO_COLORS[0] });
  const [addError, setAddError] = useState('');
  const fileRef = useRef(null);

  const updateQty = (id, val) => {
    const n = Math.max(0, parseInt(val) || 0);
    setQuantities({ ...quantities, [id]: n });
  };

  // Group boxes
  const groups = {};
  for (const b of boxes) {
    const g = b.group || 'Custom';
    if (!groups[g]) groups[g] = [];
    groups[g].push(b);
  }

  const totalQty = Object.values(quantities).reduce((s, n) => s + (n || 0), 0);
  const activeCount = boxes.filter((b) => (quantities[b.id] || 0) > 0).length;

  const handleAddSubmit = (e) => {
    e.preventDefault();
    const L = parseFloat(newBox.length);
    const W = parseFloat(newBox.width);
    const H = parseFloat(newBox.height);
    if (!newBox.name || isNaN(L) || isNaN(W) || isNaN(H)) {
      setAddError('Please fill in all fields with valid numbers.');
      return;
    }
    onAddCustom({ name: newBox.name, length: L, width: W, height: H, color: newBox.color });
    setNewBox({ name: '', length: '', width: '', height: '', color: AUTO_COLORS[0] });
    setShowAddForm(false);
    setAddError('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onXlsxImport(file);
      e.target.value = '';
    }
  };

  return (
    <div className="inputs">
      {/* Toolbar */}
      <div className="inputs-header">
        <h2>
          Boxes
          {totalQty > 0 && <span className="qty-badge">{totalQty}</span>}
          {activeCount > 0 && <span className="qty-badge-green">{activeCount} types</span>}
        </h2>
        <div className="inputs-toolbar">
          <button
            className="btn-icon" title="Import xlsx"
            onClick={() => fileRef.current?.click()}
          >
            ⬆ xlsx
          </button>
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls"
            style={{ display: 'none' }} onChange={handleFileChange}
          />
          <button
            className="btn-icon" title="Add custom box"
            onClick={() => setShowAddForm((v) => !v)}
          >
            + Custom
          </button>
          <button className="btn-reset" onClick={onReset}>Reset</button>
        </div>
      </div>

      {/* Add custom box form */}
      {showAddForm && (
        <form className="add-box-form" onSubmit={handleAddSubmit}>
          <div className="add-box-title">Add Custom Box</div>
          <input
            placeholder="Name"
            value={newBox.name}
            onChange={(e) => setNewBox({ ...newBox, name: e.target.value })}
            className="add-box-input"
          />
          <div className="add-box-dims">
            <input placeholder="L cm" type="number" step="0.1" value={newBox.length}
              onChange={(e) => setNewBox({ ...newBox, length: e.target.value })}
              className="add-box-dim-input" />
            <input placeholder="W cm" type="number" step="0.1" value={newBox.width}
              onChange={(e) => setNewBox({ ...newBox, width: e.target.value })}
              className="add-box-dim-input" />
            <input placeholder="H cm" type="number" step="0.1" value={newBox.height}
              onChange={(e) => setNewBox({ ...newBox, height: e.target.value })}
              className="add-box-dim-input" />
          </div>
          <div className="add-box-color-row">
            <label>Color:</label>
            <input type="color" value={newBox.color}
              onChange={(e) => setNewBox({ ...newBox, color: e.target.value })} />
            {AUTO_COLORS.map((c) => (
              <button
                key={c} type="button"
                className={`color-swatch-btn${newBox.color === c ? ' selected' : ''}`}
                style={{ background: c }}
                onClick={() => setNewBox({ ...newBox, color: c })}
              />
            ))}
          </div>
          {addError && <div className="add-box-error">{addError}</div>}
          <div className="add-box-actions">
            <button type="submit" className="btn-primary btn-sm">Add</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Box groups */}
      {Object.entries(groups).map(([groupName, groupBoxes]) => (
        <div key={groupName} className="group">
          <h3>{groupName}</h3>
          {groupBoxes.map((box) => {
            const qty = quantities[box.id] || 0;
            return (
              <div key={box.id} className={`row${qty > 0 ? ' row-active' : ''}`}>
                <div className="row-info">
                  <span className="swatch" style={{ background: box.color }} />
                  <div className="row-name">
                    <div>{box.name}</div>
                    <div className="dim">
                      {box.length}×{box.width}×{box.height} cm
                      {box.maxPerPallet ? (
                        <span className="max"> · max {box.maxPerPallet}/pal</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="qty-control">
                  <button
                    className="qty-btn" onClick={() => updateQty(box.id, qty - 1)}
                    disabled={qty === 0}
                  >−</button>
                  <input
                    type="number" min="0"
                    value={qty}
                    onChange={(e) => updateQty(box.id, e.target.value)}
                  />
                  <button
                    className="qty-btn" onClick={() => updateQty(box.id, qty + 1)}
                  >+</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}