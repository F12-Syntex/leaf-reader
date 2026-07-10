'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { APP_DEFAULTS } from '@/lib/constants';
import { loadGlobal, loadBook, loadLib, saveLib } from '@/lib/storage';
import { ICONS as I } from '@/components/icons';
import BookCard from './BookCard';
import InstantLookup from './InstantLookup';

function bookStat(b) {
  const st = loadBook(b.id);
  const total = b.chapterCount || 0;
  const readCount = (st.read || []).length;
  const readPct = total ? Math.round((readCount / total) * 100) : 0;
  const pct = Math.max(Math.round((st.overall || 0) * 100), readPct);
  const done = total > 0 && readCount >= total;
  const mins = b.minutes || 0;
  return { total, readCount, pct, done, started: pct > 0 || readCount > 0, mins, at: st.at || 0 };
}

export default function LibraryView({ initialBooks }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState('paper');
  const [shelf, setShelf] = useState([]);
  const [favs, setFavs] = useState([]);

  /* read localStorage only after mount — reading it during SSR would either
     crash (no `window`) or, if guarded, produce a hydration mismatch between
     the server's empty-state render and the client's real localStorage data.
     Gating on `mounted` means the server (and the client's first paint) both
     render the same "Loading…" shell, then this effect swaps in real data. */
  /* eslint-disable react-hooks/set-state-in-effect -- deliberate one-time client-only
     hydration of localStorage-derived state; see the comment above */
  useEffect(() => {
    setTheme(loadGlobal().theme || 'paper');
    const l = loadLib();
    const savedShelf = Array.isArray(l.shelf) ? l.shelf.slice() : [];
    const missing = initialBooks.map((b) => b.id).filter((id) => !savedShelf.includes(id));
    setShelf(missing.length ? [...missing, ...savedShelf] : savedShelf);
    setFavs(Array.isArray(l.favs) ? l.favs : []);
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!mounted) return;
    saveLib({ shelf, favs });
  }, [shelf, favs, mounted]);

  const removeBook = (id, e) => {
    e && e.stopPropagation();
    setShelf((s) => s.filter((x) => x !== id));
    setFavs((f) => f.filter((x) => x !== id));
  };

  const appStyle = { '--accent': APP_DEFAULTS.accent };
  const skinAttr = APP_DEFAULTS.skin.toLowerCase();

  if (!mounted) {
    return (
      <div className="app" data-theme={theme} data-skin={skinAttr} style={appStyle}>
        <div className="lib">
          <div className="lib-inner">
            <div className="lib-empty">
              <div className="lib-empty-orn">❦</div>
              <div className="lib-empty-t">Loading…</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const shelfBooks = initialBooks.filter((b) => shelf.includes(b.id));
  const stats = {};
  shelfBooks.forEach((b) => { stats[b.id] = bookStat(b); });
  const inProgress = shelfBooks
    .filter((b) => stats[b.id].started && !stats[b.id].done)
    .sort((a, b) => (stats[b.id].at - stats[a.id].at) || (stats[b.id].pct - stats[a.id].pct));
  const heroBook = inProgress[0] || null;
  const restBooks = shelfBooks.filter((b) => !heroBook || b.id !== heroBook.id);
  const finishedN = shelfBooks.filter((b) => stats[b.id].done).length;
  const totalMins = shelfBooks.reduce((n, b) => n + stats[b.id].mins, 0);
  const hrs = Math.round(totalMins / 60);
  const timePhrase = totalMins >= 60 ? '~' + hrs + ' hr' + (hrs === 1 ? '' : 's') : '~' + totalMins + ' min';

  return (
    <div className="app" data-theme={theme} data-skin={skinAttr} style={appStyle}>
      <div className="lib">
        <div className="lib-inner">
          <div className="lib-top">
            <div>
              <div className="lib-eyebrow">Library</div>
              <h1 className="lib-title">Your shelf</h1>
              {shelfBooks.length > 0 && (
                <div className="lib-substat">
                  {shelfBooks.length} {shelfBooks.length === 1 ? 'book' : 'books'}
                  {finishedN > 0 && <span> · {finishedN} finished</span>}
                  <span> · {timePhrase} of reading</span>
                </div>
              )}
            </div>
          </div>

          {shelfBooks.length === 0 ? (
            <div className="lib-empty">
              <div className="lib-empty-orn">❦</div>
              <div className="lib-empty-t">Your shelf is empty</div>
              <div className="lib-empty-s">No books yet — run <code>/addbook &lt;path&gt;</code> in Claude Code to add one.</div>
            </div>
          ) : (
            <>
              {heroBook && (() => {
                const s = stats[heroBook.id];
                const minsLeft = Math.max(1, Math.round(s.mins * (1 - s.pct / 100)));
                return (
                  <Link href={`/book/${heroBook.id}`} className="lib-hero">
                    <div className="lib-hero-coverwrap">
                      <div className="bk-cover" style={{ '--bk': heroBook.tint }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="bk-img" src={`/books/${heroBook.id}/images/cover.jpg`} alt={heroBook.title + ' cover'}
                          ref={(el) => { if (el && el.complete && el.naturalWidth > 0) el.parentNode.classList.add('hasimg'); }}
                          onLoad={(e) => e.currentTarget.parentNode.classList.add('hasimg')}
                          onError={(e) => e.currentTarget.remove()} />
                        <div className="bk-author">{heroBook.author}</div>
                        <div className="bk-name">{heroBook.title}</div>
                        <div className="bk-orn">{heroBook.title[0]}</div>
                      </div>
                    </div>
                    <div className="lib-hero-body">
                      <div className="lib-hero-eyebrow">{I.clock}<span>Continue reading</span></div>
                      <h2 className="lib-hero-title">{heroBook.title}</h2>
                      <div className="lib-hero-author">{heroBook.author}</div>
                      <div className="lib-hero-prog">
                        <div className="bar"><i style={{ width: s.pct + '%' }} /></div>
                        <span className="lib-hero-pct">{s.pct}%</span>
                      </div>
                      <div className="lib-hero-foot">
                        <span className="lib-hero-resume">{I.play}<span>Resume reading</span></span>
                        <span className="lib-hero-left">{I.clock}<span>~{minsLeft} min left</span></span>
                      </div>
                    </div>
                  </Link>
                );
              })()}
              <div className="lib-section">
                {heroBook && <div className="lib-sec-label"><span>On your shelf</span><i className="lib-sec-n">{restBooks.length}</i></div>}
                <div className="lib-grid">
                  {restBooks.map((b) => <BookCard key={b.id} book={b} onRemove={removeBook} />)}
                </div>
              </div>
            </>
          )}

          <InstantLookup />
        </div>
      </div>
    </div>
  );
}
