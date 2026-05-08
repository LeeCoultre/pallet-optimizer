// @ts-nocheck — incremental TS migration: file renamed, strict typing pending
import { PALLET } from '../data/boxes';

/* ============================================================
 * PALLET OPTIMIZER · Этап 1: чистый алгоритм по слоям
 *
 * Каждый слой имеет чёткую структуру, которую можно описать
 * словами для сборщика:
 *   - 'pure'        — один тип, сетка N×M
 *   - 'half-split'  — два типа равной высоты, две зоны
 *   - 'center-cap'  — остатки, центрированная сетка сверху
 *
 * Никаких «разбросанных» EP-коробок.  Если коробки не
 * помещаются чистым слоем — они попадают в unplaced и
 * показываются в предупреждении.
 * ============================================================ */

const EPS = 1e-6;
const DEFAULT_OVERHANG = 0.05;
const MIN_SUPPORT = 0.7;
const HEIGHT_MATCH_TOL = 0.01;

/* ------------------------------------------------------------
 * Ориентации коробки (до 6 вариантов, дедуплицированных)
 * Возвращает массив {l, w, h, kind: 'flat'|'stand'}.
 * ------------------------------------------------------------ */
function orientations(type) {
  const raw = [];
  const add = (l, w, h, kind) => raw.push({
    l: Math.round(l * 100) / 100,
    w: Math.round(w * 100) / 100,
    h: Math.round(h * 100) / 100,
    kind,
  });
  const { length: L, width: W, height: H } = type;
  add(L, W, H, 'flat');
  add(W, L, H, 'flat');
  add(L, H, W, 'stand');
  add(H, L, W, 'stand');
  add(W, H, L, 'stand');
  add(H, W, L, 'stand');
  const out = [];
  for (const o of raw) {
    if (out.some((d) => d.l === o.l && d.w === o.w && d.h === o.h)) continue;
    out.push(o);
  }
  return out;
}

function flatOrientations(type) {
  return orientations(type).filter((o) => o.kind === 'flat');
}

/* ------------------------------------------------------------
 * Лучшая чистая сетка для типа в прямоугольнике.
 * Предпочитает плашмя и максимум коробок.
 * ------------------------------------------------------------ */
function bestPureGrid(type, rect) {
  let best = null;
  for (const o of flatOrientations(type)) {
    const cols = Math.floor((rect.l + EPS) / o.l);
    const rows = Math.floor((rect.w + EPS) / o.w);
    const count = cols * rows;
    if (count === 0) continue;
    if (!best || count > best.count) {
      best = {
        cols, rows, count,
        boxL: o.l, boxW: o.w, boxH: o.h,
        oriKind: o.kind,
        rotated: best !== null,   // (для совместимости)
      };
    }
  }
  return best;
}

/* ------------------------------------------------------------
 * Смешанная кромка: один тип, часть плашмя + полоса «на ребре».
 * Пользовательская идея: убрать N рядов плашмя и поставить туда
 * 2 (или больше) рядов коробок на боку — так плотнее.
 *
 * Слой с неровным верхом (flat h ≠ stand h), поэтому ИСПОЛЬЗУЕМ
 * ТОЛЬКО как финальный слой типа — когда pure.count < remaining
 * <= mixedEdge.total. Иначе оставшиеся коробки «висят в воздухе».
 * ------------------------------------------------------------ */
