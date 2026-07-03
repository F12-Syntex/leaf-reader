'use client';

import { relMeta, relHeat } from '@/lib/constants';
import { readTime } from '@/lib/storage';
import { ICONS as I } from '@/components/icons';

export default function ChaptersPanel({ book, cur, readSet, marks, tts, overall, onGoChap, onLibrary }) {
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
      <div className="ch-list">
        {book.chapters.map((c, i) => {
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
      </div>
    </div>
  );
}
