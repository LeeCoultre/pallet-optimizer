/* Theming: pick an accent color, derive the five shades the UI needs,
   write them to CSS variables on :root.

   Components read the accent via T.accent.* (which now resolve to
   `var(--accent-*)`), so changing the color here propagates everywhere
   without a React re-render. */

const KEY = 'marathon.accent.color.v1';
const DEFAULT = '#FF5B1F';

function clamp(n) {
  return Math.max(0, Math.min(255, n));
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  if (m.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b]
    .map((n) => clamp(Math.round(n)).toString(16).padStart(2, '0'))
    .join('');
}

function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r - amount, g: g - amount, b: b - amount });
}

function mixWithWhite(hex, weight) {
  // weight = 0 → original, 1 → pure white
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({
    r: r + (255 - r) * weight,
    g: g + (255 - g) * weight,
    b: b + (255 - b) * weight,
  });
}

/** Derive the five UI shades from a single hex. Tuned to look right on
 *  the existing white surface without per-color manual review. */
export function deriveAccent(hex) {
  return {
    main:   hex,
    hover:  darken(hex, 25),
    text:   darken(hex, 70),     // dark text variant for badges, links
    bg:     mixWithWhite(hex, 0.92),
    border: mixWithWhite(hex, 0.6),
    soft:   `${hex}14`,           // ~8% alpha (modern hex-with-alpha)
  };
}

/** Push the accent into CSS custom properties. */
export function applyAccent(hex) {
  const s = deriveAccent(hex);
  const root = document.documentElement.style;
  root.setProperty('--accent',        s.main);
  root.setProperty('--accent-hover',  s.hover);
  root.setProperty('--accent-text',   s.text);
  root.setProperty('--accent-bg',     s.bg);
  root.setProperty('--accent-border', s.border);
  root.setProperty('--accent-2',      s.hover);     // legacy alias
  root.setProperty('--accent-soft',   s.soft);
}

export function getStoredAccent() {
  try {
    const v = localStorage.getItem(KEY);
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setStoredAccent(hex) {
  try { localStorage.setItem(KEY, hex.toUpperCase()); } catch { /* ignore */ }
}

export function resetAccent() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  applyAccent(DEFAULT);
  return DEFAULT;
}

export const DEFAULT_ACCENT = DEFAULT;
