/* Vitest — auftragHelpers.js critical-path tests.

   Covers:
     • getDisplayLevel — title regex priority over legacy `category`
     • formatItemTitle — Kürbiskernöl noise stripping + size suffix
     • sortItemsForPallet — W×H clustering rule (added 2026-05-06)
     • distributeEinzelneSku — H1-H4 level order + H7 4-Seiten-Warnung
     • itemTotalVolumeCm3 / itemTotalWeightKg — heuristic fallbacks

   Tests use minimal synthetic items — no real .docx, no DB. */

import { describe, expect, it } from 'vitest';
import {
  getLevel,
  getDisplayLevel,
  formatItemTitle,
  sortItemsForPallet,
  distributeEinzelneSku,
  primaryLevel,
  itemTotalVolumeCm3,
  itemTotalWeightKg,
  LEVEL_META,
} from './auftragHelpers.js';

/* ─── Helpers to build minimal items ───────────────────────────────── */
function mkMixed({ title, units = 10, dim = null, rollen = null, fnsku = 'X-FAKE' }) {
  return {
    title,
    units,
    fnsku,
    sku: 'sku-' + fnsku,
    dim,
    rollen,
    isEinzelneSku: false,
  };
}
function mkEsku({ title, cartons = 5, packsPerCarton = 10, fnsku = 'X-ESKU' }) {
  return {
    title,
    fnsku,
    sku: 'sku-' + fnsku,
    isEinzelneSku: true,
    units: cartons * packsPerCarton,
    einzelneSku: { cartonsCount: cartons, packsPerCarton },
  };
}

