/* Tiny dependency-free fuzzy matcher for the instant-lookup directory.
   Deliberately forgiving: exact substrings rank highest, then in-order
   subsequences ("hmr" → HoMeRton), then one-typo words ("marys" → Mare's)
   via a bounded edit distance. Every matcher returns a score plus the
   matched character indices so the UI can highlight them. */

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const isWordCh = (c) => /[a-z0-9]/.test(c);

const range = (at, len) => Array.from({ length: len }, (_, i) => at + i);

/* Levenshtein distance capped at `max` — returns max+1 as soon as a full
   row exceeds the cap so long strings bail out early. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/* In-order subsequence match. Each query char takes the next occurrence,
   preferring a continuation of the current run, then a word start; scoring
   rewards runs and word starts and penalises gaps. Rejected below a density
   threshold so scattered coincidental matches don't surface as results. */
function subsequence(q, t) {
  const indices = [];
  let score = 0;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    let at = -1;
    for (let k = prev < 0 ? 0 : prev + 1; k < t.length; k++) {
      if (t[k] !== q[qi]) continue;
      if (at === -1) at = k;
      if (k === prev + 1 || k === 0 || !isWordCh(t[k - 1])) { at = k; break; }
    }
    if (at === -1) return null;
    const wordStart = at === 0 || !isWordCh(t[at - 1]);
    score += 3 + (at === prev + 1 ? 4 : 0) + (wordStart ? 5 : 0);
    if (prev >= 0 && at !== prev + 1) score -= Math.min(4, (at - prev - 1) * 0.5);
    indices.push(at);
    prev = at;
  }
  const span = indices[indices.length - 1] - indices[0] + 1;
  if (span > q.length * 3 || score < q.length * 3) return null;
  return { score: Math.min(score, 55), indices };
}

/* Typo tolerance: a query token within edit distance 1 (2 for long tokens)
   of any word in the text — or of that word's prefix, so partially-typed
   words with a typo still land. */
function typoMatch(q, t) {
  if (q.length < 4) return null;
  const max = q.length >= 8 ? 2 : 1;
  const re = /[a-z0-9]+/g;
  let m;
  while ((m = re.exec(t))) {
    const w = m[0];
    const dFull = editDistance(q, w, max);
    const dPrefix = editDistance(q, w.slice(0, q.length), max);
    const d = Math.min(dFull, dPrefix);
    if (d <= max) {
      const hlLen = dPrefix <= dFull ? Math.min(q.length, w.length) : w.length;
      return { score: 30 - d * 6 + (m.index === 0 ? 4 : 0), indices: range(m.index, hlLen) };
    }
  }
  return null;
}

/* Best match of one query token against one text: substring > subsequence > typo. */
export function matchToken(q, t) {
  const at = t.indexOf(q);
  if (at !== -1) {
    const wordStart = at === 0 || !isWordCh(t[at - 1]);
    return { score: 60 + (wordStart ? 25 : 0) + Math.max(0, 10 - at), indices: range(at, q.length) };
  }
  return subsequence(q, t) || typoMatch(q, t);
}

/* Rank directory entries against a free-form query. Every whitespace-separated
   token must match at least one field of an entry; the entry's score is the
   sum of each token's best weighted field match. Matches on the entry name
   also report their character indices for highlighting. */
export function searchDirectory(query, entries) {
  /* drop tokens with no letters or digits (stray punctuation, emoji) so
     they don't veto every entry under the all-tokens-must-match rule */
  const tokens = norm(query).trim().split(/\s+/).filter((t) => /[a-z0-9]/.test(t));
  if (!tokens.length) return [];
  const results = [];
  for (const entry of entries) {
    const fields = [
      { text: norm(entry.name), weight: 1, isName: true },
      { text: norm((entry.keywords || []).join(' ')), weight: 0.85 },
      { text: norm(entry.category), weight: 0.7 },
      { text: norm(entry.where || ''), weight: 0.6 },
      { text: (entry.phone || '').replace(/\D/g, ''), weight: 0.9, isPhone: true },
    ];
    let total = 0;
    const nameIndices = [];
    let allMatched = true;
    for (const token of tokens) {
      let best = null;
      for (const f of fields) {
        if (!f.text) continue;
        let m = null;
        if (f.isPhone) {
          const digits = token.replace(/\D/g, '');
          if (digits.length >= 2 && f.text.includes(digits)) m = { score: 70, indices: [] };
        } else {
          m = matchToken(token, f.text);
        }
        if (m) {
          const weighted = m.score * f.weight;
          if (!best || weighted > best.weighted) best = { weighted, indices: m.indices, isName: f.isName };
        }
      }
      if (!best) { allMatched = false; break; }
      total += best.weighted;
      if (best.isName) nameIndices.push(...best.indices);
    }
    if (allMatched) results.push({ entry, score: total + (entry.boost || 0), nameIndices: new Set(nameIndices) });
  }
  results.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return results;
}
