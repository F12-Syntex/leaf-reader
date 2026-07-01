'use client';

import { CharPopCard, MoneyPopCard, NotePopCard } from '@/components/richtext/blocks';

export default function EntityPopover({ ipop, book, mentions, onClose }) {
  if (!ipop) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={'inline-pop' + (ipop.up ? ' up' : '')} style={{ left: ipop.x, top: ipop.y }}>
        {ipop.type === 'char' && <CharPopCard ckey={ipop.key} book={book} mentions={mentions} />}
        {ipop.type === 'money' && <MoneyPopCard data={ipop.data} />}
        {ipop.type === 'note' && <NotePopCard data={ipop.data} />}
      </div>
    </>
  );
}
