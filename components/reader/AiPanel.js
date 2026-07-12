'use client';

import { ICONS as I } from '@/components/icons';

/* Lets a reader force a specific chapter to be re-run through the OpenRouter
   formatting pass (e.g. it came out under-formatted, or a prompt/model change
   should apply retroactively) instead of only ever formatting once. */
export default function AiPanel({ chapter, status, onReanalyse }) {
  const busy = status === 'working';
  return (
    <div className="panel ai-panel" role="dialog" aria-labelledby="ai-panel-title">
      <div className="ai-confirm">
        <div id="ai-panel-title" className="ai-confirm-title">Reanalyse chapter?</div>
        <div className="ai-confirm-sub">This replaces the current formatting for {chapter.title}.</div>
      </div>
      <button className={'ai-reanalyse' + (busy ? ' busy' : '')} onClick={onReanalyse} disabled={busy}>
        {busy ? 'Reanalysing…' : <>{I.refresh} Reanalyse</>}
      </button>
      {status === 'error' && <div className="ai-err">Reanalysis failed — try again.</div>}
    </div>
  );
}
