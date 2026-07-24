import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/store.jsx';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';
import {
  validateBusinessProfile, BUSINESS_PROFILE_LIMITS, PALETTE_ROLES, normalizeHex,
} from '../../lib/businessProfile.js';
import { fromProfile } from '../settings/BusinessContextEditor.jsx';
import {
  ONBOARDING_STEPS, ONBOARDING_FIRST_VALUE_PROMPT, isOnboardingComplete, determineFirstIncompleteStep,
  computeAutoOpen, canFinalizeSave, loadOnboardingDraft, saveOnboardingDraft, clearOnboardingLocal,
  isAutoOpenDismissed, setAutoOpenDismissed,
} from '../../lib/onboarding.js';

// ===================================================================
// OnboardingWizard (S0E · Milestone 1) — a short guided setup that turns
// the durable S0D Business Context into first-use activation.
//
// ALL decision logic lives in the pure helpers (lib/onboarding.js); this
// file is thin wiring. Validation/limits/palette rules and the persist
// path are REUSED from S0D (businessProfile.js + SAVE_BUSINESS_PROFILE) —
// no competing model, no duplicated constants. BusinessContextEditor.jsx
// is imported (fromProfile) but NOT modified.
//
// Milestone 1 stops at a truthful save + completion screen. It does NOT
// prefill or send any Jake text (that is Milestone 2).
// ===================================================================

const L = BUSINESS_PROFILE_LIMITS;
const str = (v) => (v == null ? '' : String(v)).trim();

// STEP_META order MUST match ONBOARDING_STEPS (asserted by a focused test).
const STEP_META = [
  { id: 'identity', title: 'זהות העסק', sub: 'איך קוראים לעסק ומה הוא עושה' },
  { id: 'offer', title: 'ההצעה', sub: 'השירותים או המוצרים המרכזיים' },
  { id: 'audience', title: 'קהל ושפה', sub: 'למי אתם פונים ובאיזה טון · מומלץ, לא חובה' },
  { id: 'brand', title: 'מותג', sub: 'פלטת צבעים · אופציונלי' },
  { id: 'review', title: 'סקירה ואישור', sub: 'מה ג׳יק יידע על העסק' },
];

const LIST_META = {
  audiences: { label: 'קהלי יעד', lim: L.audiences, placeholder: 'למשל: בעלי עסקים קטנים' },
  tone: { label: 'טון ושפה', lim: L.tone, placeholder: 'למשל: מקצועי, חד' },
  differentiators: { label: 'מה מייחד אתכם', lim: L.differentiators, placeholder: 'הבידול המרכזי שלכם' },
};
const PALETTE_LABELS = {
  primary: 'ראשי (primary) · חובה אם מגדירים פלטה',
  secondary: 'משני (secondary)', accent: 'הדגשה (accent)', neutral1: 'ניטרלי 1', neutral2: 'ניטרלי 2',
};

// Coerce any object (durable profile form OR a restored draft) into the exact
// editable form shape, defending against a malformed/partial draft.
function coerceForm(o) {
  const blank = fromProfile(null);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return blank;
  return {
    businessName: typeof o.businessName === 'string' ? o.businessName : '',
    positioning: typeof o.positioning === 'string' ? o.positioning : '',
    audiences: Array.isArray(o.audiences) ? o.audiences.map(String) : [],
    tone: Array.isArray(o.tone) ? o.tone.map(String) : [],
    differentiators: Array.isArray(o.differentiators) ? o.differentiators.map(String) : [],
    services: Array.isArray(o.services)
      ? o.services.map((s) => ({ name: s && typeof s.name === 'string' ? s.name : '', pitch: s && typeof s.pitch === 'string' ? s.pitch : '' }))
      : [],
    brandPalette: o.brandPalette && typeof o.brandPalette === 'object' && !Array.isArray(o.brandPalette) ? { ...o.brandPalette } : {},
  };
}

