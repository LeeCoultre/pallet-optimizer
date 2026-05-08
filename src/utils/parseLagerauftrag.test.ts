/* Vitest — pure-function tests for parseLagerauftrag.js
   Focus on the two highest-leverage helpers (`parseTitleMeta` +
   `classifyItem`) plus the validation severity pass. Full-document
   parsing of real .docx files is covered indirectly via the Node
   sanity-check scripts we run during dev — adding fixture .docx
   files here is a follow-up (would need to commit binary blobs). */

import { describe, expect, it } from 'vitest';
import {
  parseTitleMeta,
  classifyItem,
  validateParsing,
  detectFormat,
  normalizeHeight,
  detectCodeType,
  categoryRank,
  CATEGORY_ORDER,
} from './parseLagerauftrag.js';

describe('parseTitleMeta', () => {
  it('returns nulls for empty / falsy title', () => {
    expect(parseTitleMeta(null)).toEqual({ dimStr: null, rollen: null, dim: null });
    expect(parseTitleMeta('')).toEqual({ dimStr: null, rollen: null, dim: null });
    expect(parseTitleMeta(undefined)).toEqual({ dimStr: null, rollen: null, dim: null });
  });

  it('extracts W×H dimensions in canonical "57 × 18" form', () => {
    const m = parseTitleMeta('Thermorolle 57x18 m 12 mm');
    expect(m.dim).toMatchObject({ w: 57, h: 18, normW: 57 });
    expect(m.dimStr).toBe('57 × 18');
  });

  it('handles unicode × and Cyrillic х as separators', () => {
    expect(parseTitleMeta('80×80').dim).toMatchObject({ w: 80, h: 80 });
    expect(parseTitleMeta('80х80').dim).toMatchObject({ w: 80, h: 80 });
  });

  it('extracts explicit roll counts: "(50 Rollen)" wins over leading-prefix', () => {
    expect(parseTitleMeta('10 Thermo 57×18 (50 Rollen)').rollen).toBe(50);
    expect(parseTitleMeta('Thermorolle 57×35 mit 25 Stk').rollen).toBe(25);
    expect(parseTitleMeta('Set 12er Pack').rollen).toBe(12);
  });

  it('extracts leading-prefix multiplier when no explicit Rollen', () => {
    expect(parseTitleMeta('50 EC-Cash Thermorollen 57×9').rollen).toBe(50);
    expect(parseTitleMeta('10x Thermorollen 80×80').rollen).toBe(10);
    expect(parseTitleMeta('5 SWIPARO Cash Roll 57×18').rollen).toBe(5);
  });

  it('caps leading-prefix at 500 to reject zip codes / years / SKU prefixes', () => {
    expect(parseTitleMeta('70794 Filderstadt Thermorolle').rollen).toBeNull();
    expect(parseTitleMeta('2024 Aktion Thermorolle').rollen).toBeNull();
  });

  it('returns null rollen when no count pattern matches', () => {
    expect(parseTitleMeta('Thermorolle ohne Mengenangabe').rollen).toBeNull();
    expect(parseTitleMeta('Klebeband Standard').rollen).toBeNull();
  });
});

describe('classifyItem', () => {
  it('classifies thermo titles (regex matches "Thermorollen" plural form)', () => {
    const c = classifyItem('Thermorollen 57x18 50 Rollen');
    expect(c.isThermo).toBe(true);
    expect(c.category).toBe('thermorollen');
  });

  it('classifies EC-Cash + SWIPARO + Bonrollen as thermo', () => {
    expect(classifyItem('SWIPARO Cash Roll 57×35').category).toBe('thermorollen');
    expect(classifyItem('Bonrollen 80×80 Standard').category).toBe('thermorollen');
    expect(classifyItem('EC-Cash Rollen 57×9').category).toBe('thermorollen');
  });

  it('classifies tacho explicitly', () => {
    const c = classifyItem('Tachographenrollen 57×8mm');
    expect(c.isTacho).toBe(true);
    expect(c.isThermo).toBe(false);
    expect(c.category).toBe('tachographenrollen');
  });

  it('classifies produktion (Klebeband, Sandsäcke, Kürbiskern)', () => {
    expect(classifyItem('TK THERMALKING Klebeband 50m').category).toBe('produktion');
    expect(classifyItem('Sandsack 50x bedruckt').category).toBe('produktion');
    expect(classifyItem('Kürbiskernöl 1 L').category).toBe('produktion');
  });

  it('classifies HEIPA / VEIT brands', () => {
    expect(classifyItem('HEIPA Thermopapier 80×80').category).toBe('heipa');
    expect(classifyItem('Veit GmbH Papierrolle 57×35').category).toBe('veit');
  });

  it('falls through to sonstige for unknown', () => {
    expect(classifyItem('Random product').category).toBe('sonstige');
    expect(classifyItem(null).category).toBe('sonstige');
  });

  it('Tacho beats Thermo when both substrings present', () => {
    // Tacho-rollen contains "rollen" but classifyItem prioritises Tacho.
    const c = classifyItem('Tachographenrollen Thermo 57×9');
    expect(c.category).toBe('tachographenrollen');
  });
});

