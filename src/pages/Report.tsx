import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  api, ApiError, fmtDate,
  type AgentEvent, type Analysis, type Complaint, type RouteResult,
} from '../api';
import {
  CategoryIcon, CopyButton, Dialog, I, Notice, Severity, Spinner, StatusBadge, useMeta, usePageTitle,
} from '../ui';
import { AgentTimeline, type TimelineStep, type StepState } from '../AgentTimeline';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ROUTABLE = ['pothole', 'garbage', 'broken_streetlight', 'waterlogging'];

type Busy = '' | 'analyze' | 'route' | 'create';

export default function Report() {
  usePageTitle('Report an issue');
  const { meta } = useMeta();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [fileError, setFileError] = useState('');
  const [locality, setLocality] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<Busy>('');
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [uploadId, setUploadId] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [category, setCategory] = useState('');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [created, setCreated] = useState<{ complaint: Complaint; replayed: boolean } | null>(null);
  const idemKey = useRef(crypto.randomUUID());
  const resultRef = useRef<HTMLDivElement>(null);

  const refreshEvents = useCallback(() => {
    api<{ events: AgentEvent[] }>('/api/activity').then((r) => setEvents(r.events)).catch(() => undefined);
  }, []);
  useEffect(refreshEvents, [refreshEvents]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clearResults = () => {
    setAnalysis(null); setRoute(null); setCategory(''); setConfirmed(false); setCreateError(''); setError('');
  };

  const pick = (f: File | undefined | null) => {
    setFileError('');
    if (!f) return;
    if (!TYPES.includes(f.type)) { setFileError('Unsupported file type. Use a JPG, PNG or WEBP image.'); return; }
    if (f.size > (meta?.maxImageBytes ?? 5 * 1024 * 1024)) { setFileError('This image is larger than 5 MB. Choose a smaller photo.'); return; }
    setFile(f);
    clearResults();
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); };
  const removeFile = () => {
    setFile(null); setUploadId(''); setFileError(''); clearResults();
    if (fileRef.current) fileRef.current.value = '';
  };

  const runRoute = useCallback(async (loc: string, cat: string) => {
    setBusy('route'); setError(''); setConfirmed(false);
    idemKey.current = crypto.randomUUID();
    try {
      setRoute(await api<RouteResult>('/api/route', { method: 'POST', body: JSON.stringify({ locality: loc, category: cat }) }));
    } catch (e) {
      setRoute(null);
      setError((e as ApiError).message);
    } finally { setBusy(''); refreshEvents(); }
  }, [refreshEvents]);

  const localityError = touched && !locality.trim() ? 'Enter your area or locality.' : '';
  const canAnalyze = !!file && !!locality.trim() && busy === '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!file) { setFileError('Add a photo of the issue first.'); return; }
    if (!locality.trim()) return;
    clearResults();
    setBusy('analyze');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await api<{ uploadId: string; analysis: Analysis }>('/api/analyze', { method: 'POST', body: fd });
      setUploadId(r.uploadId); setAnalysis(r.analysis);
      setCategory(r.analysis.category);
      refreshEvents();
      if (ROUTABLE.includes(r.analysis.category)) await runRoute(locality, r.analysis.category);
      else setBusy('');
      setTimeout(() => resultRef.current?.focus({ preventScroll: false }), 60);
    } catch (err) {
      setError((err as ApiError).message);
      setBusy('');
      refreshEvents();
    }
  };

  const create = async () => {
    if (!analysis) return;
    setBusy('create'); setCreateError('');
    try {
      const r = await api<{ complaint: Complaint; replayed: boolean }>('/api/complaints', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: idemKey.current, confirmed: true, category, severity: analysis.severity,
          locality, imageRef: uploadId || null, description: description || null,
          analysisMode: analysis.failed || analysis.category !== category ? 'manual' : analysis.mode,
        }),
      });
      setCreated(r);
      setReviewOpen(false);
    } catch (e) {
      setCreateError((e as ApiError).message + ' Nothing was filed. You can try again.');
    } finally { setBusy(''); refreshEvents(); }
  };

  const reset = () => {
    removeFile(); setLocality(''); setTouched(false); setDescription(''); setCreated(null);
    idemKey.current = crypto.randomUUID();
  };

  const categories = meta?.categories ?? [];
  const routed = route?.ward.status === 'resolved' && route.department?.status === 'resolved';
  const ward = route?.ward;

  const steps: TimelineStep[] = useMemo(() => {
    const s = (id: string, title: string, state: StepState, detail?: string, tool?: string): TimelineStep => ({ id, title, state, detail, tool });
    const a = analysis;
    const analyzeState: StepState = busy === 'analyze' ? 'running'
      : !a ? 'waiting' : a.failed ? 'failed' : ['uncertain', 'other'].includes(a.category) ? 'attention' : 'done';
    const routing = busy === 'route';
    const wr = route?.ward;
    return [
      s('analyze', 'Image analysis', analyzeState,
        a?.failed ? a.message : a && ['uncertain', 'other'].includes(a.category) ? 'The photo is unclear. Choose the category yourself.' : a ? `Identified as ${CAT_LABEL[a.category] || a.category}${a.confidence != null ? ` (${Math.round(a.confidence * 100)}% confidence)` : ''}.` : undefined,
        'analyze_civic_image'),
      s('locality', 'Locality resolution', routing ? 'running' : !wr ? 'waiting' : wr.status === 'resolved' ? 'done' : 'attention',
        wr ? (wr.status === 'resolved' ? `"${wr.locality}" found in the demo dataset.` : wr.message) : undefined, 'lookup_ward'),
      s('ward', 'Ward lookup', wr?.status === 'resolved' ? 'done' : 'waiting',
        wr?.status === 'resolved' && wr.ward ? `${wr.ward.name} ward, ${wr.ward.zone}` : undefined),
      s('dept', 'Department selection', route?.department?.status === 'resolved' ? 'done' : routing ? 'waiting' : route?.department ? 'attention' : 'waiting',
        route?.department?.status === 'resolved' ? route.department.department?.name : route?.department?.message, 'lookup_department'),
      s('dup', 'Duplicate check', route?.duplicates ? (route.duplicates.duplicates.length ? 'attention' : 'done') : 'waiting',
        route?.duplicates ? (route.duplicates.duplicates.length ? `${route.duplicates.duplicates.length} possible duplicate(s). Review before continuing.` : 'No open duplicates found.') : undefined,
        'check_duplicate_complaint'),
      s('confirm', 'Your confirmation', created ? 'done' : routed ? 'attention' : 'waiting',
        created ? 'You confirmed the details.' : routed ? 'Waiting for you to review and confirm.' : undefined),
      s('create', 'Complaint creation', busy === 'create' ? 'running' : created ? 'done' : createError ? 'failed' : 'waiting',
        createError || undefined, 'create_complaint'),
      s('track', 'Tracking ID returned', created ? 'done' : 'waiting', created ? created.complaint.trackingId : undefined),
    ];
  }, [analysis, busy, route, routed, created, createError]);

  if (created) {
    return (
      <div className="container page">
        <div className="workspace">
          <Success data={created} onReset={reset} />
          <aside className="side"><AgentTimeline steps={steps} events={events} /></aside>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <header className="page-head">
        <p className="eyebrow">Ahmedabad civic issues</p>
        <h1>Report a civic issue</h1>
        <p className="lead">Add a photo and your area. The agent finds the ward and department, checks for duplicates, and creates a record only after you confirm.</p>
      </header>

      <div className="workspace">
        <div className="main-col">
          <form onSubmit={submit} className="panel" noValidate>
            <h2 className="panel-title"><span className="num">1</span> Photo and area</h2>

            <div
              className={`dropzone${drag ? ' is-drag' : ''}${preview ? ' has-file' : ''}${fileError ? ' has-error' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
            >
              {preview ? (
                <div className="preview">
                  <img src={preview} alt="Selected issue photo preview" />
                  <div className="preview-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>Replace</button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={removeFile}>Remove</button>
                  </div>
                </div>
              ) : (
                <div className="drop-empty">
                  <span className="drop-icon"><I.ImagePlus size={26} aria-hidden="true" /></span>
                  <p><strong>{drag ? 'Drop the photo to add it' : 'Drag a photo here'}</strong></p>
                  <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Choose a photo</button>
                  <p className="hint">JPG, PNG or WEBP, up to 5 MB</p>
                </div>
              )}
              <input
                ref={fileRef} id="photo" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="sr-only" aria-label="Issue photo" aria-describedby={fileError ? 'photo-err' : undefined}
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </div>
            {fileError && <p className="field-error" id="photo-err" role="alert"><I.CircleAlert size={15} aria-hidden="true" /> {fileError}</p>}

            <div className="field">
              <label htmlFor="locality">Area or locality in Ahmedabad</label>
              <input
                id="locality" list="locality-list" value={locality} maxLength={80} autoComplete="off"
                aria-invalid={!!localityError} aria-describedby={localityError ? 'loc-err' : 'loc-hint'}
                onChange={(e) => { setLocality(e.target.value); if (route) { setRoute(null); } }}
                onBlur={() => setTouched(true)} placeholder="For example, Navrangpura"
              />
              <datalist id="locality-list">
                {meta?.localities.map((l) => <option key={l} value={l} />)}
              </datalist>
              {localityError
                ? <p className="field-error" id="loc-err" role="alert"><I.CircleAlert size={15} aria-hidden="true" /> {localityError}</p>
                : <p className="hint" id="loc-hint">Suggestions come from the demonstration dataset.</p>}
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            <button type="submit" className="btn btn-primary btn-block" disabled={!canAnalyze}>
              {busy === 'analyze' ? <><Spinner /> Analysing photo</> : busy === 'route' ? <><Spinner /> Finding ward</> : analysis ? 'Analyse again' : 'Analyse and find ward'}
            </button>
            {!file || !locality.trim()
              ? <p className="hint center">Add a photo and an area to continue.</p> : null}
          </form>

          <div ref={resultRef} tabIndex={-1} className="results" aria-live="polite" aria-busy={busy !== ''}>
            {busy === 'analyze' && (
              <div className="panel scanning">
                {preview && <img src={preview} alt="" className="scan-thumb" />}
                <p className="processing"><Spinner size={18} /> The agent is analysing the photo.</p>
              </div>
            )}

            {analysis && (
              <AnalysisPanel
                analysis={analysis} category={category} categories={categories} preview={preview}
                onChange={(c) => { setCategory(c); setCreateError(''); if (ROUTABLE.includes(c)) runRoute(locality, c); else setRoute(null); }}
              />
            )}

            {analysis && ROUTABLE.includes(category) && (
              <RoutingPanel route={route} busy={busy === 'route'} locality={locality} setLocality={setLocality}
                recheck={() => runRoute(locality, category)} />
            )}
            {route?.duplicates && route.duplicates.duplicates.length > 0 && <DuplicatePanel dups={route.duplicates.duplicates} />}

            {analysis && routed && (
              <div className="action-bar">
                <div>
                  <strong>Ready to review</strong>
                  <p className="hint">Nothing is created until you confirm in the next step.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => { setConfirmed(false); setReviewOpen(true); }}>
                  Review and create <I.ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="side"><AgentTimeline steps={steps} events={events} /></aside>
      </div>

      <Dialog open={reviewOpen} onClose={() => { if (busy !== 'create') setReviewOpen(false); }} title="Review and confirm" labelId="review-h">
        {analysis && ward?.ward && route?.department?.department && (
          <>
            <dl className="kv">
              <dt>Issue</dt><dd>{categories.find((c) => c.id === category)?.label}</dd>
              <dt>Severity</dt><dd><Severity level={analysis.severity} /></dd>
              <dt>Area</dt><dd>{ward.locality}, {ward.ward.name} ward</dd>
              <dt>Department</dt><dd>{route.department.department.name}</dd>
              <dt>Photo</dt><dd>{file?.name}</dd>
            </dl>
            <div className="field">
              <label htmlFor="desc">Extra details (optional)</label>
              <textarea id="desc" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Nearest landmark, how long it has been there" />
              <p className="hint">Do not include names, phone numbers or other personal details.</p>
            </div>
            <label className="check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>These details are correct. I understand this creates a record in this prototype only. It is not filed with the AMC.</span>
            </label>
            {createError && <Notice kind="error">{createError}</Notice>}
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setReviewOpen(false)} disabled={busy === 'create'}>Back</button>
              <button type="button" className="btn btn-primary" onClick={create} disabled={!confirmed || busy === 'create'}>
                {busy === 'create' ? <><Spinner /> Saving</> : 'Create complaint record'}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

const CAT_LABEL: Record<string, string> = {
  pothole: 'Pothole', garbage: 'Garbage accumulation', broken_streetlight: 'Broken streetlight',
  waterlogging: 'Waterlogging', other: 'Other issue', uncertain: 'Unclear',
};

function AnalysisPanel({ analysis, category, categories, preview, onChange }: {
  analysis: Analysis; category: string; categories: { id: string; label: string }[]; preview: string | null; onChange: (c: string) => void;
}) {
  const unclear = ['uncertain', 'other'].includes(analysis.category);
  const changed = category !== analysis.category;
  return (
    <section className="panel reveal" aria-labelledby="an-h">
      <h2 className="panel-title" id="an-h"><span className="num">2</span> Photo analysis
        <span className={`tag ${analysis.mode === 'demo' ? 'tag-warn' : 'tag-ok'}`}>
          {analysis.mode === 'demo' ? 'Simulated, not AI' : 'Gemini AI'}
        </span>
      </h2>
      <div className="analysis">
        {preview && <img className="analysis-img" src={preview} alt="" />}
        <div className="analysis-body">
          {analysis.failed ? (
            <Notice kind="warn">{analysis.message || 'Image analysis is unavailable right now. You can choose the category yourself.'}</Notice>
          ) : (
            <>
              <p className="cat-line"><span className={`cat-icon${unclear ? ' unclear' : ''}`}><CategoryIcon category={analysis.category} /></span>
                <strong>{CAT_LABEL[analysis.category] ?? analysis.category}</strong></p>
              <p className="meta-line">
                <Severity level={analysis.severity} />
                <span className="conf">{analysis.confidence != null ? `Confidence ${Math.round(analysis.confidence * 100)}%` : 'Confidence not available in demo mode'}</span>
              </p>
              {(analysis.description || analysis.evidence) && (
                <p className="evidence"><span className="label">Evidence</span> {analysis.description || analysis.evidence}</p>
              )}
              {unclear && <Notice kind="warn">The photo is not clear enough to decide. Choose the category below. We do not guess.</Notice>}
            </>
          )}
        </div>
      </div>
      <div className="field">
        <label htmlFor="category">Confirmed issue category</label>
        <select id="category" value={category} onChange={(e) => onChange(e.target.value)}>
          {!ROUTABLE.includes(category) && <option value={category}>Select a category</option>}
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {changed && <p className="hint">You changed the category from the analysis result.</p>}
      </div>
    </section>
  );
}

function RoutingPanel({ route, busy, locality, setLocality, recheck }: {
  route: RouteResult | null; busy: boolean; locality: string; setLocality: (s: string) => void; recheck: () => void;
}) {
  return (
    <section className="panel reveal" aria-labelledby="rt-h">
      <h2 className="panel-title" id="rt-h"><span className="num">3</span> Ward and department</h2>
      {busy && <p className="processing"><Spinner size={18} /> Looking up ward and department.</p>}
      {!busy && route?.ward.status === 'resolved' && route.ward.ward && (
        <>
          <div className="route-grid">
            <div className="route-item">
              <I.MapPin size={18} aria-hidden="true" />
              <div><span className="label">Ward</span><strong>{route.ward.ward.name}</strong><span className="muted small">{route.ward.ward.zone}, code {route.ward.ward.id}</span></div>
            </div>
            <div className="route-item">
              <I.Check size={18} aria-hidden="true" />
              <div><span className="label">Department</span><strong>{route.department?.department?.name ?? 'Not available'}</strong><span className="muted small">{route.department?.office}</span></div>
            </div>
          </div>
          <p className="why"><span className="label">Why this routing</span>{route.department?.explanation ?? route.department?.message}</p>
          <p className="hint">Demonstration data. Ward codes are internal identifiers, not official AMC numbers.</p>
        </>
      )}
      {!busy && route && route.ward.status !== 'resolved' && (
        <>
          <Notice kind="warn">
            {route.ward.message}
            {route.ward.status === 'ambiguous' && route.ward.candidates && (
              <> Possible wards: {route.ward.candidates.map((w) => w.name).join(', ')}.</>
            )}
          </Notice>
          {!!route.ward.suggestions?.length && (
            <p className="suggest">Did you mean {route.ward.suggestions.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => setLocality(s)}>{s}</button>
            ))}</p>
          )}
          <div className="field">
            <label htmlFor="locality2">Area or locality</label>
            <input id="locality2" value={locality} onChange={(e) => setLocality(e.target.value)} list="locality-list" />
          </div>
          <button type="button" className="btn btn-secondary" onClick={recheck} disabled={!locality.trim()}>Check area again</button>
          <p className="hint">No complaint can be created until the area matches one ward.</p>
        </>
      )}
    </section>
  );
}

function DuplicatePanel({ dups }: { dups: NonNullable<RouteResult['duplicates']>['duplicates'] }) {
  return (
    <section className="panel panel-amber reveal" aria-labelledby="dup-h">
      <h2 className="panel-title" id="dup-h"><I.TriangleAlert size={18} aria-hidden="true" /> Possible duplicates</h2>
      <p>Open reports of the same type in this ward. If yours is a different problem, you can still continue.</p>
      <ul className="dup-list">
        {dups.map((d) => (
          <li key={d.trackingId}>
            <div>
              <Link to={`/track/${d.trackingId}`} target="_blank" rel="noreferrer">{d.trackingId}</Link>
              {d.isDemo && <span className="tag tag-warn">Demonstration</span>}
              <div className="muted small">{d.locality}{d.sameLocality ? ' (same locality)' : ''}. Reported {fmtDate(d.createdAt)}</div>
            </div>
            <StatusBadge status={d.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Success({ data, onReset }: { data: { complaint: Complaint; replayed: boolean }; onReset: () => void }) {
  usePageTitle('Complaint recorded');
  const c = data.complaint;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="main-col">
      <div className="panel success" role="status" ref={ref} tabIndex={-1}>
        <div className="success-head">
          <span className="success-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <h1>{data.replayed ? 'This report was already saved' : 'Complaint record created'}</h1>
        </div>
        <p className="label">Your tracking ID</p>
        <p className="track-id" id="tracking-id">{c.trackingId}</p>
        <div className="row"><CopyButton text={c.trackingId} /></div>
        <dl className="kv">
          <dt>Issue</dt><dd>{c.categoryLabel}</dd>
          <dt>Locality</dt><dd>{c.locality}, {c.ward.name} ward</dd>
          <dt>Department</dt><dd>{c.department.name}</dd>
          <dt>Status</dt><dd><StatusBadge status={c.status} /></dd>
          <dt>Created</dt><dd>{fmtDate(c.createdAt)}</dd>
        </dl>
        <Notice kind="info">Saved in the CivicSaathi AI prototype database. It has not been sent to the Ahmedabad Municipal Corporation.</Notice>
        <div className="row">
          <Link className="btn btn-primary" to={`/track/${c.trackingId}`}>Track this complaint</Link>
          <button type="button" className="btn btn-secondary" onClick={onReset}>Report another issue</button>
        </div>
      </div>
    </div>
  );
}
