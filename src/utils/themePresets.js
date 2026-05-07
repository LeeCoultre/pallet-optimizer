/* Theme presets — curated accent palettes for the Einstellungen Studio.
   Each preset is just an accent hex; deriveAccent() in accent.js
   handles the 5-shade derivation, so adding a new theme is one line.

   The order here drives the visual order in Einstellungen — keep the
   default preset first so users see "their" theme on the left. */

import { DEFAULT_ACCENT } from './accent.js';

export const THEME_PRESETS = [
  { id: 'marathon',  label: 'Marathon Orange', hex: DEFAULT_ACCENT, emoji: '🔥' },
  { id: 'indigo',    label: 'Linear Indigo',   hex: '#5B62D8',     emoji: '🌌' },
  { id: 'forest',    label: 'Forest Green',    hex: '#10B981',     emoji: '🌲' },
  { id: 'sky',       label: 'Sky Blue',        hex: '#0EA5E9',     emoji: '🌊' },
  { id: 'violet',    label: 'Royal Violet',    hex: '#A855F7',     emoji: '💜' },
  { id: 'midnight',  label: 'Midnight',        hex: '#0A0A0B',     emoji: '⚫' },
];

export function findPreset(hex) {
  if (!hex) return null;
  const up = hex.toUpperCase();
  return THEME_PRESETS.find((p) => p.hex.toUpperCase() === up) || null;
}
