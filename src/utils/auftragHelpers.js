/* ─────────────────────────────────────────────────────────────────────────
   auftragHelpers — pure helpers that map parsed-Lagerauftrag data into
   shapes the screens consume. Keeps screens dumb.
   ───────────────────────────────────────────────────────────────────────── */

import { parseTitleMeta } from './parseLagerauftrag.js';

/* ─── Pallet ordering ─────────────────────────────────────────────────────
   Operations rule:
     1. Pallets WITHOUT Tachorollen come first
     2. Inside each group, fewest articles first (easy → hard)
     3. Tachorollen-pallets always last
   Stable sort preserves original order for equal-rank pallets.
   ───────────────────────────────────────────────────────────────────────── */
function palletHasTacho(p) {
  return (p.items || []).some(
    (it) => it.category === 'tachographenrollen' || it.isTacho === true,
  );
}
export function sortPallets(pallets) {
  return [...(pallets || [])]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const at = palletHasTacho(a.p) ? 1 : 0;
      const bt = palletHasTacho(b.p) ? 1 : 0;
      if (at !== bt) return at - bt;
      const al = a.p.items?.length || 0;
      const bl = b.p.items?.length || 0;
      if (al !== bl) return al - bl;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

/* ─── pallet stats (volume / weight estimate) ─────────────────────────── */
const PALLET_VOL_M3 = 120 * 80 * 165 / 1e6;       // 1.584 m³
const DEFAULT_KG_PER_CARTON = 0.55;
const PALLET_WEIGHT_CAP_KG = 700;

function itemBoxVolCm3(it) {
  if (it.category === 'thermorollen') {
    const r = it.rollen || 50;
    if (r >= 60) return 4500;
    if (r >= 40) return 3500;
    if (r >= 20) return 2400;
    return 1800;
  }
  if (it.category === 'produktion')         return 18000;
  if (it.category === 'tachographenrollen') return 1200;
  if (it.category === 'heipa' || it.category === 'veit') return 5500;
  return 8000;
}

function itemCartonCount(it) {
  if (it.isEinzelneSku && it.einzelneSku?.cartonsCount) return it.einzelneSku.cartonsCount;
  return Math.max(1, it.units || 0);
}

/* ─── Per-pallet primary category for badge color ─────────────────────── */
function primaryCategory(items) {
  const cats = new Set(items.map((it) => (it.category || 'sonstige').toUpperCase()));
  if (cats.has('THERMOROLLEN')) return 'THERMO';
  if (cats.has('PRODUKTION'))   return 'PRODUKTION';
  if (cats.has('HEIPA'))        return 'HEIPA';
  if (cats.has('VEIT'))         return 'VEIT';
  if (cats.has('TACHOGRAPHENROLLEN')) return 'TACHO';
  return 'SONSTIGE';
}

/* ─── Einzelne-SKU distribution ──────────────────────────────────────────
   Verteilt ESKU-Items (ohne native Palette) per Best-Fit-Decreasing.

   Pipeline:
     1. enrich     — Volumen/Gewicht/Format/Brand/useItemId pro Item
     2. palletState — laufender Zustand jeder Palette (Volumen, Gewicht,
                     vorhandene Formate/Marken/Kategorien/useItem-IDs)
     3. sort       — Items nach Volumen DESC (großes zuerst platzieren)
     4. assign     — pro Item: alle Paletten scoren, beste mit canFit pickern
                     (oder als unassigned markieren mit Reason)

   Hard-Constraints (eligibility + canFit):
     • ≥2 unique Artikel auf der Ziel-Palette (sonst „Single SKU")
     • Volumen + ItemVolumen ≤ 1.584 m³
     • Gewicht + ItemGewicht ≤ 700 kg

   Scoring (höher = besser):
     +50000  useItem-Match    — gleiche Katalog-ID (EAN/X-Code)
     +10000  Format-Match     — gleicher rollen + dim
     + 3000  Brand-Match      — gleiche Marke (HEIPA, VEIT, SWIPARO …)
     + 1000  Category-Match
     -10000  Mono-Cat-Konflikt (reine Kategorie-Palette ≠ ESKU-Kategorie)
     -  200  Multi-Cat-Mismatch (gemischte Palette ohne ESKU-Kategorie)
     +  ≤100 Tightness        — nahe am 85%-Sweet-Spot
     +  ≤ 50 Weight-Balance   — leichter beladene Palette bevorzugt

   Returns:
     {
       byPalletId: { [palletId]: ESKU-Items[] },
       unassigned: ESKU-Items[],
       reasons:    { [itemKey]: { source, breakdown } }
     }
   ───────────────────────────────────────────────────────────────────────── */
const PALLET_VOL_CM3 = PALLET_VOL_M3 * 1e6;
const SWEET_SPOT_PCT = 0.85;
const MIN_ARTIKEL    = 2;

export function distributeEinzelneSku(pallets, einzelneSkuItems) {
  const byPalletId = Object.fromEntries((pallets || []).map((p) => [p.id, []]));
  const unassigned = [];
  const reasons    = {};

  if (!pallets?.length || !einzelneSkuItems?.length) {
    return { byPalletId, unassigned, reasons };
  }

  const states  = pallets.map(buildPalletState);
  const entries = einzelneSkuItems
    .map(enrichEsku)
    .sort((a, b) => b.volCm3 - a.volCm3);

  for (const e of entries) {
    let best = null;
    let bestScore = -Infinity;
    let bestBreakdown = null;
    let blockedBy = 'no-eligible-pallet';

    for (const ps of states) {
      if (!ps.eligible) continue;
      if (!canFit(ps, e)) {
        blockedBy = 'volume-or-weight';
        continue;
      }
      const { score, breakdown } = scoreEsku(e, ps);
      if (score > bestScore) {
        bestScore = score;
        best = ps;
        bestBreakdown = breakdown;
      }
    }

    if (best) {
      commitEsku(e, best);
      byPalletId[best.pallet.id].push(e.item);
      reasons[e.key] = { source: 'assigned', breakdown: bestBreakdown };
    } else {
      unassigned.push(e.item);
      reasons[e.key] = { source: 'unassigned', breakdown: { blockedBy } };
    }
  }

  return { byPalletId, unassigned, reasons };
}

/* ─── Pipeline-Helpers ──────────────────────────────────────────────────── */
function buildPalletState(p) {
  let volCm3 = 0;
  let weightKg = 0;
  const formats     = new Set();
  const categories  = new Set();
  const brands      = new Set();
  const useItemIds  = new Set();
  const ids         = new Set();

  for (const it of p.items) {
    const cartons = itemCartonCount(it);
    volCm3   += cartons * itemBoxVolCm3(it);
    weightKg += cartons * DEFAULT_KG_PER_CARTON;
    formats.add(formatSig(it));
    if (it.category) categories.add(it.category);
    const b = detectBrand(it.title);
    if (b !== 'GENERIC') brands.add(b);
    palletItemTokens(it).forEach((t) => useItemIds.add(t));
    ids.add(it.fnsku || it.sku || it.title);
  }

  return {
    pallet: p,
    volCm3, weightKg,
    formats, categories, brands, useItemIds,
    eligible: ids.size >= MIN_ARTIKEL,
  };
}

function enrichEsku(item) {
  const cartons = itemCartonCount(item);
  return {
    item,
    key:        item.fnsku || item.sku || item.title,
    volCm3:     cartons * itemBoxVolCm3(item),
    weightKg:   cartons * DEFAULT_KG_PER_CARTON,
    formatSig:  formatSig(item),
    category:   item.category,
    brand:      detectBrand(item.title),
    useItemId:  extractUseItemId(item.useItem),
  };
}

function canFit(ps, e) {
  if (ps.volCm3   + e.volCm3   > PALLET_VOL_CM3)        return false;
  if (ps.weightKg + e.weightKg > PALLET_WEIGHT_CAP_KG) return false;
  return true;
}

function scoreEsku(e, ps) {
  const breakdown = {
    useItemMatch: false, formatMatch: false, brandMatch: false,
    categoryMatch: false, categoryConflict: false,
    fillScore: 0, weightScore: 0,
  };
  let score = 0;

  if (e.useItemId && ps.useItemIds.has(e.useItemId)) {
    score += 50000;
    breakdown.useItemMatch = true;
  }
  if (ps.formats.has(e.formatSig)) {
    score += 10000;
    breakdown.formatMatch = true;
  }
  if (e.brand !== 'GENERIC' && ps.brands.has(e.brand)) {
    score += 3000;
    breakdown.brandMatch = true;
  }
  if (e.category && ps.categories.has(e.category)) {
    score += 1000;
    breakdown.categoryMatch = true;
  } else if (e.category && ps.categories.size === 1) {
    score -= 10000;
    breakdown.categoryConflict = true;
  } else if (e.category && ps.categories.size > 1) {
    score -= 200;
  }

  const fillAfter = (ps.volCm3 + e.volCm3) / PALLET_VOL_CM3;
  breakdown.fillScore = Math.round((1 - Math.min(1, Math.abs(SWEET_SPOT_PCT - fillAfter))) * 100);
  score += breakdown.fillScore;

  const weightFracAfter = (ps.weightKg + e.weightKg) / PALLET_WEIGHT_CAP_KG;
  breakdown.weightScore = Math.round((1 - Math.min(1, weightFracAfter)) * 50);
  score += breakdown.weightScore;

  return { score, breakdown };
}

function commitEsku(e, ps) {
  ps.volCm3   += e.volCm3;
  ps.weightKg += e.weightKg;
  ps.formats.add(e.formatSig);
  if (e.category)              ps.categories.add(e.category);
  if (e.brand !== 'GENERIC')   ps.brands.add(e.brand);
  if (e.useItemId)             ps.useItemIds.add(e.useItemId);
}

/* ─── Identity / matching helpers ────────────────────────────────────────── */
function formatSig(it) {
  const r = it.rollen ?? 'x';
  const w = it.dim?.normW ?? it.dim?.w ?? 'x';
  const h = it.dim?.normH ?? it.dim?.h ?? 'x';
  return `${r}-${w}x${h}`;
}

function detectBrand(title) {
  const t = (title || '').toUpperCase();
  if (/SWIPARO/.test(t))       return 'SWIPARO';
  if (/ECO\s*ROOLLS/.test(t))  return 'ECO_ROOLLS';
  if (/THERMALKING/.test(t))   return 'THERMALKING';
  if (/\bVEIT\b/.test(t))      return 'VEIT';
  if (/\bHEIPA\b/.test(t))     return 'HEIPA';
  return 'GENERIC';
}

/* "wird von 9120107187501 produziert" → "9120107187501"
   "X0017LU653" → "X0017LU653"
   Kurze Zahlen (z.B. "wird von 41 produziert") werden ignoriert. */
function extractUseItemId(s) {
  if (!s) return null;
  const ean = String(s).match(/\b\d{12,14}\b/);
  if (ean) return ean[0];
  const xcode = String(s).match(/\bX[0-9A-Z]{8,10}\b/i);
  if (xcode) return xcode[0].toUpperCase();
  return null;
}

/* Identity-Tokens, an denen ein ESKU per useItemId andocken kann. */
function palletItemTokens(it) {
  const out = new Set();
  const useId = extractUseItemId(it.useItem);
  if (useId) out.add(useId);
  if (it.ean)   out.add(String(it.ean));
  if (it.fnsku) out.add(String(it.fnsku).toUpperCase());
  return out;
}

/* ─── Build view-shape for Pruefen ────────────────────────────────────── */
export function pruefenView(parsed) {
  if (!parsed) return null;
  const pallets = parsed.pallets || [];
  const meta    = parsed.meta || {};

  let cartons = 0, units = 0, articles = 0, weightKg = 0, volumeCm3 = 0;
  const palletViews = pallets.map((p) => {
    let pCartons = 0, pVol = 0, pWeight = 0, pUnits = 0;
    const formats = new Set();
    p.items.forEach((it) => {
      const c = itemCartonCount(it);
      pCartons += c;
      pVol += c * itemBoxVolCm3(it);
      pWeight += c * DEFAULT_KG_PER_CARTON;
      pUnits += it.units || 0;
      if (it.dimStr) formats.add(it.dimStr);
    });
    cartons += pCartons; volumeCm3 += pVol; weightKg += pWeight;
    articles += p.items.length; units += pUnits;
    const cat = primaryCategory(p.items);
    return {
      id: p.id,
      category: cat,
      articles: p.items.length,
      units: pUnits,
      fillPct: pVol / 1e6 / PALLET_VOL_M3,
      formats: Array.from(formats),
    };
  });

  const overallFill = pallets.length > 0
    ? volumeCm3 / 1e6 / (pallets.length * PALLET_VOL_M3)
    : 0;

  return {
    fba: meta.sendungsnummer || meta.fbaCode || '—',
    destination: meta.destination || '—',
    format: parsed.format === 'schilder' ? 'SCHILDER' : 'STANDARD',
    createdDate: meta.createdDate || '',
    createdTime: meta.createdTime || '',
    stats: {
      palletCount: pallets.length,
      articles,
      cartons,
      weightKg: Math.round(weightKg),
      units,
      fillPct: overallFill,
      durationSec: estimateOrderSeconds(pallets),
    },
    pallets: palletViews,
  };
}

/* ─── Order time estimate ─────────────────────────────────────────────── */
const T_PER_ARTICLE = 11;
const T_PER_ARTICLE_TACHO = 21;
const T_PALLET_BASE = 6 * 60;
const T_BETWEEN_PALLETS = 9 * 60;

function isTacho(it) {
  if (it.category !== 'tachographenrollen') return false;
  const w = it.dim?.w, h = it.dim?.h;
  if (w === 57 && (h === 15 || h === 6)) return true;
  if (it.rollen === 60) return true;
  return false;
}
export function estimateOrderSeconds(pallets) {
  if (!pallets?.length) return 0;
  let s = 0;
  pallets.forEach((p) => {
    s += T_PALLET_BASE;
    p.items.forEach((it) => { s += isTacho(it) ? T_PER_ARTICLE_TACHO : T_PER_ARTICLE; });
  });
  s += Math.max(0, pallets.length - 1) * T_BETWEEN_PALLETS;
  return s;
}

/* ─── Build view-shape for Focus ──────────────────────────────────────── */
export function focusItemView(item) {
  const { rollen } = parseTitleMeta(item.title || '');
  const lst =
    /\bmit\s+lst\b/i.test(item.title) ? 'mit LST' :
    /\bohne\s+lst\b/i.test(item.title) ? 'ohne LST' : null;

  // Produktion-Fallback: "(50)" trailing oder "50x ..." leading
  let perCarton = item.rollen || rollen || null;
  if (!perCarton && item.category === 'produktion') {
    perCarton = extractProduktionPerCarton(item.title || '');
  }
  const perCartonUnit = item.category === 'produktion' ? 'Stück' : 'Rollen';

  return {
    code:           item.fnsku || item.sku || '—',
    useItem:        item.useItem || '',
    units:          item.units || 0,
    name:           shortArticleName(item),
    dim:            item.dimStr,
    rollen:         perCarton,
    rollenUnit:     perCartonUnit,
    category:       (item.category || 'sonstige').toUpperCase().replace('THERMOROLLEN', 'THERMO').replace('TACHOGRAPHENROLLEN', 'TACHO'),
    lst,
  };
}

function extractProduktionPerCarton(title) {
  // "(50)" am Ende — Stück pro Karton
  const trail = title.match(/\((\d+)\)\s*$/);
  if (trail) return parseInt(trail[1], 10);
  // "TK THERMALKING 50x Sandsäcke ..." — Prefix-Multiplikator
  const lead = title.match(/^(?:[A-ZÄÖÜ]{2,}\s+)+(\d+)\s*x\s+/i);
  if (lead) return parseInt(lead[1], 10);
  return null;
}

function shortArticleName(item) {
  const title = item.title || '';
  const { dimStr } = parseTitleMeta(title);

  const lower = title.toLowerCase();
  const isThermo = item.category === 'thermorollen' || /thermo|bonroll|kassenroll/i.test(lower);
  if (isThermo) {
    if (dimStr) return `Thermorolle ${dimStr}`;
    // Thermopapier-Notation: "12mm ø, 57mm breit"
    const diameter = title.match(/(\d+)\s*mm\s*ø/i);
    const width    = title.match(/(\d+)\s*mm\s+(?:breit|wide|width|breite)\b/i);
    if (diameter && width) return `Thermopapier, ${diameter[1]}mm ø, ${width[1]}mm`;
    if (diameter)          return `Thermopapier, ${diameter[1]}mm ø`;
    if (width)             return `Thermopapier, ${width[1]}mm breit`;
  }

  if (item.category === 'tachographenrollen') {
    // Tacho-Notationen: "57-8mm", "57/8 mm", "57/28/7"
    const m = title.match(/(\d+)\s*[-/×x]\s*(\d+)(?:\s*[-/×x]\s*(\d+))?/i);
    if (m) {
      const dims = [m[1], m[2], m[3]].filter(Boolean).join('/');
      return `Tachographenrollen ${dims}mm`;
    }
    return 'Tachographenrollen';
  }

  if (item.category === 'produktion') {
    let s = title
      .replace(/^TK\s+\w+\s+/i, '')
      .replace(/^\d+\s*x\s+/i, '')
      .replace(/\b(für|zum|leer|mit|ohne)\s+.*/i, '')
      .split(/[,(–—-]/)[0]
      .trim();
    if (!s) s = title.split(/[,(]/)[0].trim();
    if (s.length > 50) s = s.slice(0, 47) + '…';
    return s;
  }

  if (title.length > 50) return title.slice(0, 47) + '…';
  return title;
}

/* ─── Category aggregation across pallets (for Abschluss) ─────────────── */
export function categoryDistribution(pallets) {
  const totals = {};
  let grand = 0;
  pallets.forEach((p) => {
    p.items.forEach((it) => {
      const cat = (it.category || 'sonstige').toUpperCase()
        .replace('THERMOROLLEN', 'THERMO')
        .replace('TACHOGRAPHENROLLEN', 'TACHO');
      totals[cat] = (totals[cat] || 0) + (it.units || 0);
      grand += it.units || 0;
    });
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, units]) => ({ cat, units, pct: grand ? units / grand : 0 }));
}

/* ─── Pallet timings (from current.palletTimings) ─────────────────────── */
export function palletTimingRows(pallets, palletTimings) {
  return pallets.map((p) => {
    const t = palletTimings?.[p.id] || {};
    const dur = t.startedAt && t.finishedAt
      ? Math.round((t.finishedAt - t.startedAt) / 1000)
      : 0;
    return {
      id: p.id,
      category: primaryCategory(p.items),
      articles: p.items.length,
      durSec: dur,
    };
  });
}
