'use client';

import { useMemo, useState } from 'react';
import { DIRECTORY, LOOKUP_CATEGORIES } from '@/lib/lookupDirectory';
import { searchDirectory } from '@/lib/fuzzy';
import { ICONS as I } from '@/components/icons';

const telHref = (phone) => 'tel:' + phone.replace(/[^\d+]/g, '');

/* wrap the fuzzy-matched characters of a name in highlight spans */
function highlightName(name, indices) {
  if (!indices || indices.size === 0) return name;
  const out = [];
  let buf = '';
  let marking = false;
  for (let i = 0; i <= name.length; i++) {
    const hit = i < name.length && indices.has(i);
    if (hit !== marking || i === name.length) {
      if (buf) out.push(marking ? <mark className="lookup-hl" key={i}>{buf}</mark> : buf);
      buf = '';
      marking = hit;
    }
    if (i < name.length) buf += name[i];
  }
  return out;
}

export default function InstantLookup() {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const pool = cat === 'All' ? DIRECTORY : DIRECTORY.filter((e) => e.category === cat);
    if (query.trim()) return searchDirectory(query, pool);
    return pool.map((entry) => ({ entry, nameIndices: null }));
  }, [query, cat]);

  const activeIdx = Math.min(active, Math.max(0, results.length - 1));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) { window.location.href = telHref(results[activeIdx].entry.phone); }
    else if (e.key === 'Escape') { setQuery(''); setActive(0); }
  };

  return (
    <section className="lookup" aria-label="Instant lookup directory">
      <div className="lookup-head">
        <div className="lib-sec-label"><span>Instant lookup</span><i className="lib-sec-n">{DIRECTORY.length}</i></div>
        <div className="lookup-sub">
          Fuzzy-search the Riverside Practice (Dr Goel, Upper Clapton E5) directory — hospitals,
          departments &amp; pharmacies. Try “homer”, “pha” or even a typo like “whipps crossx”.
        </div>
      </div>

      <div className="lookup-box">
        {I.search}
        <input
          className="lookup-input"
          type="text"
          value={query}
          placeholder="Type a name, department, keyword or number…"
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          aria-label="Search the practice directory"
        />
        {query && (
          <button className="lookup-clear" onClick={() => { setQuery(''); setActive(0); }} aria-label="Clear search">
            {I.x}
          </button>
        )}
      </div>

      <div className="lookup-cats" role="tablist" aria-label="Filter by category">
        {LOOKUP_CATEGORIES.map((c) => (
          <button key={c} className={'lookup-cat' + (cat === c ? ' on' : '')}
            onClick={() => { setCat(c); setActive(0); }}>
            {c}
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="lookup-none">
          No matches for “{query}” — try fewer letters, a keyword like “eye” or “blood”, or part of the number.
        </div>
      ) : (
        <div className="lookup-list">
          {results.map(({ entry, nameIndices }, i) => (
            <div key={entry.id} className={'lookup-row' + (query && i === activeIdx ? ' on' : '')}
              onMouseMove={() => setActive(i)}>
              <div className="lookup-row-main">
                <div className="lookup-name">
                  {highlightName(entry.name, nameIndices)}
                  <span className={'lookup-badge c-' + entry.category.toLowerCase()}>{entry.category}</span>
                </div>
                <div className="lookup-meta">{entry.note} · {entry.where}</div>
              </div>
              <a className="lookup-call" href={telHref(entry.phone)}>
                {I.phone}<span>{entry.phone}</span>
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
