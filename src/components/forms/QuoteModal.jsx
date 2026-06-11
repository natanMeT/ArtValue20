import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';
import { uid } from '../../data/seed.js';
import { formatCurrency } from '../../lib/format.js';
import { quoteSubtotal, quoteVat, quoteTotal } from '../../lib/calc.js';

function nextNumber(quotes) {
  const nums = quotes
    .map((q) => parseInt(String(q.number).replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1040;
  return `AV-${max + 1}`;
}

function blankItem() {
  return { id: uid('li'), desc: '', qty: 1, price: 0 };
}

export default function QuoteModal({ open, onClose, onSave, clients, quotes, initial, presetClientId }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({ ...initial, items: initial.items.map((i) => ({ ...i })) });
    } else {
      setForm({
        number: nextNumber(quotes),
        clientId: presetClientId || clients[0]?.id || '',
        date: new Date().toISOString().slice(0, 10),
        validDays: 30,
        vatRate: 18,
        status: 'draft',
        notes: '',
        items: [blankItem()],
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return null;

  const setItem = (id, k, v) =>
    setForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? { ...it, [k]: v } : it)) }));
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }));
  const delItem = (id) => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((it) => it.id !== id) : f.items }));

  const valid = form.clientId && form.items.some((it) => it.desc.trim() && Number(it.price) > 0);

  const submit = () => {
    if (!valid) return;
    onSave({
      ...form,
      items: form.items
        .filter((it) => it.desc.trim())
        .map((it) => ({ ...it, qty: Number(it.qty) || 1, price: Number(it.price) || 0 })),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `עריכת הצעה ${form.number}` : 'הצעת מחיר חדשה'}
      subtitle="בנייה אוטומטית עם חישוב מע״מ"
      maxWidth={720}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={submit} disabled={!valid} style={!valid ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
            {initial ? 'שמירת שינויים' : 'יצירת הצעה'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="form-grid">
          <div className="field">
            <label>לקוח *</label>
            <select className="select" value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}>
              {clients.length === 0 && <option value="">אין לקוחות</option>}
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>תאריך</label>
            <input className="input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} dir="ltr" style={{ textAlign: 'right' }} />
          </div>
          <div className="field">
            <label>תוקף (ימים)</label>
            <input className="input tnum" value={form.validDays} onChange={(e) => setForm((f) => ({ ...f, validDays: Number(e.target.value) || 0 }))} dir="ltr" style={{ textAlign: 'right' }} inputMode="numeric" />
          </div>
          <div className="field">
            <label>מע״מ (%)</label>
            <input className="input tnum" value={form.vatRate} onChange={(e) => setForm((f) => ({ ...f, vatRate: Number(e.target.value) || 0 }))} dir="ltr" style={{ textAlign: 'right' }} inputMode="numeric" />
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="panel-title">פריטים</div>
            <button className="btn btn-ghost btn-sm" onClick={addItem}><Icon name="plus" size={16} /> שורה</button>
          </div>
          <div className="line-items">
            <div className="line-row">
              <span className="lh">תיאור</span>
              <span className="lh">כמות</span>
              <span className="lh">מחיר ליח׳</span>
              <span />
            </div>
            {form.items.map((it) => (
              <div className="line-row" key={it.id}>
                <input className="input" value={it.desc} onChange={(e) => setItem(it.id, 'desc', e.target.value)} placeholder="תיאור השירות" />
                <input className="input tnum" value={it.qty} onChange={(e) => setItem(it.id, 'qty', e.target.value)} dir="ltr" style={{ textAlign: 'center' }} inputMode="numeric" />
                <input className="input tnum" value={it.price} onChange={(e) => setItem(it.id, 'price', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} inputMode="numeric" />
                <button className="icon-action del" onClick={() => delItem(it.id)} aria-label="מחיקת שורה"><Icon name="trash" size={15} /></button>
              </div>
            ))}
          </div>

          <div className="line-total-box">
            <div className="ln"><span>סכום ביניים</span><span className="tnum">{formatCurrency(quoteSubtotal(form))}</span></div>
            <div className="ln"><span>מע״מ ({form.vatRate}%)</span><span className="tnum">{formatCurrency(quoteVat(form))}</span></div>
            <div className="ln grand"><span>סה״כ לתשלום</span><span className="tnum">{formatCurrency(quoteTotal(form))}</span></div>
          </div>
        </div>

        <div className="field">
          <label>הערות / תנאים</label>
          <textarea className="textarea" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="תנאי תשלום, סבבי תיקונים, לוחות זמנים..." />
        </div>
      </div>
    </Modal>
  );
}