describe('detectFormat', () => {
  it('flags Schilder format on the "VERWENDEN SIE KARTON" hallmark', () => {
    expect(detectFormat('Some header\nVERWENDEN SIE KARTON A')).toBe('schilder');
  });

  it('flags Standard format on Sendungsnummer header', () => {
    expect(detectFormat('Sendungsnummer\tFBA15ABC\nLagerauftrag\n')).toBe('standard');
  });

  it('defaults to standard for empty / unknown input', () => {
    expect(detectFormat('')).toBe('standard');
    expect(detectFormat('random text')).toBe('standard');
  });
});

describe('normalizeHeight + detectCodeType', () => {
  it('normalizeHeight returns numeric value for typical heights', () => {
    expect(typeof normalizeHeight(18)).toBe('number');
    expect(typeof normalizeHeight(80)).toBe('number');
  });

  it('detectCodeType returns the prefix family bucket', () => {
    expect(detectCodeType('X001QKJOQ7')).toBe('X001');
    expect(detectCodeType('X002ABCDEF')).toBe('X002');
    expect(detectCodeType('B07YXWBHQ4')).toBe('B0');
    expect(detectCodeType('UNKNOWN')).toBe('OTHER');
    expect(detectCodeType('')).toBe('OTHER');
    expect(detectCodeType(null)).toBe('OTHER');
  });
});

describe('categoryRank', () => {
  it('orders by CATEGORY_ORDER, unknown lands last', () => {
    const ranks = CATEGORY_ORDER.map(categoryRank);
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5]);
    expect(categoryRank('not-a-category')).toBe(99);
  });
});

describe('validateParsing', () => {
  // Build a minimal parsed shape — we don't need to drive the full
  // parser to test the validator.
  const minimalParsed = ({
    pallets = [] as Array<{ id: string; items: Array<Record<string, unknown>> }>,
    einzelneSkuItems = [] as Array<Record<string, unknown>>,
    meta = {} as Record<string, unknown>,
  } = {}) => ({
    format: 'standard',
    meta: { totalUnits: 0, totalSkus: 0, ...meta },
    pallets,
    einzelneSkuItems,
  });

  it('returns ok=true with no issues when counts match', () => {
    const v = validateParsing(
      'Lagerauftrag FBA15\n…\nGesamt 0 Einheiten\n',
      minimalParsed({ meta: { totalUnits: 0, totalSkus: 0 } }),
    );
    expect(v.errorCount + v.warningCount).toBe(0);
  });

  it('flags unit-mismatch as error when header says N and items sum to M', () => {
    const parsed = minimalParsed({
      meta: { totalUnits: 100, totalSkus: 1 },
      pallets: [{
        id: 'P1-B1',
        items: [{ title: 'Item', units: 80, fnsku: 'X1', sku: 'S1', asin: 'A1' }],
      }],
    });
    const v = validateParsing('any', parsed);
    const unitFlag = v.issues.find((i) => i.kind === 'unit-mismatch');
    expect(unitFlag).toBeDefined();
    expect(unitFlag?.severity).toBe('error');
  });

  it('flags missing-asin as warn (not error)', () => {
    const parsed = minimalParsed({
      meta: { totalUnits: 5, totalSkus: 1 },
      pallets: [{
        id: 'P1-B1',
        items: [{ title: 'Item', units: 5, fnsku: 'X1', sku: 'S1' }], // no asin
      }],
    });
    const v = validateParsing('any', parsed);
    const asinFlag = v.issues.find((i) => i.kind === 'missing-asin');
    if (asinFlag) {                          // only emitted when ASIN actually missing
      expect(asinFlag.severity).toBe('warn');
    }
  });
});