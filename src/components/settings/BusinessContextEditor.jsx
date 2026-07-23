import { useMemo, useState } from 'react';
import { useStore } from '../../store/store.jsx';
import Icon from '../ui/Icon.jsx';
import {
  validateBusinessProfile, BUSINESS_PROFILE_LIMITS, PALETTE_ROLES, normalizeHex,
} from '../../lib/businessProfile.js';

// ===================================================================
// BusinessContextEditor (S0D) — self-contained, reusable editor for the
// per-account Business Context. Opens EMPTY for unconfigured accounts (no
// ArtValue prefill). Local form state; commits to the store ONLY on a
// confirmed persist ({ ok:true }); a failed save leaves no false state and
// keeps the user's input. Non-destructive "revert unsaved edits" only — no
// cloud reset/delete. Validation runs through the SAME shared boundary the
// store/api use. Designed to be reused verbatim by a future Onboarding slice.
// ===================================================================

const L = BUSINESS_PROFILE_LIMITS;

const BLANK = () => ({
  businessName: '', positioning: '',
  audiences: [], tone: [], differentiators: [], services: [], brandPalette: {},
});

function fromProfile(p) {
  if (!p) return BLANK();
  return {
    businessName: p.businessName || '',
    positioning: p.positioning || '',
    audiences: [...(p.audiences || [])],
    tone: [...(p.tone || [])],
    differentiators: [...(p.differentiators || [])],
    services: (p.services || []).map((s) => ({ name: s.name || '', pitch: s.pitch || '' })),
    brandPalette: { ...(p.brandPalette || {}) },
  };
}

const LIST_META = {
  audiences: { label: 'קהלי יעד', lim: L.audiences, placeholder: 'למשל: בעלי עסקים קטנים' },
  tone: { label: 'טון ושפה', lim: L.tone, placeholder: 'למשל: מקצועי, חד' },
  differentiators: { label: 'מה מייחד אתכם', lim: L.differentiators, placeholder: 'הבידול המרכזי שלכם' },
};
const PALETTE_LABELS = {
  primary: 'ראשי (primary) · חובה אם מגדירים פלטה',
  secondary: 'משני (secondary)',
  accent: 'הדגשה (accent)',
  neutral1: 'ניטרלי 1',
  neutral2: 'ניטרלי 2',
};

