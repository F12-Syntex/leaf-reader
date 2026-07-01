/* ---------- reading themes ---------- */
export const THEMES = {
  paper: { name: 'Paper', bg: '#faf8f3', ink: '#2a251e', soft: '#b8b1a4' },
  sepia: { name: 'Sepia', bg: '#f4ead3', ink: '#473722', soft: '#bda584' },
  dark:  { name: 'Dark',  bg: '#1e2024', ink: '#dcd8d0', soft: '#62605a' },
  oled:  { name: 'OLED',  bg: '#000000', ink: '#cbc7bf', soft: '#46443e' },
};
export const THEME_ORDER = ['paper', 'sepia', 'dark', 'oled'];

export const FONTS = {
  newsreader: { name: 'Newsreader', stack: "'Newsreader', Georgia, serif" },
  spectral:   { name: 'Spectral',   stack: "'Spectral', Georgia, serif" },
  literata:   { name: 'Literata',   stack: "'Literata', Georgia, serif" },
};

export const MEASURES = { narrow: 600, cozy: 680, wide: 760 };

/* fixed app defaults — formerly a live-tweakable EDITMODE block in the Claude
   Design prototype; now just the shipped app's settings. */
export const APP_DEFAULTS = {
  skin: 'Literary',
  accent: '#c2873f',
  dropCap: true,
  justify: true,
  paraStyle: 'spaced',
  detect: true,
  dialogue: true,
  dialogueLabel: true,
  dockStyle: 'floating',
};

/* per-chapter story-relevance scores, 1 (idle/filler) → 10 (climax/pivotal),
   index-aligned to a book's chapters array. Unknown books/chapters fall back
   to a neutral 5 via relScore(). */
const RELEVANCE = {};

export function relScore(bookId, i) {
  const a = RELEVANCE[bookId];
  return a && a[i] != null ? a[i] : 5;
}
export function relMeta(s) {
  if (s >= 9) return { label: 'Pivotal', cls: 'peak' };
  if (s >= 7) return { label: 'Major beat', cls: 'high' };
  if (s >= 5) return { label: 'Story moves', cls: 'mid' };
  if (s >= 3) return { label: 'Slow burn', cls: 'low' };
  return { label: 'Filler', cls: 'idle' };
}
/* continuous heat color: cool blue (low) → hot red (high) */
export function relHeat(s) {
  const hue = 248 - ((Math.max(1, Math.min(10, s)) - 1) / 9) * 223;
  return `oklch(0.66 0.16 ${hue.toFixed(1)})`;
}