// Initial form: the durable profile is authoritative. A draft is restored ONLY
// when it was created against the SAME durable-profile baseline currently
// hydrated (loadOnboardingDraft enforces the baseline match); otherwise — stale
// or absent — initialize from the authoritative profile. So an authoritative
// change (Settings / import / refetch) always wins over a stale draft.
function initialForm(profile, session) {
  const draft = loadOnboardingDraft(session, profile);
  if (draft) return coerceForm(draft);
  return fromProfile(profile);
}

function OnboardingWizard({ startStep, session, profile, dispatch, toast, onDismiss, onDoneClose }) {
  const [step, setStep] = useState(() => (Number.isInteger(startStep) ? startStep : 0));
  const [form, setForm] = useState(() => initialForm(profile, session));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [done, setDone] = useState(false);

  // Persist the in-progress draft (uid-scoped, UX-only) as the user edits,
  // stamped with the CURRENT durable-profile baseline so a later authoritative
  // change invalidates it. Never runs after completion (draft cleared on save).
  useEffect(() => {
    if (done) return;
    saveOnboardingDraft(session, form, profile);
  }, [form, done, session, profile]);

  const errorFor = (field) => (errors.find((e) => e.field === field) || {}).message;

  // ---- field helpers (presentation only; validation stays in the S0D validator) ----
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const addListItem = (k) => setForm((f) => ({ ...f, [k]: [...f[k], ''] }));
  const setListItem = (k, i, v) => setForm((f) => ({ ...f, [k]: f[k].map((x, j) => (j === i ? v : x)) }));
  const removeListItem = (k, i) => setForm((f) => ({ ...f, [k]: f[k].filter((_, j) => j !== i) }));
  const addService = () => setForm((f) => ({ ...f, services: [...f.services, { name: '', pitch: '' }] }));
  const setService = (i, key, v) => setForm((f) => ({ ...f, services: f.services.map((s, j) => (j === i ? { ...s, [key]: v } : s)) }));
  const removeService = (i) => setForm((f) => ({ ...f, services: f.services.filter((_, j) => j !== i) }));
  const setColor = (role, v) => setForm((f) => ({ ...f, brandPalette: { ...f.brandPalette, [role]: v } }));

  const identityOk = !!str(form.businessName) && !!str(form.positioning);
  const offerOk = form.services.some((s) => str(s.name));
  const canNext = step === 0 ? identityOk : step === 1 ? offerOk : true;

  const next = () => { setSaveFailed(false); setStep((s) => Math.min(s + 1, STEP_META.length - 1)); };
  const back = () => { setSaveFailed(false); setStep((s) => Math.max(s - 1, 0)); };

  const confirm = async () => {
    // Authoritative validation through the SAME shared S0D boundary.
    const { ok, errors: errs, value } = validateBusinessProfile(form);
    if (!ok) { setErrors(errs); toast('יש לתקן את השדות המסומנים', 'error'); return; }
    // Truthful floor guard (also enforced by the stepped Next gates).
    if (!isOnboardingComplete(value)) {
      setErrors([{ field: 'floor', message: 'צריך שם עסק, מיצוב ולפחות שירות אחד עם שם.' }]);
      return;
    }
    setErrors([]); setSaveFailed(false); setBusy(true);
    try {
      // Persist-first, truthful: advance ONLY on a settled { ok: true }.
      const res = await dispatch({ type: 'SAVE_BUSINESS_PROFILE', payload: value });
      if (canFinalizeSave(res)) {
        clearOnboardingLocal(session); // clears THIS uid's draft + dismissal
        setDone(true);
      } else {
        // Store already toasted + refetched authoritative state. Stay open,
        // keep all dirty input, show no success and no completion.
        setSaveFailed(true);
      }
    } finally {
      setBusy(false);
    }
  };

  // Completion-screen first-value CTA: fire exactly ONE additive jake:prefill
  // event (the Assistant listener opens Jake + fills the EMPTY composer WITHOUT
  // sending), then close. No auto-send, no history change, no separate open
  // event (the prefill handler opens Jake itself — avoids an ordering race).
  const startWithJake = () => {
    window.dispatchEvent(new CustomEvent('jake:prefill', { detail: { text: ONBOARDING_FIRST_VALUE_PROMPT, source: 'onboarding' } }));
    onDoneClose();
  };

  const meta = STEP_META[step];
  const isReview = meta.id === 'review';

  // ---------- completion screen ----------
  if (done) {
    return (
      <Modal open onClose={onDoneClose} title="הכול מוכן" subtitle="ההקשר העסקי נשמר בענן" maxWidth={560}
        footer={(
          <div className="row gap-2 wrap" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn ai-confirm-yes" onClick={startWithJake}><Icon name="spark" size={16} /> תן לי 3 פעולות ראשונות עם ג׳יק</button>
            <button className="btn btn-ghost" onClick={onDoneClose}>סיום</button>
          </div>
        )}>
        <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted" style={{ fontSize: '0.95rem', lineHeight: 1.7 }}>
            מעולה! שמרנו את פרטי העסק שלך. מעכשיו ג׳יק ישתמש בהם כשהוא כותב עבורך תוכן שיווקי וטיוטות — לפי העסק שלך בלבד.
          </p>
          <p className="dim" style={{ fontSize: '0.84rem', lineHeight: 1.7 }}>
            לחיצה על הכפתור תפתח את ג׳יק עם הצעה מוכנה לעריכה — לא יישלח דבר עד שתאשרו. אפשר גם לערוך את ההקשר בכל עת דרך <strong>הגדרות</strong>.
          </p>
        </div>
      </Modal>
    );
  }

  // ---------- footer per step ----------
  const footer = (
    <div className="row gap-2 wrap" style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
      <span className="dim" style={{ fontSize: '0.8rem' }}>שלב {step + 1} מתוך {STEP_META.length}</span>
      <div className="grow" style={{ flex: 1 }} />
      {step > 0 && <button className="btn btn-ghost" onClick={back} disabled={busy}>הקודם</button>}
      {!isReview && <button className="btn btn-ghost" onClick={onDismiss} disabled={busy}>אחר כך</button>}
      {isReview
        ? <button className="btn ai-confirm-yes" onClick={confirm} disabled={busy}><Icon name={busy ? 'refresh' : 'check'} size={16} /> {busy ? 'שומר…' : 'אישור ושמירה'}</button>
        : <button className="btn btn-primary" onClick={next} disabled={busy || !canNext}>הבא <Icon name="arrow" size={15} /></button>}
    </div>
  );

  return (
    <Modal open onClose={onDismiss} title={meta.title} subtitle={meta.sub} maxWidth={640} footer={footer}>
      <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Step 1 — Identity */}
        {meta.id === 'identity' && (
          <>
            <div className="field">
              <label>שם העסק <span style={{ color: 'var(--danger, #e5484d)' }}>*</span></label>
              <input className="input" value={form.businessName} maxLength={L.businessName + 20}
                onChange={(e) => setField('businessName', e.target.value)} placeholder="שם העסק שלך" />
            </div>
            <div className="field">
              <label>מיצוב — מה העסק עושה ולמי, במשפט אחד <span style={{ color: 'var(--danger, #e5484d)' }}>*</span></label>
              <textarea className="input" rows={2} value={form.positioning}
                onChange={(e) => setField('positioning', e.target.value)} placeholder="למשל: סטודיו מיתוג לעסקים קטנים בצפון" />
            </div>
            {!identityOk && <p className="dim" style={{ fontSize: '0.8rem' }}>שם העסק והמיצוב נדרשים כדי להמשיך.</p>}
          </>
        )}

        {/* Step 2 — Offer */}
        {meta.id === 'offer' && (
          <div className="field">
            <label>שירותים <span className="dim">(עד {L.services.max}) · לפחות אחד</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {form.services.map((s, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
                  <div className="row gap-2" style={{ display: 'flex', gap: 8 }}>
                    <input className="input" style={{ flex: 1 }} value={s.name} placeholder="שם השירות (חובה)" onChange={(e) => setService(i, 'name', e.target.value)} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeService(i)} aria-label="הסר שירות"><Icon name="x" size={15} /></button>
                  </div>
                  <input className="input" value={s.pitch} placeholder="תיאור קצר (אופציונלי)" onChange={(e) => setService(i, 'pitch', e.target.value)} />
                </div>
              ))}
              {form.services.length < L.services.max && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addService}><Icon name="plus" size={14} /> הוסף שירות</button>
              )}
            </div>
            {!offerOk && <p className="dim" style={{ fontSize: '0.8rem', marginTop: 8 }}>צריך לפחות שירות אחד עם שם כדי להמשיך.</p>}
          </div>
        )}

        {/* Step 3 — Customers & voice (recommended, non-blocking) */}
        {meta.id === 'audience' && (
          <>
            {['audiences', 'tone', 'differentiators'].map((k) => {
              const lm = LIST_META[k];
              return (
                <div className="field" key={k}>
                  <label>{lm.label} <span className="dim">(עד {lm.lim.max})</span></label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {form[k].map((val, i) => (
                      <div className="row gap-2" key={i} style={{ display: 'flex', gap: 8 }}>
                        <input className="input" style={{ flex: 1 }} value={val} placeholder={lm.placeholder} onChange={(e) => setListItem(k, i, e.target.value)} />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeListItem(k, i)} aria-label="הסר"><Icon name="x" size={15} /></button>
                      </div>
                    ))}
                    {form[k].length < lm.lim.max && (
                      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => addListItem(k)}><Icon name="plus" size={14} /> הוסף</button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="dim" style={{ fontSize: '0.8rem' }}>אפשר לדלג — השדות האלה משפרים את מה שג׳יק כותב אבל אינם חובה.</p>
          </>
        )}

        {/* Step 4 — Brand (optional palette; S0D rules retained) */}
        {meta.id === 'brand' && (
          <div className="field">
            <label>צבעי מותג <span className="dim">(אופציונלי)</span></label>
            <p className="dim" style={{ fontSize: '0.8rem', margin: '0 0 10px', lineHeight: 1.6 }}>
              הפלטה נשמרת כחלק מההקשר העסקי. <strong>היא עדיין אינה מוחלת אוטומטית על מחוללי היצירה</strong> — והיא אף פעם לא צובעת את ממשק המערכת עצמו.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PALETTE_ROLES.map((role) => {
                const raw = form.brandPalette[role] || '';
                const valid = normalizeHex(raw);
                return (
                  <div className="row gap-2" key={role} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: valid || 'transparent' }} aria-hidden />
                    <input type="color" value={valid || '#000000'} onChange={(e) => setColor(role, e.target.value.toUpperCase())}
                      style={{ width: 34, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }} aria-label={`בורר צבע ${role}`} />
                    <input className="input" style={{ width: 130 }} value={raw} placeholder="#RRGGBB" onChange={(e) => setColor(role, e.target.value)} />
                    <span className="dim" style={{ fontSize: '0.8rem', flex: 1 }}>{PALETTE_LABELS[role]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 5 — Review & confirm */}
        {meta.id === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="dim" style={{ fontSize: '0.84rem', lineHeight: 1.7 }}>זה מה שג׳יק יידע על העסק שלך אחרי השמירה:</p>
            <ReviewSummary form={form} />
            {errorFor('floor') && <div className="ai-gate-err">{errorFor('floor')}</div>}
            {errors.length > 0 && !errorFor('floor') && <div className="ai-gate-err">יש שדות לא תקינים — חזור אחורה ותקן אותם.</div>}
            {saveFailed && <div className="ai-gate-err">השמירה לענן נכשלה — הנתונים שלך נשמרו כאן, אפשר לנסות שוב. לא נקבעה השלמה.</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div className="row between" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="dim" style={{ fontSize: '0.82rem' }}>{label}</span>
      <span style={{ fontSize: '0.88rem', textAlign: 'start', maxWidth: '70%' }}>{value || '—'}</span>
    </div>
  );
}

function ReviewSummary({ form }) {
  const services = form.services.filter((s) => str(s.name)).map((s) => s.name).join(', ');
  const primary = normalizeHex(form.brandPalette.primary);
  return (
    <div className="card" style={{ padding: 14, borderRadius: 12 }}>
      <Row label="שם העסק" value={str(form.businessName)} />
      <Row label="מיצוב" value={str(form.positioning)} />
      <Row label="שירותים" value={services} />
      <Row label="קהלי יעד" value={form.audiences.filter(Boolean).join(', ')} />
      <Row label="טון ושפה" value={form.tone.filter(Boolean).join(', ')} />
      <Row label="בידול" value={form.differentiators.filter(Boolean).join(', ')} />
      <Row label="צבע מותג ראשי" value={primary || ''} />
    </div>
  );
}

// ===================================================================
// OnboardingOwner — the global, cloud-only owner mounted in AppShell. It
// decides (via pure helpers) when to auto-open, listens for external
// openers (Dashboard banner / Settings), and never flashes before the
// authoritative store hydration completes.
// ===================================================================
export function OnboardingOwner() {
  const { data, dispatch, toast, session, authReady, loading, supabaseEnabled } = useStore();
  const profile = data.businessProfile || null;
  const [open, setOpen] = useState(false);
  const [startStep, setStartStep] = useState(0);
  const uid = session?.user?.id || null;
  const autoEvaluated = useRef(undefined); // uid we've already auto-evaluated

  // Cloud mode only: onboarding writes require an authenticated session
  // (SAVE_BUSINESS_PROFILE no-ops without a uid). Local/demo mode → nothing.
  const hydrationReady = supabaseEnabled ? (authReady && !loading && !!session) : false;

  // Auto-open at most once per uid, AFTER authoritative hydration, only for an
  // incomplete durable profile this uid has not dismissed.
  useEffect(() => {
    if (!supabaseEnabled) return;
    if (!hydrationReady) return;
    if (autoEvaluated.current === uid) return;
    autoEvaluated.current = uid;
    const dismissed = isAutoOpenDismissed(session);
    if (computeAutoOpen({ hydrationReady, profile, dismissed })) {
      setStartStep(determineFirstIncompleteStep(profile));
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseEnabled, hydrationReady, uid]);
  // NOTE: no separate latch-reset effect — the `autoEvaluated.current === uid`
  // guard above already re-evaluates on an account switch (old uid !== new uid),
  // and resetting the latch elsewhere would defeat the once-per-uid guarantee.

  // External openers (Dashboard banner, Settings "open wizard").
  useEffect(() => {
    const onOpen = (e) => {
      const s = e && e.detail && Number.isInteger(e.detail.step) ? e.detail.step : determineFirstIncompleteStep(data.businessProfile || null);
      setStartStep(s);
      setOpen(true);
    };
    window.addEventListener('onboarding:open', onOpen);
    return () => window.removeEventListener('onboarding:open', onOpen);
  }, [data.businessProfile]);

  if (!supabaseEnabled || !open) return null;

  return (
    <OnboardingWizard
      key={uid || 'anon'}
      startStep={startStep}
      session={session}
      profile={profile}
      dispatch={dispatch}
      toast={toast}
      onDismiss={() => { setAutoOpenDismissed(session); setOpen(false); }}
      onDoneClose={() => setOpen(false)}
    />
  );
}

export default OnboardingWizard;
