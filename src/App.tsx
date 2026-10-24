import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { I, useMeta } from './ui';
import Report from './pages/Report';
import Track from './pages/Track';
import Recent from './pages/Recent';
import Activity from './pages/Activity';
import { Privacy, Terms, NotFound } from './pages/Static';

const NAV = [
  { to: '/', label: 'Report an issue', end: true },
  { to: '/track', label: 'Track a complaint' },
  { to: '/recent', label: 'Recent reports' },
  { to: '/activity', label: 'Agent activity' },
];

export default function App() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { meta } = useMeta();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="site-header">
        <div className="container header-row">
          <Link to="/" className="brand" aria-label="CivicSaathi AI home">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            <span>CivicSaathi AI</span>
          </Link>
          <span className="demo-chip" title="Complaints are stored in this prototype only">Demo system</span>
          <nav id="site-nav" aria-label="Main" className={open ? 'nav open' : 'nav'}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
            ))}
          </nav>
          <button
            className="menu-btn" aria-expanded={open} aria-controls="site-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <I.X size={22} aria-hidden="true" /> : <I.Menu size={22} aria-hidden="true" />}
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </header>
      {open && <button className="nav-scrim" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />}

      <div className="proto-bar">
        <div className="container">
          Prototype for demonstration. Complaints are stored in this app only and are not sent to the Ahmedabad Municipal Corporation.
          {meta?.aiMode === 'demo' && <strong> Demo mode: image analysis is simulated.</strong>}
        </div>
      </div>

      <main id="main" tabIndex={-1}>
        <div className="route-fade" key={loc.pathname.startsWith('/track') ? '/track' : loc.pathname}>
          <Routes>
            <Route path="/" element={<Report />} />
            <Route path="/track" element={<Track />} />
            <Route path="/track/:id" element={<Track />} />
            <Route path="/recent" element={<Recent />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>

      <footer className="site-footer">
        <div className="container footer-row">
          <div>
            <p className="footer-brand">CivicSaathi AI</p>
            <p className="muted">Report a civic issue. Track what happens next.</p>
          </div>
          <ul>
            <li><Link to="/privacy">Privacy policy</Link></li>
            <li><Link to="/terms">Terms and conditions</Link></li>
          </ul>
          <p className="muted small fine">&copy; {new Date().getFullYear()} CivicSaathi AI. Independent prototype, not affiliated with the Ahmedabad Municipal Corporation.</p>
        </div>
      </footer>
    </>
  );
}
