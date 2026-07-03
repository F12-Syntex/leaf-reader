/* Rich-text detection & rendering logic: markdown/expressive-text parsing,
   character & money detection, mention counts, speaker-attributed dialogue.
   Component pieces (StatCard, LetterBlock, etc.) live in
   components/richtext/blocks.js and import from here. */
import React, { useState as rtState, useEffect as rtEffect, useRef as rtRef } from 'react';

/* Resolve a character key case-insensitively against book.characters, falling
   back to a synthesized minimal character (never null/undefined for a truthy
   key) — the /addbook formatting pass can emit a key with different casing,
   or one for a minor character never added to meta.json's characters map. */
export function resolveChar(book, key) {
  if (!key) return null;
  const chars = book.characters || {};
  if (chars[key]) return chars[key];
  const lower = String(key).toLowerCase();
  const found = Object.keys(chars).find((k) => k.toLowerCase() === lower);
  if (found) return chars[found];
  const name = lower.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  return { name, initials: name.slice(0, 2).toUpperCase(), epithet: '', desc: '' };
}

/* canonical key for a character reference: matches book.characters case-
   insensitively, else the lowercased raw key (for characters not in meta.json) */
function canonicalCharKey(book, key) {
  const chars = book.characters || {};
  const lower = String(key).toLowerCase();
  const found = Object.keys(chars).find((k) => k.toLowerCase() === lower);
  return found || lower;
}

/* ---------- entity index ---------- */
export function buildCharIndex(book) {
  const entries = [];
  Object.entries(book.characters || {}).forEach(([key, c]) =>
    (c.aliases || [c.name]).forEach((a) => entries.push({ alias: a, key })));
  entries.sort((a, b) => b.alias.length - a.alias.length);
  /* no named characters (e.g. an imported book) → a regex that never matches,
     so detection is a no-op instead of an infinite zero-width-match loop */
  const re = entries.length
    ? new RegExp('\\b(' + entries.map((e) => e.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'g')
    : /(?!x)x/g;
  const map = {}; entries.forEach((e) => { map[e.alias] = e.key; });
  return { re, map };
}

/* ---------- money detection ---------- */
export const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export const MONEY_RE = /\b((one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+or\s+(one|two|three|four|five|six|seven|eight|nine|ten))?\s+thousand(?:\s+pounds)?(?:\s+a\s+year)?)\b/gi;
export function parseMoney(m) {
  const a = NUMW[m[2].toLowerCase()] * 1000;
  const b = m[3] ? NUMW[m[3].toLowerCase()] * 1000 : null;
  const value = b ? (a + b) / 2 : a;
  return { text: m[1], value, perYear: /a\s+year/i.test(m[1]) };
}

/* ---------- inline markdown (bold / italic) ---------- */
export function mdTokens(text) {
  const out = []; let rest = text;
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/;
  while (rest.length) {
    const m = rest.match(re);
    if (!m) { out.push({ t: 't', x: rest }); break; }
    if (m.index > 0) out.push({ t: 't', x: rest.slice(0, m.index) });
    out.push(m[2] !== undefined ? { t: 'b', x: m[2] } : { t: 'i', x: m[3] });
    rest = rest.slice(m.index + m[1].length);
  }
  return out;
}

/* ---------- detection within a text run ---------- */
export function detectRun(text, ctx, keyBase) {
  if (!ctx.detect) return text;
  const hits = [];
  ctx.charIndex.re.lastIndex = 0; MONEY_RE.lastIndex = 0;
  let m;
  while ((m = ctx.charIndex.re.exec(text))) hits.push({ s: m.index, e: m.index + m[0].length, type: 'char', key: ctx.charIndex.map[m[0]], text: m[0] });
  while ((m = MONEY_RE.exec(text))) hits.push({ s: m.index, e: m.index + m[1].length, type: 'money', data: parseMoney(m), text: m[1] });
  if (!hits.length) return text;
  hits.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  const flat = []; let last = 0;
  hits.forEach((h) => { if (h.s < last) return; flat.push(h); last = h.e; });
  const out = []; let pos = 0;
  flat.forEach((h, i) => {
    if (h.s > pos) out.push(text.slice(pos, h.s));
    out.push(h.type === 'char'
      ? <span key={keyBase + '-c' + i} className="chip chip-char" style={ctx.hues ? { '--spk-h': ctx.hues[h.key] } : undefined}
          onClick={(e) => { e.stopPropagation(); ctx.onChar(e, h.key); }}>{h.text}</span>
      : <span key={keyBase + '-m' + i} className="chip chip-money" onClick={(e) => { e.stopPropagation(); ctx.onMoney(e, h.data); }}>{h.text}</span>);
    pos = h.e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

export function renderMd(text, ctx) {
  return mdTokens(text).map((tok, i) => {
    const inner = detectRun(tok.x, ctx, 'k' + i);
    if (tok.t === 'b') return <strong key={i}>{inner}</strong>;
    if (tok.t === 'i') return <em key={i}>{inner}</em>;
    return <React.Fragment key={i}>{inner}</React.Fragment>;
  });
}

/* ---------- expressive text + footnotes + items ----------
   {scream:...} {whisper:...} {tremble:...} {cold:...} {glow:...} {fade:...}
   {item:a notable object mention} — highlighted like a character/money chip,
   but with a fixed motif color instead of a per-character hue.
   [fn:term|historical note] */
export const TOK_RE = /\{(scream|whisper|tremble|cold|glow|fade):([^}]+)\}|\{item:([^}]+)\}|\[fn:([^\]|]+)\|([^\]]+)\]/;
export function FxSpan({ kind, children }) {
  const [ref, on] = useInView();
  return <span ref={ref} className={'fx fx-' + kind + (on ? ' fx-live' : '')}>{children}</span>;
}

