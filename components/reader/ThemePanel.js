'use client';

import { THEMES, THEME_ORDER } from '@/lib/constants';

export default function ThemePanel({ theme, setTheme }) {
  return (
    <div className="panel">
      <div className="pop-title">Reading theme</div>
      <div className="theme-grid">
        {THEME_ORDER.map((k) => {
          const T = THEMES[k];
          return (
            <div key={k} className={'theme-card' + (theme === k ? ' sel' : '')} onClick={() => setTheme(k)}>
              <div className="swatch" style={{ background: T.bg, color: T.ink }}>
                <div className="glyph">Aa</div>
                <div className="ln" style={{ background: T.ink, width: '90%', opacity: .85 }} />
                <div className="ln" style={{ background: T.soft, width: '70%' }} />
                <div className="ln" style={{ background: T.soft, width: '80%' }} />
              </div>
              <div className="theme-name"><span className="dot" />{T.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
