import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { TASK_STATUS, TASK_PRIORITY } from '../../data/studio.js';

const empty = {
  title: '', projectId: '', status: 'new', priority: 'normal',
  deadline: '', assignee: 'נתן', linkRef: '', notes: '',
};

export default function TaskModal({ open, onClose, onSave, projects, initial, lockProjectId }) {
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...empty, ...initial } : { ...empty, projectId: lockProjectId || projects[0]?.id || '' });
      setErr(false);
    }
  }, [open, initial, lockProjectId, projects]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.title.trim()) { setErr(true); return; }
    const project = projects.find((p) => p.id === form.projectId);
    onSave({ ...form, clientId: project?.clientId || null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'עריכת משימה' : 'משימה חדשה'}
      maxWidth={560}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={submit}>{initial ? 'שמירה' : 'הוספה'}</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label>שם המשימה *</label>
          <input className="input" value={form.title} onChange={set('title')} placeholder="לדוגמה: לשלוח סקיצה ללקוח" style={err ? { borderColor: '#ef6f6f' } : undefined} autoFocus />
        </div>
        <div className="field full">
          <label>פרויקט</label>
          <select className="select" value={form.projectId} onChange={set('projectId')} disabled={!!lockProjectId}>
            {projects.length === 0 && <option value="">אין פרויקטים</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>סטטוס</label>
          <select className="select" value={form.status} onChange={set('status')}>
            {TASK_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>עדיפות</label>
          <select className="select" value={form.priority} onChange={set('priority')}>
            {TASK_PRIORITY.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>דדליין</label>
          <input className="input" type="date" value={form.deadline || ''} onChange={set('deadline')} dir="ltr" style={{ textAlign: 'right' }} />
        </div>
        <div className="field">
          <label>אחראי</label>
          <input className="input" value={form.assignee} onChange={set('assignee')} placeholder="שם" />
        </div>
        <div className="field full">
          <label>הערות</label>
          <textarea className="textarea" value={form.notes} onChange={set('notes')} placeholder="פרטים נוספים..." />
        </div>
      </div>
    </Modal>
  );
}
