// @ts-nocheck — incremental TS migration: file renamed, strict typing pending
/* ─────────────────────────────────────────────────────────────────────────
   palletStory — pure rule-based generator that turns a pallet's structural
   features (level mix, weight/volume, 4-Seiten flag, ESKU presence,
   superlative-rank against the rest of the Auftrag) into a one-line
   "headline" + 1-2 supporting facts the warehouse operator can scan in
   under a second.

   No LLM. No async. The card component receives the briefing and renders
   it; this module owns the language so all copy lives in one file.
   ───────────────────────────────────────────────────────────────────────── */

import { LEVEL_META, getDisplayLevel } from './auftragHelpers.js';

const PALLET_VOL_M3        = 1.59;
const PALLET_VOL_CM3       = PALLET_VOL_M3 * 1e6;
const PALLET_WEIGHT_KG     = 700;
const DOMINANT_PCT         = 0.65;
const NEAR_FULL_PCT        = 0.95;

/**
 * @typedef {Object} PalletStory
 * @property {string} headline                      — short, bold, scan-first
 * @property {string} subtitle                      — fact line under headline
 * @property {string} narrative                     — 1-2 sentence "why"
 * @property {'special'|'warn'|'accent'|'neutral'|'cool'} tone
 * @property {{ level: number, units: number, pct: number, color: string }[]} levels
 * @property {{ weightPct: number, volumePct: number, fillPct: number,
 *              weightKg: number, volumeM3: number,
 *              overloadFlags: string[] }} capacity
 */

/**
 * @param {Object} ctx
 * @param {Object} ctx.pallet            — view-shape pallet (id, level, articles, units, formats, isSingleSku)
 * @param {Array}  ctx.items             — raw enriched items (with units, level, etc.)
 * @param {Array}  ctx.eskuAssigned      — ESKU items distributed onto this pallet (+placementMeta)
 * @param {Object} ctx.palletState       — distribute()'s palletStates[id] (volCm3, weightKg, overloadFlags...)
 * @param {Object} ctx.ranking           — { largestId, smallestId, heaviestId } across the Auftrag
 * @returns {PalletStory}
 */
export function buildPalletStory(ctx) {
  const { pallet, items = [], eskuAssigned = [], palletState, ranking = {} } = ctx;

  const totalUnits = (items || []).reduce((s, it) => s + (it.units || 0), 0)
                  + (eskuAssigned || []).reduce((s, it) =>
                      s + (it.placementMeta?.cartonsHere ?? 1), 0);

  // Level histogram — share by units (Mixed) + carton count (ESKU).
  const levelCount = {};
  for (const it of items) {
    const lvl = getDisplayLevel(it);
    levelCount[lvl] = (levelCount[lvl] || 0) + (it.units || 0);
  }
  for (const it of eskuAssigned) {
    const lvl = getDisplayLevel(it);
    levelCount[lvl] = (levelCount[lvl] || 0) + (it.placementMeta?.cartonsHere ?? 1);
  }
  const totalForPct = Object.values(levelCount).reduce((s, n) => s + n, 0) || 1;
  const levels = Object.entries(levelCount)
    .map(([lvl, n]) => {
      const lvlNum = parseInt(lvl, 10);
      const meta = LEVEL_META[lvlNum] || LEVEL_META[1];
      return {
        level: lvlNum,
        units: n,
        pct: n / totalForPct,
        name: meta.shortName,
        color: meta.color,
      };
    })
    .sort((a, b) => b.units - a.units);

  // Capacity
  const volCm3   = palletState?.volCm3 || 0;
  const weightKg = palletState?.weightKg || 0;
  const volumePct = volCm3 / PALLET_VOL_CM3;
  const weightPct = weightKg / PALLET_WEIGHT_KG;
  const fillPct   = palletState?.fillPct ?? volumePct;
  const overloadFlags = Array.from(palletState?.overloadFlags || []);

  // ── Headline rules — first match wins ──────────────────────────────
  let tone = 'neutral';
  let headline = 'Mixed-Inhalt';

  if (pallet.isSingleSku) {
    headline = 'Single-SKU · 4-Seiten-Warnung';
    tone = 'warn';
  } else if (overloadFlags.includes('OVERLOAD-W') || overloadFlags.includes('OVERLOAD-V')
          || overloadFlags.includes('OVERLOAD-CAP')) {
    headline = `OVERLOAD · ${overloadFlags.join(' + ')}`;
    tone = 'warn';
  } else if (volumePct >= NEAR_FULL_PCT || weightPct >= NEAR_FULL_PCT) {
    headline = 'Knapp am Soft-Limit';
    tone = 'warn';
  } else if (ranking.largestId === pallet.id && totalUnits > 0) {
    headline = 'Größte Palette';
    tone = 'accent';
  } else if (ranking.smallestId === pallet.id && totalUnits > 0) {
    headline = 'Leichteste Palette';
    tone = 'cool';
  } else if (levels.length === 1 && levels[0]) {
    headline = `Mono-Level · L${levels[0].level} ${levels[0].name}`;
    tone = 'neutral';
  } else if (levels[0] && levels[0].pct >= DOMINANT_PCT) {
    headline = `${levels[0].name}-dominant`;
    tone = 'neutral';
  } else if (levels.length >= 3) {
    headline = 'Mixed-Pyramide';
    tone = 'neutral';
  }

  // ── Subtitle — facts row under headline ────────────────────────────
  const subtitleParts = [
    `${pallet.articles} Artikel`,
    `${totalUnits.toLocaleString('de-DE')} Einheiten`,
  ];
  if (eskuAssigned.length > 0) {
    subtitleParts.push(`+${eskuAssigned.length} ESKU verteilt`);
  }
  const subtitle = subtitleParts.join(' · ');

  // ── Narrative — 1-2 sentences, optional ────────────────────────────
  const narrative = buildNarrative({
    pallet, levels, eskuAssigned, fillPct,
    overloadFlags, ranking,
  });

  return {
    headline,
    subtitle,
    narrative,
    tone,
    levels,
    capacity: {
      weightPct,
      volumePct,
      fillPct,
      weightKg,
      volumeM3: volCm3 / 1e6,
      overloadFlags,
    },
  };
}