export function renderRich(text, ctx) {
  const parts = []; let rest = text;
  while (rest.length) {
    const m = rest.match(TOK_RE);
    if (!m) { parts.push({ x: rest }); break; }
    if (m.index > 0) parts.push({ x: rest.slice(0, m.index) });
    if (m[1] !== undefined) parts.push({ fx: m[1], x: m[2] });
    else if (m[3] !== undefined) parts.push({ item: m[3] });
    else parts.push({ fn: m[4], note: m[5] });
    rest = rest.slice(m.index + m[0].length);
  }
  return parts.map((p, i) => {
    if (p.fx) return <FxSpan key={'fx' + i} kind={p.fx}>{renderMd(p.x, ctx)}</FxSpan>;
    if (p.item) return <span key={'it' + i} className="chip chip-item">{renderMd(p.item, ctx)}</span>;
    if (p.fn) return (
      <span key={'fn' + i} className="chip-note"
        onClick={(e) => { e.stopPropagation(); ctx.onNote(e, { term: p.fn, note: p.note }); }}>
        {p.fn}<sup>°</sup>
      </span>
    );
    return <React.Fragment key={i}>{renderMd(p.x, ctx)}</React.Fragment>;
  });
}

/* ---------- mention counts ----------
   getBook() rebuilds every chapter object from disk on each request, so a
   large book's [book]-keyed useMemo would otherwise rescan all chapters on
   every router.refresh() (e.g. each time a background chapter finishes
   formatting). A formatted chapter's blocks never change once written, so
   its mention counts are cached by bookId:stem and reused across refreshes;
   only newly-formatted or still-`unformatted` chapters get rescanned. */
const mentionsPerChapterCache = new Map();

export function computeMentions(book) {
  const idx = buildCharIndex(book);
  const scanInto = (blocks, into) => {
    const scan = (s) => { idx.re.lastIndex = 0; let m; while ((m = idx.re.exec(s))) { const k = idx.map[m[0]]; into[k] = (into[k] || 0) + 1; } };
    blocks.forEach((b) => {
      if (typeof b === 'string') scan(b);
      else if (b.t === 'letter') b.lines.forEach(scan);
    });
  };
  const counts = {};
  book.chapters.forEach((ch) => {
    const cacheKey = !ch.unformatted && ch.stem && book.id + ':' + ch.stem;
    let chCounts = cacheKey && mentionsPerChapterCache.get(cacheKey);
    if (!chCounts) {
      chCounts = {};
      scanInto(ch.blocks, chCounts);
      if (cacheKey) mentionsPerChapterCache.set(cacheKey, chCounts);
    }
    Object.entries(chCounts).forEach(([k, v]) => { counts[k] = (counts[k] || 0) + v; });
  });
  return counts;
}

