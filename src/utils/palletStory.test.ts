// @ts-nocheck — incremental TS migration: file renamed, strict typing pending
/* Vitest — palletStory.js story-engine tests.

   Covers the headline-rule order (first match wins), narrative
   composition, level histogram, and rankPallets() superlatives. */

import { describe, expect, it } from 'vitest';
import { buildPalletStory, rankPallets } from './palletStory.js';

/* ─── Helpers ──────────────────────────────────────────────────────── */
function mkPallet({ id = 'P1-B1', isSingleSku = false, articles = 3, units = 100 }) {
  return { id, isSingleSku, articles, units, level: 1, formats: [] };
}
function mkItem({ title, units = 50, level = null, dim = null }) {
  const it = { title, units, fnsku: 'F-' + title, sku: 's', dim, isEinzelneSku: false };
  if (level != null) it.level = level;
  return it;
}
function mkPalletState({ volCm3 = 0, weightKg = 0, overloadFlags = [], fillPct = null }) {
  return {
    volCm3,
    weightKg,
    overloadFlags: new Set(overloadFlags),
    fillPct: fillPct ?? volCm3 / 1.59e6,
  };
}

/* ════════════════════════════════════════════════════════════════════ */
describe('buildPalletStory — headline rules (first-match-wins)', () => {
  it('Single-SKU 4-Seiten beats every other rule', () => {
    const story = buildPalletStory({
      pallet: mkPallet({ isSingleSku: true }),
      items: [mkItem({ title: 'Thermo 57×18', units: 200 })],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 1.2e6, weightKg: 600 }),
      ranking: { largestId: 'P1-B1' },                 // would otherwise be "Größte"
    });
    expect(story.headline).toMatch(/Single-SKU/);
    expect(story.tone).toBe('warn');
  });

  it('OVERLOAD beats superlatives + dominant level', () => {
    const story = buildPalletStory({
      pallet: mkPallet({ isSingleSku: false }),
      items: [mkItem({ title: 'Thermo 57×18', units: 100 })],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 1.7e6, weightKg: 720, overloadFlags: ['OVERLOAD-W'] }),
      ranking: {},
    });
    expect(story.headline).toMatch(/OVERLOAD/);
    expect(story.tone).toBe('warn');
  });

  it('Größte Palette when ranking.largestId matches', () => {
    const story = buildPalletStory({
      pallet: mkPallet({ id: 'P1-B3', units: 590 }),
      items: [mkItem({ title: 'Thermo 57×18', units: 590 })],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 1.0e6, weightKg: 400 }),
      ranking: { largestId: 'P1-B3', smallestId: 'P1-B1' },
    });
    expect(story.headline).toBe('Größte Palette');
    expect(story.tone).toBe('accent');
  });

  it('Leichteste Palette when ranking.smallestId matches', () => {
    const story = buildPalletStory({
      pallet: mkPallet({ id: 'P1-B1', units: 30 }),
      items: [mkItem({ title: 'Thermo 57×18', units: 30 })],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 0.3e6, weightKg: 100 }),
      ranking: { largestId: 'P1-B3', smallestId: 'P1-B1' },
    });
    expect(story.headline).toBe('Leichteste Palette');
    expect(story.tone).toBe('cool');
  });

  it('Mono-Level when only one level is present', () => {
    const story = buildPalletStory({
      pallet: mkPallet({ id: 'P1-B2', units: 200 }),
      items: [
        mkItem({ title: 'Thermo 57×18', units: 100, level: 1 }),
        mkItem({ title: 'Thermo 80×80', units: 100, level: 1 }),
      ],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 0.6e6 }),
      ranking: {},
    });
    expect(story.headline).toMatch(/Mono-Level · L1/);
  });

  it('THERMO-dominant when ≥65% of one level', () => {
    const story = buildPalletStory({
      pallet: mkPallet({ id: 'P1-B2', units: 100 }),
      items: [
        mkItem({ title: 'Thermo 57×18', units: 90, level: 1 }),
        mkItem({ title: 'Klebeband',    units: 10, level: 3 }),
      ],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 0.5e6 }),
      ranking: {},
    });
    expect(story.headline).toMatch(/THERMO-dominant/);
  });

  it('Mixed-Pyramide when 3+ different levels', () => {
    const story = buildPalletStory({
      pallet: mkPallet({ id: 'P1-B2', units: 100 }),
      items: [
        mkItem({ title: 'Thermo 57×18',     units: 30, level: 1 }),
        mkItem({ title: 'ÖKO Thermo 57×40', units: 30, level: 2 }),
        mkItem({ title: 'Klebeband',         units: 30, level: 3 }),
      ],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 0.4e6 }),
      ranking: {},
    });
    expect(story.headline).toMatch(/Mixed-Pyramide/);
  });
});