function bestMixedEdge(type, rect, maxBoxes = Infinity) {
  const flatOris = flatOrientations(type);
  const standOris = orientations(type).filter((o) => o.kind === 'stand');
  if (standOris.length === 0) return null;
  let best = null;

  const consider = (positions, total, flatCount, standCount, flatOri, standOri, meta) => {
    if (total > maxBoxes) return;
    const layerH = Math.max(flatOri.h, standOri.h);
    if (!best || total > best.total) {
      best = { total, layerH, flatCount, standCount, flatOri, standOri, positions, ...meta };
    }
  };

  for (const fo of flatOris) {
    const cols = Math.floor((rect.l + EPS) / fo.l);
    const rows = Math.floor((rect.w + EPS) / fo.w);
    if (cols === 0 || rows === 0) continue;
    const pureCount = cols * rows;

    // Вариант А: убираем drop последних столбцов (по длине x)
    for (let drop = 1; drop <= cols; drop++) {
      const flatCols = cols - drop;
      const flatCount = flatCols * rows;
      const flatSpanL = flatCols * fo.l;
      const gapL = rect.l - flatSpanL;
      const gapW = rect.w;
      if (gapL < EPS) continue;

      for (const so of standOris) {
        const sCols = Math.floor((gapL + EPS) / so.l);
        const sRows = Math.floor((gapW + EPS) / so.w);
        const sCount = sCols * sRows;
        if (sCount < 2) continue; // минимум 2 стоячих, иначе нет смысла
        const total = flatCount + sCount;
        if (total <= pureCount) continue;

        const positions = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < flatCols; c++) {
            positions.push({
              typeId: type.id,
              x: rect.x + c * fo.l,
              y: rect.y + r * fo.w,
              l: fo.l, w: fo.w, h: fo.h,
              oriKind: 'flat',
            });
          }
        }
        for (let r = 0; r < sRows; r++) {
          for (let c = 0; c < sCols; c++) {
            positions.push({
              typeId: type.id,
              x: rect.x + flatSpanL + c * so.l,
              y: rect.y + r * so.w,
              l: so.l, w: so.w, h: so.h,
              oriKind: 'stand',
            });
          }
        }
        consider(positions, total, flatCount, sCount, fo, so, {
          axis: 'x', drop, flatCols, flatRows: rows, sCols, sRows,
        });
      }
    }

    // Вариант B: убираем drop последних строк (по ширине y)
    for (let drop = 1; drop <= rows; drop++) {
      const flatRows = rows - drop;
      const flatCount = cols * flatRows;
      const flatSpanW = flatRows * fo.w;
      const gapW = rect.w - flatSpanW;
      const gapL = rect.l;
      if (gapW < EPS) continue;

      for (const so of standOris) {
        const sCols = Math.floor((gapL + EPS) / so.l);
        const sRows = Math.floor((gapW + EPS) / so.w);
        const sCount = sCols * sRows;
        if (sCount < 2) continue;
        const total = flatCount + sCount;
        if (total <= pureCount) continue;

        const positions = [];
        for (let r = 0; r < flatRows; r++) {
          for (let c = 0; c < cols; c++) {
            positions.push({
              typeId: type.id,
              x: rect.x + c * fo.l,
              y: rect.y + r * fo.w,
              l: fo.l, w: fo.w, h: fo.h,
              oriKind: 'flat',
            });
          }
        }
        for (let r = 0; r < sRows; r++) {
          for (let c = 0; c < sCols; c++) {
            positions.push({
              typeId: type.id,
              x: rect.x + c * so.l,
              y: rect.y + flatSpanW + r * so.w,
              l: so.l, w: so.w, h: so.h,
              oriKind: 'stand',
            });
          }
        }
        consider(positions, total, flatCount, sCount, fo, so, {
          axis: 'y', drop, flatCols: cols, flatRows, sCols, sRows,
        });
      }
    }
  }
  return best;
}

