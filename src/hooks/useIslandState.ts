// @ts-nocheck — incremental TS migration: file renamed, strict typing pending
/* ─────────────────────────────────────────────────────────────────────────
   useIslandState — pure derivation hook that turns Marathon's app-state
   into a normalized briefing for the DynamicIsland component.

   The hook DOES NOT own UI state (mode/expand). It owns only
   "what should the island say right now" — based on:
     • current Auftrag (or absence thereof)
     • current.step  (pruefen / focus / abschluss)
     • current.validation  (parsing severity)
     • current.parsed  +  currentPalletIdx / currentItemIdx  (Focus position)
     • current.completedKeys  (Focus copy state)
     • current.palletTimings  (Focus elapsed time)

   The DynamicIsland component subscribes via this hook and decides
   compact vs expanded vs auto-collapse — separation of concerns lets
   us unit-test the briefing logic without DOM, and lets the component
   stay focused on animation/interaction.
   ───────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../state.jsx';
import { LEVEL_META } from '../utils/auftragHelpers.js';

const TICK_MS = 1000;   // 1Hz "now" tick for elapsed-time fields

/**
 * @typedef {Object} IslandBriefing
 * @property {'idle'|'upload'|'pruefen'|'focus'|'abschluss'} context
 * @property {'ok'|'info'|'warn'|'error'} severity
 * @property {string} signature              — stable string identifying current state; pulse triggers when it changes
 * @property {{ icon: string, primary: string, secondary?: string }} glance
 *   Tiny: 1 icon + 1 short string (≤14 chars), the *only* thing visible at rest.
 * @property {{ icon: string, title: string, sub?: string, accent?: string }} compact
 *   Hover-revealed: 1 icon + title (≤24 chars) + optional 1-line secondary.
 * @property {Object} [expanded]             — full content for click/long-hover state.
 */

export function useIslandState() {
  const { current } = useAppState();
  const now = useNow(TICK_MS);

  return useMemo(() => deriveBriefing(current, now), [current, now]);
}

/* ─── Derivation ─────────────────────────────────────────────────────── */
function deriveBriefing(current, now) {
  if (!current) {
    return {
      context: 'idle',
      severity: 'info',
      signature: 'idle',
      glance: { icon: '·', primary: 'Bereit' },
      compact: {
        icon: '📥',
        title: 'Bereit für Upload',
        sub: 'Lagerauftrag .docx ablegen',
      },
      expanded: null,
    };
  }

  const step = current.step || 'pruefen';
  if (step === 'focus')     return briefFocus(current, now);
  if (step === 'abschluss') return briefAbschluss(current);
  return briefPruefen(current);
}

/* ─── Pruefen ───────────────────────────────────────────────────────── */
function briefPruefen(current) {
  const errCount = current.validation?.errorCount || 0;
  const warnCount = current.validation?.warningCount || 0;
  const palletCount = current.parsed?.pallets?.length || current.palletCount || 0;
  const articleCount = current.articleCount || (current.parsed?.pallets || [])
    .reduce((n, p) => n + (p.items?.length || 0), 0);
  const units = (current.parsed?.pallets || []).reduce((n, p) =>
    n + (p.items || []).reduce((s, it) => s + (it.units || 0), 0), 0);

  const severity = errCount > 0 ? 'error'
    : warnCount > 0 ? 'warn'
    : 'ok';
  const headline = errCount > 0
    ? `${errCount} Fehler`
    : warnCount > 0
      ? `${warnCount} Warnung${warnCount === 1 ? '' : 'en'}`
      : 'Bereit';
  const icon = severity === 'error' ? '⚠'
    : severity === 'warn' ? '⚠'
    : '✓';

  return {
    context: 'pruefen',
    severity,
    signature: `pruefen:${current.id}:${severity}:${errCount}:${warnCount}`,
    glance: {
      icon,
      primary: headline,
    },
    compact: {
      icon,
      title: headline,
      sub: `${palletCount} Pal · ${articleCount} Art · ${units.toLocaleString('de-DE')} Eh`,
    },
    expanded: {
      kind: 'pruefen',
      title: 'Auftrag prüfen',
      stats: [
        { label: 'Paletten',  value: palletCount },
        { label: 'Artikel',   value: articleCount },
        { label: 'Einheiten', value: units.toLocaleString('de-DE') },
      ],
      severity,
      errCount,
      warnCount,
      fba: current.fbaCode || current.parsed?.meta?.sendungsnummer || '—',
    },
  };
}

