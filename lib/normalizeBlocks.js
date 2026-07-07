/* Correction system for OpenRouter chapter formatting.

   The model is meant to emit typed blocks ({"t":"break"}, {"t":"statcard",...})
   as real JSON objects in the blocks array, inline tokens ({say:key},
   {whisper:...}, *italics*) inside paragraph strings, and nothing else. In
   practice it drifts in several recurring ways:

     - echoes block syntax as literal TEXT inside a paragraph, in any of three
       spellings: {t:'break'} (JS single-quote), {t:"break"} (unquoted keys,
       double-quoted values), or {"t":"break"} (real JSON) — readers were
       seeing this raw
     - invents its own object schema, most commonly {"say":"key","text":"..."}
       instead of a tagged string (whole chapters have come back this way)
     - puts a {say:} tag mid-sentence, or on narration with no quoted speech
     - wraps output in markdown code fences
     - invents inline tags outside the vocabulary ({sob:...}, {gasp:...})

   normalizeBlocks() repairs all of these. It is applied both when writing
   freshly-formatted chapters (app/api/format-chapter) and when reading
   existing ones (lib/books.js), so already-written files self-heal without a
   re-format. auditBlocks() reports anything that still looks broken after a
   pass, so the API route can reject/retry a hopeless response. */

/* ---------------- inline-token vocabulary ---------------- */

export const FX_KINDS = [
  'scream', 'whisper', 'tremble', 'cold', 'glow', 'fade',
  'echo', 'chant', 'blood', 'divine', 'shadow', 'thunder', 'ancient', 'tiny', 'mind',
];

const INLINE_ALLOWED = new Set([...FX_KINDS, 'say', 'item']);

/* ---------------- tolerant field parsing for leaked literals ----------------
   Accepts 'single', "double", bare-identifier, and numeric values, with
   optionally-quoted keys — covers every spelling the model has leaked. */