describe('buildPalletStory — narrative + capacity', () => {
  it('adds Tacho-on-top warning when L6 present', () => {
    const story = buildPalletStory({
      pallet: mkPallet({}),
      items: [
        mkItem({ title: 'Thermo 57×18', units: 50, level: 1 }),
        mkItem({ title: 'Tacho 57×8',   units: 30, level: 6 }),
      ],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 0.5e6 }),
      ranking: {},
    });
    expect(story.narrative).toMatch(/Tacho on top/i);
  });

  it('adds Single-SKU narrative on hasFourSideWarning', () => {
    const story = buildPalletStory({
      pallet: mkPallet({ isSingleSku: true }),
      items: [mkItem({ title: 'Thermo 57×18', units: 200 })],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 1e6 }),
      ranking: {},
    });
    expect(story.narrative).toMatch(/Single-SKU/i);
    expect(story.narrative).toMatch(/Keine ESKU/i);
  });

  it('exposes capacity { weightPct, volumePct, fillPct }', () => {
    const story = buildPalletStory({
      pallet: mkPallet({}),
      items: [mkItem({ title: 'Thermo 57×18', units: 50 })],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 0.795e6, weightKg: 350 }),
      ranking: {},
    });
    // 0.795 m³ / 1.59 = 50%, 350 / 700 = 50%
    expect(story.capacity.volumePct).toBeCloseTo(0.5, 2);
    expect(story.capacity.weightPct).toBeCloseTo(0.5, 2);
  });

  it('exposes levels histogram sorted by units DESC', () => {
    const story = buildPalletStory({
      pallet: mkPallet({}),
      items: [
        mkItem({ title: 'Thermo 57×18', units: 80, level: 1 }),
        mkItem({ title: 'Klebeband',    units: 20, level: 3 }),
      ],
      eskuAssigned: [],
      palletState: mkPalletState({ volCm3: 0.5e6 }),
      ranking: {},
    });
    expect(story.levels[0].level).toBe(1);
    expect(story.levels[0].pct).toBeCloseTo(0.8, 2);
    expect(story.levels[1].level).toBe(3);
  });
});

describe('rankPallets', () => {
  it('returns null IDs for empty pallet list', () => {
    expect(rankPallets([], {})).toEqual({
      largestId: null, smallestId: null, heaviestId: null,
    });
  });

  it('picks largest by volCm3, smallest by volCm3, heaviest by weightKg', () => {
    const pallets = [
      { id: 'A' }, { id: 'B' }, { id: 'C' },
    ];
    const states = {
      A: { volCm3: 1.0e6, weightKg: 200 },
      B: { volCm3: 1.5e6, weightKg: 400 },
      C: { volCm3: 0.3e6, weightKg: 600 },
    };
    const r = rankPallets(pallets, states);
    expect(r.largestId).toBe('B');
    expect(r.smallestId).toBe('C');
    expect(r.heaviestId).toBe('C');
  });

  it('treats missing palletState as zero values', () => {
    const r = rankPallets([{ id: 'A' }, { id: 'B' }], {});
    expect(r).toMatchObject({ largestId: expect.any(String), smallestId: expect.any(String) });
  });
});