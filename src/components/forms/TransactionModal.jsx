import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../../data/seed.js';

const empty = {
  type: 'income',
  amount: '',
  category: INCOME_CATEGORIES[0],
  date: new Date().toISOString().slice(0, 10),
  description: '',
};

export default function TransactionModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...initial, amount: initial.amount } : empty);
      setErr(false);
    }
  }, [open, initial]);

  const cats = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setType = (t) =>
    setForm((f) => ({ ...f, type: t, category: (t === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0] }));

  const submit = () => {
    if (!form.amount || Number(form.amount) <= 0) {
      setErr(true);
      return;
    }
    onSave({ ...form, amount: Number(form.amount) });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'עריכת תנועה' : 'תנועה חדשה'}
      subtitle="רישום הכנסה או הוצאה"
      maxWidth={520}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={submit}>{initial ? 'שמירה' : 'הוספה'}</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button className={form.type === 'income' ? 'on' : ''} onClick={() => setType('income')}>הכנסה</button>
          <button className={form.type === 'expense' ? 'on' : ''} onClick={() => setType('expense')}>הוצאה</button>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>סכום (₪) *</label>
            <input className="input tnum" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" dir="ltr" style={{ textAlign: 'right', ...(err ? { borderColor: '#ef6f6f' } : {}) }} inputMode="numeric" autoFocus />
          </div>
          <div className="field">
            <label>תאריך</label>
            <input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} />
          </div>
          <div className="field">
            <label>קטגוריה</label>
            <select className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>תיאור</label>
            <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="לדוגמה: תשלום פרויקט" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
