'use client';

import { ICONS as I } from '@/components/icons';

/* Lets a reader force a specific chapter to be re-run through the OpenRouter
   formatting pass (e.g. it came out under-formatted, or a prompt/model change
   should apply retroactively) instead of only ever formatting once. */
export default function AiPanel({ status, onReanalyse }) {
  const busy = status === 'working';
  return (
    <div className="panel ai-panel" role="dialog" aria-labelledby="ai-panel-title">
      <div id="ai-panel-title" className="ai-confirm-title">
        {status === 'error' ? 'Reanalysis failed' : busy ? 'Reanalysing chapter…' : 'Reanalyse this chapter?'}
      </div>
      <button className={'ai-reanalyse' + (busy ? ' busy' : '')} onClick={onReanalyse} disabled={busy}>
        {busy ? 'Working…' : <>{I.refresh} {status === 'error' ? 'Try again' : 'Confirm'}</>}
      </button>
    </div>
  );
}