/* ════════════════════════════════════════════════════════════════════ */
describe('getLevel / getDisplayLevel', () => {
  it('Tachorollen → L6 (highest priority — beats Thermorollen pattern)', () => {
    expect(getLevel({ title: 'Tachographenrollen 57×8mm' })).toBe(6);
    expect(getLevel({ title: 'Tachorolle 57/8' })).toBe(6);
  });

  it('Kürbiskernöl → L5 (fragile cap)', () => {
    expect(getLevel({ title: 'Steirisches Gourmet Kürbiskernöl 1L' })).toBe(5);
    expect(getLevel({ title: 'Kernöl Premium' })).toBe(5);
  });

  it('TK THERMALKING / Sandsäcke → L4 Produktion', () => {
    expect(getLevel({ title: 'TK THERMALKING Klebeband' })).toBe(4);
    expect(getLevel({ title: '50x Sandsäcke leer' })).toBe(4);
  });

  it('Klebeband / fragile → L3', () => {
    expect(getLevel({ title: 'Klebeband Standard 50m' })).toBe(3);
    expect(getLevel({ title: 'Fragile Aufkleber' })).toBe(3);
  });

  it('ÖKO / phenolfrei → L2 (genuine eco indicators only)', () => {
    expect(getLevel({ title: 'ÖKO Thermorollen phenolfrei' })).toBe(2);
    expect(getLevel({ title: 'Phenolfrei BPA-frei Thermorolle' })).toBe(2);
  });

  it('ECO ROOLLS brand alone is L1, not L2', () => {
    // Brand prefix "ECO ROOLLS" (registered trademark) used to false-
    // positive into L2. The vendor's catalog is mostly regular
    // thermal paper — only count genuine öko/phenolfrei flags.
    expect(getLevel({
      title: 'ECO ROOLLS® EC Cash Rollen Thermopapier 57mm x 35mm x 12mm - Kassenrollen',
    })).toBe(1);
    expect(getLevel({ title: 'ECO ROOLLS 57×40' })).toBe(1);
    // ECO ROOLLS that ARE explicitly öko still hit L2:
    expect(getLevel({ title: 'ECO ROOLLS phenolfrei 80×80' })).toBe(2);
  });

  it('default falls through to L1 Thermorollen', () => {
    expect(getLevel({ title: 'Standard Thermorolle 57×18' })).toBe(1);
    expect(getLevel({ title: 'Random product' })).toBe(1);
  });

  it('getDisplayLevel: title regex wins over legacy category field', () => {
    // Legacy parser tagged Kernöl as 'produktion' (=L4) but the live
    // title-based check should give L5. This was the FBA15LL4PK53 bug.
    const item = { title: 'Kürbiskernöl 1 L', category: 'produktion' };
    expect(getDisplayLevel(item)).toBe(5);
  });

  it('getDisplayLevel: pre-computed item.level always wins', () => {
    expect(getDisplayLevel({ level: 6, title: 'whatever' })).toBe(6);
  });

  it('LEVEL_META has 6 entries with shortName + color', () => {
    for (let lvl = 1; lvl <= 6; lvl++) {
      expect(LEVEL_META[lvl]).toMatchObject({
        shortName: expect.any(String),
        color: expect.stringMatching(/^#[0-9A-F]{6}$/i),
      });
    }
  });
});

/* ════════════════════════════════════════════════════════════════════ */
describe('formatItemTitle', () => {
  it('strips g.g.A. + 100% vegan + kaltgepresst noise on Kernöl titles', () => {
    const out = formatItemTitle('Steirisches Gourmet Kürbiskernöl g.g.A. 100% vegan kaltgepresst (1 l)');
    expect(out).not.toMatch(/g\.g\.A/);
    expect(out).not.toMatch(/100\s*%/);
    expect(out).not.toMatch(/vegan/i);
    expect(out).not.toMatch(/kaltgepresst/i);
  });

  it('surfaces (N l) / (N kg) suffix at end of cleaned title', () => {
    expect(formatItemTitle('Steirisches Kürbiskernöl (1 l)')).toMatch(/1 L$/);
    expect(formatItemTitle('Big Bag (10 kg)')).toMatch(/10 kg$/);
  });

  it('handles missing / empty input', () => {
    expect(formatItemTitle('')).toBe('—');
    expect(formatItemTitle(null)).toBe('—');
  });
});

/* ════════════════════════════════════════════════════════════════════ */
describe('sortItemsForPallet — W×H cluster rule (2026-05-06)', () => {
  it('clusters identical W×H even with different rollen counts', () => {
    // FBA15LL4PK53 P1-B3 case: 57×18 (75 rolls) + 57×14 + 57×18 (15 rolls) + 57×9
    // Expected: 57×18 cluster stays adjacent (75 rolls then 15 rolls),
    // then 57×14, then 57×9.
    const items = [
      mkMixed({ title: 'Thermorollen 57×9',  units: 20, dim: { w: 57, h: 9 },  rollen: 50, fnsku: 'F1' }),
      mkMixed({ title: 'Thermorollen 57×14', units: 70, dim: { w: 57, h: 14 }, rollen: 50, fnsku: 'F2' }),
      mkMixed({ title: 'Thermorollen 57×18', units: 15, dim: { w: 57, h: 18 }, rollen: 50, fnsku: 'F3' }),
      mkMixed({ title: 'Thermorollen 57×18', units: 75, dim: { w: 57, h: 18 }, rollen: 50, fnsku: 'F4' }),
    ];
    const sorted = sortItemsForPallet(items);
    const keys = sorted.map((it) => `${it.dim.w}×${it.dim.h} ·${it.units}`);
    // 57×18 (75) anchor → 57×18 (15) clustered after → 57×14 → 57×9
    expect(keys[0]).toBe('57×18 ·75');
    expect(keys[1]).toBe('57×18 ·15');
    expect(keys[2]).toBe('57×14 ·70');
    expect(keys[3]).toBe('57×9 ·20');
  });

  it('puts L5 (Kernöl) and L6 (Tacho) at end, L5 before L6', () => {
    const items = [
      mkMixed({ title: 'Tachographenrollen 57×8', units: 20, dim: { w: 57, h: 8 }, rollen: 50, fnsku: 'T1' }),
      mkMixed({ title: 'Kürbiskernöl 1L',         units: 10, fnsku: 'K1' }),
      mkMixed({ title: 'Thermorollen 57×18',      units: 30, dim: { w: 57, h: 18 }, rollen: 50, fnsku: 'F1' }),
    ];
    const sorted = sortItemsForPallet(items);
    expect(getDisplayLevel(sorted[0])).toBe(1);   // L1 first
    expect(getDisplayLevel(sorted[1])).toBe(5);   // Kernöl
    expect(getDisplayLevel(sorted[2])).toBe(6);   // Tacho last
  });

  it('returns empty array for empty input', () => {
    expect(sortItemsForPallet([])).toEqual([]);
    expect(sortItemsForPallet(null)).toEqual([]);
    expect(sortItemsForPallet(undefined)).toEqual([]);
  });

  it('preserves single-item input', () => {
    const item = mkMixed({ title: 'Thermo 57×18', units: 10, dim: { w: 57, h: 18 } });
    expect(sortItemsForPallet([item])).toEqual([item]);
  });

  it('ESKU items get unique cluster keys — do NOT cluster with each other', () => {
    // Two ESKU items with same W×H but different fnsku should stay
    // separate (the sort still orders them, just doesn't merge).
    const a = mkEsku({ title: 'ESKU A 57×18', cartons: 5, fnsku: 'EA' });
    const b = mkEsku({ title: 'ESKU B 57×18', cartons: 3, fnsku: 'EB' });
    a.dim = { w: 57, h: 18 };
    b.dim = { w: 57, h: 18 };
    const sorted = sortItemsForPallet([a, b]);
    expect(sorted.length).toBe(2);    // both present
  });
});

/* ════════════════════════════════════════════════════════════════════ */
describe('primaryLevel', () => {
  it('picks dominant level by total volume', () => {
    const items = [
      mkMixed({ title: 'Thermo 57×18', units: 100, dim: { w: 57, h: 18 } }),
      mkMixed({ title: 'Tacho 57×8',   units: 5,   dim: { w: 57, h: 8 } }),
    ];
    expect(primaryLevel(items)).toBe(1);    // L1 dominates
  });

  it('returns 1 for empty pallet', () => {
    expect(primaryLevel([])).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════════════ */
describe('distributeEinzelneSku — hard constraints', () => {
  function mkPallet({ id, items = [], hasFourSideWarning = false }) {
    return { id, items, hasFourSideWarning };
  }

  it('returns empty distribution when no pallets', () => {
    const r = distributeEinzelneSku([], []);
    expect(r.byPalletId).toEqual({});
    expect(r.unassigned).toEqual([]);
  });

  it('returns empty placement when no ESKU items', () => {
    const r = distributeEinzelneSku([mkPallet({ id: 'P1-B1' })], []);
    expect(r.byPalletId).toEqual({ 'P1-B1': [] });
  });

  it('H7 — refuses to assign ESKU to a Single-SKU pallet (hasFourSideWarning)', () => {
    const single = mkPallet({
      id: 'P1-B1',
      items: [mkMixed({ title: 'Single-SKU thermo 57×18', units: 200, dim: { w: 57, h: 18 } })],
      hasFourSideWarning: true,                  // Amazon 4-Seiten ban
    });
    const normal = mkPallet({
      id: 'P1-B2',
      items: [mkMixed({ title: 'Mixed thermo 57×40', units: 50, dim: { w: 57, h: 40 } })],
    });
    const esku = mkEsku({ title: 'ESKU thermo 57×30', cartons: 3, fnsku: 'EC1' });
    esku.dim = { w: 57, h: 30 };

    const r = distributeEinzelneSku([single, normal], [esku]);
    // Distributor must place on P1-B2 (normal), NOT P1-B1 (4-side).
    expect(r.byPalletId['P1-B1']).toHaveLength(0);
    expect(r.byPalletId['P1-B2'].length).toBeGreaterThan(0);
  });

  it('returns palletStates with weightKg / volCm3 / overloadFlags fields', () => {
    const p = mkPallet({
      id: 'P1-B1',
      items: [mkMixed({ title: 'Thermo 57×18', units: 50, dim: { w: 57, h: 18 } })],
    });
    const r = distributeEinzelneSku([p], []);
    const state = r.palletStates['P1-B1'];
    expect(state).toBeDefined();
    expect(state.weightKg).toBeGreaterThanOrEqual(0);
    expect(state.volCm3).toBeGreaterThanOrEqual(0);
    expect(state.overloadFlags).toBeInstanceOf(Set);
  });

  it('exposes overloadCount + noValidCount summary', () => {
    const r = distributeEinzelneSku(
      [mkPallet({ id: 'P1-B1' })],
      [mkEsku({ title: 'ESKU 1', cartons: 1 })],
    );
    expect(typeof r.overloadCount).toBe('number');
    expect(typeof r.noValidCount).toBe('number');
  });
});

/* ════════════════════════════════════════════════════════════════════ */
describe('itemTotalVolumeCm3 + itemTotalWeightKg', () => {
  it('returns positive volume for an item with rollen + dim', () => {
    const it = mkMixed({ title: 'Thermo 57×18', units: 10, dim: { w: 57, h: 18 }, rollen: 50 });
    const v = itemTotalVolumeCm3(it);
    expect(v).toBeGreaterThan(0);
  });

  it('weight of empty pallet items returns 0', () => {
    expect(itemTotalWeightKg(mkMixed({ title: 'x', units: 0 }))).toBe(0);
  });

  it('ESKU heuristic returns positive vol/weight when no dimensions row', () => {
    const it = mkEsku({ title: 'ESKU thermo 57×18', cartons: 5 });
    expect(itemTotalVolumeCm3(it)).toBeGreaterThan(0);
    expect(itemTotalWeightKg(it)).toBeGreaterThan(0);
  });

  it('thermal-roll volume uses 3D bounding-box (W × D × D), not flat cross-section', () => {
    // 57mm × 35mm × 12mm roll — bounding box per roll is W × D × D.
    // 50-roll Einheit must be roughly 50× that × packing slack ~1.30,
    // i.e. several thousand cm³ — not under a thousand.
    const it = mkMixed({
      title: 'Thermorolle 57×35×12',
      units: 1,
      dim: { w: 57, h: 35, normW: 57, normH: 35 },
      rollen: 50,
    });
    const v = itemTotalVolumeCm3(it);
    // 5.7 × 3.5 × 3.5 × 50 × 1.30 ≈ 4534 cm³ ± slack tolerance
    expect(v).toBeGreaterThan(3500);
    expect(v).toBeLessThan(6000);
  });

  it('"57mm × 14m × 12mm" maps roll length to diameter via dim.normH', () => {
    // Title encodes 14m roll-length; parser sets dim.h=14 (m) and
    // dim.normH=35 (real diameter). Heuristic must use normH so this
    // physical roll volume matches the 57×35 case.
    const lengthForm = mkMixed({
      title: 'Thermorolle 57×14m×12mm',
      units: 1,
      dim: { w: 57, h: 14, normW: 57, normH: 35 },
      rollen: 50,
    });
    const diameterForm = mkMixed({
      title: 'Thermorolle 57×35×12mm',
      units: 1,
      dim: { w: 57, h: 35, normW: 57, normH: 35 },
      rollen: 50,
    });
    expect(itemTotalVolumeCm3(lengthForm)).toBeCloseTo(itemTotalVolumeCm3(diameterForm), 0);
  });

  it('heavy thermal-roll pallet (350 × 50-roll Einheiten) reaches near-full fill', () => {
    // Mirrors P1-B3 from a real Lagerauftrag — two L1 articles totalling
    // 350 Einheiten of 50-roll boxes. Previously rendered ~22% fill
    // (heuristic bug). Should now read close to 1.0.
    const PALLET_VOL_CM3 = 1.59 * 1e6;
    const a = mkMixed({
      title: 'THERMALKING 57×35×12 (50 Stk)',
      units: 100,
      dim: { w: 57, h: 35, normW: 57, normH: 35 },
      rollen: 50,
    });
    const b = mkMixed({
      title: 'ECO ROOLLS 57×35×12 (50 Stk)',
      units: 250,
      dim: { w: 57, h: 35, normW: 57, normH: 35 },
      rollen: 50,
    });
    const totalVol = itemTotalVolumeCm3(a) + itemTotalVolumeCm3(b);
    const fill = totalVol / PALLET_VOL_CM3;
    expect(fill).toBeGreaterThan(0.85);    // realistic full-pallet read
    expect(fill).toBeLessThan(1.20);       // not absurdly past capacity
  });
});
