import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store/store.jsx';
import Icon from '../components/ui/Icon.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { isSupabaseConfigured } from '../lib/supabase.js';
import {
  listCampaigns, createCampaign, updateCampaign, setCampaignStatus, deleteCampaign,
} from '../lib/api.js';
import {
  CAMPAIGN_LIMITS, CAMPAIGN_QUOTA, CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_CLASS,
  nextStatuses, canCreateWithin,
} from '../lib/campaigns.js';

// ===================================================================
// Campaigns slice 1 — the durable per-account BUSINESS campaign.
//
// NAMING BOUNDARY: this screen owns public.campaigns. It is NOT the device-local
// creative session in `src/creative/v2/campaignStore.js`, it never reads it, and
// it must never import from `src/creative/v2/**`. See src/lib/campaigns.js.
//
// CLOUD-ONLY BY CONSTRUCTION. Campaigns exist only as durable cloud rows; there
// is no local reducer, no seed and no localStorage fallback. So in local/demo
// mode this page renders a truthful unavailable state instead of a working
// form. This is the S0A false-success rule applied in the OTHER direction: S0A
// contained local-only modules that pretended to persist in the cloud; here a
// cloud-only module must not present a form that would persist nothing locally.
//
// The wording is deliberately NOT the BetaUnavailable "not yet in the beta"
// copy — that would be false. Campaigns ARE in the beta; they are unavailable
// in the LOCAL demo, which is a different and truthful statement.
// ===================================================================

const EMPTY_FORM = { title: '', objective: '', startDate: '', endDate: '' };

function LocalUnavailable() {
  return (
    <div>
      <SectionHeader title="קמפיינים" sub="ניהול קמפיינים עסקיים — מטרה, תאריכים ומצב" />
      <div className="card panel">
        <EmptyState
          icon="lock"
          title="זמין רק בחשבון בענן"
          hint="קמפיינים נשמרים בענן בלבד ומשויכים לחשבון. במצב ההדגמה המקומי אין להם אחסון עמיד, ולכן המסך אינו פעיל כאן — כדי לא להציג טופס ששומר לכאורה ולא שומר בפועל."
        />
      </div>
    </div>
  );
}

export default function Campaigns() {
  const { toast, session } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const userId = session?.user?.id || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listCampaigns());
    } catch (e) {
      setError(e?.userSafe ? e.message : 'לא הצלחתי לטעון את הקמפיינים כרגע. אפשר לנסות שוב.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isSupabaseConfigured) load(); }, [load]);

  if (!isSupabaseConfigured) return <LocalUnavailable />;

  const reset = () => { setForm(EMPTY_FORM); setEditingId(null); setError(''); };

  // Every handler below re-reads from the server after a write. Nothing updates
  // local state optimistically — a row appears on screen only once the server
  // has returned it.
  const run = async (fn, okMsg) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      reset();
      toast(okMsg);
    } catch (e) {
      setError(e?.userSafe ? e.message : 'הפעולה לא הושלמה ולא נשמר דבר. אפשר לנסות שוב.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (editingId) run(() => updateCampaign(editingId, form), 'הקמפיין עודכן');
    else run(() => createCampaign(userId, form, items.length), 'הקמפיין נוצר');
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setError('');
    setForm({
      title: c.title,
      objective: c.objective || '',
      startDate: c.startDate || '',
      endDate: c.endDate || '',
    });
  };

  const atQuota = !canCreateWithin(items.length);

  return (
    <div>
      <SectionHeader
        title="קמפיינים"
        sub={`ניהול קמפיינים עסקיים — מטרה, תאריכים ומצב · ${items.length}/${CAMPAIGN_QUOTA}`}
      />

      <form className="card panel" onSubmit={submit} style={{ marginBottom: 16 }}>
        <div className="form-row">
          <label>
            שם הקמפיין
            <input
              className="input"
              value={form.title}
              maxLength={CAMPAIGN_LIMITS.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="לדוגמה: השקת חבילת אתרים לעסקים קטנים"
            />
          </label>
          <label>
            מטרה
            <input
              className="input"
              value={form.objective}
              maxLength={CAMPAIGN_LIMITS.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              placeholder="מה הקמפיין אמור להשיג"
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            תאריך התחלה
            {/* className="input" + dir="ltr": these two were the only bare date
                inputs in the product, so they inherited nothing and rendered as
                white native boxes on the dark form. */}
            <input className="input" type="date" dir="ltr" style={{ textAlign: 'right' }} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <label>
            תאריך סיום
            <input className="input" type="date" dir="ltr" style={{ textAlign: 'right' }} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </label>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        {!editingId && atQuota && (
          <div className="form-error" role="alert">
            הגעת למכסת {CAMPAIGN_QUOTA} הקמפיינים לחשבון. אפשר למחוק קמפיין קיים כדי ליצור חדש.
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || (!editingId && atQuota)}>
            <Icon name={editingId ? 'check' : 'plus'} size={17} />
            {editingId ? 'שמור שינויים' : 'צור קמפיין'}
          </button>
          {editingId && (
            <button className="btn btn-ghost" type="button" onClick={reset} disabled={busy}>ביטול</button>
          )}
        </div>
      </form>

      {loading ? (
        <div className="card panel"><EmptyState icon="clock" title="טוען…" hint="קורא את הקמפיינים של החשבון" /></div>
      ) : !items.length ? (
        <div className="card panel">
          <EmptyState icon="target" title="אין עדיין קמפיינים" hint="הקמפיין הראשון נוצר במצב טיוטה, ואפשר להפעיל אותו כשהוא מוכן." />
        </div>
      ) : (
        <div className="card panel">
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>שם</th><th>מטרה</th><th>תאריכים</th><th>מצב</th><th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.title}</td>
                  <td>{c.objective || '—'}</td>
                  <td>{c.startDate || '—'} — {c.endDate || '—'}</td>
                  <td><span className={`badge ${CAMPAIGN_STATUS_CLASS[c.status]}`}>{CAMPAIGN_STATUS_LABELS[c.status]}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => startEdit(c)} disabled={busy}>ערוך</button>
                      {/* Only LEGAL transitions are offered. The trigger refuses
                          the rest server-side; this is UX, not enforcement. */}
                      {nextStatuses(c.status).map((to) => (
                        <button
                          key={to}
                          className="btn btn-sm btn-ghost"
                          disabled={busy}
                          onClick={() => run(() => setCampaignStatus(c.id, c.status, to), `הקמפיין עבר ל${CAMPAIGN_STATUS_LABELS[to]}`)}
                        >
                          {CAMPAIGN_STATUS_LABELS[to]}
                        </button>
                      ))}
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busy}
                        onClick={() => run(() => deleteCampaign(c.id), 'הקמפיין נמחק')}
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
