'use client';

import Link from 'next/link';
import { loadBook } from '@/lib/storage';
import { ICONS as I } from '@/components/icons';

export default function BookCard({ book, onRemove }) {
  const st = loadBook(book.id);
  const total = book.chapterCount || 0;
  const readCount = (st.read || []).length;
  const readPct = total ? Math.round((readCount / total) * 100) : 0;
  const pct = Math.max(Math.round((st.overall || 0) * 100), readPct);
  const done = total > 0 && readCount >= total;
  const mins = book.minutes || 0;

  return (
    <Link href={`/book/${book.id}`} className="bk">
      <div className="bk-cover" style={{ '--bk': book.tint }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bk-img" src={`/books/${book.id}/images/cover.jpg`} alt={book.title + ' cover'}
          ref={(el) => { if (el && el.complete && el.naturalWidth > 0) el.parentNode.classList.add('hasimg'); }}
          onLoad={(e) => e.currentTarget.parentNode.classList.add('hasimg')}
          onError={(e) => e.currentTarget.remove()} />
        <div className="bk-controls">
          <button
            className="bk-ic bk-rm"
            onClick={(e) => { e.preventDefault(); onRemove(book.id, e); }}
            title="Remove from shelf"
          >
            {I.x}
          </button>
        </div>
        <div className="bk-author">{book.author}</div>
        <div className="bk-name">{book.title}</div>
        <div className="bk-orn">{book.title[0]}</div>
        {readCount > 0 && (
          <div className={'bk-readmark' + (done ? ' done' : '')}>
            {I.tick}<span>{done ? 'All read' : readCount + '/' + total + ' read'}</span>
          </div>
        )}
      </div>
      <div className="bk-meta">
        <span>{total} chapters · {mins} min</span>
        {pct > 0
          ? <div className="bk-prog"><div className="bar"><i style={{ width: pct + '%' }}></i></div><span>{done || pct >= 97 ? 'Finished' : pct + '%'}</span></div>
          : <div className="bk-new">Not started</div>}
      </div>
    </Link>
  );
}
