import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, type Complaint } from '../api';
import { CategoryIcon, I, Notice, Spinner, StatusBadge, useMeta, usePageTitle } from '../ui';

export default function Recent() {
  usePageTitle('Recent reports');
  const { meta } = useMeta();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<Complaint[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q, category, status });
      api<{ complaints: Complaint[] }>(`/api/complaints?${p}`)
        .then((r) => { setItems(r.complaints); setError(''); })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, category, status, tick]);

  const filtered = !!(q || category || status);
  return (
    <div className="container page">
      <header className="page-head">
        <p className="eyebrow">Reports in this prototype</p>
        <h1>Recent reports</h1>
        <p className="lead">Records marked Demonstration are sample data. They do not show real municipal progress.</p>
      </header>
      <form className="filters" onSubmit={(e) => e.preventDefault()} role="search">
        <div className="field grow">
          <label htmlFor="q">Search</label>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tracking ID, locality or ward" />
        </div>
        <div className="field">
          <label htmlFor="fc">Category</label>
          <select id="fc" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fs">Status</label>
          <select id="fs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {meta?.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        {filtered && <button type="button" className="btn btn-quiet" onClick={() => { setQ(''); setCategory(''); setStatus(''); }}>Clear filters</button>}
      </form>

      <div aria-live="polite" className={loading && items ? 'list-wrap is-loading' : 'list-wrap'}>
        {error && (
          <Notice kind="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setTick((t) => t + 1)}>Retry</button>}>{error}</Notice>
        )}
        {!items && loading && <p className="processing"><Spinner size={18} /> Loading reports.</p>}
        {items && items.length === 0 && (
          <div className="empty">
            <I.Search size={22} aria-hidden="true" />
            <p><strong>No reports match these filters.</strong></p>
            <p className="muted">Try a different search or clear the filters.</p>
          </div>
        )}
        <ul className="report-list">
          {items?.map((c) => (
            <li key={c.trackingId}>
              <Link to={`/track/${c.trackingId}`} className="report-row">
                <span className="cat-icon"><CategoryIcon category={c.category} /></span>
                <div className="report-main">
                  <div><span className="rid">{c.trackingId}</span>{c.isDemo && <span className="tag tag-warn">Demonstration</span>}</div>
                  <div className="rtitle">{c.categoryLabel} in {c.locality}</div>
                  <div className="muted small">{c.ward.name} ward, {c.department.name}. Reported {fmtDate(c.createdAt)}</div>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
