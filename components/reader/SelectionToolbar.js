'use client';

import { ICONS as I } from '@/components/icons';

export default function SelectionToolbar({ seltool, onReadFromSel, onCopySel }) {
  if (!seltool) return null;
  const placeAbove = seltool.top > 120;
  const y = placeAbove ? seltool.top - 12 : seltool.bottom + 12;
  const x = Math.min(Math.max(seltool.x, 120), window.innerWidth - 120);
  return (
    <div className={'sel-tool' + (placeAbove ? ' up' : ' down')}
      style={{ left: x, top: y }} onMouseDown={(e) => e.preventDefault()}>
      <button className="st-btn primary" onClick={onReadFromSel}>{I.voice}<span>Read from here</span></button>
      <span className="st-sep" />
      <button className="st-btn" onClick={onCopySel} title="Copy">{I.copy}</button>
    </div>
  );
}