// WCAG relative luminance + contrast ratio (basic hint only).
function luminance(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrastVsWhite(hex) {
  const l = luminance(hex);
  if (l == null) return null;
  return (1 + 0.05) / (l + 0.05);
}

export default function BusinessContextEditor() {
  const { data, dispatch, toast } = useStore();
  const saved = data.businessProfile || null;

  const [form, setForm] = useState(() => fromProfile(saved));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  // Baseline snapshot of the last-saved profile → dirty detection + revert.
  const baseline = useMemo(() => JSON.stringify(fromProfile(saved)), [saved]);
  const dirty = JSON.stringify(form) !== baseline;

  const errorFor = (field) => (errors.find((e) => e.field === field) || {}).message;

  // ---- field helpers ----
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const addListItem = (k) => setForm((f) => ({ ...f, [k]: [...f[k], ''] }));
  const setListItem = (k, i, v) => setForm((f) => ({ ...f, [k]: f[k].map((x, j) => (j === i ? v : x)) }));
  const removeListItem = (k, i) => setForm((f) => ({ ...f, [k]: f[k].filter((_, j) => j !== i) }));
  const addService = () => setForm((f) => ({ ...f, services: [...f.services, { name: '', pitch: '' }] }));
  const setService = (i, key, v) => setForm((f) => ({ ...f, services: f.services.map((s, j) => (j === i ? { ...s, [key]: v } : s)) }));
  const removeService = (i) => setForm((f) => ({ ...f, services: f.services.filter((_, j) => j !== i) }));
  const setColor = (role, v) => setForm((f) => ({ ...f, brandPalette: { ...f.brandPalette, [role]: v } }));

  const revert = () => { setForm(fromProfile(saved)); setErrors([]); };

  const save = async () => {
    const { ok, errors: errs, value } = validateBusinessProfile(form);
    if (!ok) { setErrors(errs); toast('יש לתקן את השדות המסומנים', 'error'); return; }
    setErrors([]);
    setBusy(true);
    try {
      // Persist-first: the store applies the reducer + resolves { ok:true } ONLY
      // after Supabase confirms. On { ok:false } the store already toasted and
      // refetched the authoritative state — we keep the form input as-is.
      const res = await dispatch({ type: 'SAVE_BUSINESS_PROFILE', payload: value });
      if (res && res.ok) toast('ההקשר העסקי נשמר');
    } finally {
      setBusy(false);
    }
  };

  const primaryContrast = contrastVsWhite(form.brandPalette.primary);

  return (
    <div className="card panel" dir="rtl">
      <div className="panel-title row gap-2" style={{ marginBottom: 6 }}>
        <Icon name="spark" size={18} style={{ color: 'var(--lime-deep)' }} /> הקשר עסקי
      </div>
      <p className="dim" style={{ fontSize: '0.84rem', margin: '0 0 16px', lineHeight: 1.7 }}>
        הגדירו את פרטי העסק שלכם. ג׳יק ישתמש במידע הזה כשהוא כותב תוכן שיווקי וטיוטות —
        לפי העסק שלכם בלבד. כל השדות אופציונליים חוץ משם העסק.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* business name */}
        <div className="field">
          <label>שם העסק <span style={{ color: 'var(--danger, #e5484d)' }}>*</span></label>
          <input
            className="input"
            value={form.businessName}
            maxLength={L.businessName + 20}
            onChange={(e) => setField('businessName', e.target.value)}
            placeholder="שם העסק שלך"
          />
          {errorFor('businessName') && <div className="ai-gate-err">{errorFor('businessName')}</div>}
        </div>

        {/* positioning */}
        <div className="field">
          <label>מיצוב (משפט אחד)</label>
          <textarea
            className="input" rows={2}
            value={form.positioning}
            onChange={(e) => setField('positioning', e.target.value)}
            placeholder="מה העסק עושה ולמי, במשפט אחד"
          />
          {errorFor('positioning') && <div className="ai-gate-err">{errorFor('positioning')}</div>}
        </div>

        {/* string lists */}
        {['audiences', 'tone', 'differentiators'].map((k) => {
          const meta = LIST_META[k];
          return (
            <div className="field" key={k}>
              <label>{meta.label} <span className="dim">(עד {meta.lim.max})</span></label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form[k].map((val, i) => (
                  <div className="row gap-2" key={i} style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input" style={{ flex: 1 }}
                      value={val} placeholder={meta.placeholder}
                      onChange={(e) => setListItem(k, i, e.target.value)}
                    />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeListItem(k, i)} aria-label="הסר">
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                ))}
                {form[k].length < meta.lim.max && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => addListItem(k)}>
                    <Icon name="plus" size={14} /> הוסף
                  </button>
                )}
              </div>
              {errorFor(k) && <div className="ai-gate-err">{errorFor(k)}</div>}
            </div>
          );
        })}

        {/* services */}
        <div className="field">
          <label>שירותים <span className="dim">(עד {L.services.max})</span></label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {form.services.map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
                <div className="row gap-2" style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input" style={{ flex: 1 }}
                    value={s.name} placeholder="שם השירות (חובה)"
                    onChange={(e) => setService(i, 'name', e.target.value)}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeService(i)} aria-label="הסר שירות">
                    <Icon name="x" size={15} />
                  </button>
                </div>
                <input
                  className="input"
                  value={s.pitch} placeholder="תיאור קצר (אופציונלי)"
                  onChange={(e) => setService(i, 'pitch', e.target.value)}
                />
              </div>
            ))}
            {form.services.length < L.services.max && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addService}>
                <Icon name="plus" size={14} /> הוסף שירות
              </button>
            )}
          </div>
          {errorFor('services') && <div className="ai-gate-err">{errorFor('services')}</div>}
        </div>

        {/* brand palette */}
        <div className="field">
          <label>צבעי מותג <span className="dim">(אופציונלי)</span></label>
          <p className="dim" style={{ fontSize: '0.8rem', margin: '0 0 10px', lineHeight: 1.6 }}>
            הפלטה נשמרת כחלק מההקשר העסקי. <strong>היא עדיין אינה מוחלת אוטומטית על כל מחוללי היצירה</strong> —
            והיא אף פעם לא צובעת את ממשק המערכת עצמו.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PALETTE_ROLES.map((role) => {
              const raw = form.brandPalette[role] || '';
              const valid = normalizeHex(raw);
              return (
                <div className="row gap-2" key={role} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: valid || 'transparent' }} aria-hidden />
                  <input
                    type="color"
                    value={valid || '#000000'}
                    onChange={(e) => setColor(role, e.target.value.toUpperCase())}
                    style={{ width: 34, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }}
                    aria-label={`בורר צבע ${role}`}
                  />
                  <input
                    className="input" style={{ width: 130 }}
                    value={raw} placeholder="#RRGGBB"
                    onChange={(e) => setColor(role, e.target.value)}
                  />
                  <span className="dim" style={{ fontSize: '0.8rem', flex: 1 }}>{PALETTE_LABELS[role]}</span>
                  {errorFor(`palette.${role}`) && <div className="ai-gate-err" style={{ width: '100%' }}>{errorFor(`palette.${role}`)}</div>}
                </div>
              );
            })}
          </div>
          {primaryContrast && (
            <div className="dim" style={{ fontSize: '0.8rem', marginTop: 8 }}>
              ניגודיות הצבע הראשי מול לבן: {primaryContrast.toFixed(1)}:1 {primaryContrast >= 4.5 ? '✓' : '⚠ נמוך'}
            </div>
          )}
          {errorFor('palette.primary') && <div className="ai-gate-err">{errorFor('palette.primary')}</div>}
        </div>

        {/* actions */}
        <div className="row gap-2 wrap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn ai-confirm-yes" onClick={save} disabled={busy || !dirty}>
            <Icon name={busy ? 'refresh' : 'check'} size={16} /> {busy ? 'שומר…' : 'שמירה'}
          </button>
          <button className="btn btn-ghost" onClick={revert} disabled={busy || !dirty}>
            ביטול שינויים
          </button>
          {!dirty && saved && <span className="dim" style={{ fontSize: '0.82rem' }}>נשמר</span>}
        </div>
      </div>
    </div>
  );
}
