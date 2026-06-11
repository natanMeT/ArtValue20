import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';
import { PROJECT_TYPES, LEAD_SOURCES } from '../../data/seed.js';
import { CLIENT_STATUS_EXT } from '../../data/studio.js';

const EMPTY = {
  name: '',
  contact: '',
  phone: '',
  email: '',
  status: 'lead',
  value: '',
  projectType: PROJECT_TYPES[0],
  source: LEAD_SOURCES[0],
  date: new Date().toISOString().slice(0, 10),
  paidDate: new Date().toISOString().slice(0, 10),
  notes: '',
  nextAction: '',
};

export default function ClientModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...EMPTY, ...initial, value: initial.value ?? '' } : EMPTY);
      setErr({});
    }
  }, [open, initial]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const e = {};
    if (!form.name.trim()) e.name = 1;
    if (!form.contact.trim()) e.contact = 1;
    if (form.phone && !/^[0-9+\-\s]{6,}$/.test(form.phone)) e.phone = 1;
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = 1;
    if (form.status === 'completed_paid' && !(Number(form.value) > 0)) e.value = 1; // paid deal needs an amount
    setErr(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, value: Number(form.value) || 0 });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'עריכת לקוח' : 'לקוח חדש'}
      subtitle={initial ? initial.name : 'הוספת לקוח למאגר'}
      maxWidth={620}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={submit}>
            {initial ? 'שמירת שינויים' : 'הוספת לקוח'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>שם הלקוח / חברה *</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="לדוגמה: אורורה סטודיו" style={err.name ? { borderColor: '#ef6f6f' } : undefined} />
        </div>
        <div className="field">
          <label>איש קשר *</label>
          <input className="input" value={form.contact} onChange={set('contact')} placeholder="שם מלא" style={err.contact ? { borderColor: '#ef6f6f' } : undefined} />
        </div>
        <div className="field">
          <label>טלפון</label>
          <input className="input" value={form.phone} onChange={set('phone')} placeholder="050-0000000" inputMode="tel" dir="ltr" style={{ textAlign: 'right', ...(err.phone ? { borderColor: '#ef6f6f' } : {}) }} />
        </div>
        <div className="field">
          <label>אימייל</label>
          <input className="input" value={form.email} onChange={set('email')} placeholder="name@email.com" dir="ltr" style={{ textAlign: 'right', ...(err.email ? { borderColor: '#ef6f6f' } : {}) }} />
        </div>
        <div className="field">
          <label>סטטוס</label>
          <select className="select" value={form.status} onChange={set('status')}>
            {CLIENT_STATUS_EXT.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>שווי פרויקט (₪){form.status === 'completed_paid' ? ' *' : ''}</label>
          <input className="input tnum" value={form.value} onChange={set('value')} placeholder="0" inputMode="numeric" dir="ltr" style={{ textAlign: 'right', ...(err.value ? { borderColor: '#ef6f6f' } : {}) }} />
        </div>
        {form.status === 'completed_paid' && (
          <>
            <div className="field">
              <label>תאריך תשלום</label>
              <input className="input" type="date" value={form.paidDate} onChange={set('paidDate')} dir="ltr" style={{ textAlign: 'right' }} />
            </div>
            <div className="field full">
              <div className="row gap-2" style={{ alignItems: 'flex-start', background: 'color-mix(in srgb, var(--surface) 86%, #d4ff3f 14%)', border: '1px solid rgba(212,255,63,0.3)', borderRadius: 12, padding: '10px 12px' }}>
                <Icon name="wallet" size={16} style={{ color: 'var(--lime-deep)', marginTop: 2, flexShrink: 0 }} />
                <span className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                  ייווצר אוטומטית <b>רישום הכנסה</b> בסכום השווי, בתאריך התשלום — ויופיע בפיננסים ובהכנסות החודש. שינוי הסכום/הסטטוס יסונכרן אוטומטית.
                </span>
              </div>
            </div>
          </>
        )}
        <div className="field">
          <label>סוג פרויקט</label>
          <select className="select" value={form.projectType} onChange={set('projectType')}>
            {PROJECT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label>מקור הליד</label>
          <select className="select" value={form.source} onChange={set('source')}>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field full">
          <label>פעולה הבאה</label>
          <input className="input" value={form.nextAction} onChange={set('nextAction')} placeholder="לדוגמה: לשלוח הצעת מחיר / להתקשר מחר" />
        </div>
        <div className="field full">
          <label>הערות</label>
          <textarea className="textarea" value={form.notes} onChange={set('notes')} placeholder="פרטים נוספים על הלקוח או הפרויקט..." />
        </div>
      </div>
    </Modal>
  );
}
