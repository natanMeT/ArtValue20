import { useState, useEffect, useRef, useCallback } from 'react';
import { SectionHeader } from '../components/ui/atoms.jsx';
import Icon from '../components/ui/Icon.jsx';

// Fooocus runs as its own local Gradio app (default 127.0.0.1:7865). We embed the
// FULL native UI in an iframe so every option Fooocus offers is available, identical
// to the standalone software — no feature gets lost in a custom rebuild.
const FOOOCUS_URL = (import.meta.env.VITE_FOOOCUS_URL || 'http://127.0.0.1:7865').replace(/\/$/, '');

export default function Fooocus() {
  const [status, setStatus] = useState('checking'); // checking | up | down
  const [checking, setChecking] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [frameKey, setFrameKey] = useState(0); // bump to force-reload the iframe
  const wrapRef = useRef(null);

  // Reachability probe — Gradio doesn't send CORS headers, so a no-cors fetch that
  // resolves = reachable, rejects = engine down. (We can't read the status code,
  // only whether the socket answered.)
  const ping = useCallback(async () => {
    setChecking(true);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      await fetch(`${FOOOCUS_URL}/`, { mode: 'no-cors', signal: ctrl.signal });
      clearTimeout(t);
      setStatus('up');
    } catch {
      setStatus('down');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    ping();
    const iv = setInterval(ping, 15000);
    return () => clearInterval(iv);
  }, [ping]);

  const reload = () => { setFrameKey((k) => k + 1); ping(); };
  const openNewTab = () => window.open(FOOOCUS_URL, '_blank', 'noopener');
  const goFullscreen = () => { try { wrapRef.current?.requestFullscreen?.(); } catch { /* noop */ } };

  return (
    <div className="studio-hf">
      <SectionHeader
        title={<span className="row gap-2" style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="image" size={22} style={{ color: 'var(--lime-deep)' }} /> Fooocus</span>}
        sub="התוכנה המלאה של Fooocus — כל האפשרויות — מוטמעת בתוך ה-CRM, רצה מקומית על ה-GPU שלך."
        action={(
          <div className="row gap-2 wrap" style={{ alignItems: 'center' }}>
            <span className={`badge ${status === 'up' ? 'badge-active' : 'badge-neutral'}`}>
              <span className="dot" /> {status === 'checking' ? 'בודק מנוע…' : status === 'up' ? 'Fooocus פעיל' : 'Fooocus כבוי'}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={reload} disabled={checking}><Icon name="refresh" size={14} /> רענון</button>
            <button className="btn btn-ghost btn-sm" onClick={openNewTab}><Icon name="link" size={14} /> טאב חדש</button>
            <button className="btn btn-ghost btn-sm" onClick={goFullscreen}><Icon name="image" size={14} /> מסך מלא</button>
          </div>
        )}
      />

      {status === 'down' && (
        <div className="engine-status engine-down" style={{ marginBottom: 14 }}>
          <div className="engine-row">
            <span className="engine-dot" />
            <span className="engine-label">מנוע Fooocus כבוי</span>
            <button className="btn btn-ghost btn-sm" onClick={ping} disabled={checking}>{checking ? 'בודק…' : 'בדוק שוב'}</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowHelp((s) => !s)}><Icon name="spark" size={14} /> איך מפעילים</button>
          </div>
          {showHelp && (
            <div className="engine-help">
              <p style={{ margin: '0 0 6px' }}>הפעל את Fooocus והמתן ~30 שניות (האינדיקטור יתעדכן לבד):</p>
              <ol style={{ margin: 0, paddingInlineStart: 18, lineHeight: 1.9 }}>
                <li>לחיצה כפולה על <code>D:\Downloads\Fooocus\start_fooocus.bat</code></li>
                <li>בהרצה הראשונה הוא מוריד מודלים (~6GB) — זה לוקח כמה דקות פעם אחת.</li>
                <li>כשהדפדפן של Fooocus נפתח (פורט 7865) — חזור לכאן ולחץ «בדוק שוב».</li>
              </ol>
            </div>
          )}
        </div>
      )}

      <div ref={wrapRef} className="card panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
        {status === 'up' ? (
          <iframe
            key={frameKey}
            title="Fooocus"
            src={FOOOCUS_URL}
            style={{ width: '100%', height: 'calc(100vh - 180px)', minHeight: 640, border: 0, display: 'block', background: '#fff' }}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ) : (
          <div className="diag-empty" style={{ minHeight: 420 }}>
            <div className="diag-empty-ico"><Icon name="image" size={30} /></div>
            <h3>{status === 'checking' ? 'מתחבר ל-Fooocus…' : 'Fooocus לא פעיל'}</h3>
            <p className="muted">
              {status === 'checking'
                ? 'בודק אם המנוע פועל בפורט 7865…'
                : 'הפעל את start_fooocus.bat ולחץ «בדוק שוב». ברגע שהמנוע יעלה, התוכנה המלאה תופיע כאן.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