export function useInView() {
  const ref = rtRef(null); const [on, setOn] = rtState(false);
  rtEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return [ref, on];
}

/* ---------- TTS helpers ---------- */
export function cleanText(s) {
  return s
    .replace(/^\{say:[a-z0-9_]+\}\s*/i, '')
    .replace(/\{(?:scream|whisper|tremble|cold|glow|fade):([^}]+)\}/g, '$1')
    .replace(/\[fn:([^\]|]+)\|[^\]]*\]/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1');
}

/* infer a character's gender from honorific, for pronoun resolution */
export function charGender(c) {
  if (!c) return null;
  if (c.gender) return c.gender;
  const m = c.name || '';
  if (/^(Mrs\.|Miss\b|Lady\b)/.test(m)) return 'f';
  if (/^(Mr\.|Sir\b|Lord\b|Colonel\b|Col\.|Dr\.)/.test(m)) return 'm';
  return null;
}

/* assign each character a well-separated, stable hue (most-mentioned get the
   most distinct colors). Theme controls lightness/chroma in CSS. */
export const SPK_HUES = [28, 248, 150, 330, 92, 200, 8, 278, 52, 178, 116, 300, 68, 224];
export function assignHues(book, mentions) {
  const keys = Object.keys(book.characters)
    .sort((a, b) => ((mentions && mentions[b]) || 0) - ((mentions && mentions[a]) || 0));
  const h = {};
  keys.forEach((k, i) => { h[k] = i < SPK_HUES.length ? SPK_HUES[i] : Math.round((i * 137.508) % 360); });
  return h;
}

/* short, characterful label for a speaker tag — prefer a given name / nickname;
   keep the honorific (Mr./Mrs.) when that's the only thing distinguishing two people */
export function speakerLabel(c) {
  const aliases = (c.aliases && c.aliases.length ? c.aliases : [c.name]);
  const HON = /^(Mr|Mrs|Miss|Sir|Lady|Lord|Colonel|Dr|Col)\.?\s/i;
  const given = aliases.filter((a) => !HON.test(a)).sort((a, b) => a.length - b.length);
  if (given.length) return given[0];
  return aliases.slice().sort((a, b) => a.length - b.length)[0] || c.name;
}

export const SPEECH_VERB = /\b(said|says|cried|cries|replied|replies|returned|returns|observed|continued|added|answered|answers|asked|asks|exclaimed|repeated|repeats|protested|whispered|murmured|declared|rejoined|resumed|interrupted|remarked|insisted|called|pursued|went on)\b/i;
export const QUOTE_RE = /“[^”]*”|"[^"]*"/g;

