/* Repairs malformed output from the /addbook OpenRouter formatting pass.
   The model is meant to emit typed blocks ({t:'break'}, {t:'statcard',...})
   as real JSON objects in the blocks array, and {say:charKey} only as a
   leading tag on a paragraph — in practice it sometimes echoes that JS-
   literal syntax as literal text instead (a whole paragraph that's just the
   string "{t:'break'}", or a {say:shimi} tag stuck mid-sentence). Applied
   both when writing freshly-formatted chapters and when reading existing
   ones, so already-written files self-heal without a re-format. */

function parseLeakedBlock(literal) {
  const typeMatch = literal.match(/^\s*t\s*:\s*'([a-zA-Z]+)'/);
  if (!typeMatch) return null;
  const type = typeMatch[1];

  const field = (name) => {
    /* \b anchors the field name so e.g. "x" doesn't match inside "fx"; the
       bare-identifier form (no quotes at all, e.g. char:veythor) also needs
       to accept end-of-string as its terminator, since that field may be
       the last one before the literal's own closing brace was stripped. */
    let m = literal.match(new RegExp('\\b' + name + "\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'"));
    if (m) return m[1].replace(/\\'/g, "'");
    m = literal.match(new RegExp('\\b' + name + '\\s*:\\s*([a-zA-Z_][\\w]*)\\s*(?:[,}]|$)'));
    if (m) return m[1];
    return undefined;
  };

  if (type === 'break') return { t: 'break' };
  if (type === 'timeskip') return { t: 'timeskip', x: field('x') || '' };
  if (type === 'statcard') { const char = field('char'); return char ? { t: 'statcard', char: char.toLowerCase() } : null; }
  if (type === 'quote') return { t: 'quote', x: field('x') || '', by: field('by') };
  if (type === 'scene') return { t: 'scene', label: field('label') || '', fx: field('fx'), x: field('x') || '' };
  if (type === 'letter') return { t: 'letter', from: (field('from') || '').toLowerCase(), to: field('to') || '', sign: field('sign') || '', lines: [] };
  if (type === 'uistat') {
    const items = [];
    const itemsMatch = literal.match(/items\s*:\s*\[([\s\S]*)\]/);
    if (itemsMatch) {
      const itemRe = /\{\s*label\s*:\s*'([^']*)'\s*,\s*value\s*:\s*'([^']*)'\s*\}/g;
      let m;
      while ((m = itemRe.exec(itemsMatch[1]))) items.push({ label: m[1], value: m[2] });
    }
    return { t: 'uistat', items };
  }
  return null;
}

/* splits text on {t:'...'...} spans (brace-matched, quote-aware so commas/
   braces inside string values don't confuse it), converting each into a
   real block object and leaving the surrounding prose as plain text */
function splitLeakedTypedBlocks(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{t:", i);
    if (start === -1) { out.push(text.slice(i)); break; }
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
    out.push(parsed || text.slice(start, j));
    i = j;
  }
  return out;
}

export function normalizeBlocks(blocks) {
  const out = [];
  for (const b of blocks || []) {
    if (typeof b !== 'string') { out.push(b); continue; }

    let text = b;
    let sayKey = null;
    text = text.replace(/\{\{?say:([a-zA-Z0-9_]+)\}?\}/gi, (m, k) => {
      if (!sayKey) sayKey = k.toLowerCase();
      return '';
    }).replace(/[ \t]{2,}/g, ' ').trim();

    const parts = /\{t:\s*'/.test(text) ? splitLeakedTypedBlocks(text) : [text];
    let first = true;
    parts.forEach((p) => {
      if (typeof p !== 'string') { out.push(p); return; }
      const t = p.trim();
      if (!t) return;
      /* the model sometimes tags {say:key} on plain narration with no actual
         quoted speech in it — that's not dialogue, so drop the tag rather
         than falsely attributing a "speaker" to a paragraph nobody says. */
      const keep = first && sayKey && /["“”]/.test(t);
      out.push(keep ? `{say:${sayKey}} ${t}` : t);
      first = false;
    });
  }
  return out;
}