/* ─── Focus ─────────────────────────────────────────────────────────── */
function briefFocus(current, now) {
  const pallets = current.parsed?.pallets || [];
  const palletIdx = current.currentPalletIdx ?? 0;
  const itemIdx = current.currentItemIdx ?? 0;
  const pallet = pallets[palletIdx];
  if (!pallet) {
    return {
      context: 'focus',
      severity: 'info',
      signature: 'focus:noPallet',
      glance: { icon: '⚡', primary: 'Focus' },
      compact: { icon: '⚡', title: 'Focus läuft' },
      expanded: null,
    };
  }

  const items = pallet.items || [];
  const item = items[itemIdx];
  const palletItemCount = items.length;
  const overall = pallets.reduce((n, p) => n + (p.items?.length || 0), 0);
  const completedAtPallet = countCompleted(pallet, current.completedKeys);
  const itemPos = Math.min(itemIdx + 1, palletItemCount);
  const palletProgress = palletItemCount > 0 ? completedAtPallet / palletItemCount : 0;

  // Elapsed since this pallet started — tracked in current.palletTimings.
  const startedAt = current.palletTimings?.[pallet.id]?.startedAt;
  const elapsedSec = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;

  const meta = LEVEL_META[derivePalletLevel(pallet)] || LEVEL_META[1];

  // Code copy state — keyed by `${palletIdx}|${itemIdx}` in copiedKeys
  // (server-persisted as of the cinematic Focus rewrite). The Island
  // signature flips on copy, not on fertig — this is what drives the
  // ring-pulse micro-interaction tied to the copy gesture.
  const copiedKey = `${palletIdx}|${itemIdx}`;
  const codeDone = !!current.copiedKeys?.[copiedKey];

  // Next item preview — same pallet first, then first item of next pallet.
  const nextItem = items[itemIdx + 1] || pallets[palletIdx + 1]?.items?.[0] || null;

  return {
    context: 'focus',
    severity: 'info',
    signature: `focus:${current.id}:${pallet.id}:${itemIdx}:${codeDone ? 'done' : 'open'}`,
    glance: {
      icon: '⚡',
      primary: `${pallet.id} · ${itemPos}/${palletItemCount}`,
    },
    compact: {
      icon: '⚡',
      title: `${pallet.id} · L${meta.shortName ? meta.shortName.toLowerCase() : ''}`,
      sub: `${itemPos}/${palletItemCount} · ${formatDur(elapsedSec)}`,
      accent: meta.color,
    },
    expanded: {
      kind: 'focus',
      pallet,
      palletPosition: palletIdx + 1,
      palletTotal: pallets.length,
      itemPos,
      palletItemCount,
      palletProgress,
      elapsedSec,
      codeDone,
      currentItemTitle: shortenTitle(item?.title, 36),
      nextItemTitle: shortenTitle(nextItem?.title, 36),
      levelMeta: meta,
      overallProgress: overall > 0 ? totalCompletedSoFar(pallets, current.completedKeys) / overall : 0,
    },
  };
}

/* ─── Abschluss ─────────────────────────────────────────────────────── */
function briefAbschluss(current) {
  const dur = current.durationSec || 0;
  const articles = current.articleCount || 0;
  const itemsPerMin = dur > 0 ? (articles * 60) / dur : 0;
  return {
    context: 'abschluss',
    severity: 'ok',
    signature: `abschluss:${current.id}`,
    glance: { icon: '✓', primary: formatDur(dur) },
    compact: {
      icon: '✓',
      title: 'Auftrag fertig',
      sub: `${formatDur(dur)} · ${articles} Artikel`,
    },
    expanded: {
      kind: 'abschluss',
      durationSec: dur,
      articles,
      itemsPerMin: itemsPerMin.toFixed(1),
      fba: current.fbaCode || '—',
    },
  };
}

/* ─── Internals ──────────────────────────────────────────────────────── */
function countCompleted(pallet, completedKeys) {
  if (!completedKeys) return 0;
  let n = 0;
  for (const key of Object.keys(completedKeys)) {
    if (key.startsWith(`${pallet.id}|`)) n += 1;
  }
  return n;
}
function totalCompletedSoFar(pallets, completedKeys) {
  if (!completedKeys) return 0;
  return Object.keys(completedKeys).filter((k) => {
    const palletId = k.split('|', 1)[0];
    return pallets.some((p) => p.id === palletId);
  }).length;
}
function derivePalletLevel(pallet) {
  // Pick the dominant level from items — use sortItemsForPallet's first
  // item which has highest priority. Fallback L1.
  if (!pallet?.items?.length) return 1;
  const counts = {};
  for (const it of pallet.items) {
    const lvl = it.level
      || (it.title?.toLowerCase().includes('tacho') ? 6 : 1);
    counts[lvl] = (counts[lvl] || 0) + (it.units || 1);
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? parseInt(top[0], 10) : 1;
}
function shortenTitle(title, max) {
  if (!title) return '';
  const t = String(title).trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
function formatDur(sec) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

/* 1Hz tick — drives the elapsed-time clock without re-rendering the
   whole app. Uses requestAnimationFrame for smooth lifecycle and
   clears properly on unmount. */
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  const lastRef = useRef(now);
  useEffect(() => {
    let raf;
    const tick = () => {
      const t = Date.now();
      if (t - lastRef.current >= intervalMs) {
        lastRef.current = t;
        setNow(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [intervalMs]);
  return now;
}