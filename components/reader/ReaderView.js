'use client';

import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FONTS, MEASURES, APP_DEFAULTS, relMeta, relHeat } from '@/lib/constants';
import { loadGlobal, saveGlobal, loadBook, saveBook, readTime } from '@/lib/storage';
import { buildCharIndex, computeMentions, assignHues, computeDialogue, cleanText, renderProse } from '@/lib/richtext';
import {
  SceneBreak, Timeskip, QuoteBlock, SceneBlock, DeltaCard, JourneyCard,
  StatCard, LetterBlock, TtsPara, UiStatBlock,
  SfxBlock, DreamBlock, FlashbackBlock, RitualBlock, PoemBlock, SysBlock, SignBlock, NewsBlock,
} from '@/components/richtext/blocks';
import { ICONS as I } from '@/components/icons';
import ChaptersPanel from './ChaptersPanel';
import VoicePanel from './VoicePanel';
import ThemePanel from './ThemePanel';
import SettingsPanel from './SettingsPanel';
import SelectionToolbar from './SelectionToolbar';
import EntityPopover from './EntityPopover';
import AiPanel from './AiPanel';

export default function ReaderView({ book }) {
  const router = useRouter();
  const bookId = book.id;

  const charIndex = useMemo(() => buildCharIndex(book), [book]);
  const mentions = useMemo(() => computeMentions(book), [book]);
  const hues = useMemo(() => assignHues(book, mentions), [book, mentions]);
  const speakerMap = useMemo(() => computeDialogue(book), [book]);

  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState('paper');
  const [font, setFont] = useState('newsreader');
  const [fontSize, setFS] = useState(20);
  const [leading, setLead] = useState(1.75);
  const [measure, setMeas] = useState('cozy');
  const [pageMode, setPageMode] = useState('scroll');
  const [wide, setWide] = useState(false);
  const [spreadPage, setSpreadPage] = useState(0);
  const [spreadPages, setSpreadPages] = useState(1);
  const [marks, setMarks] = useState([]);
  const [readSet, setReadSet] = useState([]);

  const [cur, setCur] = useState(0);
  const [progress, setProgress] = useState(0);
  const [overall, setOverall] = useState(0);
  const [pop, setPop] = useState(null);
  const [rate, setRateState] = useState(1);
  const [tts, setTts] = useState({ on: false, playing: false, chap: 0, para: -1, word: -1 });
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURIState] = useState(null);
  const voiceRef = useRef(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [now, setNow] = useState(0);

  const [ipop, setIpop] = useState(null);
  const [seltool, setSeltool] = useState(null);
  const curRef = useRef(0);
  const [chrome, setChrome] = useState(true);
  const [hintMsg, setHintMsg] = useState(null);
  const [reanalyseStatus, setReanalyseStatus] = useState(null);

  const stageRef = useRef(null);
  const secRefs = useRef([]);
  const lastY = useRef(0);
  const saveT = useRef(null);
  const frameRef = useRef(null);
  const articleRef = useRef(null);
  const spRef = useRef({ pageStep: 1, frameW: 0, pageH: 0, colW: 0, G: 0 });
  const spreadPagesRef = useRef(1);
  const spreadPageRef = useRef(0);
  /* where the next spread layout should land: {page: n | 'last'} after a
     chapter change, or {frac} to preserve proportional position on
     mode/typography changes */
  const pendingSpreadRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const formatRequestedRef = useRef(new Set());
  const spread = pageMode === 'spread' && wide;

  /* declared up front (rather than interleaved with the effects below) so every
     effect that references them — including ones earlier in this file — sees an
     already-initialized function, not a temporal-dead-zone reference */
  /* scroll mode shows exactly ONE chapter — scrolling never advances to the
     next chapter (that's an explicit click on the next-chapter button), so
     this only tracks within-chapter progress. */
  const onScroll = () => {
    if (spread) return;
    const el = stageRef.current; if (!el) return;
    const y = el.scrollTop;
    const ci = curRef.current;
    const sec = secRefs.current[ci];
    const probe = y + el.clientHeight * 0.35;
    let pr = sec ? Math.min(1, Math.max(0, (probe - sec.offsetTop) / sec.offsetHeight)) : 0;
    /* the probe sits 35% down the viewport, so with a single chapter mounted
       it can never sweep past the section's bottom edge — treat reaching the
       physical bottom of the scroll as 100% (also reveals the next-chapter
       dock, and marks short fit-on-one-screen chapters as read) */
    const max = el.scrollHeight - el.clientHeight;
    const atEnd = max <= 0 || max - y < 8;
    if (atEnd) pr = 1;
    setProgress(pr);
    const total = book.chapters.length;
    setOverall(total > 0 ? Math.min(1, (ci + pr) / total) : 0);
    setReadSet((rs) => {
      const s = new Set(rs);
      const before = s.size;
      for (let k = 0; k < ci; k++) s.add(k);
      if (pr > 0.9) s.add(ci);
      return s.size === before ? rs : Array.from(s).sort((a, b) => a - b);
    });
    if (Math.abs(y - lastY.current) > 2 && ipop) setIpop(null);
    if (Math.abs(y - lastY.current) > 2 && seltool) setSeltool(null);
    /* at the bottom of a chapter the dock (and the next-chapter dock above
       it) must always be visible — never auto-hidden by the scroll direction */
    if (atEnd) setChrome(true);
    else if (y > lastY.current + 5 && y > 140) setChrome(false);
    else if (y < lastY.current - 5) setChrome(true);
    lastY.current = y;
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      const st = loadBook(bookId);
      saveBook(bookId, { ...st, marks, chap: ci, chapProgress: pr,
        overall: total > 0 ? Math.min(1, (ci + pr) / total) : 0, at: Date.now() });
    }, 300);
  };

  const goChap = (i) => {
    if (i < 0 || i >= book.chapters.length) return;
    setPop(null); setIpop(null); setChrome(true);
    if (spread) {
      /* spread renders one chapter at a time — switch chapters and let the
         layout effect below paginate the new one from its first page */
      pendingSpreadRef.current = { chap: i, page: 0 };
      setCur(i);
      return;
    }
    /* chapter i isn't mounted yet (only the current chapter renders) — switch
       to it via setCur, then scroll to its top once the layout effect below
       has committed the new content. */
    setCur(i);
    pendingScrollRef.current = { chap: i, progress: 0, smooth: false };
  };

  /* ======================= two-page spread ======================= */
  const setPage = (n) => { spreadPageRef.current = n; setSpreadPage(n); };
  const geom = () => {
    const el = stageRef.current; const W = el.clientWidth, H = el.clientHeight;
    const G = Math.round(Math.min(96, Math.max(44, W * 0.045)));
    const availW = Math.min(W - 150, 1480);
    const colW = Math.max(300, Math.min(MEASURES[measure], Math.floor((availW - G) / 2)));
    const frameW = 2 * colW + G;
    const padTop = Math.round(H * 0.085), padBot = Math.round(H * 0.15);
    const pageH = Math.max(220, H - padTop - padBot);
    const pageStep = 2 * (colW + G);
    return { G, colW, frameW, pageH, pageStep, padTop, padBot };
  };
  const applyPage = (page, g) => {
    const fr = frameRef.current; if (!fr) return;
    fr.scrollLeft = page * g.pageStep;
  };
  const updateFromPage = (page) => {
    /* spread paginates only the current chapter, so page → within-chapter
       progress directly; overall position comes from the chapter index */
    const ci = curRef.current;
    const pages = spreadPagesRef.current;
    const pr = pages > 0 ? Math.min(1, Math.max(0, (page + 1) / pages)) : 0;
    setProgress(pr);
    const total = book.chapters.length;
    setOverall(total > 0 ? Math.min(1, (ci + pr) / total) : 0);
    setReadSet((rs) => {
      const s = new Set(rs); const before = s.size;
      for (let k = 0; k < ci; k++) s.add(k);
      if (page >= pages - 1) s.add(ci);
      return s.size === before ? rs : Array.from(s).sort((a, b) => a - b);
    });
    /* last page of the chapter — surface the dock + next-chapter dock */
    if (page >= pages - 1) setChrome(true);
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      const st = loadBook(bookId);
      saveBook(bookId, { ...st, chap: ci, chapProgress: pr,
        overall: total > 0 ? Math.min(1, (ci + pr) / total) : 0, at: Date.now() });
    }, 300);
  };
  const layoutSpread = () => {
    const a = articleRef.current, fr = frameRef.current, el = stageRef.current;
    if (!spread || !a || !fr || !el) {
      if (a) { a.style.transform = ''; a.style.width = ''; a.style.height = ''; a.style.columnWidth = ''; a.style.columnGap = ''; }
      if (fr) { fr.style.width = ''; fr.style.height = ''; fr.style.marginTop = ''; fr.style.marginBottom = ''; fr.scrollLeft = 0; }
      if (!spread && el) { const sec = secRefs.current[cur]; if (sec) el.scrollTop = Math.max(0, sec.offsetTop - 12); }
      return;
    }
    const g = geom(); spRef.current = g;
    fr.style.width = g.frameW + 'px'; fr.style.height = g.pageH + 'px';
    fr.style.marginTop = g.padTop + 'px'; fr.style.marginBottom = g.padBot + 'px';
    a.style.width = g.frameW + 'px'; a.style.height = g.pageH + 'px';
    a.style.columnWidth = g.colW + 'px'; a.style.columnGap = g.G + 'px';
    const aRect = a.getBoundingClientRect();
    const last = a.lastElementChild;
    const lastRight = last ? (last.getBoundingClientRect().right - aRect.left) : a.scrollWidth;
    const contentW = Math.max(a.scrollWidth, lastRight);
    const pages = contentW <= g.frameW + 4 ? 1 : Math.max(1, Math.ceil((contentW - g.frameW) / g.pageStep) + 1);
    spreadPagesRef.current = pages; setSpreadPages(pages);
    let page = spreadPageRef.current;
    const pending = pendingSpreadRef.current;
    /* only consume a target aimed at the chapter actually laid out — a resize
       or style pass can run while the setCur that queued the target hasn't
       committed yet, and must not burn it against the outgoing chapter */
    if (pending != null && (pending.chap == null || pending.chap === curRef.current)) {
      if (pending.frac != null) page = Math.round(pending.frac * (pages - 1));
      else page = pending.page === 'last' ? pages - 1 : (pending.page || 0);
      pendingSpreadRef.current = null;
    }
    page = Math.min(pages - 1, Math.max(0, page));
    applyPage(page, g); setPage(page); updateFromPage(page);
  };
  const goPage = (d) => {
    const max = spreadPagesRef.current - 1;
    const n = spreadPageRef.current + d;
    if (n > max || n < 0) {
      /* past either edge of the chapter — flow into the neighbouring one,
         landing on its first page going forward, last page going back */
      const ci = curRef.current + (n > max ? 1 : -1);
      if (ci < 0 || ci >= book.chapters.length) return;
      setIpop(null); setSeltool(null);
      pendingSpreadRef.current = { chap: ci, page: n > max ? 0 : 'last' };
      setCur(ci);
      return;
    }
    if (n === spreadPageRef.current) return;
    setIpop(null); setSeltool(null);
    applyPage(n, spRef.current); setPage(n); updateFromPage(n);
  };

  /* keep curRef in lockstep with cur before any layout effect below reads it —
     wheel/resize handlers capture goPage/layoutSpread closures that would
     otherwise see a stale chapter index */
  useLayoutEffect(() => { curRef.current = cur; }, [cur]);

  /* ---- mount: load global prefs + this book's saved progress from localStorage.
     ReaderView is remounted per book (see app/book/[id]/page.js's key={book.id}),
     so this only needs to run once per book, not react to bookId changes. ---- */
  /* eslint-disable react-hooks/set-state-in-effect -- deliberate one-time
     client-only hydration of localStorage-derived state (see comment above) */
  useEffect(() => {
    const g = loadGlobal();
    setTheme(g.theme || 'paper');
    setFont(g.font || 'newsreader');
    setFS(g.fontSize || 20);
    setLead(g.leading || 1.75);
    setMeas(g.measure || 'cozy');
    setPageMode(g.pageMode || 'scroll');
    setRateState(g.rate || 1);
    setVoiceURIState(g.voiceURI || null);
    voiceRef.current = g.voiceURI || null;
    const b = loadBook(bookId);
    setMarks(b.marks || []);
    setReadSet(b.read || []);
    setWide(window.matchMedia('(min-width: 900px)').matches);
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* persist global prefs */
  useEffect(() => {
    if (!mounted) return;
    saveGlobal({ theme, font, fontSize, leading, measure, pageMode, rate, voiceURI, lastBook: bookId });
  }, [mounted, theme, font, fontSize, leading, measure, pageMode, rate, voiceURI, bookId]);

  /* load synthesis voices (arrive asynchronously) */
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth) return;
    const load = () => {
      const all = synth.getVoices(); if (!all.length) return;
      const en = all.filter((v) => /^en/i.test(v.lang));
      const seen = new Set();
      const list = (en.length ? en : all).filter((v) => {
        if (seen.has(v.voiceURI)) return false; seen.add(v.voiceURI); return true;
      });
      setVoices(list);
      if (!voiceRef.current && list.length) {
        const def = list.find((v) => v.default) || list[0];
        voiceRef.current = def.voiceURI; setVoiceURIState(def.voiceURI);
      }
    };
    load();
    synth.addEventListener && synth.addEventListener('voiceschanged', load);
    return () => { synth.removeEventListener && synth.removeEventListener('voiceschanged', load); };
  }, []);

  /* keep the "finishes ~HH:MM" clock ticking while reading aloud — Date.now()
     is impure, so it's only ever read inside this effect, never during render */
  /* eslint-disable react-hooks/set-state-in-effect -- subscribing to the passage
     of time is exactly what setInterval-in-an-effect is for */
  useEffect(() => {
    if (!tts.on || !tts.playing) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tts.on, tts.playing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* closes the voice dropdown whenever the panel switches away from it */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (pop !== 'voice') setVoiceOpen(false); }, [pop]);

  /* persist per-book bookmarks */
  useEffect(() => {
    if (!mounted) return;
    const st = loadBook(bookId);
    saveBook(bookId, { ...st, marks });
  }, [marks, bookId, mounted]);

  /* persist per-book read chapters */
  useEffect(() => {
    if (!mounted) return;
    const st = loadBook(bookId);
    saveBook(bookId, { ...st, read: readSet, at: Date.now() });
  }, [readSet, bookId, mounted]);

  /* restore scroll position once mounted — stored as {chap, chapProgress} rather
     than a raw pixel offset, since with windowed rendering the pixel height of
     the document depends on which chapters happen to be expanded. */
  /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only
     hydration of localStorage-derived reading position (same rationale as the
     mount effect above) */
  useLayoutEffect(() => {
    if (!mounted) return;
    secRefs.current.length = book.chapters.length;
    const saved = loadBook(bookId);
    const chap = Math.min(book.chapters.length - 1, Math.max(0, saved.chap || 0));
    setCur(chap);
    if (spread) { pendingSpreadRef.current = { chap, frac: saved.chapProgress || 0 }; return; }
    pendingScrollRef.current = { chap, progress: saved.chapProgress || 0, anchor: 'probe', smooth: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* consume a pending scroll target (from goChap or the mount restore above) once
     the chapter it points to has expanded to full content — runs after every
     commit and no-ops immediately unless something set a target. */
  useLayoutEffect(() => {
    if (spread || !pendingScrollRef.current) return;
    const target = pendingScrollRef.current;
    const el = stageRef.current; const sec = secRefs.current[target.chap];
    if (!el || !sec) return;
    /* the setCur() that requested this target may not have committed its
       render yet (this effect runs after every commit, including the one
       that merely scheduled the update) — if the section is still a lazy
       placeholder, its offsetHeight is the estimate, not the real size, so
       wait for the commit where it's actually expanded before consuming. */
    if (!sec.querySelector('.prose')) return;
    pendingScrollRef.current = null;
    /* 'top' anchor (chapter jumps) lands the section flush under the chrome;
       'probe' anchor (restoring a saved position) inverts onScroll's own
       `probe = scrollTop + clientHeight*0.35` so the reader lands exactly
       where they left off, not at the chapter's start. */
    const offset = target.anchor === 'probe' ? el.clientHeight * 0.35 : 12;
    const top = Math.max(0, sec.offsetTop + (target.progress || 0) * sec.offsetHeight - offset);
    if (target.smooth) { el.scrollTo({ top, behavior: 'smooth' }); }
    else { el.scrollTop = top; lastY.current = top; }
    /* sync cur/progress/overall to the new position immediately — scrollTop
       reads back synchronously, and rAF isn't reliable here (suspended
       entirely for backgrounded tabs, e.g. restoring position in a tab
       that isn't focused yet). */
    onScroll();
  });

  /* reveal chrome near bottom */
  useEffect(() => {
    const mm = (e) => { if (e.clientY > window.innerHeight - 130) setChrome(true); };
    window.addEventListener('mousemove', mm);
    return () => window.removeEventListener('mousemove', mm);
  }, []);

  /* keyboard */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (spread && (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown')) { e.preventDefault(); goPage(1); }
      else if (spread && (e.key === 'ArrowLeft' || e.key === 'PageUp')) { e.preventDefault(); goPage(-1); }
      else if (e.key === 'ArrowRight') goChap(cur + 1);
      else if (e.key === 'ArrowLeft') goChap(cur - 1);
      else if (e.key === 'Escape') { setPop(null); setIpop(null); }
      else if (e.key.toLowerCase() === 'c') setPop((p) => p === 'chapters' ? null : 'chapters');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cur, spread]);

  /* plain "resuming" hint on a meaningful re-entry */
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage-derived, client-only */
  useEffect(() => {
    if (!mounted) return;
    const saved = loadBook(bookId);
    const chap = saved.chap || 0;
    if (chap > 0 || (saved.chapProgress || 0) > 0.05) setHintMsg('Resuming — ' + book.chapters[chap].title);
    else setHintMsg(null);
    const h = setTimeout(() => setHintMsg(null), 4000);
    return () => clearTimeout(h);
  }, [mounted]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* progressively format the next few unformatted chapters ahead of where the
     reader actually is, instead of requiring the whole book to be formatted
     up front — each request is a single fast direct OpenRouter call. */
  useEffect(() => {
    if (!mounted) return;
    const upcoming = book.chapters
      .slice(cur, cur + 6)
      .filter((c) => c.unformatted && c.stem && !formatRequestedRef.current.has(c.stem));
    if (!upcoming.length) return;
    upcoming.forEach((c) => formatRequestedRef.current.add(c.stem));
    Promise.all(upcoming.map((c) =>
      fetch('/api/format-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, stem: c.stem }),
      }).then((r) => r.json()).catch(() => null)
    )).then((results) => {
      if (results.some((r) => r && r.ok)) router.refresh();
    });
  }, [mounted, cur, book.chapters, bookId, router]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const f = () => setWide(mq.matches);
    f();
    mq.addEventListener ? mq.addEventListener('change', f) : mq.addListener(f);
    window.addEventListener('resize', f);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', f) : mq.removeListener(f);
      window.removeEventListener('resize', f);
    };
  }, []);
  /* entering spread: keep the reader's proportional place in the chapter —
     unless something (the mount restore) already queued a landing target */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (spread && !pendingSpreadRef.current) pendingSpreadRef.current = { chap: cur, frac: progress };
  }, [spread]);
  useLayoutEffect(() => {
    if (!mounted) return;
    layoutSpread();
    if (!spread) return;
    const t = setTimeout(layoutSpread, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, spread, measure, fontSize, leading, font, theme]);
  /* spread renders exactly one chapter, so a chapter change swaps the article's
     content and needs a fresh pagination pass (the effect above deliberately
     doesn't depend on cur — in scroll mode its reset branch would hijack
     scrolling on every chapter boundary) */
  useLayoutEffect(() => {
    if (!mounted || !spread) return;
    layoutSpread();
    const t = setTimeout(layoutSpread, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);
  useEffect(() => {
    if (!spread) return;
    let t = 0;
    const onResize = () => { clearTimeout(t); t = setTimeout(layoutSpread, 120); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t); };
  }, [spread]);

  /* wheel / trackpad flips pages in two-page mode */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !spread) return;
    let armed = true, lastFlip = 0, idle = 0;
    const onWheel = (e) => {
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(d) < 4) return;
      e.preventDefault();
      clearTimeout(idle);
      idle = setTimeout(() => { armed = true; }, 120);
      const nowMs = Date.now();
      if (!armed && nowMs - lastFlip < 550) return;
      armed = false; lastFlip = nowMs;
      goPage(d > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(idle); };
  }, [spread]);

  const toggleMark = () => setMarks((m) => m.includes(cur) ? m.filter((x) => x !== cur) : [...m, cur]);

  /* ---------- read aloud (TTS) ---------- */
  const speakSeq = useRef(0);
  const speakableIdx = (ci) => book.chapters[ci].blocks.reduce((a, b, j) => { if (typeof b === 'string') a.push(j); return a; }, []);
  const paraText = (ci, pi) => cleanText(book.chapters[ci].blocks[pi]);

  const speakPara = (ci, pi, r, fromWord = 0) => {
    const synth = window.speechSynthesis; if (!synth) return;
    const token = ++speakSeq.current;
    synth.cancel();
    synth.resume();
    const allWords = paraText(ci, pi).split(/\s+/).filter(Boolean);
    const startW = Math.max(0, Math.min(fromWord, Math.max(0, allWords.length - 1)));
    const words = allWords.slice(startW);
    const text = words.join(' ');
    const offsets = []; let o = 0;
    words.forEach((w) => { offsets.push(o); o += w.length + 1; });
    const u = new SpeechSynthesisUtterance(text);
    u.rate = r;
    const v = voiceRef.current && window.speechSynthesis.getVoices().find((x) => x.voiceURI === voiceRef.current);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.onboundary = (e) => {
      if (e.charIndex == null || token !== speakSeq.current) return;
      let wi = 0;
      for (let i = 0; i < offsets.length; i++) { if (offsets[i] <= e.charIndex) wi = i; else break; }
      setTts((t) => ({ ...t, word: startW + wi }));
    };
    u.onend = () => { if (token === speakSeq.current) speakNext(ci, pi, r); };
    u.onerror = (e) => {
      if (token === speakSeq.current && e.error !== 'interrupted' && e.error !== 'canceled') stopTts();
    };
    setTts({ on: true, playing: true, chap: ci, para: pi, word: startW });
    setTimeout(() => { if (token === speakSeq.current) synth.speak(u); }, 80);
  };
  const speakNext = (ci, pi, r) => {
    const list = speakableIdx(ci);
    const ni = list.find((j) => j > pi);
    if (ni != null) return speakPara(ci, ni, r);
    if (ci + 1 < book.chapters.length) {
      const l2 = speakableIdx(ci + 1);
      if (l2.length) return speakPara(ci + 1, l2[0], r);
    }
    stopTts();
  };
  const stopTts = () => {
    speakSeq.current++;
    if (window.speechSynthesis) { window.speechSynthesis.cancel(); window.speechSynthesis.resume(); }
    setTts({ on: false, playing: false, chap: 0, para: -1, word: -1 });
  };
  const togglePlay = () => {
    const synth = window.speechSynthesis; if (!synth) return;
    if (!tts.on) { const l = speakableIdx(cur); if (l.length) speakPara(cur, l[0], rate); return; }
    if (tts.playing) { synth.pause(); setTts((t) => ({ ...t, playing: false })); }
    else { synth.resume(); setTts((t) => ({ ...t, playing: true })); }
  };
  const skipPara = (dir) => {
    if (!tts.on) return;
    const list = speakableIdx(tts.chap);
    const n = list[list.indexOf(tts.para) + dir];
    if (n != null) speakPara(tts.chap, n, rate);
    else if (dir > 0) speakNext(tts.chap, tts.para, rate);
    else if (tts.chap > 0) { const l2 = speakableIdx(tts.chap - 1); speakPara(tts.chap - 1, l2[l2.length - 1], rate); }
  };
  const setRate = (r) => { setRateState(r); if (tts.on) speakPara(tts.chap, tts.para, r); };
  const setVoiceURI = (uri) => { voiceRef.current = uri; setVoiceURIState(uri); if (tts.on) speakPara(tts.chap, tts.para, rate); };

  /* ---------- selection toolbar → read aloud from selection ---------- */
  const handleSelect = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { setSeltool(null); return; }
    let rng; try { rng = sel.getRangeAt(0); } catch (e) { return; }
    let node = rng.startContainer;
    let el = node.nodeType === 3 ? node.parentElement : node;
    const pEl = el && el.closest && el.closest('[data-pi]');
    if (!pEl || !stageRef.current || !stageRef.current.contains(pEl)) { setSeltool(null); return; }
    const ci = +pEl.dataset.ci, pi = +pEl.dataset.pi;
    let fromWord = 0;
    try {
      const pre = document.createRange();
      pre.setStart(pEl, 0);
      pre.setEnd(rng.startContainer, rng.startOffset);
      fromWord = pre.toString().split(/\s+/).filter(Boolean).length;
    } catch (e) {}
    const rect = rng.getBoundingClientRect();
    if (!rect.width && !rect.height) { setSeltool(null); return; }
    setSeltool({ ci, pi, fromWord, text: sel.toString(),
      x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
  };
  const readFromSel = () => {
    if (!seltool) return;
    setPop(null); setIpop(null);
    speakPara(seltool.ci, seltool.pi, rate, seltool.fromWord);
    setSeltool(null);
    const s = window.getSelection(); if (s) s.removeAllRanges();
  };
  const copySel = () => {
    if (!seltool) return;
    if (navigator.clipboard) navigator.clipboard.writeText(seltool.text).catch(() => {});
    setSeltool(null);
    const s = window.getSelection(); if (s) s.removeAllRanges();
  };

  /* ---------- chapter ETA while reading aloud ---------- */
  const TTS_WPM = 168;
  const etaSeconds = useMemo(() => {
    if (!tts.on) return null;
    const blocks = book.chapters[tts.chap].blocks;
    const idxs = speakableIdx(tts.chap);
    let words = 0;
    idxs.forEach((j) => {
      if (j < tts.para) return;
      const w = cleanText(blocks[j]).split(/\s+/).filter(Boolean).length;
      words += (j === tts.para) ? Math.max(0, w - Math.max(0, tts.word)) : w;
    });
    return (words / (TTS_WPM * rate)) * 60;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tts.on, tts.chap, tts.para, tts.word, rate]);
  const fmtRemain = (s) => {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + ' sec';
    const m = Math.round(s / 60);
    return m + ' min';
  };
  const fmtClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const toLibrary = () => { stopTts(); setPop(null); setIpop(null); router.push('/'); };
  useEffect(() => () => { if (window.speechSynthesis) window.speechSynthesis.cancel(); }, []);

  /* follow the read-aloud position */
  useEffect(() => {
    if (!tts.on || tts.para < 0) return;
    const stage = stageRef.current; if (!stage) return;
    /* both layouts show one chapter at a time — when read-aloud rolls into
       the next chapter, follow it there first */
    if (tts.chap !== cur) {
      if (spread) pendingSpreadRef.current = { chap: tts.chap, page: 0 };
      else pendingScrollRef.current = { chap: tts.chap, progress: 0, smooth: false };
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate:
         read-aloud position is external (speech synthesis callbacks), and the
         visible chapter must follow it */
      setCur(tts.chap);
      return;
    }
    const para = stage.querySelector('.tts-para'); if (!para) return;
    const active = para.querySelector('.tw.on') || para;

    if (spread) {
      const g = spRef.current, a = articleRef.current;
      if (!g || !a) return;
      const contentX = active.getBoundingClientRect().left - a.getBoundingClientRect().left;
      let pg = Math.floor((contentX + 2) / g.pageStep);
      pg = Math.min(spreadPagesRef.current - 1, Math.max(0, pg));
      if (pg !== spreadPageRef.current) { applyPage(pg, g); setPage(pg); updateFromPage(pg); }
      return;
    }

    const sr = stage.getBoundingClientRect(), er = active.getBoundingClientRect();
    const top = er.top - sr.top;
    if (top < stage.clientHeight * 0.16 || top > stage.clientHeight * 0.72) {
      const target = stage.scrollTop + top - stage.clientHeight * 0.32;
      stage.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }, [tts.on, tts.chap, tts.para, tts.word, spread, cur]);

  const openIpop = (e, payload) => {
    const r = e.target.getBoundingClientRect();
    const W = 312, H = 280;
    const x = Math.min(Math.max(12, r.left + r.width / 2 - W / 2), window.innerWidth - W - 12);
    const up = r.bottom + H + 16 > window.innerHeight;
    const y = up ? r.top - 10 : r.bottom + 10;
    setIpop({ ...payload, x, y, up });
  };
  const ctx = {
    detect: APP_DEFAULTS.detect, charIndex,
    dialogue: APP_DEFAULTS.dialogue, dialogueLabel: APP_DEFAULTS.dialogueLabel, hues, characters: book.characters,
    onChar: (e, key) => openIpop(e, { type: 'char', key }),
    onMoney: (e, data) => openIpop(e, { type: 'money', data }),
    onNote: (e, data) => openIpop(e, { type: 'note', data }),
  };

  const chromeOpen = chrome || pop;
  const appStyle = {
    '--measure': MEASURES[measure] + 'px',
    '--fs': fontSize + 'px',
    '--lh': leading,
    '--serif': FONTS[font].stack,
    '--accent': APP_DEFAULTS.accent,
  };
  const proseCls = ['prose', APP_DEFAULTS.dropCap ? 'dropcap' : '', APP_DEFAULTS.justify ? 'justify' : '',
    APP_DEFAULTS.paraStyle === 'indented' ? 'indented' : ''].filter(Boolean).join(' ');

  if (!mounted) {
    return (
      <div className="app" data-theme="paper" data-skin={APP_DEFAULTS.skin.toLowerCase()} style={appStyle}>
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

  const ch = book.chapters[cur];
  const isMarked = marks.includes(cur);

  const onReanalyse = async () => {
    if (!ch.stem || reanalyseStatus === 'working') return;
    setReanalyseStatus('working');
    try {
      const r = await fetch('/api/format-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, stem: ch.stem, force: true }),
      }).then((res) => res.json()).catch(() => null);
      if (r && r.ok) { setReanalyseStatus(null); router.refresh(); }
      else setReanalyseStatus('error');
    } catch (e) { setReanalyseStatus('error'); }
  };

  const renderBlock = (b, i, ci) => {
    if (typeof b === 'string') {
      if (tts.on && tts.chap === ci && tts.para === i)
        return <TtsPara key={i} ci={ci} pi={i} text={paraText(ci, i)} word={tts.word} />;
      const dlg = APP_DEFAULTS.dialogue && speakerMap[ci] ? speakerMap[ci][i] : null;
      return (
        <p key={i} data-ci={ci} data-pi={i}>
          {renderProse(b, { ...ctx, speaker: dlg ? dlg.k : null, showLabel: dlg ? dlg.lab : false })}
        </p>
      );
    }
    if (b.t === 'break') return <SceneBreak key={i} />;
    if (b.t === 'timeskip') return <Timeskip key={i} x={b.x} />;
    if (b.t === 'quote') return <QuoteBlock key={i} b={b} ctx={ctx} />;
    if (b.t === 'scene') return <SceneBlock key={i} b={b} ctx={ctx} />;
    if (b.t === 'delta') return <DeltaCard key={i} b={b} book={book} />;
    if (b.t === 'journey') return <JourneyCard key={i} b={b} />;
    if (b.t === 'statcard') return <StatCard key={i} ckey={b.char} book={book} mentions={mentions} />;
    if (b.t === 'statrow') return (
      <div className="statrow" key={i}>
        {b.chars.map((c) => <StatCard key={c} ckey={c} book={book} mentions={mentions} />)}
      </div>
    );
    if (b.t === 'letter') return <LetterBlock key={i} b={b} book={book} ctx={ctx} />;
    if (b.t === 'uistat') return <UiStatBlock key={i} b={b} />;
    if (b.t === 'sfx') return <SfxBlock key={i} b={b} />;
    if (b.t === 'dream') return <DreamBlock key={i} b={b} ctx={ctx} />;
    if (b.t === 'flashback') return <FlashbackBlock key={i} b={b} ctx={ctx} />;
    if (b.t === 'ritual') return <RitualBlock key={i} b={b} ctx={ctx} />;
    if (b.t === 'poem') return <PoemBlock key={i} b={b} ctx={ctx} />;
    if (b.t === 'sys') return <SysBlock key={i} b={b} />;
    if (b.t === 'sign') return <SignBlock key={i} b={b} />;
    if (b.t === 'news') return <NewsBlock key={i} b={b} ctx={ctx} />;
    return null;
  };

  const voiceTitle = tts.on ? book.chapters[tts.chap].title : ch.title;
  const speechSupported = typeof window !== 'undefined' && !!window.speechSynthesis;

  return (
    <div className="app" data-theme={theme} data-skin={APP_DEFAULTS.skin.toLowerCase()} style={appStyle}>
      <div className="progline" style={{ width: (overall * 100).toFixed(2) + '%', opacity: chromeOpen ? .9 : .35 }} />
      <div className="topfade" />

      <div className={'stage' + (spread ? ' spread' : '')} ref={stageRef} onScroll={onScroll}
        onMouseUp={handleSelect} onTouchEnd={handleSelect}>
        <div className="spread-frame" ref={frameRef}>
        <div className="article" ref={articleRef}>
          {book.chapters.map((c, i) => {
            /* both layouts mount exactly ONE chapter — the next chapter never
               renders until the reader explicitly moves to it (next-chapter
               button, arrow keys, chapter list). A 1000+ chapter book pays the
               DOM cost of a single chapter, ever. */
            if (i !== cur) return null;
            return (
              <section className="chap" key={i} data-screen-label={c.n}
                ref={(el) => { secRefs.current[i] = el; }}>
                {!spread && i > 0 && (
                  <div className="chap-next chap-prev">
                    <button onClick={() => goChap(i - 1)}>
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                      <span className="chap-next-k">Previous</span>
                      <span className="chap-next-t">{book.chapters[i - 1].title}</span>
                    </button>
                  </div>
                )}
                <div className="chap-eyebrow">{c.n}</div>
                <h2 className="chap-title">{c.title}</h2>
                <div className="chap-metarow">
                  <span className="chap-meta">{readTime(c)} min read</span>
                  {c.unformatted ? (
                    <span className="chap-unformatted">Not yet processed</span>
                  ) : (() => {
                    const s = c.rel, m = relMeta(s), h = relHeat(s);
                    return (
                      <span className={'rel rel-' + m.cls} title={`Story relevance ${s}/10 — ${m.label}`}>
                        <span className="rel-k">Relevance</span>
                        <span className="rel-track"><i style={{ width: s * 10 + '%', background: h }}></i></span>
                        <span className="rel-n" style={{ color: h }}>{s}</span>
                        <span className="rel-lab">{m.label}</span>
                      </span>
                    );
                  })()}
                </div>
                <div className={proseCls + (tts.on && tts.chap === i ? ' listening' : '')}>
                  {c.blocks.map((b, j) => renderBlock(b, j, i))}
                </div>
              </section>
            );
          })}
          {cur === book.chapters.length - 1 && (
            <div className="book-end">
              <div className="scenebreak">· · ·</div>
              <div className="end-note">End of available chapters.</div>
            </div>
          )}
        </div>
        </div>
        {spread && (
          <>
            <button className="pg pg-prev" onClick={() => goPage(-1)} disabled={spreadPage <= 0 && cur <= 0} aria-label="Previous page">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"></path></svg>
            </button>
            <button className="pg pg-next" onClick={() => goPage(1)} disabled={spreadPage >= spreadPages - 1 && cur >= book.chapters.length - 1} aria-label="Next page">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"></path></svg>
            </button>
            <div className="pg-count">{spreadPage + 1}<span>/</span>{spreadPages}</div>
          </>
        )}
      </div>

      <div className={'hint' + (hintMsg && chrome ? ' show' : '')}>{hintMsg || ''}</div>

      <SelectionToolbar seltool={seltool} onReadFromSel={readFromSel} onCopySel={copySel} />
      <EntityPopover ipop={ipop} book={book} mentions={mentions} onClose={() => setIpop(null)} />

      {pop && <div className="scrim" onClick={() => setPop(null)} />}

      <div className={'dock-col ' + (chromeOpen ? '' : 'hidden ') + (APP_DEFAULTS.dockStyle === 'attached' ? 'attached' : '')}>

        {/* next-chapter dock — first child of the dock column, so it always
            stacks ABOVE every other dock element (eta pill, panels, main dock) */}
        {cur + 1 < book.chapters.length && (spread ? spreadPage >= spreadPages - 1 : progress >= 0.98) && (
          <div className="next-dock">
            <button onClick={() => goChap(cur + 1)}>
              <span className="chap-next-k">Next chapter</span>
              <span className="chap-next-t">{book.chapters[cur + 1].title}</span>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"></path></svg>
            </button>
          </div>
        )}

        {tts.playing && pop !== 'voice' && etaSeconds != null && (
          <div className="eta-pill">
            <button className="eta-pill-main" onClick={() => setPop('voice')} title="Read aloud">
              <span className="eq"><i></i><i></i><i></i></span>
              <span className="eta-pill-t"><b>{fmtRemain(etaSeconds)}</b> left · finishes ~{fmtClock(now + etaSeconds * 1000)}</span>
            </button>
            <button className="eta-pill-x" onClick={(e) => { e.stopPropagation(); stopTts(); }} title="Stop reading aloud" aria-label="Stop reading aloud">{I.x}</button>
          </div>
        )}

      {pop === 'chapters' && (
        <ChaptersPanel book={book} cur={cur} readSet={readSet} marks={marks} tts={tts} overall={overall}
          onGoChap={goChap} onLibrary={toLibrary} />
      )}

      {pop === 'voice' && (
        <VoicePanel title={voiceTitle} tts={tts} voices={voices} voiceURI={voiceURI}
          voiceOpen={voiceOpen} setVoiceOpen={setVoiceOpen} rate={rate} etaSeconds={etaSeconds} now={now}
          onTogglePlay={togglePlay} onSkipPara={skipPara} onStop={stopTts}
          onSetRate={setRate} onSetVoiceURI={setVoiceURI}
          fmtRemain={fmtRemain} fmtClock={fmtClock} speechSupported={speechSupported} />
      )}

      {pop === 'theme' && <ThemePanel theme={theme} setTheme={setTheme} />}

      {pop === 'settings' && (
        <SettingsPanel fontSize={fontSize} setFS={setFS} leading={leading} setLead={setLead}
          measure={measure} setMeas={setMeas} pageMode={pageMode} setPageMode={setPageMode}
          wide={wide} font={font} setFont={setFont} />
      )}

      {pop === 'ai' && <AiPanel chapter={ch} status={reanalyseStatus} onReanalyse={onReanalyse} />}

      {/* dock */}
        <div className="dock">
          <button className={'ib' + (pop === 'chapters' ? ' on' : '')} onClick={() => setPop(pop === 'chapters' ? null : 'chapters')} title="Contents">{I.list}</button>
          <div className="dock-sep" />
          <div className="dock-center" onClick={() => setPop(pop === 'chapters' ? null : 'chapters')}>
            <div className="row">
              <span className="ct">{ch.title}</span>
              <span className="pct">{Math.round(progress * 100)}%</span>
            </div>
            <div className="dock-track"><div className="dock-fill" style={{ width: (progress * 100) + '%' }} /></div>
          </div>
          <div className="dock-sep" />
          <button className={'ib' + (tts.on || pop === 'voice' ? ' on' : '')} onClick={() => setPop(pop === 'voice' ? null : 'voice')} title="Read aloud">
            {tts.playing ? <span className="eq"><i></i><i></i><i></i></span> : I.voice}
          </button>
          <button className={'ib ib-bm' + (isMarked ? ' on' : '')} onClick={toggleMark} title="Bookmark chapter">{isMarked ? I.bookmarkOn : I.bookmark}</button>
          <button className={'ib' + (pop === 'settings' ? ' on' : '')} onClick={() => setPop(pop === 'settings' ? null : 'settings')} title="Text settings">
            <span style={{ fontFamily: FONTS[font].stack, fontSize: 17, fontWeight: 500 }}>Aa</span>
          </button>
          <button className={'ib' + (pop === 'theme' ? ' on' : '')} onClick={() => setPop(pop === 'theme' ? null : 'theme')} title="Theme">{I.theme}</button>
          <button className={'ib' + (pop === 'ai' ? ' on' : '')} onClick={() => setPop(pop === 'ai' ? null : 'ai')} title="AI formatting">{I.sparkle}</button>
        </div>
      </div>
    </div>
  );
}
