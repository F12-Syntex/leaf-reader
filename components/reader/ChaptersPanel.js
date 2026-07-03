'use client';

import { useEffect, useRef, useState } from 'react';
import { relMeta, relHeat } from '@/lib/constants';
import { readTime } from '@/lib/storage';
import { ICONS as I } from '@/components/icons';

/* windowed rendering — a 1000+ chapter book shouldn't mount 1000+ DOM rows
   just to show a contents list. Two spacer divs (sized off a fixed row
   height estimate) stand in for everything scrolled out of view, and only
   rows actually near the viewport are ever rendered. */
const ROW_H = 54;
const OVERSCAN = 14;

export default function ChaptersPanel({ book, cur, readSet, marks, tts, overall, onGoChap, onLibrary }) {
  const listRef = useRef(null);
  const total = book.chapters.length;
  const [range, setRange] = useState(() => {
    const start = Math.max(0, cur - OVERSCAN);
    return { start, end: Math.min(total, start + OVERSCAN * 2 + 20) };
  });
  const updateRange = () => {
    const el = listRef.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_H) - OVERSCAN);
    const visible = Math.ceil(el.clientHeight / ROW_H) + OVERSCAN * 2;
    setRange({ start, end: Math.min(total, start + visible) });
  };

  /* open the panel already scrolled to wherever you're actually reading,
     instead of always dropping you at chapter 1 */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, cur * ROW_H - el.clientHeight / 2 + ROW_H / 2);
    updateRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="panel">
      <div className="ch-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dh-author">{book.author}</div>
          <h2 className="dh-title">{book.title}</h2>
        </div>
        <div className="ch-head-r">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="lib-btn" onClick={onLibrary}>{I.lib} Library</button>
          </div>
          <div className="dh-prog">
            <div className="bar"><i style={{ width: (overall * 100) + '%' }} /></div>
            <span>{Math.round(overall * 100)}%</span>
          </div>
        </div>
      </div>
      <div className="ch-list" ref={listRef} onScroll={updateRange}>
        <div style={{ height: range.start * ROW_H }} />
        {book.chapters.slice(range.start, range.end).map((c, idx) => {
          const i = range.start + idx;
          const isRead = readSet.includes(i) && i !== cur;
          const m = c.unformatted ? null : relMeta(c.rel), h = c.unformatted ? null : relHeat(c.rel);
          return (
            <div key={i} className={'crow' + (i === cur ? ' cur' : '') + (isRead ? ' read' : '')} onClick={() => onGoChap(i)}>
              <div className="num">{String(i + 1).padStart(2, '0')}</div>
              <div className="crow-main">
                <div className="ctitle">{c.title}</div>
                <div className="ctime">
                  {isRead ? 'Read' : readTime(c) + ' min'}
                  {marks.includes(i) && <span className="bm">{I.bookmarkOn}</span>}
                </div>
              </div>
              {c.unformatted ? (
                <span className="chap-unformatted chap-unformatted-sm">Not processed</span>
              ) : (
                <span className={'rel rel-sm rel-' + m.cls} title={`Story relevance ${c.rel}/10 — ${m.label}`}>
                  <span className="rel-track"><i style={{ width: c.rel * 10 + '%', background: isRead ? 'var(--soft)' : h }}></i></span>
                  <span className="rel-n" style={{ color: isRead ? 'var(--soft)' : h }}>{c.rel}</span>
                </span>
              )}
              {tts.on && tts.chap === i ? <span className="now">Listening</span>
                : i === cur ? <span className="now">Reading</span>
                : isRead ? <span className="ck">{I.tick}</span> : null}
            </div>
          );
        })}
        <div style={{ height: Math.max(0, total - range.end) * ROW_H }} />
      </div>
    </div>
  );
}
