import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import Icon from '../components/ui/Icon.jsx';
import { SectionHeader, DemoTag } from '../components/ui/atoms.jsx';
import { PROJECT_TYPES, LEAD_SOURCES } from '../data/seed.js';
import { formatCurrency } from '../lib/format.js';

const STEPS = [
  { n: 1, label: 'פרטי קשר' },
  { n: 2, label: 'סוג פרויקט' },
  { n: 3, label: 'תקציב' },
  { n: 4, label: 'מקור' },
  { n: 5, label: 'סיכום' },
];

const BUDGETS = [
  { label: 'עד ₪15,000', value: 12000 },
  { label: '₪15,000 – ₪30,000', value: 22000 },
  { label: '₪30,000 – ₪60,000', value: 45000 },
  { label: '₪60,000 ומעלה', value: 75000 },
];

const variants = {
  enter: (d) => ({ opacity: 0, x: d > 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (d) => ({ opacity: 0, x: d > 0 ? -40 : 40 }),
};

export default function Intake() {
  const { dispatch, toast } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [f, setF] = useState({
    name: '', contact: '', phone: '', email: '',
    projectType: '', value: 0, budgetLabel: '', source: '', notes: '',
  });

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const go = (n) => { setDir(n > step ? 1 : -1); setStep(n); };

  const canNext = () => {
    if (step === 1) return f.name.trim() && f.contact.trim() && /^[0-9+\-\s]{6,}$/.test(f.phone);
    if (step === 2) return !!f.projectType;
    if (step === 3) return f.value > 0;
    if (step === 4) return !!f.source;
    return true;
  };

  const next = () => { if (canNext() && step < 5) go(step + 1); };
  const back = () => step > 1 && go(step - 1);

  const submit = () => {
    dispatch({
      type: 'ADD_CLIENT',
      payload: {
        name: f.name, contact: f.contact, phone: f.phone, email: f.email,
        status: 'lead', value: f.value, projectType: f.projectType,
        source: f.source, date: new Date().toISOString().slice(0, 10), notes: f.notes,
      },
    });
    toast('הליד נקלט במערכת · נשמר מקומית');
    navigate('/clients');
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <SectionHeader title="קליטת ליד חדש" sub="הוספת לקוח פוטנציאלי למערכת" action={<DemoTag />} />

      <div className="card panel" style={{ padding: '26px 28px' }}>
        {/* Stepper */}
        <div className="stepper">
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: 'contents' }}>
              <div className={`step ${step === s.n ? 'active' : ''} ${step > s.n ? 'done' : ''}`}>
                <div className="step-dot">{step > s.n ? <Icon name="check" size={15} strokeWidth={2.6} /> : s.n}</div>
                <span className="step-label">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`step-line ${step > s.n ? 'done' : ''}`} />}
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', minHeight: 240 }}>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 1 && (
                <div className="form-grid">
                  <div className="field full">
                    <label>שם הלקוח / חברה *</label>
                    <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="לדוגמה: וולווט קוסמטיקס" autoFocus />
                  </div>
                  <div className="field">
                    <label>איש קשר *</label>
                    <input className="input" value={f.contact} onChange={(e) => set('contact', e.target.value)} placeholder="שם מלא" />
                  </div>
                  <div className="field">
                    <label>טלפון *</label>
                    <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="050-0000000" dir="ltr" style={{ textAlign: 'right' }} inputMode="tel" />
                  </div>
                  <div className="field full">
                    <label>אימייל</label>
                    <input className="input" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="name@email.com" dir="ltr" style={{ textAlign: 'right' }} />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <label className="muted" style={{ fontSize: '0.86rem', display: 'block', marginBottom: 12 }}>איזה סוג פרויקט הלקוח מחפש?</label>
                  <div className="choice-grid">
                    {PROJECT_TYPES.map((p) => (
                      <div key={p} className={`choice ${f.projectType === p ? 'selected' : ''}`} onClick={() => set('projectType', p)}>
                        <span className="check">{f.projectType === p && <Icon name="check" size={12} strokeWidth={3} />}</span>
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <label className="muted" style={{ fontSize: '0.86rem', display: 'block', marginBottom: 12 }}>מהו טווח התקציב המשוער?</label>
                  <div className="choice-grid">
                    {BUDGETS.map((b) => (
                      <div key={b.label} className={`choice ${f.budgetLabel === b.label ? 'selected' : ''}`} onClick={() => { set('budgetLabel', b.label); set('value', b.value); }}>
                        <span className="check">{f.budgetLabel === b.label && <Icon name="check" size={12} strokeWidth={3} />}</span>
                        {b.label}
                      </div>
                    ))}
                  </div>
                  <div className="field" style={{ marginTop: 18 }}>
                    <label>או הזן שווי מדויק (₪)</label>
                    <input className="input tnum" value={f.value || ''} onChange={(e) => { set('value', Number(e.target.value) || 0); set('budgetLabel', ''); }} placeholder="0" dir="ltr" style={{ textAlign: 'right', maxWidth: 220 }} inputMode="numeric" />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <label className="muted" style={{ fontSize: '0.86rem', display: 'block', marginBottom: 12 }}>איך הליד הגיע אלינו?</label>
                  <div className="choice-grid">
                    {LEAD_SOURCES.map((s) => (
                      <div key={s} className={`choice ${f.source === s ? 'selected' : ''}`} onClick={() => set('source', s)}>
                        <span className="check">{f.source === s && <Icon name="check" size={12} strokeWidth={3} />}</span>
                        {s}
                      </div>
                    ))}
                  </div>
                  <div className="field full" style={{ marginTop: 18 }}>
                    <label>הערות (אופציונלי)</label>
                    <textarea className="textarea" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="פרטים נוספים, צרכים מיוחדים, לוחות זמנים..." />
                  </div>
                </div>
              )}

              {step === 5 && (
                <div>
                  <div className="row gap-3" style={{ marginBottom: 18 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--lime)', color: 'var(--on-lime)', display: 'grid', placeItems: 'center' }}>
                      <Icon name="check" size={24} strokeWidth={2.4} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.15rem' }}>הליד מוכן לקליטה</h3>
                      <p className="muted" style={{ fontSize: '0.86rem' }}>בדוק את הפרטים ולחץ לאישור</p>
                    </div>
                  </div>
                  <div className="detail-grid" style={{ background: 'var(--surface-2)', padding: 18, borderRadius: 16, border: '1px solid var(--border)' }}>
                    <div className="detail-item"><div className="k">לקוח</div><div className="v">{f.name || '—'}</div></div>
                    <div className="detail-item"><div className="k">איש קשר</div><div className="v">{f.contact || '—'}</div></div>
                    <div className="detail-item"><div className="k">טלפון</div><div className="v" dir="ltr" style={{ textAlign: 'right' }}>{f.phone || '—'}</div></div>
                    <div className="detail-item"><div className="k">סוג פרויקט</div><div className="v">{f.projectType || '—'}</div></div>
                    <div className="detail-item"><div className="k">תקציב משוער</div><div className="v tnum" style={{ color: 'var(--lime-deep)', fontWeight: 700 }}>{formatCurrency(f.value)}</div></div>
                    <div className="detail-item"><div className="k">מקור</div><div className="v">{f.source || '—'}</div></div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Nav */}
        <div className="row between" style={{ marginTop: 26 }}>
          <button className="btn btn-ghost" onClick={back} disabled={step === 1} style={step === 1 ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
            <Icon name="chevronR" size={18} /> חזרה
          </button>
          {step < 5 ? (
            <button className="btn btn-primary" onClick={next} disabled={!canNext()} style={!canNext() ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
              המשך <Icon name="chevronL" size={18} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={submit}>
              <Icon name="check" size={18} /> קליטת הליד
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