function fieldOf(literal, name) {
  /* (?<!\w) anchors the field name so e.g. "x" never matches inside "fx" */
  const key = `(?<!\\w)["']?${name}["']?`;
  let m = literal.match(new RegExp(key + `\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
  if (m) return m[1].replace(/\\'/g, "'");
  m = literal.match(new RegExp(key + `\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (m) return m[1].replace(/\\"/g, '"');
  m = literal.match(new RegExp(key + `\\s*:\\s*(-?\\d+(?:\\.\\d+)?)\\s*(?:[,}\\]]|$)`));
  if (m) return Number(m[1]);
  m = literal.match(new RegExp(key + `\\s*:\\s*([a-zA-Z_][\\w]*)\\s*(?:[,}\\]]|$)`));
  if (m) return m[1];
  return undefined;
}

function linesOf(literal, name) {
  const m = literal.match(new RegExp(`(?<!\\w)["']?${name}["']?\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return undefined;
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let mm;
  while ((mm = re.exec(m[1]))) out.push((mm[1] ?? mm[2]).replace(/\\(['"])/g, '$1'));
  return out;
}

function parseLeakedBlock(literal) {
  const t = fieldOf(literal, 't');
  if (typeof t !== 'string') return null;
  const obj = { t };
  ['x', 'label', 'by', 'fx', 'char', 'from', 'to', 'sign', 'dist', 'note', 'title', 'source']
    .forEach((f) => { const v = fieldOf(literal, f); if (v !== undefined) obj[f] = v; });
  ['lines', 'chars', 'meta'].forEach((f) => { const v = linesOf(literal, f); if (v !== undefined) obj[f] = v; });
  const itemsMatch = literal.match(/["']?items["']?\s*:\s*\[([\s\S]*)\]/);
  if (itemsMatch) {
    const items = [];
    const itemRe = /\{[^{}]*\}/g;
    let m;
    while ((m = itemRe.exec(itemsMatch[1]))) {
      const label = fieldOf(m[0], 'label'), value = fieldOf(m[0], 'value');
      if (label !== undefined) items.push({ label: String(label), value: String(value ?? '') });
    }
    obj.items = items;
  }
  return validateBlock(obj);
}

/* splits text on {...} spans that look like typed blocks (brace-matched,
   quote-aware so commas/braces inside string values don't confuse it),
   converting each into a real block object and leaving surrounding prose as
   plain text. Matches {t:...}, {t":...}, {"t":...} and { t : ... } spellings. */
const LEAK_START_RE = /\{\s*["']?t["']?\s*:/;

function splitLeakedTypedBlocks(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const m = rest.match(LEAK_START_RE);
    if (!m) { out.push(rest); break; }
    const start = i + m.index;
    if (start > i) out.push(text.slice(i, start));
    let depth = 0, j = start, inStr = null;
    for (; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
      if (c === "'" || c === '"') { inStr = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    const literal = text.slice(start + 1, j - 1);
    const parsed = parseLeakedBlock(literal);
    if (parsed) out.push(parsed);
    /* unparseable literal is dropped rather than kept — raw block syntax must
       never reach the page, and it carries no prose the reader would miss */
    i = j;
  }
  return out;
}

/* ---------------- quoted-thought demotion ----------------
   The model sometimes ADDS quotation marks (and a {say:} tag) to internal
   monologue the source never quoted — "...," Klein silently retorted, but he
   didn't say it out loud. A quote whose trailing narration reports it as
   unspoken is demoted to the established italic-thought style (*...*, no
   quotes); with no quotes left, normalizeString then drops the {say:} tag. */

const ANY_QUOTE_RE = /“[^”]*”|"[^"]*"/g;
const THOUGHT_CUE = /\b(?:silently|inwardly|wordlessly|to (?:himself|herself)|in (?:his|her) (?:mind|heart)|didn.t say|without (?:saying|speaking)|(?:he|she|[A-Z][a-z]+) (?:thought|mused|wondered)(?!\s+(?:aloud|out loud)))\b/;
const SPOKEN_CUE = /\b(?:said|asked|replied|shouted|exclaimed|answered|called|cried|spoke|says|voice)\b/i;

function demoteThoughtQuotes(text) {
  return text.replace(ANY_QUOTE_RE, (q, offset) => {
    /* only the clause immediately after the closing quote decides — a thought
       cue further along (or one before the quote, as in "X silently retorted,
       manipulating ... to speak, "real speech"") must not demote real speech */
    const clause = text.slice(offset + q.length).split(/[.!?](?:\s|$)/)[0].slice(0, 120);
    const cue = clause.match(THOUGHT_CUE);
    if (!cue || SPOKEN_CUE.test(clause.slice(0, cue.index))) return q;
    const inner = q.slice(1, -1);
    /* already italic-wrapped (*“...”*) → just strip the quote marks */
    const wrapped = text[offset - 1] === '*' && text[offset + q.length] === '*';
    return wrapped ? inner : '*' + inner + '*';
  });
}

/* ---------------- string scrubbing ---------------- */

function scrubString(text) {
  let s = text;
  /* markdown code fences (with or without a language tag) */
  s = s.replace(/```[a-z]*\n?/gi, '');
  /* unknown inline tags ({sob:...}, {gasp:...}) → unwrap, keep the words.
     Runs repeatedly for nesting; {t:...} spans were split out before this. */
  const unknownTag = /\{([a-zA-Z][a-zA-Z0-9_-]*):([^{}]*)\}/g;
  let prev;
  do {
    prev = s;
    s = s.replace(unknownTag, (m, tag, inner) =>
      INLINE_ALLOWED.has(tag.toLowerCase()) ? m : inner);
  } while (s !== prev);
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s;
}

/* ---------------- typed-block validation ----------------
   Coerces every known block type to its canonical field shape; salvages the
   prose out of unknown/invented shapes; returns null for anything that has
   nothing renderable in it. */

const str = (v) => typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : undefined);
const strArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) :
  (typeof v === 'string' && v.trim() ? [v] : []);
const num10 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : undefined; };
const lowKey = (v) => typeof v === 'string' && v.trim() ? v.trim().toLowerCase().replace(/\s+/g, '_') : undefined;

const SCENE_FX = new Set(['rain', 'candles', 'fog', 'snow', 'embers', 'moonlight']);

export function validateBlock(b) {
  if (!b || typeof b !== 'object') return null;

  /* invented dialogue-object schema → tagged paragraph string */
  const sayKey = lowKey(b.say ?? b.speaker);
  const sayText = str(b.text ?? b.x ?? b.p);
  if (!b.t && sayKey && sayText) return `{say:${sayKey}} ${sayText}`;
  if (!b.t && sayText) return sayText;

  const t = typeof b.t === 'string' ? b.t.toLowerCase() : null;
  switch (t) {
    case 'break': return { t: 'break' };
    case 'timeskip': { const x = str(b.x) || str(b.label); return x ? { t: 'timeskip', x } : { t: 'break' }; }
    case 'quote': { const x = str(b.x) || str(b.text); if (!x) return null;
      const out = { t: 'quote', x }; const by = str(b.by); if (by) out.by = by; return out; }
    case 'scene': { const x = str(b.x) || str(b.text); if (!x) return null;
      const out = { t: 'scene', label: str(b.label) || '', x };
      if (typeof b.fx === 'string' && SCENE_FX.has(b.fx.toLowerCase())) out.fx = b.fx.toLowerCase();
      return out; }
    case 'statcard': { const char = lowKey(b.char); return char ? { t: 'statcard', char } : null; }
    case 'statrow': { const chars = strArr(b.chars).map(lowKey).filter(Boolean);
      if (!chars.length) return null;
      return chars.length === 1 ? { t: 'statcard', char: chars[0] } : { t: 'statrow', chars }; }
    case 'delta': { const char = lowKey(b.char), from = num10(b.from), to = num10(b.to);
      if (!char || from === undefined || to === undefined) return null;
      return { t: 'delta', char, label: str(b.label) || 'Condition', from, to, note: str(b.note) || '' }; }
    case 'journey': { const from = str(b.from), to = str(b.to); if (!from || !to) return null;
      const out = { t: 'journey', from, to, dist: str(b.dist) || '' };
      const meta = strArr(b.meta); if (meta.length) out.meta = meta; return out; }
    case 'letter': { const lines = strArr(b.lines).map(scrubString);
      return { t: 'letter', from: lowKey(b.from) || '', to: str(b.to) || '', sign: str(b.sign) || '', lines }; }
    case 'uistat': { const items = (Array.isArray(b.items) ? b.items : [])
        .map((it) => it && typeof it === 'object' && str(it.label) !== undefined
          ? { label: str(it.label), value: str(it.value) ?? '' } : null)
        .filter(Boolean);
      return items.length ? { t: 'uistat', items } : null; }
    /* --- newer block types --- */
    case 'sfx': { const x = str(b.x) || str(b.text); return x ? { t: 'sfx', x } : null; }
    case 'dream': { const x = str(b.x) || str(b.text); if (!x) return null;
      const out = { t: 'dream', x }; const label = str(b.label); if (label) out.label = label; return out; }
    case 'flashback': { const x = str(b.x) || str(b.text); if (!x) return null;
      const out = { t: 'flashback', x }; const label = str(b.label); if (label) out.label = label; return out; }
    case 'ritual': { const lines = strArr(b.lines).length ? strArr(b.lines) : strArr(b.x);
      return lines.length ? { t: 'ritual', lines } : null; }
    case 'poem': { const lines = strArr(b.lines).length ? strArr(b.lines) : strArr(b.x);
      return lines.length ? { t: 'poem', lines } : null; }
    case 'sys': { const lines = strArr(b.lines).length ? strArr(b.lines) : strArr(b.x);
      return lines.length ? { t: 'sys', lines } : null; }
    case 'sign': { const x = str(b.x) || str(b.text); return x ? { t: 'sign', x } : null; }
    case 'news': { const x = str(b.x) || str(b.text); if (!x) return null;
      const out = { t: 'news', x };
      const title = str(b.title); if (title) out.title = title;
      const source = str(b.source); if (source) out.source = source;
      return out; }
    default: {
      /* unknown/invented type — salvage whatever prose it carries */
      const x = str(b.x) || str(b.text);
      if (x) return x;
      const lines = strArr(b.lines);
      if (lines.length) return lines.join('\n');
      return null;
    }
  }
}

/* ---------------- main pass ---------------- */

export function normalizeBlocks(blocks) {
  const out = [];
  const push = (v) => {
    if (v == null) return;
    if (typeof v !== 'string') { out.push(v); return; }
    const s = v.trim();
    if (s) out.push(s);
  };

  for (const b of blocks || []) {
    if (typeof b !== 'string') {
      const fixed = validateBlock(b);
      /* validation can demote an object to a paragraph string — run that
         string back through the same scrubbing as native strings */
      if (typeof fixed === 'string') normalizeString(fixed, push);
      else push(fixed);
      continue;
    }
    normalizeString(b, push);
  }
  return out;
}

function normalizeString(text, push) {
  let sayKey = null;
  let s = text.replace(/\{\{?say:([a-zA-Z0-9_ -]+)\}?\}/gi, (m, k) => {
    if (!sayKey) sayKey = lowKey(k);
    return '';
  });

  const parts = LEAK_START_RE.test(s) ? splitLeakedTypedBlocks(s) : [s];
  let first = true;
  parts.forEach((p) => {
    if (typeof p !== 'string') { push(p); return; }
    const t = demoteThoughtQuotes(scrubString(p)).trim();
    if (!t) return;
    /* the model sometimes tags {say:key} on plain narration with no actual
       quoted speech in it — that's not dialogue, so drop the tag rather
       than falsely attributing a "speaker" to a paragraph nobody says. */
    const keep = first && sayKey && /["“”]/.test(t);
    push(keep ? `{say:${sayKey}} ${t}` : t);
    first = false;
  });
}

/* ---------------- audit ----------------
   Post-normalize sanity check used by the format API to decide whether a
   model response is usable. Returns a list of issue strings (empty = clean). */

export function auditBlocks(blocks) {
  const issues = [];
  (blocks || []).forEach((b, i) => {
    if (typeof b === 'string') {
      if (LEAK_START_RE.test(b)) issues.push(`block ${i}: leaked typed-block syntax`);
      if (/\{\s*"(?:say|text|label|value)"\s*:/.test(b)) issues.push(`block ${i}: raw JSON in prose`);
      if (/\{say:[^}]*\}/i.test(b) && !/^\{say:/i.test(b)) issues.push(`block ${i}: mid-paragraph say tag`);
    } else if (!b || typeof b.t !== 'string') {
      issues.push(`block ${i}: non-string block without a type`);
    }
  });
  return issues;
}

/* rough word count of the readable prose in a blocks array — used to detect
   truncated/paraphrased model output by comparing against the original */
export function wordsInBlocks(blocks) {
  let n = 0;
  const count = (s) => { n += String(s).split(/\s+/).filter(Boolean).length; };
  (blocks || []).forEach((b) => {
    if (typeof b === 'string') count(b);
    else if (b && Array.isArray(b.lines)) b.lines.forEach(count);
    else if (b && typeof b.x === 'string') count(b.x);
  });
  return n;
}
