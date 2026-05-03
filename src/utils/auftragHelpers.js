/* ─────────────────────────────────────────────────────────────────────────
   auftragHelpers — pure helpers that map parsed-Lagerauftrag data into
   shapes the screens consume. Keeps screens dumb.

   v2 — SOP v1.1 implementation:
     • 6-level physical hierarchy (Thermorollen → ÖKO → Klebeband →
       Produktion → Kernöl → Tachorollen) replaces the old `category`.
     • Hard constraints H1-H4 (level order) + H7 (Single-SKU pallets
       excluded via pallet.hasFourSideWarning).
     • Soft 700 kg / 1.59 m³ limits → OVERLOAD-W / OVERLOAD-V flags
       (do NOT block placement; bridge gets escalated in UI).
     • Sweet-Spot 85% scoring is preserved as the geometric tie-breaker
       on top of useItem/format/brand/FNSKU/level bonuses.
     • Real dim/weight from sku_dimensions table when available, fallback
       to the heuristics below.
   ───────────────────────────────────────────────────────────────────────── */

import { parseTitleMeta } from './parseLagerauftrag.js';

/* ─── Level (1-6) — physical stacking order ──────────────────────────────
   1 = bottom, 6 = top. A carton at level X may not sit BELOW a carton
   of level Y < X — that's the load-bearing rule the warehouse enforces.

   Detection is by SKU title regex (SOP Appendix A.6). Order matters:
   higher levels are checked first because their patterns are more
   specific (e.g. "Tacho" beats "Thermorollen" default).
   ───────────────────────────────────────────────────────────────────────── */

export function getLevel(item) {
  const t = (item.title || '').toLowerCase();
  if (/\btacho/.test(t)) return 6;                                  // Tachorollen
  if (/(kürbis|kernöl)/.test(t)) return 5;                          // Kernöl
  // Produktion: explicit phrasing OR known TK-THERMALKING product line
  // (sandbags, fillers and other "wird produziert"-grade items often
  // ship without that exact phrase but belong to the same physical class).
  if (/(wird (von .* )?produziert|tk\s+thermalking|sandsäcke|sandsack|sandsaecke)/.test(t)) return 4;
  if (/(klebeband|fragile|bruchgefahr)/.test(t)) return 3;          // Klebeband / Fragile
  if (/(öko|phenolfrei|eco\s*rooll)/.test(t)) return 2;             // ÖKO Thermorollen
  return 1;                                                          // Thermorollen (default)
}

