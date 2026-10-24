import {
  createContext, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import {
  Check, CircleAlert, CircleCheck, CircleQuestionMark, CircleX, Construction, Copy, Droplets, Info,
  Lightbulb, Loader, Menu, TriangleAlert, Trash2, Upload, X, ImagePlus, MapPin, ArrowRight, RefreshCw, Search, Clock,
} from 'lucide-react';
import { api, type Meta } from './api';

const MetaCtx = createContext<{ meta: Meta | null; error: boolean }>({ meta: null, error: false });
export const useMeta = () => useContext(MetaCtx);

export function MetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch(() => setError(true));
  }, []);
  return <MetaCtx.Provider value={{ meta, error }}>{children}</MetaCtx.Provider>;
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | CivicSaathi AI`;
  }, [title]);
}

export const I = {
  Check, CircleAlert, CircleCheck, CircleX, Copy, Info, Menu, TriangleAlert, Upload, X, ImagePlus, MapPin,
  ArrowRight, RefreshCw, Search, Clock, Loader,
};

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader className="spin" size={size} aria-hidden="true" />;
}

const CAT_ICON: Record<string, typeof Construction> = {
  pothole: Construction, garbage: Trash2, broken_streetlight: Lightbulb, waterlogging: Droplets,
};
export function CategoryIcon({ category, size = 20 }: { category: string; size?: number }) {
  const C = CAT_ICON[category] ?? CircleQuestionMark;
  return <C size={size} aria-hidden="true" />;
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved',
};
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;
export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`badge badge-${status}`} key={status}>{statusLabel(status)}</span>
);

/** Severity is shown as a labelled 3-step meter, never by colour alone. */
export function Severity({ level }: { level: string }) {
  const norm = (level || '').toLowerCase();
  const n = norm === 'critical' ? 3 : norm === 'high' ? 3 : norm === 'medium' ? 2 : norm === 'low' ? 1 : 0;
  return (
    <span className={`severity sev-${norm}`}>
      <span className="sev-bars" aria-hidden="true">
        {[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
      </span>
      <span className="cap">{norm || 'unknown'} severity</span>
    </span>
  );
}

export const Notice = ({ kind = 'info', children, id, action }: {
  kind?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode; id?: string; action?: ReactNode;
}) => {
  const Icon = kind === 'success' ? CircleCheck : kind === 'info' ? Info : kind === 'warn' ? TriangleAlert : CircleAlert;
  return (
    <div id={id} className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div className="notice-body">{children}</div>
      {action}
    </div>
  );
};

export function CopyButton({ text, label = 'Copy ID' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const t = useRef<number>(0);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch { setState('fail'); }
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setState('idle'), 2000);
  };
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
        {state === 'ok' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : label}
      </button>
      <span className="sr-only" role="status">{state === 'ok' ? 'Tracking ID copied to clipboard' : state === 'fail' ? 'Could not copy' : ''}</span>
    </>
  );
}

/** Accessible modal built on the native dialog element (focus trap and Escape handled by the browser). */
export function Dialog({ open, onClose, title, children, labelId }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; labelId: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref} className="dialog" aria-labelledby={labelId} onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="dialog-inner">
        <div className="dialog-head">
          <h2 id={labelId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={20} aria-hidden="true" /></button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
