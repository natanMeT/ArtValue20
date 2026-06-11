import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { SERVICE_TYPES, PROJECT_STATUS, TEMPLATES } from '../../data/studio.js';

const empty = {
  name: '', clientId: '', serviceType: 'website', value: '', status: 'active',
  deadline: '', nextAction: '', description: '', missing: '', deliverables: '',
  progress: 0, templateId: '', internal: false,
};

export default function ProjectModal({ open, onClose, onSave, clients, initial }) {
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...empty, ...initial, value: initial.value ?? '' } : { ...empty, clientId: clients[0]?.id || '' });
      setErr(false);
    }
  }, [open, initial, clients]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) { setErr(true); return; }
    const client = clients.find((c) => c.id === form.clientId);
    onSave({
      ...form,
      value: form.internal ? 0 : Number(form.value) || 0,
      clientName: form.internal ? 'ArtValue' : client?.name || 'לקוח',
      progress: Number(form.progress) || 0,
    });
  };

  const isEdit = !!initial?.id;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'עריכת פרויקט' : 'פרויקט חדש'}
      subtitle={isEdit ? initial.name : 'פתיחת פרויקט חדש לסטודיו'}
      maxWidth={640}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={submit}>{isEdit ? 'שמירה' : 'יצירת פרויקט'}</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label>שם הפרויקט *</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="לדוגמה: אתר תדמית לציפי" style={err ? { borderColor: '#ef6f6f' } : undefined} autoFocus />
        </div>
        <div className="field">
          <label>לקוח</label>
          <select className="select" value={form.clientId} onChange={set('clientId')} disabled={form.internal}>
            {clients.length === 0 && <option value="">אין לקוחות</option>}
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>סוג שירות</label>
          <select className="select" value={form.serviceType} onChange={set('serviceType')}>
            {SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>שווי פרויקט (₪)</label>
          <input className="input tnum" value={form.internal ? '' : form.value} onChange={set('value')} placeholder={form.internal ? 'פנימי' : '0'} disabled={form.internal} dir="ltr" style={{ textAlign: 'right' }} inputMode="numeric" />
        </div>
        <div className="field">
          <label>סטטוס</label>
          <select className="select" value={form.status} onChange={set('status')}>
            {PROJECT_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>דדליין</label>
          <input className="input" type="date" value={form.deadline || ''} onChange={set('deadline')} dir="ltr" style={{ textAlign: 'right' }} />
        </div>
        <div className="field">
          <label>התקדמות (%)</label>
          <input className="input tnum" value={form.progress} onChange={set('progress')} dir="ltr" style={{ textAlign: 'right' }} inputMode="numeric" />
        </div>
        <div className="field full">
          <label>פעולה הבאה</label>
          <input className="input" value={form.nextAction} onChange={set('nextAction')} placeholder="לדוגמה: לשלוח סקיצה" />
        </div>
        <div className="field full">
          <label>תיאור קצר</label>
          <textarea className="textarea" value={form.description} onChange={set('description')} placeholder="על מה הפרויקט..." />
        </div>
        <div className="field">
          <label>חסר מהלקוח</label>
          <input className="input" value={form.missing} onChange={set('missing')} placeholder="לוגו, תמונות..." />
        </div>
        <div className="field">
          <label>תוצרים למסירה</label>
          <input className="input" value={form.deliverables} onChange={set('deliverables')} placeholder="אתר, Brand Book..." />
        </div>
        {!isEdit && (
          <div className="field full">
            <label>תבנית (תיצור משימות אוטומטיות)</label>
            <select className="select" value={form.templateId} onChange={set('templateId')}>
              <option value="">ללא תבנית</option>
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tasks.length} משימות)</option>)}
            </select>
          </div>
        )}
        <label className="field full" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.internal} onChange={(e) => setForm((f) => ({ ...f, internal: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#d4ff3f' }} />
          <span style={{ fontSize: '0.88rem' }}>פרויקט פנימי (ArtValue)</span>
        </label>
      </div>
    </Modal>
  );
}
