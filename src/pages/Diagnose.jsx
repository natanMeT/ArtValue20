import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { SectionHeader } from '../components/ui/atoms.jsx';
import Icon from '../components/ui/Icon.jsx';
import { diagnoseQuote, isGeminiConfigured } from '../lib/gemini.js';

const EMPTY = { clientName: '', field: '', audience: '', offer: '' };

export default function Diagnose() {
  const { data, toast } = useStore();
  const location = useLocation();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Prefill when arriving from a client's "אפיון" button (Clients page).
  const prefilledRef = useState(() => ({ done: '' }))[0];
  useEffect(() => {
    const id = location.state?.diagnoseClient;
    if (!id || prefilledRef.done === id) return;
    const c = data.clients.find((x) => x.id === id);
    if (!c) return;
    prefilledRef.done = id;
    setForm({
      clientName: c.name || '',
      field: c.projectType || '',
      audience: '',
      offer: c.value ? `הצעה בתחום ${c.projectType || ''} בשווי משוער של ${c.value.toLocaleString('he-IL')} ₪.` : '',
    });
    toast('מולא מנתוני הלקוח — לחץ "בצע אבחון"');
  }, [location.state, data.clients, toast, prefilledRef]);

  const run = async () => {
    if (!form.clientName.trim() && !form.offer.trim()) { setError('מלא לפחות שם לקוח או הצעה'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await diagnoseQuote(form);
      setResult(r);
    } catch (e) {
      setError(e.message || 'שגיאה בהפקת האבחון');
    } finally {
      setLoading(false);
    }
  };

  // prefill from an existing client (optional convenience)
  const prefillClient = (id) => {
    const c = data.clients.find((x) => x.id === id);
    if (c) setForm((f) => ({ ...f, clientName: c.name, field: c.projectType || f.field }));
  };

  const copyAll = () => {
    if (!result) return;
    const txt = [
      `אבחון מכירה — ${form.clientName || ''}`,
      `\nפרופיל: ${result.psychProfile}`,
      `\nמבנה שיחה:\n${result.conversationStructure.map((s, i) => `${i + 1}. ${s.step}: ${s.detail}`).join('\n')}`,
      `\nהתנגדויות:\n${result.objections.map((o) => `• ${o.objection} → ${o.response}`).join('\n')}`,
      result.valueAngles?.length ? `\nזוויות ערך: ${result.valueAngles.join(' · ')}` : '',
      `\nטיפ סגירה: ${result.closingTip}`,
    ].join('\n');
    navigator.clipboard?.writeText(txt).then(() => toast('האבחון הועתק'), () => toast('לא ניתן להעתיק', 'error'));
  };

  return (
    <div>
      <SectionHeader
        title={<span className="row gap-2" style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="spark" size={22} style={{ color: 'var(--lime-deep)' }} /> אבחון AI להצעות מחיר</span>}
        sub="הזן את פרטי הלקוח וההצעה שלך, וקבל ניתוח פסיכולוגי, מבנה שיחה והתנגדויות צפויות לקראת סגירה."
        action={!isGeminiConfigured && <span className="badge badge-neutral"><Icon name="spark" size={12} /> מצב הדגמה · ללא מפתח Gemini</span>}
      />

      <div className="diagnose-grid">
        {/* Form */}
        <div className="card panel">
          <div className="panel-title row gap-2" style={{ marginBottom: 16 }}><Icon name="doc" size={18} style={{ color: 'var(--lime-deep)' }} /> נתוני הלקוח וההצעה</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field">
              <label><Icon name="users" size={13} /> שם / עסק הלקוח</label>
              <input className="input" value={form.clientName} onChange={set('clientName')} placeholder="למשל: סטודיו גלריה אקספרס" list="diag-clients" />
              <datalist id="diag-clients">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div className="form-grid">
              <div className="field"><label><Icon name="briefcase" size={13} /> מקצוע / תחום</label><input className="input" value={form.field} onChange={set('field')} placeholder="למשל: מכירת אמנות" /></div>
              <div className="field"><label><Icon name="target" size={13} /> קהל יעד מרכזי</label><input className="input" value={form.audience} onChange={set('audience')} placeholder="למשל: אספנים" /></div>
            </div>
            <div className="field">
              <label><Icon name="spark" size={13} /> ההצעה שלי (מה אני רוצה למכור לו?)</label>
              <textarea className="textarea" style={{ minHeight: 120 }} value={form.offer} onChange={set('offer')} placeholder={'למשל: בניית אתר תדמית כולל קטלוג עבודות וקמפיין גוגל להבאת לידים. הצעת מחיר סביב 15,000 ש״ח.'} />
            </div>

            {error && <div className="login-error"><Icon name="x" size={15} strokeWidth={2.4} /> {error}</div>}

            <button className="btn btn-primary btn-block" onClick={run} disabled={loading} style={loading ? { opacity: 0.8 } : { height: 50, fontSize: '0.98rem' }}>
              {loading ? <><span className="loader-ring" style={{ width: 18, height: 18, borderWidth: 2 }} /> מנתח את הלקוח…</> : <><Icon name="spark" size={18} /> בצע אבחון AI עמוק</>}
            </button>
          </div>
        </div>

        {/* Result */}
        <div className="card panel diag-result">
            {!result && !loading && (
              <div className="diag-empty">
                <div className="diag-empty-ico"><Icon name="spark" size={30} /></div>
                <h3>מערכת האבחון מוכנה</h3>
                <p className="muted">הזן את הנתונים בטופס כדי לקבל ניתוח פסיכולוגי של הלקוח, מבנה שיחה מומלץ והתנגדויות צפויות לפני סגירת העסקה.</p>
              </div>
            )}

            {loading && (
              <div className="diag-empty">
                <span className="loader-ring" style={{ width: 40, height: 40 }} />
                <h3 style={{ marginTop: 14 }}>מנתח את פרופיל הלקוח…</h3>
                <p className="muted">בונה אסטרטגיית שיחה והתנגדויות צפויות.</p>
              </div>
            )}

            {result && !loading && (
              <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="row between">
                  <div className="row gap-2 wrap">
                    {result.personalityType && <span className="badge badge-active"><span className="dot" />{result.personalityType}</span>}
                    {result._demo && <span className="badge badge-neutral">הדגמה</span>}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={copyAll}><Icon name="copy" size={15} /> העתק</button>
                </div>

                <DiagSection icon="users" title="פרופיל פסיכולוגי של הלקוח">
                  <p className="diag-text">{result.psychProfile}</p>
                </DiagSection>

                <DiagSection icon="arrow" title="מבנה שיחת מכירה מומלץ">
                  <ol className="diag-steps">
                    {result.conversationStructure.map((s, i) => (
                      <li key={i}><span className="diag-step-num">{i + 1}</span><div><b>{s.step}</b><span className="muted"> — {s.detail}</span></div></li>
                    ))}
                  </ol>
                </DiagSection>

                <DiagSection icon="x" title="התנגדויות צפויות ומענה">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {result.objections.map((o, i) => (
                      <div key={i} className="diag-objection">
                        <div className="obj-q">“{o.objection}”</div>
                        <div className="obj-a"><Icon name="check" size={13} /> {o.response}</div>
                      </div>
                    ))}
                  </div>
                </DiagSection>

                {result.valueAngles?.length > 0 && (
                  <DiagSection icon="target" title="זוויות ערך מרכזיות">
                    <div className="row gap-2 wrap">{result.valueAngles.map((v, i) => <span key={i} className="badge badge-completed">{v}</span>)}</div>
                  </DiagSection>
                )}

                <div className="diag-closing"><Icon name="spark" size={16} /><div><b>טיפ סגירה:</b> {result.closingTip}</div></div>
              </motion.div>
            )}
        </div>
      </div>
    </div>
  );
}

function DiagSection({ icon, title, children }) {
  return (
    <div className="diag-section">
      <div className="diag-section-title"><Icon name={icon} size={15} /> {title}</div>
      {children}
    </div>
  );
}