function gridPositions(grid, rect, typeId) {
  const out = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      out.push({
        typeId,
        x: rect.x + c * grid.boxL,
        y: rect.y + r * grid.boxW,
        l: grid.boxL, w: grid.boxW, h: grid.boxH,
        oriKind: grid.oriKind,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------
 * Half-split: две зоны равной высоты коробок.
 * Перебирает ось (x/y), какой тип слева/справа, ориентации и k.
 * Возвращает лучший по суммарному числу коробок ИЛИ null.
 * ------------------------------------------------------------ */
function bestHalfSplit(typeA, typeB, remaining, rect) {
  if (Math.abs(typeA.height - typeB.height) > HEIGHT_MATCH_TOL) return null;
  const layerH = Math.max(typeA.height, typeB.height);
  let best = null;

  const build = (leftT, rightT) => {
    const leftOris = flatOrientations(leftT);
    const rightOris = flatOrientations(rightT);
    for (const lo of leftOris) {
      for (const ro of rightOris) {
        for (const axis of ['x', 'y']) {
          const rectSpan = axis === 'x' ? rect.l : rect.w;
          const rectCross = axis === 'x' ? rect.w : rect.l;
          const loSpan = axis === 'x' ? lo.l : lo.w;
          const loCross = axis === 'x' ? lo.w : lo.l;
          const roSpan = axis === 'x' ? ro.l : ro.w;
          const roCross = axis === 'x' ? ro.w : ro.l;

          const leftCrossFits = Math.floor((rectCross + EPS) / loCross);
          const rightCrossFits = Math.floor((rectCross + EPS) / roCross);
          if (leftCrossFits === 0 || rightCrossFits === 0) continue;

          const maxK = Math.floor((rectSpan + EPS) / loSpan);
          for (let k = 1; k <= maxK; k++) {
            const leftSpanTotal = k * loSpan;
            const rightSpanAvail = rectSpan - leftSpanTotal;
            if (rightSpanAvail < roSpan - EPS) continue;
            const rightKSpan = Math.floor((rightSpanAvail + EPS) / roSpan);
            if (rightKSpan <= 0) continue;

            const leftCount = k * leftCrossFits;
            const rightCount = rightKSpan * rightCrossFits;
            // Обе зоны должны полностью заполняться — это суть half-split.
            if (leftCount > remaining[leftT.id]) continue;
            if (rightCount > remaining[rightT.id]) continue;

            const total = leftCount + rightCount;
            if (best && total <= best.total) continue;

            // Построить позиции
            const positions = [];
            for (let ks = 0; ks < k; ks++) {
              for (let cs = 0; cs < leftCrossFits; cs++) {
                positions.push({
                  typeId: leftT.id,
                  x: axis === 'x' ? rect.x + ks * loSpan : rect.x + cs * loCross,
                  y: axis === 'x' ? rect.y + cs * loCross : rect.y + ks * loSpan,
                  l: lo.l, w: lo.w, h: lo.h,
                  oriKind: lo.kind,
                });
              }
            }
            for (let ks = 0; ks < rightKSpan; ks++) {
              for (let cs = 0; cs < rightCrossFits; cs++) {
                positions.push({
                  typeId: rightT.id,
                  x: axis === 'x'
                    ? rect.x + leftSpanTotal + ks * roSpan
                    : rect.x + cs * roCross,
                  y: axis === 'x'
                    ? rect.y + cs * roCross
                    : rect.y + leftSpanTotal + ks * roSpan,
                  l: ro.l, w: ro.w, h: ro.h,
                  oriKind: ro.kind,
                });
              }
            }

            best = {
              total, layerH, axis, k,
              leftT: leftT.id, rightT: rightT.id,
              leftCount, rightCount,
              leftCols: axis === 'x' ? k : leftCrossFits,
              leftRows: axis === 'x' ? leftCrossFits : k,
              rightCols: axis === 'x' ? rightKSpan : rightCrossFits,
              rightRows: axis === 'x' ? rightCrossFits : rightKSpan,
              leftSpanTotal,
              leftOri: lo, rightOri: ro,
              positions,
            };
          }
        }
      }
    }
  };

  build(typeA, typeB);
  build(typeB, typeA);
  return best;
}

/* ------------------------------------------------------------
 * Геометрия: коллизия и опора
 * ------------------------------------------------------------ */
function rectOverlapArea(ax, ay, al, aw, bx, by, bl, bw) {
  const ox = Math.min(ax + al, bx + bl) - Math.max(ax, bx);
  const oy = Math.min(ay + aw, by + bw) - Math.max(ay, by);
  if (ox <= EPS || oy <= EPS) return 0;
  return ox * oy;
}

function supportFraction(pos, placed, currentZ) {
  if (currentZ < EPS) return 1;
  const boxArea = pos.l * pos.w;
  let covered = 0;
  for (const p of placed) {
    if (Math.abs(p.z + p.h - currentZ) > 1e-3) continue;
    covered += rectOverlapArea(pos.x, pos.y, pos.l, pos.w, p.x, p.y, p.l, p.w);
  }
  return covered / boxArea;
}

function allSupported(positions, placed, currentZ) {
  if (currentZ < EPS) return true;
  return positions.every((p) => supportFraction(p, placed, currentZ) >= MIN_SUPPORT);
}

function centeredSubset(positions, n, palletL, palletW) {
  if (n >= positions.length) return positions.slice();
  const cx = palletL / 2;
  const cy = palletW / 2;
  return positions
    .map((p) => ({ p, d: Math.hypot(p.x + p.l / 2 - cx, p.y + p.w / 2 - cy) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.p);
}

/* ------------------------------------------------------------
 * Человеко-читаемые описания слоя (русский).
 * ------------------------------------------------------------ */
const fmt = (n) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
};

function orientationLabel(oriKind, boxH, type) {
  if (oriKind === 'flat') return 'плашмя';
  // stand: вычислить, каким краем стоит
  if (Math.abs(boxH - type.length) < 0.01) return 'на торце (длинной стороной вверх)';
  if (Math.abs(boxH - type.width) < 0.01) return 'на боку (шириной вверх)';
  return 'стоя';
}

function describePure(grid, type) {
  const dir = grid.cols > grid.rows
    ? `${grid.cols} вдоль длинной стороны, ${grid.rows} вдоль короткой`
    : `${grid.rows} вдоль короткой стороны, ${grid.cols} вдоль длинной`;
  return {
    headline: `${grid.count} шт ${type.name}`,
    body: `${orientationLabel(grid.oriKind, grid.boxH, type)}, сетка ${grid.cols} × ${grid.rows} (${dir})`,
  };
}

function describeHalfSplit(hs, typeLeft, typeRight) {
  const axisLabel = hs.axis === 'x' ? 'по длине палеты' : 'по ширине палеты';
  const splitAt = fmt(hs.leftSpanTotal);
  const leftZoneRange = hs.axis === 'x' ? `0–${splitAt} см по длине` : `0–${splitAt} см по ширине`;
  const rightZoneRange = hs.axis === 'x'
    ? `${splitAt}–${fmt((hs.axis === 'x' ? PALLET.length : PALLET.width))} см по длине`
    : `${splitAt}–${fmt((hs.axis === 'x' ? PALLET.length : PALLET.width))} см по ширине`;
  return {
    headline: `${hs.total} шт: ${hs.leftCount} × ${typeLeft.name} + ${hs.rightCount} × ${typeRight.name}`,
    body: `Разделение ${axisLabel}:`,
    zones: [
      {
        label: `Зона A (${leftZoneRange})`,
        text: `${hs.leftCount} × ${typeLeft.name}, ${orientationLabel(hs.leftOri.kind, hs.leftOri.h, typeLeft)}, сетка ${hs.leftCols} × ${hs.leftRows}`,
      },
      {
        label: `Зона B (${rightZoneRange})`,
        text: `${hs.rightCount} × ${typeRight.name}, ${orientationLabel(hs.rightOri.kind, hs.rightOri.h, typeRight)}, сетка ${hs.rightCols} × ${hs.rightRows}`,
      },
    ],
  };
}

function describeMixedEdge(me, type) {
  const axisLabel = me.axis === 'x' ? 'в конце длины палеты' : 'в конце ширины палеты';
  const dropWord = me.drop === 1 ? 'ряд' : (me.drop >= 2 && me.drop <= 4 ? 'ряда' : 'рядов');
  const flatDir = `${me.flatCols} × ${me.flatRows}`;
  const standDir = `${me.sCols} × ${me.sRows}`;
  return {
    headline: `${me.total} шт ${type.name} (смешанный слой)`,
    body: `Основная зона плашмя + ${me.drop} ${dropWord} заменены на стоящие «на ребре» ${axisLabel}.`,
    zones: [
      {
        label: 'Зона A — плашмя',
        text: `${me.flatCount} × ${type.name}, ${orientationLabel('flat', me.flatOri.h, type)}, сетка ${flatDir}`,
      },
      {
        label: 'Зона B — на ребре',
        text: `${me.standCount} × ${type.name}, ${orientationLabel('stand', me.standOri.h, type)}, сетка ${standDir}`,
      },
    ],
  };
}

function describeCenterCap(type, count, cols, rows) {
  return {
    headline: `${count} шт ${type.name} (шапка)`,
    body: `По центру палеты, ${orientationLabel('flat', type.height, type)}, сетка ${cols} × ${rows}`,
  };
}

/* ============================================================
 * ГЛАВНАЯ ФУНКЦИЯ
 * ============================================================ */
export function packPallet(boxTypes, quantities, options = {}) {
  const {
    overhangPct = DEFAULT_OVERHANG,
  } = options;

  const maxL = PALLET.length * (1 + overhangPct);
  const maxW = PALLET.width * (1 + overhangPct);
  const maxZ = PALLET.maxStackHeight;

  const typeById = Object.fromEntries(boxTypes.map((t) => [t.id, t]));
  const remaining = {};
  for (const t of boxTypes) remaining[t.id] = quantities[t.id] || 0;

  const placed = [];
  const layers = [];
  const unplaced = {};
  let currentZ = 0;

  const fullRect = { x: 0, y: 0, l: maxL, w: maxW };

  const activeTypeIds = () => Object.keys(remaining).filter((id) => remaining[id] > 0);

  /* ----- ФАЗА 1: чистые слои и half-split ----- */
  while (activeTypeIds().length > 0) {
    const candidates = [];

    // Кандидаты: чистая сетка одного типа
    for (const id of activeTypeIds()) {
      const t = typeById[id];
      if (currentZ + t.height > maxZ + EPS) continue;
      const grid = bestPureGrid(t, fullRect);
      if (!grid) continue;
      if (grid.count > remaining[id]) continue;
      const positions = gridPositions(grid, fullRect, id).map((p) => ({ ...p, z: currentZ }));
      if (!allSupported(positions, placed, currentZ)) continue;
      candidates.push({
        kind: 'pure',
        count: grid.count,
        height: t.height,
        type: t,
        grid,
        positions,
      });
    }

    // Кандидаты: смешанная кромка (flat + stand того же типа).
    // Даём только когда это будет ФИНАЛЬНЫЙ слой типа (иначе верх
    // слоя неровный и следующие слои лишатся опоры).
    for (const id of activeTypeIds()) {
      const t = typeById[id];
      if (currentZ + Math.max(t.height, ...orientations(t).map((o) => o.h)) > maxZ + EPS) continue;
      const pureGrid = bestPureGrid(t, fullRect);
      const pureCount = pureGrid ? pureGrid.count : 0;
      // Подбираем смешанную раскладку с максимумом коробок, но не
      // больше, чем есть в остатке — так раскладка всегда полностью
      // заполнена.
      const me = bestMixedEdge(t, fullRect, remaining[id]);
      if (!me) continue;
      if (me.total <= pureCount) continue;               // выгоды нет
      // Условие финального слоя типа: после этого слоя на ещё один
      // чистый уже не хватит. Иначе сначала лучше сделать pure.
      if (remaining[id] - me.total >= pureCount) continue;
      if (currentZ + me.layerH > maxZ + EPS) continue;
      const positions = me.positions.map((p) => ({ ...p, z: currentZ }));
      if (!allSupported(positions, placed, currentZ)) continue;
      candidates.push({
        kind: 'mixed-edge',
        count: me.total,
        height: me.layerH,
        type: t,
        me,
        positions,
      });
    }

    // Кандидаты: half-split
    const ids = activeTypeIds();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const tA = typeById[ids[i]];
        const tB = typeById[ids[j]];
        if (currentZ + Math.max(tA.height, tB.height) > maxZ + EPS) continue;
        const hs = bestHalfSplit(tA, tB, remaining, fullRect);
        if (!hs) continue;
        const positions = hs.positions.map((p) => ({ ...p, z: currentZ }));
        if (!allSupported(positions, placed, currentZ)) continue;
        candidates.push({
          kind: 'half-split',
          count: hs.total,
          height: hs.layerH,
          hs,
          positions,
        });
      }
    }

    if (candidates.length === 0) break;

    // Для каждого кандидата — «сколько ещё слоёв потянет его запас».
    // Это главный сигнал: тип с большим запасом должен идти первым,
    // чтобы не остаться наверху без опоры.
    const bulkScore = (c) => {
      if (c.kind === 'pure' || c.kind === 'mixed-edge') {
        return remaining[c.type.id] / c.count;
      }
      // half-split: считаем лимитирующий тип
      return Math.min(
        remaining[c.hs.leftT] / c.hs.leftCount,
        remaining[c.hs.rightT] / c.hs.rightCount,
      );
    };

    // Приоритет слоёв:
    // (1) больше коробок в слое;
    // (2) больше «запаса слоёв» — чтобы массовые типы шли первыми;
    // (3) pure > half-split > mixed-edge при равном количестве
    //     (mixed-edge слой с неровным верхом и «ломает» опору выше).
    const kindRank = (k) => (k === 'pure' ? 0 : k === 'half-split' ? 1 : 2);
    candidates.sort((a, b) =>
      b.count - a.count
      || bulkScore(b) - bulkScore(a)
      || kindRank(a.kind) - kindRank(b.kind)
    );
    const pick = candidates[0];

    // Разместить
    for (const p of pick.positions) {
      placed.push({
        ...p,
        support: supportFraction(p, placed.filter((x) => x.z < p.z), currentZ),
        layerKind: pick.kind,
      });
      remaining[p.typeId]--;
    }

    // Описание слоя
    let description, typeBreakdown;
    if (pick.kind === 'pure') {
      description = describePure(pick.grid, pick.type);
      typeBreakdown = { [pick.type.id]: pick.grid.count };
    } else if (pick.kind === 'mixed-edge') {
      description = describeMixedEdge(pick.me, pick.type);
      typeBreakdown = { [pick.type.id]: pick.me.total };
    } else {
      const tL = typeById[pick.hs.leftT];
      const tR = typeById[pick.hs.rightT];
      description = describeHalfSplit(pick.hs, tL, tR);
      typeBreakdown = {
        [pick.hs.leftT]: pick.hs.leftCount,
        [pick.hs.rightT]: pick.hs.rightCount,
      };
    }

    layers.push({
      index: layers.length + 1,
      z: [currentZ, currentZ + pick.height],
      kind: pick.kind,
      count: pick.count,
      typeBreakdown,
      positions: pick.positions,
      description,
    });

    currentZ += pick.height;
  }

  /* ----- ФАЗА 2: центрированные шапки для остатков ----- */
  // Остатки сортируем от тяжёлых/больших к мелким (высота desc).
  const capTypes = activeTypeIds()
    .map((id) => typeById[id])
    .sort((a, b) => b.height - a.height);

  for (const t of capTypes) {
    while (remaining[t.id] > 0) {
      if (currentZ + t.height > maxZ + EPS) {
        unplaced[t.id] = (unplaced[t.id] || 0) + remaining[t.id];
        remaining[t.id] = 0;
        break;
      }
      const grid = bestPureGrid(t, fullRect);
      if (!grid) {
        unplaced[t.id] = (unplaced[t.id] || 0) + remaining[t.id];
        remaining[t.id] = 0;
        break;
      }
      const allPositions = gridPositions(grid, fullRect, t.id)
        .map((p) => ({ ...p, z: currentZ }));
      const supported = allPositions.filter((p) => supportFraction(p, placed, currentZ) >= MIN_SUPPORT);
      if (supported.length === 0) {
        // Ничто не помещается — отдаём в unplaced
        unplaced[t.id] = (unplaced[t.id] || 0) + remaining[t.id];
        remaining[t.id] = 0;
        break;
      }
      const toPlace = Math.min(remaining[t.id], supported.length);
      const subset = centeredSubset(supported, toPlace, maxL, maxW);

      // Оценить фактическую сетку подмножества (для описания)
      const xs = [...new Set(subset.map((p) => Math.round(p.x * 100) / 100))].sort((a, b) => a - b);
      const ys = [...new Set(subset.map((p) => Math.round(p.y * 100) / 100))].sort((a, b) => a - b);

      for (const p of subset) {
        placed.push({
          ...p,
          support: supportFraction(p, placed, currentZ),
          layerKind: 'center-cap',
        });
        remaining[t.id]--;
      }

      layers.push({
        index: layers.length + 1,
        z: [currentZ, currentZ + t.height],
        kind: 'center-cap',
        count: toPlace,
        typeBreakdown: { [t.id]: toPlace },
        positions: subset,
        description: describeCenterCap(t, toPlace, xs.length, ys.length),
      });

      currentZ += t.height;
    }
  }

  // Остатки, не размещённые из-за пределов
  for (const id of Object.keys(remaining)) {
    if (remaining[id] > 0) unplaced[id] = (unplaced[id] || 0) + remaining[id];
  }

  /* ----- СТАТИСТИКА ----- */
  const totalHeight = placed.reduce((m, b) => Math.max(m, b.z + b.h), 0);
  const totalBoxVolume = placed.reduce((s, b) => s + b.l * b.w * b.h, 0);
  const palletVolumeUsed = PALLET.length * PALLET.width * Math.max(totalHeight, 0.001);
  const efficiency = totalBoxVolume / palletVolumeUsed;
  const avgSupport = placed.length > 0
    ? placed.reduce((s, b) => s + (b.support ?? 1), 0) / placed.length : 1;
  const standFraction = placed.length > 0
    ? placed.filter((b) => b.oriKind === 'stand').length / placed.length : 0;

  return {
    placedBoxes: placed,
    layers,
    stats: {
      totalBoxes: placed.length,
      layerCount: layers.length,
      totalHeight,
      efficiency,
      avgSupport,
      standFraction,
      unplaced,
    },
  };
}