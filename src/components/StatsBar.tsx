// @ts-nocheck — incremental TS migration: file renamed to .tsx, strict typing pending
import { PALLET } from '../data/boxes';

export default function StatsBar({ stats, quantities, mode }) {
  const requested = Object.values(quantities).reduce((a, b) => a + (b || 0), 0);
  const unplacedCount = Object.values(stats.unplaced || {}).reduce((a, b) => a + b, 0);
  const effPct = stats.efficiency != null ? (stats.efficiency * 100).toFixed(1) : '—';
  const stackH = stats.totalHeight ?? 0;
  const heightPct = ((stackH / PALLET.maxStackHeight) * 100).toFixed(0);
  const totalH = (stackH + PALLET.height).toFixed(1);
  const supportPct = ((stats.avgSupport ?? 1) * 100).toFixed(1);
  const supportClass = (stats.avgSupport ?? 1) >= 0.95 ? 'good' : (stats.avgSupport ?? 1) >= 0.85 ? 'ok' : 'warning';
  const fillPct = stats.fillPct ?? stats.fill_pct ?? null;

  return (
    <div className="stats">
      <div className="stat">
        <div className="label">Placed</div>
        <div className={`value${unplacedCount > 0 ? ' warning' : ''}`}>
          {stats.totalBoxes ?? 0}
          <span className="sub"> / {requested}</span>
        </div>
      </div>

      <div className="stat">
        <div className="label">{mode === 'column-hybrid' ? 'Zones' : 'Layers'}</div>
        <div className="value">{stats.layerCount ?? 0}</div>
      </div>

      <div className="stat">
        <div className="label">Stack height</div>
        <div className="value">
          {stackH.toFixed(1)} cm
          <span className="sub"> ({heightPct}%)</span>
        </div>
      </div>

      <div className="stat">
        <div className="label">Total height</div>
        <div className="value">{totalH} cm</div>
      </div>

      <div className="stat">
        <div className="label">Fill efficiency</div>
        <div className="value">{fillPct != null ? `${fillPct}%` : `${effPct}%`}</div>
      </div>

      <div className={`stat ${supportClass}`}>
        <div className="label">Support avg</div>
        <div className="value">{supportPct}%</div>
      </div>

      {unplacedCount > 0 && (
        <div className="stat warning">
          <div className="label">Unplaced</div>
          <div className="value">
            {unplacedCount}
            <div className="unplaced-detail">
              {Object.entries(stats.unplaced || {}).map(([id, n]) => (
                <div key={id}>{id}: {n}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}