/* Narrative — the "why" of this pallet. Composed from up to 3 clauses
   that vary based on what's actually distinctive. Keep terse: warehouse
   operators read them mid-task. */
function buildNarrative({ pallet, levels, eskuAssigned, fillPct, overloadFlags, ranking }) {
  const parts = [];

  if (pallet.isSingleSku) {
    parts.push('Single-SKU nach Amazon-Standard. Keine ESKU zuweisen.');
  }

  if (overloadFlags.length > 0) {
    parts.push(`Soft-Limit überschritten: ${overloadFlags.join(', ')}. Bridge informieren.`);
  }

  // Has L7 (Tachorollen) → it's the "top" pallet, focus last
  const hasL7 = levels.some((l) => l.level === 7);
  const hasL6 = levels.some((l) => l.level === 6);
  if (hasL7 && !pallet.isSingleSku) {
    parts.push('Tacho on top — als letzte Palette focusen.');
  } else if (hasL6 && !pallet.isSingleSku) {
    parts.push('Kürbiskernöl on top — fragile Position.');
  }

  if (eskuAssigned.length > 0 && !pallet.isSingleSku) {
    const eskuLevels = [...new Set(eskuAssigned.map((it) =>
      it.level || (it.title && it.title.toLowerCase().includes('tacho') ? 7 : 1)
    ))].sort();
    parts.push(`ESKU auf ${eskuLevels.map((l) => `L${l}`).join('+')} verteilt.`);
  }

  if (parts.length === 0) {
    if (fillPct < 0.4) {
      parts.push('Reichlich Reserve — Auflader-Kandidat.');
    } else if (ranking.largestId === pallet.id) {
      parts.push('Höchstes Volumen im Auftrag.');
    } else {
      // Default fall-back — just a sentence about level mix.
      const top = levels[0];
      if (top) {
        parts.push(`Schwerpunkt L${top.level} ${top.name} (${Math.round(top.pct * 100)}%).`);
      }
    }
  }

  return parts.slice(0, 2).join(' ');
}

/* ─── Cross-pallet ranking — call once per Auftrag, reuse for every card ─ */
export function rankPallets(viewPallets, palletStates) {
  if (!viewPallets?.length) {
    return { largestId: null, smallestId: null, heaviestId: null };
  }
  const ranked = viewPallets
    .map((p) => ({
      id: p.id,
      vol: palletStates?.[p.id]?.volCm3 ?? 0,
      weight: palletStates?.[p.id]?.weightKg ?? 0,
    }));
  const byVol = [...ranked].sort((a, b) => b.vol - a.vol);
  const byWeight = [...ranked].sort((a, b) => b.weight - a.weight);
  return {
    largestId:  byVol[0]?.id ?? null,
    smallestId: byVol[byVol.length - 1]?.id ?? null,
    heaviestId: byWeight[0]?.id ?? null,
  };
}