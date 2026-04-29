import { PALLET, BOX_BY_ID } from '../data/boxes';

/* ============================================================
 * УНИВЕРСАЛЬНЫЙ ГИЛЬОТИННЫЙ ДВИЖОК
 *
 * Палета (footprint 120×80 + overhang) рекурсивно разрезается
 * вертикальными «гильотинными» разрезами на прямоугольники.
 * Каждый ЛИСТ — однородная колонна одного типа в одной
 * ориентации, с собственным числом тиров K.
 *
 * Движок САМ находит:
 *   - сколько типов смешать,
 *   - где делать разрезы,
 *   - какую ориентацию (flat или на боку) выбрать,
 *   - сколько тиров строить в каждой колонне.
 *
 * Никаких фиксированных шаблонов column-hybrid / interlock —
 * они получаются автоматически как частные случаи.
 * ============================================================ */

const EPS = 1e-6;
const DEFAULT_OVERHANG = 0.05;
const MAX_DEPTH = 3;            // до 8 листьев, на практике редко больше 4
const MAX_CUTS_PER_AXIS = 10;   // ограничение перебора, см. cutCandidates()
const MAX_STAND_DEPTH = 3;      // stand-зона = узкая полоса не глубже 3 рядов
                                // (физическая устойчивость: на ребре нельзя
                                //  ставить «поле» — только полосу-добор)

/* ------------------------------------------------------------
 * Шесть уникальных ориентаций (l × w × h, kind = flat | stand)
 * ------------------------------------------------------------ */
function orientations(type) {
  const { length: L, width: W, height: H } = type;
  const raw = [
    { l: L, w: W, h: H, kind: 'flat' },
    { l: W, w: L, h: H, kind: 'flat' },
    { l: L, w: H, h: W, kind: 'stand' },
    { l: H, w: L, h: W, kind: 'stand' },
    { l: W, w: H, h: L, kind: 'stand' },
    { l: H, w: W, h: L, kind: 'stand' },
  ];
  const out = [];
  for (const o of raw) {
    const rl = Math.round(o.l * 100) / 100;
    const rw = Math.round(o.w * 100) / 100;
    const rh = Math.round(o.h * 100) / 100;
    if (out.some((d) => d.l === rl && d.w === rw && d.h === rh)) continue;
    out.push({ l: rl, w: rw, h: rh, kind: o.kind });
  }
  return out;
}

function gridFits(ori, l, w) {
  return {
    cols: Math.floor((l + EPS) / ori.l),
    rows: Math.floor((w + EPS) / ori.w),
  };
}

/* ------------------------------------------------------------
 * Кандидаты на точку разреза по оси длиной `len`.
 * Берём кратные ширины каждой ориентации каждого активного типа,
 * + дедуп, + отсев слишком близких к краям.
 * ------------------------------------------------------------ */
function cutCandidates(remaining, len) {
  const set = new Set();
  for (const id in remaining) {
    if (remaining[id] <= 0) continue;
    const t = BOX_BY_ID[id];
    if (!t) continue;
    for (const ori of orientations(t)) {
      for (const step of [ori.l, ori.w]) {
        for (let k = 1; k * step < len - EPS; k++) {
          const v = Math.round(k * step * 100) / 100;
          if (v > EPS && v < len - EPS) set.add(v);
        }
      }
    }
  }
  let arr = Array.from(set).sort((a, b) => a - b);
  // Если кандидатов слишком много, оставляем равномерно распределённые
  if (arr.length > MAX_CUTS_PER_AXIS) {
    const step = arr.length / MAX_CUTS_PER_AXIS;
    const reduced = [];
    for (let i = 0; i < MAX_CUTS_PER_AXIS; i++) {
      reduced.push(arr[Math.floor(i * step)]);
    }
    arr = Array.from(new Set(reduced));
  }
  return arr;
}

/* ------------------------------------------------------------
 * Лист: один тип + одна ориентация на весь rect, максимум тиров.
 * ------------------------------------------------------------ */
