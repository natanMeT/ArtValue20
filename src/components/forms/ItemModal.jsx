import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';

export const INVENTORY_CATEGORIES = ['מוצר', 'חומר גלם', 'אריזה', 'ציוד', 'מרצ׳נדייז', 'אחר'];

const EMPTY = {
  name: '',
  category: INVENTORY_CATEGORIES[0],
  sku: '',
  qty: '',
  unit: 'יח׳',
  unitPrice: '',
  cost: '',
  lowThreshold: '5',
  supplier: '',
  note: '',
};

export default function ItemModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...EMPTY, ...initial, qty: initial.qty ?? '', unitPrice: initial.unitPrice ?? '', cost: initial.cost ?? '', lowThreshold: initial.lowThreshold ?? '' } : EMPTY);
      setErr({});
    }
  }, [open, initial]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const e = {};
    if (!form.name.trim()) e.name = 1;
    if (form.qty === '' || Number(form.qty) < 0 || Number.isNaN(Number(form.qty))) e.qty = 1;
    setErr(e);
    if (Object.keys(e).length) return;
    onSave({
      ...form,
      qty: Math.round(Number(form.qty) || 0),
      unitPrice: Number(form.unitPrice) || 0,
      cost: Number(form.cost) || 0,
      lowThreshold: Math.round(Number(form.lowThreshold) || 0),
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'עריכת פריט' : 'פריט מלאי חדש'}
      subtitle={initial ? initial.name : 'הוספת פריט למלאי'}
      maxWidth={620}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={submit}>{initial ? 'שמירת שינויים' : 'הוספת פריט'}</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>שם הפריט *</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="לדוגמה: בקבוק יין מרלו 2021" style={err.name ? { borderColor: '#ef6f6f' } : undefined} autoFocus />
        </div>
        <div className="field">
          <label>קטגוריה</label>
          <select className="select" value={form.category} onChange={set('category')}>
            {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>מק״ט / ברקוד</label>
          <input className="input" value={form.sku} onChange={set('sku')} placeholder="SKU-001" dir="ltr" style={{ textAlign: 'right' }} />
        </div>
        <div className="field">
          <label>ספק</label>
          <input className="input" value={form.supplier} onChange={set('supplier')} placeholder="שם הספק" />
        </div>
        <div className="field">
          <label>כמות במלאי *</label>
          <input className="input tnum" value={form.qty} onChange={set('qty')} placeholder="0" inputMode="numeric" dir="ltr" style={{ textAlign: 'right', ...(err.qty ? { borderColor: '#ef6f6f' } : {}) }} />
        </div>
        <div className="field">
          <label>סף התראת מלאי נמוך</label>
          <input className="input tnum" value={form.lowThreshold} onChange={set('lowThreshold')} placeholder="5" inputMode="numeric" dir="ltr" style={{ textAlign: 'right' }} />
        </div>
        <div className="field">
          <label>מחיר מכירה ליחידה (₪)</label>
          <input className="input tnum" value={form.unitPrice} onChange={set('unitPrice')} placeholder="0" inputMode="numeric" dir="ltr" style={{ textAlign: 'right' }} />
        </div>
        <div className="field">
          <label>עלות ליחידה (₪)</label>
          <input className="input tnum" value={form.cost} onChange={set('cost')} placeholder="0" inputMode="numeric" dir="ltr" style={{ textAlign: 'right' }} />
        </div>
        <div className="field full">
          <label>הערה</label>
          <input className="input" value={form.note} onChange={set('note')} placeholder="מיקום במחסן, פרטים נוספים..." />
        </div>
      </div>
    </Modal>
  );
}
