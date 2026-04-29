/* ============================================================
 * PALLET + BOX DATA MODEL
 *
 * Расширенная схема. Поля сверх базовой геометрии:
 *   shortCode              — короткий код для печатных планов
 *   weightKg               — оценка веса коробки (брутто). *ПРИКИДКА*,
 *                            нужно уточнить замерами.
 *   topLoadLimitKg         — сколько кг можно поставить сверху
 *                            без деформации. *ПРИКИДКА*.
 *   fragility              — 0 прочная, 1 стандарт, 2 деликатная,
 *                            3 хрупкая.
 *   allowedOrientations    — ['flat'] или ['flat','stand'].
 *   preferredOrientation   — что выбирать по умолчанию.
 *   maxStackSelf           — максимум коробок ЭТОГО типа друг на
 *                            друге без промежуточной прокладки.
 *                            null = ограничено только высотой.
 *   thisWayUp              — есть стрелка «↑», класть запрещено.
 *
 * Все «прикидочные» значения помечены комментом и будут
 * пересчитаны, когда у нас будут реальные замеры.
 * ============================================================ */

export const PALLET = {
  length: 120,
  width: 80,
  height: 14.4,
  maxTotalHeight: 180,
  get maxStackHeight() {
    return this.maxTotalHeight - this.height;
  },
};

export const BOX_DEFAULTS = {
  fragility: 1,
  allowedOrientations: ['flat', 'stand'],
  preferredOrientation: 'flat',
  maxStackSelf: null,
  thisWayUp: false,
};

/**
 * Применяет BOX_DEFAULTS к «голому» объекту коробки.
 * Используй в алгоритме через `normalizeBox(type)` чтобы не
 * проверять каждый раз undefined.
 */
export function normalizeBox(t) {
  return { ...BOX_DEFAULTS, ...t };
}

const RAW_BOX_TYPES = [
  /* -------- Thermo 5 Rollen -------- */
  {
    id: 'therm_5r_80x80',
    name: 'Thermo 5 Rollen 80×80',
    shortCode: 'T5-80',
    group: 'Thermo 5 Rollen',
    length: 40.5, width: 9, height: 9,
    maxPerPallet: 504,
    weightKg: 1.7,           // прикидка: 5 × 0.30 кг ролл + 0.2 кг картон
    topLoadLimitKg: 40,      // прикидка
    color: '#3b82f6',
  },

  /* -------- Thermo 10 Rollen -------- */
  {
    id: 'therm_10r_80x80',
    name: 'Thermo 10 Rollen 80×80',
    shortCode: 'T10-80',
    group: 'Thermo 10 Rollen',
    length: 40.5, width: 17, height: 9,
    maxPerPallet: 252,
    weightKg: 3.2,
    topLoadLimitKg: 45,
    color: '#8b5cf6',
  },

  /* -------- Thermo 20 Rollen -------- */
  {
    id: 'therm_20r_57x30_ohne',
    name: 'Thermo 20 Rollen 57×30 ohne',
    shortCode: 'T20-30',
    group: 'Thermo 20 Rollen',
    length: 16, width: 7, height: 12,
    maxPerPallet: null,
    weightKg: 1.1,
    topLoadLimitKg: 25,
    color: '#f97316',
  },
  {
    id: 'therm_20r_57x35_lst',
    name: 'Thermo 20 Rollen 57×35 mit LST',
    shortCode: 'T20-35',
    group: 'Thermo 20 Rollen',
    length: 18.5, width: 8, height: 12.5,
    maxPerPallet: 560,
    weightKg: 1.3,
    topLoadLimitKg: 25,
    color: '#10b981',
  },
  {
    id: 'therm_20r_57x40_lst',
    name: 'Thermo 20 Rollen 57×40 mit LST',
    shortCode: 'T20-40',
    group: 'Thermo 20 Rollen',
    length: 20.5, width: 8.5, height: 12.5,
    maxPerPallet: 560,
    weightKg: 1.5,
    topLoadLimitKg: 25,
    color: '#14b8a6',
  },
  {
    id: 'therm_20r_80x80',
    name: 'Thermo 20 Rollen 80×80',
    shortCode: 'T20-80',
    group: 'Thermo 20 Rollen',
    length: 40, width: 17, height: 16.5,
    maxPerPallet: 126,
    weightKg: 6.2,
    topLoadLimitKg: 50,
    color: '#eab308',
    // Physical arrangement: 7 cols of 17 cm (= 119 cm) × 2 rows of 40 cm (= 80 cm) = 14 per layer
    forcedGrid: { cols: 7, rows: 2, boxL: 17, boxW: 40 },
  },

  /* -------- Thermo 50 Rollen -------- */
  {
    id: 'therm_50r_57x30_ohne',
    name: 'Thermo 50 Rollen 57×30 ohne',
    shortCode: 'T50-30',
    group: 'Thermo 50 Rollen',
    length: 16, width: 16, height: 12,
    maxPerPallet: 350,
    weightKg: 2.7,
    topLoadLimitKg: 35,
    color: '#f59e0b',
  },
  {
    id: 'therm_50r_57x35_lst',
    name: 'Thermo 50 Rollen 57×35 mit LST',
    shortCode: 'T50-35',
    group: 'Thermo 50 Rollen',
    length: 18.5, width: 18.5, height: 12,
    maxPerPallet: 350,
    weightKg: 3.2,
    topLoadLimitKg: 35,
    color: '#06b6d4',
  },
  {
    id: 'therm_50r_57x40_ohne',
    name: 'Thermo 50 Rollen 57×40 ohne',
    shortCode: 'T50-40',
    group: 'Thermo 50 Rollen',
    length: 20.5, width: 20.5, height: 12,
    maxPerPallet: 250,
    weightKg: 3.7,
    topLoadLimitKg: 40,
    color: '#a855f7',
  },
  {
    id: 'therm_50r_57x63',
    name: 'Thermo 50 Rollen 57×63',
    shortCode: 'T50-63',
    group: 'Thermo 50 Rollen',
    length: 32.5, width: 32.5, height: 12.5,
    maxPerPallet: null,
    weightKg: 5.8,
    topLoadLimitKg: 50,
    color: '#ef4444',
  },

  /* -------- Veit -------- */
  {
    id: 'veit_50r_57x30',
    name: 'Veit 50 Rollen 57×30',
    shortCode: 'V50-30',
    group: 'Veit',
    length: 17.5, width: 15, height: 13.5,
    maxPerPallet: null,
    weightKg: 3.0,
    topLoadLimitKg: 35,
    color: '#ec4899',
  },
];

export const BOX_TYPES = RAW_BOX_TYPES.map(normalizeBox);

export const BOX_BY_ID = Object.fromEntries(BOX_TYPES.map((t) => [t.id, t]));

/* ------------------------------------------------------------
 * Группировка для UI. Сохраняет порядок объявления.
 * ------------------------------------------------------------ */
export function boxGroups() {
  const seen = new Set();
  const out = [];
  for (const t of BOX_TYPES) {
    if (seen.has(t.group)) continue;
    seen.add(t.group);
    out.push({
      name: t.group,
      types: BOX_TYPES.filter((b) => b.group === t.group),
    });
  }
  return out;
}
