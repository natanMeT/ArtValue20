import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { TASK_STATUS, TASK_PRIORITY } from '../../data/studio.js';

const empty = {
  title: '', projectId: '', clientId: '', status: 'new', priority: 'normal',
  deadline: '', assignee: 'נתן', linkRef: '', notes: '',
};

// S0B: a task may be project-linked, directly client-linked, or standalone.
// `clients` is optional — the frozen ProjectDetail caller does not pass it, so
// the client picker only appears where a clients list is provided (e.g. Tasks).
export default function TaskModal({ open, onClose, onSave, projects, clients = [], initial, lockProjectId }) {
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({ ...empty, ...initial });
      } else {
        const projectId = lockProjectId || projects[0]?.id || '';
        const proj = projects.find((p) => p.id === projectId);
        setForm({ ...empty, projectId, clientId: proj?.clientId || '' });
      }
      setErr(false);
    }
  }, [open, initial, lockProjectId, projects]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // Selecting a project defaults the task's client to that project's client
  // (the user can still override it via the client picker for a direct link).
  const setProject = (e) => {
    const projectId = e.target.value;
    const proj = projects.find((p) => p.id === projectId);
    setForm((f) => ({ ...f, projectId, clientId: proj?.clientId ?? f.clientId }));
  };

  const submit = () => {
    if (!form.title.trim()) { setErr(true); return; }
    const project = projects.find((p) => p.id === form.projectId);
    // project-linked, directly client-linked, or standalone — both ids may be null.
    onSave({ ...form, projectId: form.projectId || null, clientId: form.clientId || project?.clientId || null });
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
        <div className="field">
          <label>פרויקט</label>
          <select className="select" value={form.projectId} onChange={setProject} disabled={!!lockProjectId}>
            <option value="">ללא פרויקט</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {clients.length > 0 && (
          <div className="field">
            <label>לקוח</label>
            <select className="select" value={form.clientId || ''} onChange={set('clientId')}>
              <option value="">ללא לקוח</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
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
