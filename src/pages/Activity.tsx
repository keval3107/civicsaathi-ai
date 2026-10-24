import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, type AgentEvent } from '../api';
import { I, Notice, Spinner, usePageTitle } from '../ui';

const LABELS: Record<string, string> = {
  analyze_civic_image: 'Analyse photo',
  lookup_ward: 'Look up ward',
  lookup_department: 'Choose department',
  check_duplicate_complaint: 'Check duplicates',
  create_complaint: 'Create complaint record',
  get_complaint_status: 'Get complaint status',
};

export default function Activity() {
  usePageTitle('Agent activity');
  const [events, setEvents] = useState<AgentEvent[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    api<{ events: AgentEvent[] }>('/api/activity')
      .then((r) => { setEvents(r.events); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="container page narrow">
      <header className="page-head">
        <p className="eyebrow">Tool log</p>
        <h1>Agent activity</h1>
        <p className="lead">Every tool the agent ran in this browser session, with the real outcome and time taken. Only short summaries are shown.</p>
      </header>
      <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
        {loading ? <Spinner /> : <I.RefreshCw size={16} aria-hidden="true" />} Refresh
      </button>
      <div aria-live="polite">
        {error && <Notice kind="error">{error}</Notice>}
        {events && events.length === 0 && (
          <div className="empty">
            <I.Clock size={22} aria-hidden="true" />
            <p><strong>No activity yet.</strong></p>
            <p className="muted">Report an issue or look up a complaint to see tool calls here.</p>
          </div>
        )}
      </div>
      <ol className="events">
        {events?.map((e) => (
          <li key={e.id} className={`reveal ${e.success ? 'ok' : 'fail'}`}>
            <div className="ev-head">
              <strong>{LABELS[e.tool] ?? e.tool}</strong>
              <span className={`tag ${e.success ? 'tag-ok' : 'tag-err'}`}>{e.success ? 'Succeeded' : 'Failed'}</span>
            </div>
            <code className="ev-tool">{e.tool}</code>
            <dl className="kv compact">
              <dt>Input</dt><dd>{e.input}</dd>
              <dt>Result</dt><dd>{e.result}</dd>
              <dt>Duration</dt><dd>{e.durationMs} ms</dd>
              <dt>Time</dt><dd>{fmtDate(e.at)}</dd>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}
