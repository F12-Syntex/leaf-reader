'use client';

import { ICONS as I } from '@/components/icons';

export default function VoicePanel({
  title, tts, voices, voiceURI, voiceOpen, setVoiceOpen, rate, etaSeconds, now,
  onTogglePlay, onSkipPara, onStop, onSetRate, onSetVoiceURI, fmtRemain, fmtClock, speechSupported,
}) {
  return (
    <div className="panel">
      <div className="pop-title">Read aloud</div>
      <div className="voice-row">
        <button className="vbtn small" onClick={() => onSkipPara(-1)} title="Previous paragraph">{I.skipB}</button>
        <button className="vbtn main" onClick={onTogglePlay} title={tts.playing ? 'Pause' : 'Play'}>{tts.playing ? I.pause : I.play}</button>
        <button className="vbtn small" onClick={() => onSkipPara(1)} title="Next paragraph">{I.skipF}</button>
        <div className="voice-status">
          <div className="vs-t">{title}</div>
          <div className="vs-s">{!speechSupported ? 'Speech not supported in this browser'
            : tts.on ? (tts.playing ? 'Reading aloud…' : 'Paused') : 'Play to listen from this chapter'}</div>
        </div>
        {tts.on && <button className="vbtn small stop" onClick={onStop} title="Stop" aria-label="Stop">{I.stop}</button>}
      </div>
      {tts.on && etaSeconds != null && (
        <div className="eta">
          <span className="eta-clock">{I.clock}</span>
          <span className="eta-left"><b>{fmtRemain(etaSeconds)}</b> left in chapter</span>
          {tts.playing && <span className="eta-fin">finishes ~{fmtClock(now + etaSeconds * 1000)}</span>}
        </div>
      )}
      <div className="set-group" style={{ marginTop: 18 }}>
        <div className="set-label"><span>Speed</span><b>{rate}×</b></div>
        <div className="seg">
          {[0.75, 1, 1.25, 1.5, 2].map((r) => (
            <button key={r} className={rate === r ? 'on' : ''} onClick={() => onSetRate(r)}>{r}×</button>
          ))}
        </div>
      </div>
      {voices.length > 0 && (
        <div className="set-group" style={{ marginTop: 18 }}>
          <div className="set-label"><span>Voice</span></div>
          <div className="vselect">
            <button className={'vselect-btn' + (voiceOpen ? ' open' : '')} onClick={() => setVoiceOpen((o) => !o)}>
              <span className="vselect-cur">{(voices.find((v) => v.voiceURI === voiceURI) || voices[0]).name.replace(/\s*\([^)]*\)\s*$/, '')}</span>
              <span className="vselect-chev">{I.chev}</span>
            </button>
            {voiceOpen && (
              <>
                <div className="vselect-cover" onClick={() => setVoiceOpen(false)} />
                <div className="vselect-menu">
                  {voices.map((v, vi) => (
                    <button key={v.voiceURI + '#' + vi} className={'vopt' + (voiceURI === v.voiceURI ? ' on' : '')}
                      onClick={() => { onSetVoiceURI(v.voiceURI); setVoiceOpen(false); }}>
                      <span className="vopt-main">
                        <span className="vopt-name">{v.name.replace(/\s*\([^)]*\)\s*$/, '')}</span>
                        <span className="vopt-lang">{v.lang}{v.localService ? '' : ' · online'}</span>
                      </span>
                      {voiceURI === v.voiceURI && <span className="vopt-tick">{I.tick}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
