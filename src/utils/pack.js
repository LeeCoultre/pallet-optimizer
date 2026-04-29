import { PALLET, BOX_BY_ID } from '../data/boxes';
import { packPallet } from './packing';
import { tryPackColumns } from './packColumns';

/* ============================================================
 * УНИФИЦИРУЮЩАЯ ОБЁРТКА
 *
 * Выбирает режим упаковки:
 *   1. Одноформатный заказ → column-hybrid (на всю высоту).
 *   2. Многоформатный → старый layered packer.
 *
 * Возвращает стандартный shape:
 *   { mode, placedBoxes, layers?, zones?, stats }
 * ============================================================ */

function computeStats(placedBoxes, requested, unplaced, mode) {
  const totalHeight = placedBoxes.reduce((m, b) => Math.max(m, b.z + b.h), 0);
  const boxVolume = placedBoxes.reduce((s, b) => s + b.l * b.w * b.h, 0);
  const totalWeight = placedBoxes.reduce((s, b) => {
    const t = BOX_BY_ID[b.typeId];
    return s + (t?.weightKg || 0);
  }, 0);
  // используем bounding-box фактически уложенных коробок (учитывая overhang),
  // иначе при overhang>0 эффективность вылезает за 100%
  let footL = PALLET.length, footW = PALLET.width;
  for (const b of placedBoxes) {
    if (b.x + b.l > footL) footL = b.x + b.l;
    if (b.y + b.w > footW) footW = b.y + b.w;
  }
  const palletVolume = footL * footW * Math.max(totalHeight, 0.001);
  const efficiency = palletVolume > 0 ? boxVolume / palletVolume : 0;
  return {
    mode,
    totalBoxes: placedBoxes.length,
    requested,
    totalHeight,
    efficiency,
    totalWeight,
    unplaced,
    avgSupport: 1, // зонный режим: опора 100% по построению
  };
}

export function packSmart(boxTypes, quantities, options = {}) {
  const requested = Object.values(quantities).reduce((a, b) => a + (b || 0), 0);

  // 1. Попытка зонного режима
  const col = tryPackColumns(quantities, options);
  if (col) {
    const stats = computeStats(col.placedBoxes, requested, col.unplaced, 'column-hybrid');
    stats.zoneCount = col.zones.length;
    stats.layerCount = col.zones.length;
    return {
      mode: 'column-hybrid',
      placedBoxes: col.placedBoxes,
      zones: col.zones,
      layers: [], // для совместимости
      stats,
    };
  }

  // 2. Старый слоёный движок
  const layered = packPallet(boxTypes, quantities, options);
  const totalWeight = layered.placedBoxes.reduce((s, b) => {
    const t = BOX_BY_ID[b.typeId];
    return s + (t?.weightKg || 0);
  }, 0);
  return {
    mode: 'layered',
    placedBoxes: layered.placedBoxes,
    layers: layered.layers,
    zones: [],
    stats: {
      mode: 'layered',
      ...layered.stats,
      requested,
      totalWeight,
      layerCount: layered.layers.length,
    },
  };
}
