import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import {
  APPOINTMENT_KINDS, APPOINTMENT_KIND_LABELS, SCHEDULE_LIMITS,
  validateAppointment, splitInstant,
} from '../../lib/schedule.js';

// ===================================================================
// AppointmentModal (Schedule Core slice 1) — create or edit ONE occurrence.
//
// THE FORM COLLECTS WALL-CLOCK TIME; THE ROW STORES AN INSTANT. One date and
// two times, interpreted in the local zone by `toInstant` inside the shared
// validator. A single date deliberately covers both times: an occurrence that
// crosses midnight is a real thing, but it is not this slice, and a second date
// field would invite it silently.
//
// THERE IS NO STATUS FIELD HERE. The outcome (התקיים / בוטל / לא הגיע) is
// recorded from the list, where the appointment is in front of the user, not
// buried inside an edit form. That keeps exactly one client-side entry point
// for it (api.setAppointmentStatus), the same shape Campaigns uses.
//
// `saving` (optional): visible in-flight state owned by the page — while true
// the submit button is disabled and shows a truthful pending label, so a
// pending cloud write cannot be re-submitted from the UI.
// ===================================================================

const empty = {
  kind: 'appointment',
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  clientId: '',
  taskId: '',
  notes: '',
};

export default function AppointmentModal({
  open, onClose, onSave, initial, clients = [], tasks = [], saving = false,
}) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const start = splitInstant(initial.startAt);
      const end = initial.endAt ? splitInstant(initial.endAt) : { time: '' };
      setForm({
        kind: initial.kind || 'appointment',
        title: initial.title || '',
        date: start.date,
        startTime: start.time,
        endTime: end.time || '',
        clientId: initial.clientId || '',
        taskId: initial.taskId || '',
        notes: initial.notes || '',
      });
    } else {
      setForm(empty);
    }
    setErrors([]);
  }, [open, initial]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    // Validate through the SAME shared validator the api layer uses, so the
    // modal can never accept a payload the boundary will reject.
    const v = validateAppointment(form);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    onSave(initial ? { ...form, id: initial.id } : form);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'עריכת רישום ביומן' : 'רישום חדש ביומן'}
      subtitle="תור, שיעור או אירוע — מתי, עם מי, וכמה זמן"
      maxWidth={680}
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={saving}
            style={saving ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            {saving ? 'שומר…' : (initial ? 'שמירה' : 'הוספה')}
          </button>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {errors.length > 0 && (
          <div className="card" style={{ padding: 12, borderColor: '#ef6f6f' }}>
            {errors.map((e) => <div key={e} style={{ color: '#ef7a7a' }}>{e}</div>)}
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label>סוג</label>
            <select className="select" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              {APPOINTMENT_KINDS.map((k) => (
                <option key={k} value={k}>{APPOINTMENT_KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>כותרת *</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="לדוגמה: שיעור ציור — קבוצה א"
              maxLength={SCHEDULE_LIMITS.title}
            />
          </div>

          <div className="field">
            <label>תאריך *</label>
            <input
              className="input" type="date" value={form.date}
              onChange={(e) => set('date', e.target.value)}
              dir="ltr" style={{ textAlign: 'right' }}
            />
          </div>

          <div className="field">
            <label>שעת התחלה *</label>
            <input
              className="input" type="time" value={form.startTime}
              onChange={(e) => set('startTime', e.target.value)}
              dir="ltr" style={{ textAlign: 'right' }}
            />
          </div>

          <div className="field">
            <label>שעת סיום</label>
            {/* Optional on purpose: end_at is nullable and "no stated end" is a
                real state, not a missing value to be guessed at. */}
            <input
              className="input" type="time" value={form.endTime}
              onChange={(e) => set('endTime', e.target.value)}
              dir="ltr" style={{ textAlign: 'right' }}
            />
          </div>

          <div className="field">
            <label>לקוח</label>
            <select className="select" value={form.clientId} onChange={(e) => set('clientId', e.target.value)}>
              <option value="">ללא שיוך</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label>משימה מקושרת</label>
            {/* Optional, and it never changes the task: the link points from the
                appointment to the task, and deleting the task only unlinks. */}
            <select className="select" value={form.taskId} onChange={(e) => set('taskId', e.target.value)}>
              <option value="">ללא קישור</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>הערות</label>
          <textarea
            className="input" rows={3} value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            maxLength={SCHEDULE_LIMITS.notes}
            placeholder="מה צריך להביא, איפה נפגשים, מה סוכם"
          />
        </div>

        <div className="sub">
          השעות נשמרות כרגע מוחלט לפי אזור הזמן של המכשיר. אין בסלייס הזה חזרתיות,
          תזכורות או סנכרון ליומן חיצוני.
        </div>
      </div>
    </Modal>
  );
}
