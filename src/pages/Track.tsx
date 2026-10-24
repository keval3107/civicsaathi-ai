import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, fmtDate, type Complaint } from '../api';
import { CategoryIcon, CopyButton, I, Notice, Severity, Spinner, StatusBadge, statusLabel, usePageTitle } from '../ui';

interface Detail {
  complaint: Complaint;
  explanation: { label: string; text: string; next: string };
  statuses: { id: string; label: string }[];
}

export default function Track() {
  usePageTitle('Track a complaint');
  const { id } = useParams();
  const nav = useNavigate();
  const [input, setInput] = useState(id ?? '');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState('');

  const load = useCallback(async (tid: string) => {
    setLoading(true); setError(null); setDetail(null);
    try {
      setDetail(await api<Detail>(`/api/complaints/${encodeURIComponent(tid)}`));
    } catch (e) { setError(e as ApiError); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (id) { setInput(id); load(id); } else { setDetail(null); setError(null); }
  }, [id, load]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) { setInputError('Enter the tracking ID you were given.'); return; }
    setInputError('');
    if (v.toUpperCase() === id?.toUpperCase()) load(v); else nav(`/track/${encodeURIComponent(v)}`);
  };

  return (
    <div className="container page">
      <header className="page-head">
        <p className="eyebrow">Tracking</p>
        <h1>Track a complaint</h1>
        <p className="lead">Enter your tracking ID. Everything shown here is read from the saved record.</p>
      </header>

      <form className="search-bar" onSubmit={onSubmit} noValidate>
        <div className="field grow">
          <label htmlFor="tid">Tracking ID</label>
          <input
            id="tid" value={input} onChange={(e) => setInput(e.target.value)} placeholder="CSA-XXXXXXXX"
            autoComplete="off" maxLength={20} aria-invalid={!!inputError} aria-describedby={inputError ? 'tid-err' : undefined}
          />
          {inputError && <p className="field-error" id="tid-err" role="alert"><I.CircleAlert size={15} aria-hidden="true" /> {inputError}</p>}
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <><Spinner /> Searching</> : <><I.Search size={18} aria-hidden="true" /> Find complaint</>}
        </button>
      </form>

      <div aria-live="polite">
        {loading && <div className="panel skeleton" aria-label="Loading complaint" />}
        {error && (
          <Notice
            kind={error.status === 404 ? 'warn' : 'error'}
            action={error.status >= 500 || error.code === 'network' ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => id && load(id)}>Retry</button> : undefined}
          >
            {error.status === 404 ? 'No complaint found with this tracking ID. Check for typing mistakes and try again.'
              : error.status >= 500 ? 'The record could not be read right now. Try again in a moment.' : error.message}
          </Notice>
        )}
        {detail && <DetailView d={detail} />}
      </div>
      <AskAgent />
    </div>
  );
}

function DetailView({ d }: { d: Detail }) {
  const c = d.complaint;
  const idx = d.statuses.findIndex((s) => s.id === c.status);
  const hist = new Map((c.history ?? []).map((h) => [h.status, h.at]));
  return (
    <section className="track-grid reveal" aria-labelledby="detail-h">
      <div className="panel summary">
        <div className="summary-top">
          <span className="cat-icon"><CategoryIcon category={c.category} size={22} /></span>
          <div>
            <p className="label">Tracking ID</p>
            <h2 id="detail-h" className="track-id sm">{c.trackingId}</h2>
          </div>
          <StatusBadge status={c.status} />
        </div>
        <div className="row tight"><CopyButton text={c.trackingId} /></div>
        {c.isDemo && <Notice kind="warn">Demonstration record. This is sample data, not a real municipal complaint.</Notice>}
        <div className="explain">
          <h3>What this means</h3>
          <p>{d.explanation.text}</p>
          <p><strong>Next:</strong> {d.explanation.next}</p>
        </div>
        <dl className="kv">
          <dt>Issue</dt><dd>{c.categoryLabel}</dd>
          <dt>Severity</dt><dd><Severity level={c.severity} /></dd>
          <dt>Locality</dt><dd>{c.locality}</dd>
          <dt>Ward</dt><dd>{c.ward.name}, {c.ward.zone}</dd>
          <dt>Department</dt><dd>{c.department.name}</dd>
          <dt>Created</dt><dd>{fmtDate(c.createdAt)}</dd>
          <dt>Last updated</dt><dd>{fmtDate(c.updatedAt)}</dd>
          {c.description && (<><dt>Details</dt><dd>{c.description}</dd></>)}
        </dl>
        {!c.isDemo && <p className="hint">Stored in the CivicSaathi AI prototype. Not submitted to the Ahmedabad Municipal Corporation.</p>}
      </div>

      <div className="panel">
        {c.imageRef && <img className="ticket-photo" src={`/api/uploads/${c.imageRef}`} alt={`Photo submitted for ${c.categoryLabel}`} loading="lazy" />}
        <h3 className="panel-title">Status history</h3>
        <ol className="status-tl" aria-label="Status timeline">
          {d.statuses.map((s, i) => {
            const at = hist.get(s.id);
            const state = i < idx ? 'done' : i === idx ? 'current' : 'next';
            return (
              <li key={s.id} className={state} aria-current={i === idx ? 'step' : undefined}>
                <span className="s-node" aria-hidden="true">{state === 'done' || state === 'current' ? <I.Check size={14} /> : null}</span>
                <div>
                  <strong>{statusLabel(s.id)}</strong>
                  <span className="muted small">
                    {at ? fmtDate(at) : state === 'next' ? 'Not reached yet' : 'No time recorded'}
                    {c.isDemo && at ? ' (demonstration)' : ''}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function AskAgent() {
  const [msg, setMsg] = useState('');
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) { setErr('Type a question first.'); return; }
    setBusy(true); setErr(''); setReply('');
    try {
      const r = await api<{ reply: string }>('/api/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
      setReply(r.reply);
    } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <form className="panel ask" onSubmit={ask} noValidate>
      <h2 className="panel-title">Ask the agent</h2>
      <p className="muted">For example: "What is the status of CSA-XXXXXXXX?" The answer is built from the saved record. The lookup appears on <Link to="/activity">Agent activity</Link>.</p>
      <div className="search-bar flat">
        <div className="field grow">
          <label htmlFor="ask">Your question</label>
          <input id="ask" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} placeholder="What's the status of my complaint?" />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={busy}>{busy ? <><Spinner /> Asking</> : 'Ask'}</button>
      </div>
      <div aria-live="polite">
        {err && <Notice kind="error">{err}</Notice>}
        {reply && <Notice kind="info">{reply}</Notice>}
      </div>
    </form>
  );
}
