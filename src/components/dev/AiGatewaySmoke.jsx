import { useState } from 'react';
import { ScrollReveal } from '../ui/motion.jsx';
import { callAiGateway } from '../../lib/aiGatewayClient.js';

// ===================================================================
// AI Gateway smoke CTA — INTERNAL / DEV-ONLY.
//
// One manual button that proves the full loop:
//   Browser UI → callAiGateway → Edge Function → Gemini → ai_usage
//
// It is rendered only behind `import.meta.env.DEV` (stripped from the
// production bundle). Fixed action + fixed prompt: NO editable input, NO
// provider/model parameter, NO direct supabase.functions.invoke, NO
// persistence (URL/localStorage/sessionStorage), NO auto-run, NO
// navigation. The frontend never writes usage — the server does.
// ===================================================================

// Fixed, safe smoke inputs. The frontend asserts no provider/model authority.
export const SMOKE_ACTION_TYPE = 'text.copy';
export const SMOKE_PROMPT = 'Write one short sentence saying ArtValue AI Gateway is connected.';

// Pure call logic (dependency-injected caller) — node-testable, no DOM.
export function runSmoke(call) {
  return call(SMOKE_ACTION_TYPE, { prompt: SMOKE_PROMPT });
}

// Pure result → compact display fields — node-testable, never throws.
export function describeSmokeResult(res) {
  if (!res || typeof res !== 'object') {
    return { ok: false, code: 'gateway_error', message: 'לא התקבלה תשובה מה-Gateway.', status: null };
  }
  if (res.ok === true) {
    return {
      ok: true,
      provider: res.provider ?? null,
      status: res.execution?.status ?? null,
      text: res.result?.text ?? null,
      logging: res.usage?.logging ?? null,
      budgetCheck: res.usage?.budgetCheck ?? null,
    };
  }
  return {
    ok: false,
    code: res.error?.code ?? 'gateway_error',
    message: res.error?.message ?? 'קריאת ה-Gateway נכשלה.',
    status: res.execution?.status ?? null,
  };
}

export default function AiGatewaySmoke() {
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);

  // Fires ONLY on click. No auto-run, no navigation, no persistence.
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setView(null);
    const res = await runSmoke(callAiGateway);
    setView(describeSmokeResult(res));
    setBusy(false);
  };

  return (
    <ScrollReveal delay={0.16}>
      <div className="card panel" dir="rtl" style={{ borderStyle: 'dashed' }}>
        <div className="panel-title" style={{ marginBottom: 6 }}>DEV · בדיקת AI Gateway</div>
        <p className="dim" style={{ fontSize: '0.84rem', marginBottom: 16 }}>
          קריאה אחת ל-Gateway דרך callAiGateway (actionType קבוע: text.copy). כלי פנימי — מוצג רק ב-DEV.
        </p>
        <div className="row gap-2 wrap">
          <button className="btn btn-ghost" type="button" onClick={onClick} disabled={busy}>
            {busy ? 'שולח…' : 'בדיקת AI Gateway'}
          </button>
        </div>

        {view && view.ok && (
          <div className="dim" style={{ fontSize: '0.84rem', marginTop: 14, lineHeight: 1.7 }}>
            <div>✓ ok · {view.status || '—'} · {view.provider || '—'}</div>
            {view.text ? <div style={{ marginTop: 6, color: 'var(--text-1)' }}>{view.text}</div> : null}
            <div style={{ marginTop: 6 }}>logging: {view.logging || '—'} · budgetCheck: {view.budgetCheck || '—'}</div>
          </div>
        )}

        {view && !view.ok && (
          <div className="dim" style={{ fontSize: '0.84rem', marginTop: 14, lineHeight: 1.7 }}>
            <div>✕ {view.code}{view.status ? ` · ${view.status}` : ''}</div>
            <div style={{ marginTop: 6 }}>{view.message}</div>
          </div>
        )}
      </div>
    </ScrollReveal>
  );
}