function packLeaf(rect, remaining, maxZ) {
  let best = null;
  for (const id in remaining) {
    const qty = remaining[id];
    if (qty <= 0) continue;
    const type = BOX_BY_ID[id];
    if (!type) continue;
    for (const ori of orientations(type)) {
      const { cols, rows } = gridFits(ori, rect.l, rect.w);
      if (cols < 1 || rows < 1) continue;
      // Жёсткое правило: stand-зона должна быть узкой полосой
      // (не «полем» из стоящих на ребре коробок).
      if (ori.kind === 'stand' && Math.min(cols, rows) > MAX_STAND_DEPTH) continue;
      const nTier = cols * rows;
      const Kmax = Math.min(
        Math.floor((maxZ + EPS) / ori.h),
        Math.floor(qty / nTier),
      );
      if (Kmax < 1) continue;
      const total = Kmax * nTier;
      if (!best || total > best.total
          || (total === best.total && Kmax * ori.h < best.zTop)) {
        best = {
          kind: 'leaf',
          rect,
          typeId: id,
          ori,
          cols,
          rows,
          tiers: Kmax,
          nTier,
          total,
          zTop: Kmax * ori.h,
          used: { [id]: total },
        };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------
 * Рекурсивная упаковка: либо лист, либо разрез на 2 подпрямоугольника.
 * remaining мутируется лишь логически — копируется при каждом split.
 * ------------------------------------------------------------ */
function packRect(rect, remaining, maxZ, depth) {
  // Проверяем минимальную осмысленность прямоугольника
  let anyFits = false;
  for (const id in remaining) {
    if (remaining[id] <= 0) continue;
    const t = BOX_BY_ID[id];
    if (!t) continue;
    for (const ori of orientations(t)) {
      if (ori.l <= rect.l + EPS && ori.w <= rect.w + EPS && ori.h <= maxZ + EPS) {
        anyFits = true; break;
      }
    }
    if (anyFits) break;
  }
  if (!anyFits) return null;

  let best = packLeaf(rect, remaining, maxZ);

  if (depth >= MAX_DEPTH) return best;

  for (const axis of ['x', 'y']) {
    const len = axis === 'x' ? rect.l : rect.w;
    const cuts = cutCandidates(remaining, len);
    for (const cut of cuts) {
      const r1 = axis === 'x'
        ? { x: rect.x, y: rect.y, l: cut, w: rect.w }
        : { x: rect.x, y: rect.y, l: rect.l, w: cut };
      const r2 = axis === 'x'
        ? { x: rect.x + cut, y: rect.y, l: len - cut, w: rect.w }
        : { x: rect.x, y: rect.y + cut, l: rect.l, w: len - cut };

      // Пробуем оба порядка: r1 первым, и r2 первым.
      for (const order of [[r1, r2], [r2, r1]]) {
        const [first, second] = order;
        const p1 = packRect(first, remaining, maxZ, depth + 1);
        if (!p1) continue;
        const remainAfter = { ...remaining };
        for (const k in p1.used) remainAfter[k] = (remainAfter[k] || 0) - p1.used[k];
        const p2 = packRect(second, remainAfter, maxZ, depth + 1);

        const total = p1.total + (p2?.total || 0);
        if (!best || total > best.total) {
          const used = { ...p1.used };
          if (p2) {
            for (const k in p2.used) used[k] = (used[k] || 0) + p2.used[k];
          }
          best = {
            kind: 'split',
            axis, cut,
            children: p2 ? [p1, p2] : [p1],
            total,
            used,
          };
        }
      }
    }
  }

  return best;
}

/* ------------------------------------------------------------
 * Уплощение дерева в плоский список листьев.
 * ------------------------------------------------------------ */
function flattenLeaves(node, out = []) {
  if (!node) return out;
  if (node.kind === 'leaf') out.push(node);
  else if (node.kind === 'split') for (const c of node.children) flattenLeaves(c, out);
  return out;
}

function materializeLeaf(leaf) {
  const { rect, ori, cols, rows, tiers, typeId } = leaf;
  const out = [];
  for (let k = 0; k < tiers; k++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({
          typeId,
          x: rect.x + c * ori.l,
          y: rect.y + r * ori.w,
          z: k * ori.h,
          l: ori.l, w: ori.w, h: ori.h,
          oriKind: ori.kind,
          tier: k + 1,
          zoneId: leaf.zoneId,
        });
      }
    }
  }
  return out;
}

/* ============================================================
 * Главная точка входа: возвращает либо результат column-hybrid,
 * либо null (тогда pack.js fallback'ает на layered).
 *
 * Возврат null оставлен ради совместимости с pack.js, но в новом
 * движке практически не происходит — мы всегда строим хоть один
 * лист, если хоть одна коробка влазит.
 * ============================================================ */
export function tryPackColumns(quantities, options = {}) {
  const { overhangPct = DEFAULT_OVERHANG } = options;
  const rectL = PALLET.length * (1 + overhangPct);
  const rectW = PALLET.width * (1 + overhangPct);
  const maxZ = PALLET.maxStackHeight;
  const rect = { x: 0, y: 0, l: rectL, w: rectW };

  const remaining = {};
  for (const [id, n] of Object.entries(quantities)) {
    if (n > 0 && BOX_BY_ID[id]) remaining[id] = n;
  }
  if (Object.keys(remaining).length === 0) return null;

  const tree = packRect(rect, remaining, maxZ, 0);
  if (!tree) return null;

  const leaves = flattenLeaves(tree);
  if (leaves.length === 0) return null;

  // Пометить ID зон в порядке обхода
  leaves.forEach((leaf, i) => { leaf.zoneId = String.fromCharCode(65 + i); });

  const placedBoxes = [];
  for (const leaf of leaves) placedBoxes.push(...materializeLeaf(leaf));

  // Подсчёт неразмещённого
  const used = tree.used || {};
  const unplaced = {};
  for (const id in quantities) {
    const want = quantities[id] || 0;
    const have = used[id] || 0;
    if (want > have) unplaced[id] = want - have;
  }

  // Зоны для UI
  const zones = leaves.map((leaf) => ({
    id: leaf.zoneId,
    kind: leaf.ori.kind, // 'flat' | 'stand'
    rect: leaf.rect,
    type: BOX_BY_ID[leaf.typeId],
    orientation: leaf.ori,
    grid: { cols: leaf.cols, rows: leaf.rows },
    tierHeight: leaf.ori.h,
    tiers: leaf.tiers,
    boxes: leaf.total,
    zTop: leaf.zTop,
  }));

  const totalHeight = Math.max(...leaves.map((l) => l.zTop));

  return {
    mode: 'column-hybrid',
    zones,
    placedBoxes,
    totalBoxes: tree.total,
    totalHeight,
    unplaced,
  };
}

/* ------------------------------------------------------------
 * Совместимость со старыми импортами, которые могут вызываться
 * из тестов / отладочных eval. Внутри — те же базовые блоки.
 * ------------------------------------------------------------ */
export function bestColumnHybrid(type, remaining, rect, maxZ) {
  // ремап: одни тип
  const r = packRect(rect, { [type.id]: remaining }, maxZ, 0);
  return r;
}

export function bestInterlockTwoTypes(typeA, qA, typeB, qB, rect, maxZ) {
  if (!typeA || typeof typeA !== 'object' || !typeB || typeof typeB !== 'object') {
    throw new Error('bestInterlockTwoTypes: typeA/typeB must be box objects');
  }
  if (!Number.isFinite(qA) || !Number.isFinite(qB)) {
    throw new Error('bestInterlockTwoTypes: qA/qB must be finite numbers');
  }
  return packRect(rect, { [typeA.id]: qA, [typeB.id]: qB }, maxZ, 0);
}

export function packColumnsSingleType(type, quantity, options = {}) {
  return tryPackColumns({ [type.id]: quantity }, options);
}