export const LEVEL_META = {
  1: { name: 'Thermorollen',   shortName: 'THERMO',     color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  2: { name: 'ÖKO Thermo',     shortName: 'ÖKO',        color: '#06B6D4', bg: '#ECFEFF', text: '#0E7490' },
  3: { name: 'Klebeband',      shortName: 'KLEBE',      color: '#A855F7', bg: '#FAF5FF', text: '#7E22CE' },
  4: { name: 'Produktion',     shortName: 'PRODUKTION', color: '#10B981', bg: '#ECFDF5', text: '#047857' },
  5: { name: 'Kernöl',         shortName: 'KERNÖL',     color: '#F59E0B', bg: '#FFFBEB', text: '#B45309' },
  6: { name: 'Tachorollen',    shortName: 'TACHO',      color: '#F97316', bg: '#FFF7ED', text: '#C2410C' },
};

/* Compat shim: legacy parsed Aufträge (Historie) only have `category`.
   Map it to the closest level for display purposes. */
const CATEGORY_TO_LEVEL = {
  thermorollen: 1,
  heipa: 1,
  veit: 1,
  produktion: 4,
  tachographenrollen: 6,
  sonstige: 1,
};

export function getDisplayLevel(item) {
  if (item?.level) return item.level;
  if (item?.category) return CATEGORY_TO_LEVEL[item.category] ?? 1;
  return getLevel(item);
}

/* ─── Pallet ordering ─────────────────────────────────────────────────────
   Operations rule:
     1. Pallets WITHOUT Tachorollen (level 6) come first
     2. Inside each group, fewest articles first (easy → hard)
     3. Tachorollen-pallets always last
   Stable sort preserves original order for equal-rank pallets.
   ───────────────────────────────────────────────────────────────────────── */
function palletHasLevel(p, level) {
  return (p.items || []).some((it) => getDisplayLevel(it) === level);
}

export function sortPallets(pallets) {
  return [...(pallets || [])]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const at = palletHasLevel(a.p, 6) ? 1 : 0;
      const bt = palletHasLevel(b.p, 6) ? 1 : 0;
      if (at !== bt) return at - bt;
      const al = a.p.items?.length || 0;
      const bl = b.p.items?.length || 0;
      if (al !== bl) return al - bl;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

/* ─── Pallet stats / heuristics ─────────────────────────────────────────── */

const PALLET_VOL_M3   = 1.59;                 // SOP soft limit
const PALLET_VOL_CM3  = PALLET_VOL_M3 * 1e6;
const PALLET_WEIGHT_KG = 700;                  // SOP soft limit
const TARA_KG         = 0.4;                   // Karton tara (corrugated + tape)
const PACK_COEFF      = 1.125;                 // Packing slack inside the carton
const SWEET_SPOT_PCT  = 0.85;                  // Sweet-spot fill target
const DEFAULT_KG_PER_CARTON = 0.55;            // fallback when no dimensions row

/* ── Volume / weight model ─────────────────────────────────────────────
   Two physically distinct paths:

   Mixed-Box item (Phase 1, isEinzelneSku=false):
     `units` raw Einheiten go into ONE outer cardboard box (P1-Bx).
     Total volume = units × per-Einheit-volume (no Tara, no PACK_COEFF
     per Einheit — slack and outer box weight live at the pallet level).
     Per-Einheit weight = dimensions.weightKg (same).

   ESKU item (Phase 2, isEinzelneSku=true):
     `cartonsCount` independent FBA cartons. Each carton holds
     `packsPerCarton` Einheiten and has its own slack (×1.125) + Tara
     (0.4 kg). Total volume = cartonsCount × per-carton-volume.

   Heuristics below are reverse-engineered fallbacks used ONLY when
   `item.dimensions` is missing. They produce "reasonable" totals for
   warehouse-typical items: thermorolls ≈ a few cm³ each Einheit; ESKU
   carton ≈ a few thousand cm³.
   ───────────────────────────────────────────────────────────────────── */

/* Per-ESKU-carton heuristic. Used only as ESKU fallback when dimensions
   missing. Returns approximate volume of ONE carton holding the item's
   `packsPerCarton` Einheiten. */
function eskuCartonHeuristicCm3(it) {
  const lvl = getDisplayLevel(it);
  if (lvl === 1 || lvl === 2) {
    const r = it.rollen || 50;
    if (r >= 60) return 4500;
    if (r >= 40) return 3500;
    if (r >= 20) return 2400;
    return 1800;
  }
  if (lvl === 6) return 1200;                 // Tachorollen
  if (lvl === 5) return 6000;                 // Kernöl bottle
  if (lvl === 4) return 18000;                // Produktion (big bag etc.)
  if (lvl === 3) return 4000;                 // Klebeband
  return 8000;
}

/* Sniff "500 g" / "1 Kg" / "1.5 kg" hints from item title and convert
   to kg. Returns null if nothing recognised. Lets Füllmaterial-type
   items get a sensible per-Einheit weight without dim data. */
function weightFromTitle(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  // kg pattern first (more specific)
  const kg = t.match(/(\d+(?:[.,]\d+)?)\s*k\s*g\b/);
  if (kg) return parseFloat(kg[1].replace(',', '.'));
  const g = t.match(/(\d+(?:[.,]\d+)?)\s*g\b/);
  if (g) return parseFloat(g[1].replace(',', '.')) / 1000;
  return null;
}

/* Per-Einheit heuristic for Mixed items. Much smaller than the ESKU
   per-carton heuristic — one Einheit, not one carton. For thermal
   rolls with `rollen` count, scales by roll count (a 40-roll Einheit
   is bulkier than a 5-roll one).

   `item.dim.w` / `.h` are stored in MILLIMETERS by parseLagerauftrag
   ("80mm × 12mm" → w=80, h=12), so we must convert to cm before
   computing cm³. */
function mixedItemHeuristicCm3(it) {
  const lvl = getDisplayLevel(it);
  if (lvl === 1 || lvl === 2) {
    // Thermal roll: cross-section (cm²) × ~1cm rim, × `rollen` per Einheit
    const wCm = (it.dim?.w ?? 57) / 10;
    const hCm = (it.dim?.h ?? 30) / 10;
    const perRoll = Math.max(2, wCm * hCm * 1.0);
    return perRoll * Math.max(1, it.rollen || 1);
  }
  if (lvl === 6) return 3 * Math.max(1, it.rollen || 1);    // Tachorollen Einheit
  if (lvl === 5) return 800;                                  // Kernöl bottle
  if (lvl === 4) return 250 * Math.max(1, it.rollen || 1);   // Produktion / Sandsäcke
  if (lvl === 3) return 50 * Math.max(1, it.rollen || 1);    // Klebeband
  return 200;
}

/* Per-Einheit weight heuristic for Mixed items. Prefers explicit kg/g
   in the title; falls back to level-based rule scaled by `rollen`. */
function mixedItemHeuristicKg(it) {
  const fromTitle = weightFromTitle(it.title);
  if (fromTitle != null) return fromTitle;
  const lvl = getDisplayLevel(it);
  const r = Math.max(1, it.rollen || 1);
  if (lvl === 1 || lvl === 2) return 0.05 * r;   // 50g per roll
  if (lvl === 6) return 0.02 * r;                // 20g per Tachorolle
  if (lvl === 5) return 0.45;                    // Kernöl bottle
  if (lvl === 4) return 0.5 * r;                 // Produktion / Sandsäcke
  if (lvl === 3) return 0.08 * r;                // Klebeband
  return 0.10;
}

/* How many "parent Einheiten" of physical content live in ONE ESKU
   carton — used to scale weight/volume.

   When dim is matched via the ESKU's OWN identifier (fnsku/sku/ean/
   asin), the dim row's per-Einheit values describe ONE ESKU Einheit.
   So a carton holds `packsPerCarton` of those, and the multiplier is
   `packsPerCarton`.

   When dim is matched via `useItem` (the parent product's EAN — the
   typical case for Lagerauftrag-derived ESKU), the dim row describes
   the PARENT's per-Einheit. ESKU notation `(N × M)` is the parent's
   Einheit re-packed: e.g. parent "(50 Rollen)" ↔ ESKU "(10 × 5
   Rollen)" — same 50 rolls, just split into smaller packs. So 1
   ESKU carton ≈ 1 parent Einheit physically, multiplier 1.

   Without dim, we rely on heuristics elsewhere. */
function eskuCartonRatio(it) {
  if (!it.dimensions) return it.einzelneSku?.packsPerCarton ?? 1;
  if (it.dimensionsMatch === 'use_item') return 1;
  return it.einzelneSku?.packsPerCarton ?? 1;
}

/* TOTAL volume of an item across all of its Einheiten / cartons. */
export function itemTotalVolumeCm3(it) {
  if (it.isEinzelneSku) {
    const cartons = it.einzelneSku?.cartonsCount ?? Math.max(1, Math.ceil((it.units || 0) / (it.einzelneSku?.packsPerCarton || 1)));
    if (it.dimensions) {
      const ratio = eskuCartonRatio(it);
      const perCarton = it.dimensions.lengthCm * it.dimensions.widthCm * it.dimensions.heightCm * ratio * PACK_COEFF;
      return cartons * perCarton;
    }
    return cartons * eskuCartonHeuristicCm3(it);
  }
  // Mixed: just sum per-Einheit volume (no per-Einheit Tara/PACK_COEFF)
  const u = it.units || 0;
  if (it.dimensions) {
    return u * it.dimensions.lengthCm * it.dimensions.widthCm * it.dimensions.heightCm;
  }
  return u * mixedItemHeuristicCm3(it);
}

/* TOTAL weight of an item. Mixed: units × per-Einheit. ESKU: per-carton
   weight (Einheiten + Tara) × carton count. */
export function itemTotalWeightKg(it) {
  if (it.isEinzelneSku) {
    const cartons = it.einzelneSku?.cartonsCount ?? Math.max(1, Math.ceil((it.units || 0) / (it.einzelneSku?.packsPerCarton || 1)));
    if (it.dimensions) {
      const ratio = eskuCartonRatio(it);
      return cartons * (it.dimensions.weightKg * ratio + TARA_KG);
    }
    return cartons * DEFAULT_KG_PER_CARTON;
  }
  const u = it.units || 0;
  if (it.dimensions) return u * it.dimensions.weightKg;
  return u * mixedItemHeuristicKg(it);
}

/* Number of physical cartons added to the pallet by this item.
   For Mixed: 0 separate cartons — the Einheiten share the outer P1-Bx box.
   For ESKU: cartonsCount independent FBA cartons. */
function itemCartonCount(it) {
  if (it.isEinzelneSku) {
    return it.einzelneSku?.cartonsCount ?? Math.max(1, Math.ceil((it.units || 0) / (it.einzelneSku?.packsPerCarton || 1)));
  }
  return 0;
}

/* Per-carton volume / weight — used by the ESKU placement loop only.
   Mixed items don't pass through here (their volume is summed at the
   pallet level via itemTotalVolumeCm3).

   Heuristic fallback (no dim row in DB) scales per-Einheit values by
   `packsPerCarton`, so heavier categories like Klebeband-x36 or
   Kürbiskernöl produce realistic per-carton weight rather than a flat
   0.55 kg. The flat default was wrong by 10× for L4/L5 ESKU. */
function eskuCartonVolumeCm3(it) {
  if (it.dimensions) {
    const ratio = eskuCartonRatio(it);
    return it.dimensions.lengthCm * it.dimensions.widthCm * it.dimensions.heightCm * ratio * PACK_COEFF;
  }
  return eskuCartonHeuristicCm3(it);
}

function eskuCartonWeightKg(it) {
  if (it.dimensions) {
    const ratio = eskuCartonRatio(it);
    return it.dimensions.weightKg * ratio + TARA_KG;
  }
  // Per-Einheit weight × packsPerCarton + Tara — so Klebeband-x36
  // (~0.5kg/Einh × 36) yields 18kg per carton instead of 0.55kg.
  const perEinheit = mixedItemHeuristicKg(it);
  const n = it.einzelneSku?.packsPerCarton ?? 1;
  return perEinheit * n + TARA_KG;
}

/* "Work units" for visual prominence on a pallet — number of Einheiten
   for Mixed items (lots of small things), carton count for ESKU. */
function itemWorkUnits(it) {
  if (it.isEinzelneSku) {
    return it.einzelneSku?.cartonsCount ?? 1;
  }
  return Math.max(1, it.units || 0);
}

/* ─── Within-pallet picking order ────────────────────────────────────────
   Order items so the warehouse worker handles them in a sensible
   physical sequence inside one pallet:

     1. Heavy/bulky first (higher total volume → forms the load base)
     2. Within similar volume, more units first (knock out big batches)
     3. Cluster carton-format-matching items adjacent (pulls items with
        the same outer carton size next to each other → fewer context
        switches at the picking station).

   Format clustering uses a sizeBucket from real `dimensions` when
   available (rounded to nearest litre), else falls back to the
   `rollen + dim` signature. Without sku_dimensions data, clustering
   is best-effort for non-roll items.
   ───────────────────────────────────────────────────────────────────── */

function sizeBucket(it) {
  if (it.dimensions) {
    const v = it.dimensions.lengthCm * it.dimensions.widthCm * it.dimensions.heightCm;
    return `dim:${Math.max(1, Math.round(v / 1000))}`;     // ~1L buckets
  }
  return `fmt:${formatSig(it)}`;
}

export function sortItemsForPallet(items) {
  if (!items?.length) return items || [];
  const enriched = items.map((it, i) => ({
    item: it,
    origIdx: i,
    totalWeight: itemTotalWeightKg(it),
    totalVol: itemTotalVolumeCm3(it),
    units: it.units || 0,
    bucket: sizeBucket(it),
  }));

  // Group by sizeBucket — items with the same (or similar) carton size
  // travel together on the pallet to minimise reorientation at the
  // packing station.
  const groups = new Map();
  for (const e of enriched) {
    if (!groups.has(e.bucket)) groups.set(e.bucket, []);
    groups.get(e.bucket).push(e);
  }

  // Order groups by HEAVIEST item DESC — heavy/bulky anchors form the
  // pallet base; lighter clusters layer on top. (Weight is a better
  // physical proxy than volume for "what should go first" — many small
  // units stuffed into a Mixed-Box are not a heavy load.)
  const orderedGroups = [...groups.values()].sort((a, b) => {
    const maxA = Math.max(...a.map((x) => x.totalWeight));
    const maxB = Math.max(...b.map((x) => x.totalWeight));
    if (maxA !== maxB) return maxB - maxA;
    // Tie-break: bigger total volume group first
    const volA = Math.max(...a.map((x) => x.totalVol));
    const volB = Math.max(...b.map((x) => x.totalVol));
    return volB - volA;
  });

  // Within each group: weight DESC, then units DESC (more numerous
  // batches first), then stable on origIdx.
  for (const g of orderedGroups) {
    g.sort((a, b) => {
      if (a.totalWeight !== b.totalWeight) return b.totalWeight - a.totalWeight;
      if (a.units !== b.units) return b.units - a.units;
      return a.origIdx - b.origIdx;
    });
  }

  return orderedGroups.flatMap((g) => g.map((e) => e.item));
}

/* ─── Per-pallet primary level for badge color ────────────────────────── */
export function primaryLevel(items) {
  // Pick the dominant level by total volume (heavier physical presence)
  if (!items?.length) return 1;
  const vols = {};
  for (const it of items) {
    const lvl = getDisplayLevel(it);
    vols[lvl] = (vols[lvl] || 0) + itemTotalVolumeCm3(it);
  }
  const sorted = Object.entries(vols).sort((a, b) => b[1] - a[1]);
  return parseInt(sorted[0][0], 10);
}

/* ─── Einzelne-SKU distribution (V2) ─────────────────────────────────────
   SOP v1.1 — Phase 2 placement after Mixed-Boxes are fixed by Auftrag plan.

   Hard constraints (block placement):
     H1-H4: violatesLevelOrder — a level-X carton cannot sit on a pallet
            whose existing items have any level Y > X.
     H7:    pallet.hasFourSideWarning → Single-SKU pallet, excluded.

   Soft (annotated, never block):
     OVERLOAD-W — pallet weight + carton.weight > 700 kg
     OVERLOAD-V — pallet volume + carton.volume > 1.59 m³

   Score (Sweet-Spot 85% retained as tie-breaker; bonuses dominate):
     +50000  useItem-Match   — same EAN/X-Code in `useItem` field
     +10000  Format-Match    — same rollen + dim signature
     + 3000  Brand-Match     — same HEIPA/VEIT/SWIPARO etc.
     + 1000  FNSKU-Match     — same FNSKU already on pallet (SOP S2)
     +  500  Level-Match     — same level already on pallet (SOP S3)
     -10000  Mono-Level conflict — pallet has only level X, carton is Y≠X
     -  200  Multi-Level mismatch — pallet has multiple levels, none match
     +  ≤100 fillScore       — sweet-spot 85% tightness (geometric)

   NO_VALID_PLACEMENT: if no pallet passes H1+H7, the carton is assigned
   to the "least bad" pallet (min absolute violations) and flagged for
   manual escalation in the UI — never blocks the workflow.

   Returns:
     {
       byPalletId:   { [palletId]: ESKU items[] (with .placementMeta) },
       unassigned:   ESKU items[] (kept for backward compat, always [] in V2),
       reasons:      { [itemKey]: { source, breakdown, overload, ... } },
       palletStates: { [palletId]: { byLevel, weightKg, volumeCm3,
                                     overloadFlags, fillPct, anyEsku } },
       overloadCount:    int  — total OVERLOAD-W + OVERLOAD-V flags
       noValidCount:     int  — total NO_VALID_PLACEMENT flags
     }
   ───────────────────────────────────────────────────────────────────────── */

export function distributeEinzelneSku(pallets, einzelneSkuItems) {
  const byPalletId = Object.fromEntries((pallets || []).map((p) => [p.id, []]));
  const unassigned = [];
  const reasons = {};
  const palletStates = {};
  let noValidCount = 0;

  if (!pallets?.length) {
    return { byPalletId, unassigned, reasons, palletStates,
             overloadCount: 0, overloadedPalletCount: 0, noValidCount };
  }

  // Initialize pallet states from Phase 1 (Mixed)
  const states = pallets.map(buildPalletState);
  for (const ps of states) palletStates[ps.pallet.id] = ps;

  if (einzelneSkuItems?.length) {
    // Phase 2: enrich + sort ESKU
    const entries = einzelneSkuItems.map(enrichEsku);

    // Group by FNSKU, then sort: level ASC, group size DESC (large first)
    const groups = new Map();
    for (const e of entries) {
      const key = e.item.fnsku || e.item.sku || e.item.title;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const orderedGroups = Array.from(groups.values()).sort((a, b) => {
      const la = a[0].level, lb = b[0].level;
      if (la !== lb) return la - lb;
      return b.length - a.length;
    });

    for (const group of orderedGroups) {
      for (const e of group) {
        // Place EACH carton of the ESKU group separately so the capacity
        // tracker sees N increments (not 1) and naturally splits the
        // group across pallets if any one fills up. Aggregate the
        // resulting placements per pallet for the UI.
        const totalCartons = Math.max(1, e.cartons || 1);
        const splits = {};   // { palletId: { count, lastResult } }
        for (let i = 0; i < totalCartons; i++) {
          const result = pickPallet(e, states);
          const target = result.target;
          target.add(e);
          const pid = target.pallet.id;
          if (!splits[pid]) splits[pid] = { count: 0, result };
          splits[pid].count += 1;
          splits[pid].result = result;     // keep latest score/flags per pallet
          if (result.flags.includes('NO_VALID_PLACEMENT')) noValidCount += 1;
        }

        // Emit ONE list item per pallet that received any cartons of
        // this ESKU group. `cartonsHere` carries the per-pallet split.
        const splitEntries = Object.entries(splits);
        const isSplit = splitEntries.length > 1;
        for (const [pid, s] of splitEntries) {
          const flags = [...(s.result.flags || [])];
          if (isSplit) flags.push('SPLIT-GROUP');
          byPalletId[pid].push({
            ...e.item,
            placementMeta: {
              score: s.result.score,
              breakdown: s.result.breakdown,
              overload: s.result.overload,
              flags,
              cartonsHere: s.count,
              cartonsTotalGroup: totalCartons,
            },
          });
        }
        // Reason — use the first (or only) pallet for trace
        const primary = splitEntries[0];
        reasons[e.key] = {
          source: primary[1].result.flags.includes('NO_VALID_PLACEMENT')
            ? 'no_valid_placement'
            : (isSplit ? 'split' : 'assigned'),
          breakdown: primary[1].result.breakdown,
          overload: primary[1].result.overload,
          flags: primary[1].result.flags,
          palletId: primary[0],
          splits: isSplit ? Object.fromEntries(splitEntries.map(([pid, s]) => [pid, s.count])) : null,
        };
      }
    }
  }

  // Final fillPct per pallet
  for (const ps of states) ps.fillPct = ps.volCm3 / PALLET_VOL_CM3;

  // OVERLOAD counts — derive from final pallet states. One pallet that
  // breaches both weight + volume counts as 2 overload incidents but
  // only 1 affected pallet. Avoids double-counting per ESKU placement
  // (the previous bug where each ESKU added to an already-overloaded
  // pallet bumped the counter again).
  let overloadCount = 0;
  let overloadedPalletCount = 0;
  for (const ps of states) {
    if (ps.overloadFlags.size > 0) overloadedPalletCount += 1;
    overloadCount += ps.overloadFlags.size;
  }

  return { byPalletId, unassigned, reasons, palletStates,
           overloadCount, overloadedPalletCount, noValidCount };
}

/* `formatKey` for capacity tracking. Same physical product (one
   sku_dimensions row) → one key; identifies items that share a
   `pallet_load_max` value. Falls back to a synthetic key from L×B×H
   when DB id is missing so heuristic items still group. */
function formatKey(it) {
  if (it?.dimensions?.id) return `id:${it.dimensions.id}`;
  if (it?.dimensions) {
    const d = it.dimensions;
    return `dim:${d.lengthCm}x${d.widthCm}x${d.heightCm}`;
  }
  return null;     // unknown — capacity check skipped for this item
}

function buildPalletState(p) {
  let volCm3 = 0;
  let weightKg = 0;
  const formats = new Set();
  const levels = new Set();
  const brands = new Set();
  const useItemIds = new Set();
  const fnskus = new Set();
  const byLevel = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  // Capacity tracking — { formatKey: cartons }, plus per-key max
  const formatCounts = {};
  const formatMax = {};

  for (const it of p.items || []) {
    const vol = itemTotalVolumeCm3(it);
    const wgt = itemTotalWeightKg(it);
    volCm3 += vol;
    weightKg += wgt;
    formats.add(formatSig(it));
    const lvl = getDisplayLevel(it);
    levels.add(lvl);
    byLevel[lvl].push({
      item: it,
      source: 'mixed',
      count: itemWorkUnits(it),
      volCm3: vol,
      weightKg: wgt,
    });
    const b = detectBrand(it.title);
    if (b !== 'GENERIC') brands.add(b);
    palletItemTokens(it).forEach((t) => useItemIds.add(t));
    if (it.fnsku) fnskus.add(it.fnsku);
    // Capacity contribution. Mixed cartons = units (1 Einheit ≈ 1 carton
    // for thermal-roll-style items). Skip if no pallet_load_max for the
    // format — falls back to volume soft limit elsewhere.
    const fk = formatKey(it);
    const max = it.dimensions?.palletLoadMax;
    if (fk && max) {
      const cartons = it.isEinzelneSku
        ? (it.einzelneSku?.cartonsCount ?? 1)
        : (it.units || 0);
      formatCounts[fk] = (formatCounts[fk] || 0) + cartons;
      formatMax[fk] = max;
    }
  }

  // Detect Phase-1 overloads up-front
  const overloadFlags = new Set();
  if (weightKg > PALLET_WEIGHT_KG) overloadFlags.add('OVERLOAD-W');
  if (volCm3   > PALLET_VOL_CM3)   overloadFlags.add('OVERLOAD-V');

  // Capacity-fraction overload — sum of (count/max) across formats.
  // > 1.0 means the pallet is physically over-stuffed by carton count
  // (factoring stack height + footprint voids), even if volume in m³
  // looks fine.
  function capacityFraction() {
    let f = 0;
    for (const k of Object.keys(formatCounts)) {
      f += formatCounts[k] / formatMax[k];
    }
    return f;
  }
  if (capacityFraction() > 1.0) overloadFlags.add('OVERLOAD-CAP');

  return {
    pallet: p,
    volCm3, weightKg,
    formats, levels, brands, useItemIds, fnskus,
    formatCounts, formatMax,
    byLevel,
    overloadFlags,
    fillPct: volCm3 / PALLET_VOL_CM3,
    capacityFraction,
    anyEsku: false,
    eligible: p.hasFourSideWarning !== true,    // H7

    add(e) {
      const newVol = this.volCm3 + e.volCm3;
      const newWgt = this.weightKg + e.weightKg;
      if (newWgt > PALLET_WEIGHT_KG) this.overloadFlags.add('OVERLOAD-W');
      if (newVol > PALLET_VOL_CM3)   this.overloadFlags.add('OVERLOAD-V');
      this.volCm3 = newVol;
      this.weightKg = newWgt;
      this.formats.add(e.formatSig);
      this.levels.add(e.level);
      if (e.brand !== 'GENERIC') this.brands.add(e.brand);
      if (e.useItemId) this.useItemIds.add(e.useItemId);
      if (e.item.fnsku) this.fnskus.add(e.item.fnsku);
      // Capacity: one ESKU carton = +1 of this format's count
      if (e.formatKey && e.palletLoadMax) {
        this.formatCounts[e.formatKey] = (this.formatCounts[e.formatKey] || 0) + 1;
        this.formatMax[e.formatKey] = e.palletLoadMax;
        if (this.capacityFraction() > 1.0) this.overloadFlags.add('OVERLOAD-CAP');
      }
      this.byLevel[e.level].push({
        item: e.item,
        source: 'esku',
        count: 1,
        volCm3: e.volCm3,
        weightKg: e.weightKg,
      });
      this.anyEsku = true;
      this.fillPct = this.volCm3 / PALLET_VOL_CM3;
    },
  };
}

function enrichEsku(item) {
  const cartons = itemCartonCount(item);
  // Per-ESKU-carton volume / weight — placement loop adds one carton at a time.
  return {
    item,
    key:           item.fnsku || item.sku || item.title,
    cartons,
    volCm3:        eskuCartonVolumeCm3(item),
    weightKg:      eskuCartonWeightKg(item),
    formatSig:     formatSig(item),
    level:         getLevel(item),
    brand:         detectBrand(item.title),
    useItemId:     extractUseItemId(item.useItem),
    formatKey:     formatKey(item),
    palletLoadMax: item.dimensions?.palletLoadMax ?? null,
  };
}

/* H1-H4: a carton at level X may not sit BELOW any existing item of level Y > X.
   The pallet's level stack is monotonic from bottom (1) up to top (6). */
function violatesLevelOrder(carton, ps) {
  for (const existingLevel of ps.levels) {
    if (existingLevel > carton.level) return true;
  }
  return false;
}

function passesHardConstraints(carton, ps) {
  if (!ps.eligible) return false;                   // H7
  if (violatesLevelOrder(carton, ps)) return false; // H1-H4
  return true;
}

function scorePallet(carton, ps) {
  const breakdown = {
    useItemMatch: false, formatMatch: false, brandMatch: false,
    fnskuMatch: false, levelMatch: false,
    monoLevelConflict: false, multiLevelMismatch: false,
    fillScore: 0,
    overloadPenalty: 0,
  };
  let score = 0;

  if (carton.useItemId && ps.useItemIds.has(carton.useItemId)) {
    score += 50000;
    breakdown.useItemMatch = true;
  }
  if (ps.formats.has(carton.formatSig)) {
    score += 10000;
    breakdown.formatMatch = true;
  }
  if (carton.brand !== 'GENERIC' && ps.brands.has(carton.brand)) {
    score += 3000;
    breakdown.brandMatch = true;
  }
  if (carton.item.fnsku && ps.fnskus.has(carton.item.fnsku)) {
    score += 1000;
    breakdown.fnskuMatch = true;
  }
  if (ps.levels.has(carton.level)) {
    score += 500;
    breakdown.levelMatch = true;
  } else if (ps.levels.size === 1) {
    score -= 10000;
    breakdown.monoLevelConflict = true;
  } else if (ps.levels.size > 1) {
    score -= 200;
    breakdown.multiLevelMismatch = true;
  }

  // Sweet-spot 85% — tightness bonus relative to current free space
  const fillAfter = (ps.volCm3 + carton.volCm3) / PALLET_VOL_CM3;
  breakdown.fillScore = Math.round(
    (1 - Math.min(1, Math.abs(SWEET_SPOT_PCT - fillAfter))) * 100
  );
  score += breakdown.fillScore;

  // Empty-pallet preference — load-balancing across pallets of the same
  // level. Strong enough to override brand+fnsku+level (3000+1000+500 =
  // 4500) so a half-empty pallet wins over a near-full pallet of the
  // same brand. Does NOT unseat format-match (10000) unless the pallet
  // is more than half empty (>50% free) — the SOP explicitly prefers
  // format affinity until the load gap becomes large enough that
  // splitting the format becomes the right call.
  const fillBefore = ps.volCm3 / PALLET_VOL_CM3;
  if (fillBefore < 0.5) {
    score += 10000;
    breakdown.emptyPalletBonus = 10000;
  } else if (fillBefore < 0.75) {
    score += 5000;
    breakdown.emptyPalletBonus = 5000;
  }

  // ── Capacity fraction (Pallet load) — strongest signal when known.
  // Empirical max-cartons-per-pallet captures stack height + edge voids
  // that volume m³ alone misses. If THIS placement would push the
  // pallet past 1.0 (= physical full), penalise massively so the
  // distributor splits the group across multiple pallets instead of
  // overstuffing one. Pre-existing over-1.0 keeps its small base
  // penalty (so we don't pile MORE on a known-bad pallet) while still
  // letting useItem-Match win as a tie-breaker if no clean option
  // exists.
  let pen = 0;
  const currentFrac = ps.capacityFraction();
  if (carton.formatKey && carton.palletLoadMax) {
    const wouldFrac = currentFrac + (1 / carton.palletLoadMax);
    breakdown.capacityFraction = wouldFrac;
    if (wouldFrac > 1.0) {
      pen += currentFrac <= 1.0 ? 100000 : 30000;
      breakdown.capacityOverflow = true;
    } else if (wouldFrac > 0.95) {
      score += 200;
      breakdown.nearCapacity = true;
    }
  } else if (currentFrac >= 1.0) {
    // Carton has no known max, but the pallet's other formats have
    // already filled it to physical capacity. Stacking more on top
    // would still overstuff — soft-penalise so a less-full pallet
    // wins. Doesn't apply when pallet has zero capacity-tracked items
    // (then we have no signal and fall through to volume/weight).
    pen += 30000;
    breakdown.palletAtCapacity = true;
  }

  // Volume / weight soft-limit penalty — same logic, lighter weight
  // (capacity fraction above is stricter). Only kicks in for items
  // without pallet_load_max data. Penalty applies on EVERY carton that
  // would land on an over-limit pallet, not just the first one to push
  // it over — otherwise subsequent cartons of the same group keep piling
  // onto the already-overloaded pallet without scoring impact.
  if (!carton.palletLoadMax) {
    if ((ps.weightKg + carton.weightKg) > PALLET_WEIGHT_KG) pen += 50000;
    if ((ps.volCm3   + carton.volCm3)   > PALLET_VOL_CM3)   pen += 50000;
  }

  if (pen > 0) {
    score -= pen;
    breakdown.overloadPenalty = pen;
  }

  return { score, breakdown };
}

/* Returns { target, score, breakdown, overload, flags }. Always returns
   a target — falls back to least-bad NO_VALID_PLACEMENT if hard fails. */
function pickPallet(carton, states) {
  const eligible = states.filter((ps) => passesHardConstraints(carton, ps));

  if (eligible.length > 0) {
    // Hard guardrail: prefer pallets that won't overflow weight/volume
    // after this carton lands. Only fall back to overflow-allowed
    // candidates when EVERY eligible pallet would overflow (genuine
    // density problem — too many cartons for the pallet count). Without
    // this filter the scoring fight (brand-match vs sweet-spot) could
    // still send cartons onto an already-overloaded pallet.
    const wouldNotOverflow = eligible.filter((ps) =>
      (ps.weightKg + carton.weightKg) <= PALLET_WEIGHT_KG &&
      (ps.volCm3   + carton.volCm3)   <= PALLET_VOL_CM3
    );
    const candidates = wouldNotOverflow.length > 0 ? wouldNotOverflow : eligible;

    // Score every eligible pallet, then pick best with FREE-VOLUME tie-break.
    // Without the tie-break the first pallet in iteration order won the
    // toss whenever scores matched, leading to lopsided placements.
    let best = null;
    let bestScore = -Infinity;
    let bestFree = -Infinity;
    let bestBreakdown = null;
    for (const ps of candidates) {
      const { score, breakdown } = scorePallet(carton, ps);
      const free = PALLET_VOL_CM3 - ps.volCm3;
      if (score > bestScore || (score === bestScore && free > bestFree)) {
        bestScore = score;
        bestFree = free;
        best = ps;
        bestBreakdown = breakdown;
      }
    }
    const overload = predictOverload(carton, best);
    const flags = [...overload];
    return {
      target: best,
      score: bestScore,
      breakdown: bestBreakdown,
      overload,
      flags,
    };
  }

  // No pallet passes hard — pick least-bad and flag NO_VALID_PLACEMENT
  let best = states[0];
  let leastViolations = Infinity;
  for (const ps of states) {
    let v = 0;
    if (!ps.eligible) v += 100;            // Single-SKU pallet — strongest no
    if (violatesLevelOrder(carton, ps)) v += 10;
    // Tie-break by remaining capacity
    v += ps.volCm3 / PALLET_VOL_CM3;
    if (v < leastViolations) {
      leastViolations = v;
      best = ps;
    }
  }
  const overload = predictOverload(carton, best);
  return {
    target: best,
    score: -Infinity,
    breakdown: { fillScore: 0 },
    overload,
    flags: ['NO_VALID_PLACEMENT', ...overload],
  };
}

function predictOverload(carton, ps) {
  const flags = [];
  if (ps.weightKg + carton.weightKg > PALLET_WEIGHT_KG) flags.push('OVERLOAD-W');
  if (ps.volCm3 + carton.volCm3 > PALLET_VOL_CM3) flags.push('OVERLOAD-V');
  // Capacity fraction — empirical max cartons of THIS format on THIS
  // pallet (factoring stack height + footprint voids). Only flagged
  // when the carton's format has a known pallet_load_max.
  if (carton.formatKey && carton.palletLoadMax) {
    const wouldFrac = ps.capacityFraction() + (1 / carton.palletLoadMax);
    if (wouldFrac > 1.0) flags.push('OVERLOAD-CAP');
  }
  return flags;
}

/* ─── enrichItemDims — async batch lookup, called from state.jsx ───────
   The Lagerauftrag .docx item carries the FNSKU directly, but the
   underlying physical-product key (the EAN of the SKU it represents) is
   only available in the "Zu verwendender Artikel" line — i.e. the
   `useItem` field, e.g. "wird von 9120107187709 produziert". Without
   probing useItem we'd miss most matches, because admin xlsx imports
   are usually keyed by EAN, not FNSKU. */
export async function enrichItemDims(items, lookupFn) {
  if (!items?.length || !lookupFn) return items;
  const keys = new Set();
  for (const it of items) {
    if (it.fnsku) keys.add(it.fnsku);
    if (it.sku)   keys.add(it.sku);
    if (it.ean)   keys.add(it.ean);
    if (it.asin)  keys.add(it.asin);          // many production items live under ASIN only
    const useId = extractUseItemId(it.useItem);
    if (useId) keys.add(useId);
  }
  if (keys.size === 0) return items;
  let res;
  try {
    res = await lookupFn([...keys]);
  } catch {
    return items;                              // graceful: fall back to heuristics
  }
  const lookups = res?.lookups || {};
  return items.map((it) => {
    const useId = extractUseItemId(it.useItem);
    let dim = null, source = null;
    if (lookups[it.fnsku])      { dim = lookups[it.fnsku]; source = 'fnsku'; }
    else if (lookups[it.sku])   { dim = lookups[it.sku];   source = 'sku'; }
    else if (lookups[it.ean])   { dim = lookups[it.ean];   source = 'ean'; }
    else if (lookups[it.asin])  { dim = lookups[it.asin];  source = 'asin'; }
    else if (useId && lookups[useId]) { dim = lookups[useId]; source = 'use_item'; }
    return dim
      ? { ...it, dimensions: dim, dimensionsMatch: source, hasDimensions: true }
      : it;
  });
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

function extractUseItemId(s) {
  if (!s) return null;
  const ean = String(s).match(/\b\d{12,14}\b/);
  if (ean) return ean[0];
  const xcode = String(s).match(/\bX[0-9A-Z]{8,10}\b/i);
  if (xcode) return xcode[0].toUpperCase();
  return null;
}

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
      // ESKU adds physical cartons; Mixed shares the outer P1-Bx box (0)
      pCartons += itemCartonCount(it);
      pVol += itemTotalVolumeCm3(it);
      pWeight += itemTotalWeightKg(it);
      pUnits += it.units || 0;
      if (it.dimStr) formats.add(it.dimStr);
    });
    // Outer Mixed-Box itself contributes one carton + Tara
    if (p.items?.length) { pCartons += 1; pWeight += TARA_KG; }
    cartons += pCartons; volumeCm3 += pVol; weightKg += pWeight;
    articles += p.items.length; units += pUnits;
    const lvl = primaryLevel(p.items);
    return {
      id: p.id,
      level: lvl,
      articles: p.items.length,
      units: pUnits,
      fillPct: pVol / PALLET_VOL_CM3,
      formats: Array.from(formats),
      isSingleSku: p.hasFourSideWarning === true,
    };
  });

  const overallFill = pallets.length > 0
    ? volumeCm3 / (pallets.length * PALLET_VOL_CM3)
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

