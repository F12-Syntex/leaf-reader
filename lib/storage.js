/* localStorage helpers. Every read/write is guarded for SSR (these modules get
   imported by client components that Next.js also renders once on the server,
   where `window`/`localStorage` don't exist) — callers should still only rely
   on real values from inside a useEffect (post-mount), not from a useState
   initializer, to avoid hydration mismatches. */

const LS = 'reader:v2';
const LSL = LS + ':lib';
const LSB = (id) => LS + ':book:' + id;

function getItem(key) {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function setItem(key, value) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch (e) {}
}
function parseOr(json, fallback) {
  try { const v = JSON.parse(json); return v == null ? fallback : v; } catch (e) { return fallback; }
}

export function loadGlobal() {
  return parseOr(getItem(LS), {});
}
export function saveGlobal(data) {
  setItem(LS, JSON.stringify(data));
}

export function loadBook(id) {
  return parseOr(getItem(LSB(id)), {});
}
export function saveBook(id, data) {
  setItem(LSB(id), JSON.stringify(data));
}

export function loadLib() {
  return parseOr(getItem(LSL), {});
}
export function saveLib(data) {
  setItem(LSL, JSON.stringify(data));
}

export function wordsOfBlocks(blocks) {
  return blocks.reduce((n, b) => n + (typeof b === 'string'
    ? b.split(/\s+/).length
    : (b.lines ? b.lines.join(' ').split(/\s+/).length : 0)), 0);
}
export function readTime(ch) {
  return Math.max(1, Math.round(wordsOfBlocks(ch.blocks) / 220));
}
