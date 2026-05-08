// @ts-nocheck — incremental TS migration: file renamed, strict typing pending
/* Vitest — preflightAnalyzer.js briefing-engine tests.

   Verifies the rule-based flag generator's behaviour for each kind:
   parsing, structural, capacity, distribution, coverage. */

import { describe, expect, it } from 'vitest';
import { analyzeAuftrag } from './preflightAnalyzer.js';

/* ─── Helpers ──────────────────────────────────────────────────────── */
function mkItem({ title, units = 50, level, dim = null, hasDimensions = false }) {
  const it = { title, units, fnsku: 'F-' + title.slice(0, 4), sku: 's', dim };
  if (level != null) it.level = level;
  if (hasDimensions) it.hasDimensions = true;
  return it;
}
function mkParsed({ pallets = [], esku = [] }) {
  return {
    format: 'standard',
    meta: { totalUnits: 0, totalSkus: 0 },
    pallets,
    einzelneSkuItems: esku,
  };
}

/* ════════════════════════════════════════════════════════════════════ */
describe('analyzeAuftrag — idle / empty', () => {
  it('returns idle briefing when no parsed input', () => {
    const b = analyzeAuftrag({});
    expect(b.flags).toEqual([]);
    expect(b.worst).toBe('ok');
    expect(b.totals.palletCount).toBe(0);
  });

  it('returns clean briefing when totals=0 and no flags', () => {
    const b = analyzeAuftrag({ parsed: mkParsed({}) });
    expect(b.worst).toBe('ok');
  });
});

describe('analyzeAuftrag — parsing flags pass-through', () => {
  it('mirrors validation.issues into parsing flags with severity preserved', () => {
    const validation = {
      ok: false,
      errorCount: 1,
      warningCount: 1,
      issues: [
        { severity: 'error', kind: 'unit-mismatch', msg: 'Header 100 vs 80', palletId: 'P1-B1' },
        { severity: 'warn',  kind: 'missing-asin',  msg: 'no asin',         palletId: 'P1-B2' },
      ],
    };
    const b = analyzeAuftrag({
      parsed: mkParsed({ pallets: [{ id: 'P1-B1', items: [] }] }),
      validation,
    });
    const parsing = b.flags.filter((f) => f.kind === 'parsing');
    expect(parsing).toHaveLength(2);
    expect(parsing.find((f) => f.code === 'UNIT_MISMATCH').severity).toBe('error');
    expect(parsing.find((f) => f.code === 'MISSING_ASIN').severity).toBe('warn');
    expect(b.worst).toBe('error');
  });
});

describe('analyzeAuftrag — structural flags', () => {
  it('emits DOMINANT_LEVEL info when one level holds ≥70% units', () => {
    const parsed = mkParsed({
      pallets: [{
        id: 'P1-B1',
        items: [
          mkItem({ title: 'Thermo 57×18', units: 80, level: 1 }),
          mkItem({ title: 'Klebeband',    units: 20, level: 3 }),
        ],
      }],
    });
    const b = analyzeAuftrag({ parsed });
    const dom = b.flags.find((f) => f.code === 'DOMINANT_LEVEL');
    expect(dom).toBeDefined();
    expect(dom.severity).toBe('info');
    expect(dom.message).toMatch(/L1/);
  });

  it('emits SINGLE_SKU_PALLET info when hasFourSideWarning present', () => {
    const parsed = mkParsed({
      pallets: [
        { id: 'P1-B1', items: [mkItem({ title: 't', units: 100, level: 1 })], hasFourSideWarning: true },
        { id: 'P1-B2', items: [mkItem({ title: 't', units: 50,  level: 1 })] },
      ],
    });
    const b = analyzeAuftrag({ parsed });
    const ssku = b.flags.find((f) => f.code === 'SINGLE_SKU_PALLET');
    expect(ssku).toBeDefined();
    expect(ssku.message).toMatch(/4-Seiten/);
  });

  it('emits HIGH_ESKU_DENSITY info when ≥3 ESKU groups', () => {
    const esku = [
      mkItem({ title: 'A', units: 5 }),
      mkItem({ title: 'B', units: 5 }),
      mkItem({ title: 'C', units: 5 }),
    ];
    esku.forEach((it, i) => { it.fnsku = `E${i}`; });
    const b = analyzeAuftrag({ parsed: mkParsed({ esku }) });
    const dense = b.flags.find((f) => f.code === 'HIGH_ESKU_DENSITY');
    expect(dense).toBeDefined();
  });
});

