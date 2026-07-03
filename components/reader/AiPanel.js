'use client';

import { ICONS as I } from '@/components/icons';

/* Lets a reader force a specific chapter to be re-run through the OpenRouter
   formatting pass (e.g. it came out under-formatted, or a prompt/model change
   should apply retroactively) instead of only ever formatting once. */
export default function AiPanel({ chapter, status, onReanalyse }) {
  const busy = status === 'working';
  return (
    <div className="panel">
      <div className="pop-title">AI formatting</div>
      <div className="ai-chap">
        <div className="ai-chap-t">{chapter.title}</div>
        <div className="ai-chap-s">
          {chapter.unformatted ? 'Not processed yet' : `Relevance ${chapter.rel}/10`}
        </div>
      </div>
      <button className={'ai-reanalyse' + (busy ? ' busy' : '')} onClick={onReanalyse} disabled={busy}>
        {busy ? 'Reanalysing…' : <>{I.refresh} Reanalyse this chapter</>}
      </button>
      {status === 'error' && <div className="ai-err">Reanalysis failed — try again.</div>}
      <div className="ai-note">Re-runs this chapter through the AI formatting pass and overwrites its current formatting. Useful if a chapter came out under-formatted or you've changed formatting rules.</div>
    </div>
  );
}
