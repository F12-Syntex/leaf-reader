/* Rich-text block components — one per block type in a chapter's `blocks[]`
   array (statcard, letter, scene, uistat, ...). Pure/logic helpers
   (renderRich, buildCharIndex, useInView, etc.) live in lib/richtext.js. */
'use client';
import React, { useState as rtState } from 'react';
import { renderRich, useInView, resolveChar } from '@/lib/richtext';

/* ---------- stat bars ---------- */
export function StatBars({ stats, on }) {
  return (
    <div className="bars">
      {stats.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span className="bar-k">{k}</span>
          <span className="bar-track"><i style={{ width: on ? (v * 10) + '%' : '0%' }} /></span>
          <span className="bar-v">{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- embedded game-UI text (e.g. "STATS HEALTH 0 SPEED 0"), converted by
   the /addbook formatting pass into { t:'uistat', items:[{label,value}, ...] } ---------- */
export function UiStatBlock({ b }) {
  return (
    <div className="uistat">
      {b.items.map((it, i) => (
        <div className="uistat-item" key={i}>
          <span className="uistat-label">{it.label}</span>
          <span className="uistat-value">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- in-flow character sheet ---------- */
export function StatCard({ ckey, book, mentions }) {
  const c = resolveChar(book, ckey);
  const [ref, on] = useInView();
  return (
    <div className="statcard" ref={ref}>
      <div className="sc-head">
        <div className="avatar">{c.initials}</div>
        <div>
          <div className="sc-name">{c.name}</div>
          <div className="sc-epithet">{c.epithet}</div>
        </div>
        {c.fortune && <div className="sc-fortune"><span>Fortune</span>{c.fortune}</div>}
      </div>
      <div className="sc-desc">{c.desc}</div>
      {c.stats && <StatBars stats={c.stats} on={on} />}
      <div className="sc-foot">Appears {mentions[ckey] || 0}× in this volume</div>
    </div>
  );
}

/* ---------- letter (interactive fold-out) ---------- */
export function LetterBlock({ b, book, ctx }) {
  const [open, setOpen] = rtState(false);
  const from = resolveChar(book, b.from);
  return (
    <div className={'letter' + (open ? ' open' : '')}>
      <button className="letter-head" onClick={() => setOpen(!open)}>
        <span className="seal">✉</span>
        <span className="letter-meta">
          <span className="letter-from">A note from {from.name}</span>
          <span className="letter-to">to {b.to}</span>
        </span>
        <span className="letter-cue">{open ? 'Fold' : 'Read'}</span>
      </button>
      <div className="letter-body">
        <div className="letter-inner">
          {b.lines.map((l, i) => <p key={i}>{renderRich(l, ctx)}</p>)}
          <div className="letter-sign">— {b.sign}</div>
        </div>
      </div>
    </div>
  );
}

export const SceneBreak = () => <div className="scenebreak" aria-hidden="true">· · ·</div>;

export function TtsPara({ text, word, ci, pi }) {
  const words = React.useMemo(() => text.split(/\s+/), [text]);
  return (
    <p className="tts-para" data-ci={ci} data-pi={pi}>
      {words.map((w, i) => (
        <React.Fragment key={i}><span className={'tw' + (i === word ? ' on' : '')}>{w}</span>{' '}</React.Fragment>
      ))}
    </p>
  );
}

export const Timeskip = ({ x }) => <div className="timeskip">{x}</div>;

export function QuoteBlock({ b, ctx }) {
  return (
    <div className="pull">
      <div className="pull-x">{renderRich(b.x, { ...ctx, detect: false })}</div>
      {b.by && <div className="pull-by">— <b>{b.by}</b></div>}
    </div>
  );
}

export function SceneBlock({ b, ctx }) {
  const variant = b.fx === 'rain' ? ' cool' : b.fx === 'candles' ? ' warm' : '';
  return (
    <div className={'scene' + variant}>
      {b.fx === 'rain' && <div className="scene-rain" />}
      {b.fx === 'candles' && <div className="scene-candles" />}
      <div className="scene-label">{b.label}</div>
      <div className="scene-x">{renderRich(b.x, { ...ctx, detect: false })}</div>
    </div>
  );
}

/* ---------- newer block types (formatting upgrade) ---------- */

/* big standalone onomatopoeia ("Bam!", "Kacha!") */
export function SfxBlock({ b }) {
  const [ref, on] = useInView();
  return <div className={'sfx' + (on ? ' sfx-live' : '')} ref={ref}>{b.x}</div>;
}

/* dream / vision / hallucination passage */
export function DreamBlock({ b, ctx }) {
  return (
    <div className="dream">
      <div className="dream-label">{b.label || 'Vision'}</div>
      <div className="dream-x">{renderRich(b.x, { ...ctx, detect: false })}</div>
    </div>
  );
}

/* explicit memory / recollection passage */
export function FlashbackBlock({ b, ctx }) {
  return (
    <div className="flashback">
      <div className="flashback-label">{b.label || 'Memory'}</div>
      <div className="flashback-x">{renderRich(b.x, { ...ctx, detect: false })}</div>
    </div>
  );
}

/* spoken ritual / incantation / prayer */
export function RitualBlock({ b, ctx }) {
  const [ref, on] = useInView();
  return (
    <div className={'ritual' + (on ? ' ritual-live' : '')} ref={ref}>
      {b.lines.map((l, i) => <div className="ritual-line" key={i} style={{ '--i': i }}>{renderRich(l, { ...ctx, detect: false })}</div>)}
    </div>
  );
}

/* verse / song / rhyme */
export function PoemBlock({ b, ctx }) {
  return (
    <div className="poem">
      {b.lines.map((l, i) => <div className="poem-line" key={i}>{renderRich(l, { ...ctx, detect: false })}</div>)}
    </div>
  );
}

/* mystical/system notification panel */
export function SysBlock({ b }) {
  const [ref, on] = useInView();
  return (
    <div className={'sysmsg' + (on ? ' sysmsg-live' : '')} ref={ref}>
      {b.lines.map((l, i) => <div className="sysmsg-line" key={i}>{l}</div>)}
    </div>
  );
}

/* signboard / plaque / gravestone text */
export function SignBlock({ b }) {
  return <div className="signboard"><span>{b.x}</span></div>;
}

/* newspaper clipping */
export function NewsBlock({ b, ctx }) {
  return (
    <div className="news">
      {b.source && <div className="news-source">{b.source}</div>}
      {b.title && <div className="news-title">{b.title}</div>}
      <div className="news-x">{renderRich(b.x, { ...ctx, detect: false })}</div>
    </div>
  );
}

export function JourneyCard({ b }) {
  const [ref, on] = useInView();
  return (
    <div className="journey" ref={ref}>
      <div className="j-route">
        <div className="j-stop"><span className="j-dot"></span><span className="j-name">{b.from}</span></div>
        <div className="j-path">
          <span className={'j-walk' + (on ? ' go' : '')}></span>
          <span className="j-dist">{b.dist}</span>
        </div>
        <div className="j-stop"><span className="j-name">{b.to}</span><span className="j-dot end"></span></div>
      </div>
      {b.meta && <div className="j-meta">{b.meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
    </div>
  );
}

export function NotePopCard({ data }) {
  return (
    <div className="cp">
      <div className="np-label">Historical note</div>
      <div className="cp-name" style={{ textTransform: 'capitalize' }}>{data.term}</div>
      <div className="cp-desc">{data.note}</div>
    </div>
  );
}

export function DeltaCard({ b, book }) {
  const c = resolveChar(book, b.char);
  const [ref, on] = useInView();
  const up = b.to >= b.from;
  return (
    <div className="delta" ref={ref}>
      <div className="avatar">{c.initials}</div>
      <div className="delta-main">
        <div className="delta-label">{b.label}</div>
        <div className="delta-track">
          <span className="was" style={{ width: (b.from * 10) + '%' }}></span>
          <span className="is" style={{ width: (on ? b.to : b.from) * 10 + '%' }}></span>
        </div>
      </div>
      <div className={'delta-badge ' + (up ? 'upp' : 'dwn')}>
        {up ? '+' : ''}{b.to - b.from}
        <small>{b.note}</small>
      </div>
    </div>
  );
}

/* ---------- popover cards ---------- */
export function CharPopCard({ ckey, book, mentions, onMore }) {
  const c = resolveChar(book, ckey);
  return (
    <div className="cp">
      <div className="cp-head">
        <div className="avatar">{c.initials}</div>
        <div>
          <div className="cp-name">{c.name}</div>
          <div className="cp-epithet">{c.epithet}</div>
        </div>
      </div>
      <div className="cp-desc">{c.desc}</div>
      {c.stats && <StatBars stats={c.stats} on={true} />}
      <div className="cp-foot">
        {c.fortune && <span className="cp-fortune">{c.fortune}</span>}
        <span>{mentions[ckey] || 0} mentions</span>
      </div>
      {onMore && <button className="cp-more" onClick={(e) => { e.stopPropagation(); onMore(); }}>Full dossier in Codex →</button>}
    </div>
  );
}

export function MoneyPopCard({ data }) {
  const modern = data.value * 87;
  const fmt = (n) => '£' + n.toLocaleString();
  const refs = [["Mr. Bennet", 2000], ["Mr. Bingley", 4500], ["Mr. Darcy", 10000]];
  const max = 10000;
  return (
    <div className="cp">
      <div className="cp-name" style={{ marginBottom: 2 }}>{fmt(data.value)}{data.perYear ? ' a year' : ''}</div>
      <div className="cp-epithet">in 1813 — roughly {fmt(Math.round(modern / 1000) * 1000)} today</div>
      <div className="cp-desc">{data.value >= 8000 ? 'Among the largest private incomes in England.' : data.value >= 4000 ? 'Gentry wealth — perhaps 100× a labourer\u2019s wage.' : 'A comfortable, if entailed, estate income.'}</div>
      <div className="bars">
        {refs.map(([k, v]) => (
          <div className="bar-row" key={k}>
            <span className="bar-k">{k}</span>
            <span className="bar-track"><i style={{ width: (v / max * 100) + '%', opacity: Math.abs(v - data.value) < 600 ? 1 : .35 }} /></span>
            <span className="bar-v">{(v / 1000)}k</span>
          </div>
        ))}
      </div>
    </div>
  );
}