describe('analyzeAuftrag — capacity flags from distribution', () => {
  it('emits PREDICTED_OVERLOAD error for pallet with overloadFlags set', () => {
    const distribution = {
      palletStates: {
        'P1-B1': {
          weightKg: 720,
          volCm3: 1.6e6,
          overloadFlags: new Set(['OVERLOAD-W', 'OVERLOAD-V']),
          fillPct: 1.005,
          capacityFraction: () => 1.05,
        },
      },
      overloadCount: 2,
      overloadedPalletCount: 1,
      noValidCount: 0,
    };
    const b = analyzeAuftrag({ parsed: mkParsed({}), distribution });
    const cap = b.flags.find((f) => f.code === 'PREDICTED_OVERLOAD');
    expect(cap).toBeDefined();
    expect(cap.severity).toBe('error');
    expect(cap.target.palletId).toBe('P1-B1');
    expect(b.worst).toBe('error');
  });

  it('emits NEAR_OVERLOAD_V warn when volume ≥95% but no hard overload', () => {
    const distribution = {
      palletStates: {
        'P1-B1': {
          weightKg: 300,
          volCm3: 1.55e6,           // ≈ 97.5% of 1.59 m³
          overloadFlags: new Set(),
          fillPct: 0.975,
          capacityFraction: () => 0.5,
        },
      },
      overloadCount: 0,
      overloadedPalletCount: 0,
      noValidCount: 0,
    };
    const b = analyzeAuftrag({ parsed: mkParsed({}), distribution });
    const near = b.flags.find((f) => f.code === 'NEAR_OVERLOAD_V');
    expect(near).toBeDefined();
    expect(near.severity).toBe('warn');
  });

  it('emits NO_VALID_PLACEMENT error when distribution.noValidCount > 0', () => {
    const distribution = {
      palletStates: {},
      overloadCount: 0,
      noValidCount: 2,
    };
    const b = analyzeAuftrag({ parsed: mkParsed({}), distribution });
    const flag = b.flags.find((f) => f.code === 'NO_VALID_PLACEMENT');
    expect(flag).toBeDefined();
    expect(flag.severity).toBe('error');
  });
});

describe('analyzeAuftrag — coverage flags', () => {
  it('emits MISSING_DIMS warn when ≥20% items lack dimensions data', () => {
    // 5 unique items, 4 without dims → 80% missing → over threshold
    const enriched = Array.from({ length: 5 }, (_, i) => ({
      id: `P1-B1`, items: [{
        title: `Item ${i}`,
        fnsku: `F${i}`,
        sku: `s${i}`,
        units: 10,
        hasDimensions: i === 0,                  // only first has dims
      }],
    }));
    const b = analyzeAuftrag({
      parsed: mkParsed({ pallets: enriched }),
      enrichedPallets: enriched,
    });
    const cov = b.flags.find((f) => f.code === 'MISSING_DIMS');
    expect(cov).toBeDefined();
    expect(cov.severity).toBe('warn');
  });

  it('does NOT emit coverage flag when most items have dims', () => {
    const enriched = Array.from({ length: 10 }, (_, i) => ({
      id: 'P1-B1', items: [{
        title: `Item ${i}`,
        fnsku: `F${i}`,
        sku: `s${i}`,
        units: 10,
        hasDimensions: true,
      }],
    }));
    const b = analyzeAuftrag({
      parsed: mkParsed({ pallets: enriched }),
      enrichedPallets: enriched,
    });
    const cov = b.flags.find((f) => f.code === 'MISSING_DIMS');
    expect(cov).toBeUndefined();
  });
});

describe('analyzeAuftrag — totals + sort order', () => {
  it('totals reflect pallet + ESKU counts', () => {
    const parsed = mkParsed({
      pallets: [{
        id: 'P1-B1',
        items: [mkItem({ title: 'A', units: 10 }), mkItem({ title: 'B', units: 20 })],
      }],
      esku: [mkItem({ title: 'C', units: 5 })],
    });
    const b = analyzeAuftrag({ parsed });
    expect(b.totals.palletCount).toBe(1);
    expect(b.totals.itemCount).toBe(3);            // 2 mixed + 1 ESKU
    expect(b.totals.units).toBe(35);
    expect(b.totals.eskuItemCount).toBe(1);
    expect(b.totals.eskuGroupCount).toBe(1);
  });

  it('flags are sorted: errors → warns → infos', () => {
    const distribution = {
      palletStates: {
        'P1-B1': {
          weightKg: 720, volCm3: 1.6e6,
          overloadFlags: new Set(['OVERLOAD-W']),
          fillPct: 1.0, capacityFraction: () => 1.0,
        },
      },
      overloadCount: 1, overloadedPalletCount: 1, noValidCount: 0,
    };
    const parsed = mkParsed({
      pallets: [{
        id: 'P1-B1',
        items: [mkItem({ title: 'Thermo', units: 100, level: 1 })],
        hasFourSideWarning: true,
      }],
    });
    const b = analyzeAuftrag({ parsed, distribution });
    const severities = b.flags.map((f) => f.severity);
    // Every error must precede every warn must precede every info.
    const lastErr = severities.lastIndexOf('error');
    const firstWarn = severities.indexOf('warn');
    const firstInfo = severities.indexOf('info');
    if (firstWarn !== -1) expect(firstWarn).toBeGreaterThan(lastErr);
    if (firstInfo !== -1 && firstWarn !== -1) expect(firstInfo).toBeGreaterThan(firstWarn);
  });
});