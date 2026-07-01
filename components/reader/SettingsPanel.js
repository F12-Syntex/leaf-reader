'use client';

import { MEASURES, FONTS } from '@/lib/constants';

export default function SettingsPanel({
  fontSize, setFS, leading, setLead, measure, setMeas, pageMode, setPageMode, wide, font, setFont,
}) {
  return (
    <div className="panel pop-set">
      <div className="set-group">
        <div className="set-label"><span>Text size</span><b>{fontSize}px</b></div>
        <div className="stepper">
          <button onClick={() => setFS((v) => Math.max(15, v - 1))}><span className="av" style={{ fontSize: 13 }}>A</span></button>
          <div className="val">{fontSize}</div>
          <button onClick={() => setFS((v) => Math.min(28, v + 1))}><span className="av" style={{ fontSize: 21 }}>A</span></button>
        </div>
      </div>
      <div className="set-group">
        <div className="set-label"><span>Line spacing</span><b>{leading.toFixed(2)}</b></div>
        <div className="stepper">
          <button onClick={() => setLead((v) => Math.max(1.4, +(v - 0.05).toFixed(2)))}>−</button>
          <div className="val">{leading.toFixed(2)}</div>
          <button onClick={() => setLead((v) => Math.min(2.1, +(v + 0.05).toFixed(2)))}>+</button>
        </div>
      </div>
      <div className="set-group">
        <div className="set-label"><span>Column width</span></div>
        <div className="seg">
          {Object.keys(MEASURES).map((k) => (
            <button key={k} className={measure === k ? 'on' : ''} onClick={() => setMeas(k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="set-group">
        <div className="set-label"><span>Page layout</span></div>
        <div className="seg">
          <button className={pageMode === 'scroll' ? 'on' : ''} onClick={() => setPageMode('scroll')}>Single</button>
          <button className={pageMode === 'spread' ? 'on' : ''} onClick={() => setPageMode('spread')} disabled={!wide} title={wide ? '' : 'Needs a wider window'}>Two-page</button>
        </div>
        {!wide && <div className="set-hint">Two-page view needs a wider window.</div>}
      </div>
      <div className="set-group">
        <div className="set-label"><span>Typeface</span></div>
        <div className="chips">
          {Object.entries(FONTS).map(([k, f]) => (
            <button key={k} className={'chip-f' + (font === k ? ' on' : '')} onClick={() => setFont(k)}
              style={{ fontFamily: f.stack }} title={f.name}>
              <span>Aa</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