function isTachoForTiming(it) {
  if (getDisplayLevel(it) !== 6) return false;
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
    p.items.forEach((it) => { s += isTachoForTiming(it) ? T_PER_ARTICLE_TACHO : T_PER_ARTICLE; });
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
  const lvl = getDisplayLevel(item);
  if (!perCarton && lvl === 4) {
    perCarton = extractProduktionPerCarton(item.title || '');
  }
  const perCartonUnit = lvl === 4 ? 'Stück' : 'Rollen';

  // ESKU items carry their own carton metadata (cartonsCount =
  // number of FBA-labelled cartons) plus distributor-attached
  // placement flags (OVERLOAD, NO_VALID_PLACEMENT). These show up
  // in Focus so the worker knows it's a separate Phase-2 item with
  // independent FBA Box ID labels.
  const isEsku = item.isEinzelneSku === true;
  const eskuCartons = isEsku
    ? (item.einzelneSku?.cartonsCount ?? Math.max(1, Math.ceil((item.units || 0) / (item.einzelneSku?.packsPerCarton || 1))))
    : null;
  const eskuPacksPerCarton = isEsku ? (item.einzelneSku?.packsPerCarton ?? null) : null;
  const placementFlags = item.placementMeta?.flags || [];

  return {
    code:           item.fnsku || item.sku || '—',
    useItem:        item.useItem || '',
    units:          item.units || 0,
    name:           shortArticleName(item),
    dim:            item.dimStr,
    rollen:         perCarton,
    rollenUnit:     perCartonUnit,
    level:          lvl,
    levelMeta:      LEVEL_META[lvl],
    lst,
    isEsku,
    eskuCartons,
    eskuPacksPerCarton,
    placementFlags,
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
  const lvl = getDisplayLevel(item);

  const lower = title.toLowerCase();
  const isThermo = lvl === 1 || lvl === 2 || /thermo|bonroll|kassenroll/i.test(lower);
  if (isThermo) {
    if (dimStr) return `Thermorolle ${dimStr}`;
    // Thermopapier-Notation: "12mm ø, 57mm breit"
    const diameter = title.match(/(\d+)\s*mm\s*ø/i);
    const width    = title.match(/(\d+)\s*mm\s+(?:breit|wide|width|breite)\b/i);
    if (diameter && width) return `Thermopapier, ${diameter[1]}mm ø, ${width[1]}mm`;
    if (diameter)          return `Thermopapier, ${diameter[1]}mm ø`;
    if (width)             return `Thermopapier, ${width[1]}mm breit`;
  }

  if (lvl === 6) {
    // Tacho-Notationen: "57-8mm", "57/8 mm", "57/28/7"
    const m = title.match(/(\d+)\s*[-/×x]\s*(\d+)(?:\s*[-/×x]\s*(\d+))?/i);
    if (m) {
      const dims = [m[1], m[2], m[3]].filter(Boolean).join('/');
      return `Tachographenrollen ${dims}mm`;
    }
    return 'Tachographenrollen';
  }

  if (lvl === 4) {
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

/* ─── Level aggregation across pallets (for Abschluss) ────────────────── */
export function levelDistribution(pallets) {
  const totals = {};
  let grand = 0;
  pallets.forEach((p) => {
    p.items.forEach((it) => {
      const lvl = getDisplayLevel(it);
      totals[lvl] = (totals[lvl] || 0) + (it.units || 0);
      grand += it.units || 0;
    });
  });
  return Object.entries(totals)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([level, units]) => ({
      level: parseInt(level, 10),
      meta: LEVEL_META[parseInt(level, 10)] || LEVEL_META[1],
      units,
      pct: grand ? units / grand : 0,
    }));
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
      level: primaryLevel(p.items),
      articles: p.items.length,
      durSec: dur,
    };
  });
}