/* split a paragraph into [isQuote, text] runs */
export function splitQuotes(text) {
  const segs = []; let last = 0, m; QUOTE_RE.lastIndex = 0;
  while ((m = QUOTE_RE.exec(text))) {
    if (m.index > last) segs.push([false, text.slice(last, m.index)]);
    segs.push([true, m[0]]);
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push([false, text.slice(last)]);
  return segs;
}

/* Resolve who speaks each quoted paragraph, chapter by chapter, so context flows.
   Returns { [ci]: { [pi]: { k:key|null, lab:bool } } }.
   Strategy: explicit {say:key} tag → named speaker in narration (nearest a speech
   verb) → pronoun (he/she) to the last male/female speaker → alternation in a
   two-person exchange. lab=true when the speaker changes (so a name tag shows). */
/* cache is keyed on bookId:stem, same rationale as mentionsPerChapterCache
   above — a formatted chapter's dialogue attribution never changes once
   written, so it's safe (and necessary for a 1000+ chapter book) to compute
   it once and reuse across every later router.refresh(). */
const dialoguePerChapterCache = new Map();

function computeChapterDialogue(book, idx, ch) {
  const map = {};
  let recent = [], lastM = null, lastF = null, prevKey = undefined, prevQuote = false;
  ch.blocks.forEach((b, pi) => {
    if (typeof b !== 'string') { prevQuote = false; return; }
    if (!/[“"]/.test(b)) { prevQuote = false; return; }
    const narr = b.replace(QUOTE_RE, '  ');   // attribute only from narration, never inside quotes
    let key = null;

    const ov = b.match(/^\{say:([a-z0-9_]+)\}/i);
    if (ov) key = canonicalCharKey(book, ov[1]);

    if (!key) {
      idx.re.lastIndex = 0; let mm; const names = [];
      while ((mm = idx.re.exec(narr))) names.push({ k: idx.map[mm[0]], i: mm.index });
      if (names.length) {
        const vm = narr.match(SPEECH_VERB);
        if (vm) { const vi = vm.index; names.sort((a, b) => Math.abs(a.i - vi) - Math.abs(b.i - vi)); }
        key = names[0].k;
      }
    }
    if (!key) {
      if (/\b(she|her|herself)\b|his\s+(lady|wife|mother|sister|daughter)|her\s+ladyship/i.test(narr)) key = lastF;
      else if (/\b(he|him|himself)\b|his\s+(friend|father|brother|son)/i.test(narr)) key = lastM;
    }
    if (!key && prevQuote) key = recent[1] || recent[0] || null;   // alternation

    /* show a chat-style speaker prefix on every turn change in an exchange —
       even when the prose also names the speaker — so the reader always sees
       who is talking. (renderProse only paints it when the line opens on a quote.) */
    const lab = key != null && key !== prevKey;
    map[pi] = { k: key, lab };
    if (key) {
      const g = charGender(book.characters[key]);
      if (g === 'm') lastM = key; else if (g === 'f') lastF = key;
      recent = [key, ...recent.filter((k) => k !== key)].slice(0, 4);
    }
    prevKey = key; prevQuote = true;
  });
  return map;
}

export function computeDialogue(book) {
  const idx = buildCharIndex(book);
  const out = {};
  book.chapters.forEach((ch, ci) => {
    const cacheKey = !ch.unformatted && ch.stem && book.id + ':' + ch.stem;
    let map = cacheKey && dialoguePerChapterCache.get(cacheKey);
    if (!map) {
      map = computeChapterDialogue(book, idx, ch);
      if (cacheKey) dialoguePerChapterCache.set(cacheKey, map);
    }
    out[ci] = map;
  });
  return out;
}

/* render a narrative paragraph with speaker-colored dialogue + optional name tag */
export function renderProse(text, ctx) {
  const t = text.replace(/^\{say:[a-z0-9_]+\}\s*/i, '');
  if (!ctx.dialogue) return renderRich(t, ctx);
  /* if an expressive token wraps a quote (e.g. {whisper:“…”}), splitting on quotes
     would corrupt the token — render whole, uncolored, and keep the effect intact */
  if (/\{(?:scream|whisper|tremble|cold|glow|fade):[^}]*["“]/.test(t)) return renderRich(t, ctx);
  const segs = splitQuotes(t);
  if (!segs.some((s) => s[0])) return renderRich(t, ctx);
  const key = ctx.speaker != null ? ctx.speaker : null;
  const hue = key != null && ctx.hues ? ctx.hues[key] : null;
  const c = key != null && ctx.characters ? ctx.characters[key] : null;
  const out = []; let shownLabel = false, narrSeen = false;
  segs.forEach((s, i) => {
    if (!s[0]) { if (s[1].trim()) narrSeen = true; out.push(<React.Fragment key={'n' + i}>{renderRich(s[1], ctx)}</React.Fragment>); return; }
    if (ctx.showLabel && ctx.dialogueLabel && c && !shownLabel && !narrSeen) {
      out.push(<span key={'l' + i} className="say-label" style={{ '--spk-h': hue }}>{speakerLabel(c)}</span>);
      shownLabel = true;
    }
    out.push(
      <span key={'q' + i} className={'say' + (key == null ? ' say-unknown' : '')}
        style={key != null ? { '--spk-h': hue } : undefined}
        title={c ? c.name : 'Dialogue'}>{renderRich(s[1], { ...ctx, dialogue: false })}</span>
    );
  });
  return out;
}
