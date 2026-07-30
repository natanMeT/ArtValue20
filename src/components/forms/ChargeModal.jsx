import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import {
  CHARGE_KINDS, CHARGE_KIND_LABELS,
  PAYMENT_TERMS, PAYMENT_TERMS_LABELS,
  RECEIVABLES_LIMITS,
  computeDueDate, validateCharge,
} from '../../lib/receivables.js';

// ===================================================================
// ChargeModal (F1) — create or edit one EXPECTED billing event.
//
// THE ONE THING THIS SCREEN MUST NOT DO: let anyone type a payment status.
// There is no status field here, because there is no status column — paid /
// partially paid / expected are derived from amount_total and the sum of the
// payments recorded against the charge. Money owed is stated once, in one place.
//
// THE DUE DATE IS EXPLICIT ABOUT WHERE IT CAME FROM. By default it is COMPUTED
// (end of the service month + 0/30/60/90 days) and recomputes as the service
// date or the terms change, so it can never silently disagree with the terms
// beside it. Overriding it is a deliberate click, and from that moment the field
// says "הוזן ידנית" and stops recomputing — an override that quietly evaporates
// the next time a field changes is worse than no override at all.
//
// `saving` (optional): visible in-flight state owned by the page — while true
// the submit button is disabled and shows a truthful pending label, so a pending
// cloud write cannot be re-submitted from the UI.
// ===================================================================

const empty = {
  clientId: '',
  quoteId: '',
  kind: 'final',
  paymentTerms: 'immediate',
  serviceDate: '',
  dueDate: '',
  amountTotal: '',
  description: '',
  invoiceUrl: '',
};

export default function ChargeModal({
  open, onClose, onSave, initial, clients = [], quotes = [], saving = false,
}) {
  const [form, setForm] = useState(empty);
  // The override is UI state, not a form field: the payload's `dueDate` is what
  // decides `dueDateSource` in the shared validator.
  const [manualDue, setManualDue] = useState(false);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        clientId: initial.clientId || '',
        quoteId: initial.quoteId || '',
        kind: initial.kind || 'final',
        paymentTerms: initial.paymentTerms || 'immediate',
        serviceDate: initial.serviceDate || '',
        dueDate: initial.dueDate || '',
        amountTotal: initial.amountTotal ?? '',
        description: initial.description || '',
        invoiceUrl: initial.invoiceUrl || '',
      });
      setManualDue(initial.dueDateSource === 'manual');
    } else {
      setForm(empty);
      setManualDue(false);
    }
    setErrors([]);
  }, [open, initial]);

  // The computed value, always available for display even while overridden — so
  // the user can see what they are overriding, and what they would return to.
  const computedDue = useMemo(
    () => computeDueDate(form.serviceDate, form.paymentTerms),
    [form.serviceDate, form.paymentTerms],
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const shownDue = manualDue ? form.dueDate : (computedDue || '');

  const submit = () => {
    // Validate through the SAME shared validator the api layer uses, so the
    // modal can never accept a payload the boundary will reject.
    const payload = {
      ...form,
      // Not overriding → send no dueDate at all, and let the validator compute
      // it and stamp `computed`. Sending the displayed value would stamp it
      // `manual` and freeze a date the user never chose.
      dueDate: manualDue ? form.dueDate : '',
    };
    const v = validateCharge(payload);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    onSave(initial ? { ...payload, id: initial.id } : payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'עריכת חיוב' : 'חיוב חדש'}
      subtitle="חיוב צפוי — מה אמור להיגבות, ומתי"
      maxWidth={620}
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
            <label>לקוח</label>
            <select className="select" value={form.clientId} onChange={(e) => set('clientId', e.target.value)}>
              <option value="">ללא שיוך</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label>הצעת מחיר</label>
            <select className="select" value={form.quoteId} onChange={(e) => set('quoteId', e.target.value)}>
              <option value="">ללא הצעה</option>
              {quotes.map((q) => <option key={q.id} value={q.id}>{q.number || q.id}</option>)}
            </select>
          </div>

          <div className="field">
            <label>סוג החיוב</label>
            <select className="select" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              {CHARGE_KINDS.map((k) => <option key={k} value={k}>{CHARGE_KIND_LABELS[k]}</option>)}
            </select>
          </div>

          <div className="field">
            <label>תנאי תשלום</label>
            <select className="select" value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)}>
              {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{PAYMENT_TERMS_LABELS[t]}</option>)}
            </select>
          </div>

          <div className="field">
            <label>תאריך השירות *</label>
            <input
              className="input" type="date" value={form.serviceDate}
              onChange={(e) => set('serviceDate', e.target.value)}
              dir="ltr" style={{ textAlign: 'right' }}
            />
          </div>

          <div className="field">
            <label>סכום כולל מע״מ (₪) *</label>
            <input
              className="input tnum" value={form.amountTotal}
              onChange={(e) => set('amountTotal', e.target.value)}
              placeholder="0" dir="ltr" style={{ textAlign: 'right' }} inputMode="decimal"
            />
          </div>
        </div>

        {/* Due date — and, in plain words, where the value came from. */}
        <div className="card" style={{ padding: 12 }}>
          <div className="row gap-3" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 200px' }}>
              <label>תאריך פירעון</label>
              <input
                className="input" type="date" value={shownDue}
                onChange={(e) => set('dueDate', e.target.value)}
                disabled={!manualDue}
                dir="ltr" style={{ textAlign: 'right' }}
              />
            </div>
            <div style={{ alignSelf: 'flex-end', paddingBottom: 4 }}>
              {manualDue ? (
                <button
                  className="btn btn-ghost"
                  onClick={() => { setManualDue(false); set('dueDate', ''); }}
                >
                  חזרה לחישוב אוטומטי
                </button>
              ) : (
                <button
                  className="btn btn-ghost"
                  onClick={() => { setManualDue(true); set('dueDate', computedDue || ''); }}
                  disabled={!computedDue}
                >
                  שינוי ידני
                </button>
              )}
            </div>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            {manualDue
              ? 'תאריך הפירעון הוזן ידנית ואינו מתעדכן לפי תנאי התשלום.'
              : 'תאריך הפירעון מחושב אוטומטית: סוף חודש השירות ועוד ימי תנאי התשלום.'}
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>תיאור</label>
            <input
              className="input" value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="לדוגמה: מקדמה לפרויקט"
              maxLength={RECEIVABLES_LIMITS.description}
            />
          </div>
          <div className="field">
            <label>קישור לחשבונית</label>
            <input
              className="input" value={form.invoiceUrl}
              onChange={(e) => set('invoiceUrl', e.target.value)}
              placeholder="https://…" dir="ltr" style={{ textAlign: 'left' }}
              maxLength={RECEIVABLES_LIMITS.invoiceUrl}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
