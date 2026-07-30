import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';
import {
  validatePayment, openBalance, chargePaymentStatus,
  PAYMENT_STATUS_LABELS,
} from '../../lib/receivables.js';
import { formatCurrency } from '../../lib/format.js';

// ===================================================================
// PaymentModal (F1) — record money that ACTUALLY ARRIVED against one charge.
//
// This is the only way received revenue enters the product. It creates exactly
// one `payments` row and nothing else: no income transaction is created beside
// it, because that would count the same shekel twice.
//
// THE SUGGESTED AMOUNT IS THE OPEN BALANCE, NOT THE CHARGE TOTAL. Prefilling the
// total is the mistake that turns a second, partial payment into a silent
// overpayment. The field stays editable — a customer may pay any amount,
// including more than is owed (see the overpayment policy in receivables.js).
//
// `saving` (optional): visible in-flight state owned by the page.
// ===================================================================

export default function PaymentModal({
  open, onClose, onSave, onDelete, charge, received = 0, payments = [], saving = false,
}) {
  const [form, setForm] = useState({ amount: '', paidAt: '' });
  const [errors, setErrors] = useState([]);

  // A cancelled charge is not a claim, so no NEW payment may be recorded against
  // it. The modal still opens on one — it is the only surface that can delete a
  // payment, and a cancelled charge's payments are still in actual revenue.
  const cancelled = charge?.lifecycle === 'cancelled';
  const balance = openBalance(charge?.amountTotal, received);
  const status = chargePaymentStatus(charge?.amountTotal, received);
  // The payments of THIS charge, newest first — the correction list below.
  const ownPayments = (Array.isArray(payments) ? payments : [])
    .filter((p) => p && charge && p.chargeId === charge.id)
    .sort((a, b) => String(b.paidAt || '').localeCompare(String(a.paidAt || '')));

  useEffect(() => {
    if (!open) return;
    setForm({
      // The remaining balance, so the common case is one click. An already-paid
      // charge suggests nothing rather than suggesting zero.
      amount: balance > 0 ? String(balance) : '',
      // Deliberately blank rather than "today": a payment date is a fact the
      // user knows and the app does not, and this module owns no clock.
      paidAt: '',
    });
    setErrors([]);
  }, [open, charge, balance]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (cancelled) return; // the disabled button is the UI; this is the rule
    const payload = { chargeId: charge?.id || '', amount: form.amount, paidAt: form.paidAt };
    const v = validatePayment(payload);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    onSave(payload);
  };

  // Deliberately WITHOUT a `balance > 0` conjunct. With that guard, an already
  // paid or overpaid charge has balance 0, so every positive amount exceeded the
  // balance and the warning was suppressed exactly when it was most warranted —
  // the page still offers "record payment" on a paid charge.
  const willOverpay = Number(form.amount) > balance;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="רישום תשלום"
      subtitle="כסף שהתקבל בפועל עבור החיוב"
      maxWidth={520}
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={saving || cancelled}
            style={(saving || cancelled) ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            {saving ? 'שומר…' : 'רישום'}
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

        {cancelled && (
          <div className="sub">
            החיוב בוטל, ולכן לא ניתן לרשום עליו תשלום חדש. התשלומים שנרשמו נשארים רשומים ונכללים בהכנסה בפועל — כאן אפשר למחוק תשלום שנרשם בטעות.
          </div>
        )}

        <div className="card" style={{ padding: 12 }}>
          <div className="row gap-3" style={{ justifyContent: 'space-between' }}>
            <span className="muted">סכום החיוב</span>
            <span className="tnum">{formatCurrency(charge?.amountTotal || 0)}</span>
          </div>
          <div className="row gap-3" style={{ justifyContent: 'space-between' }}>
            <span className="muted">התקבל עד כה</span>
            <span className="tnum">{formatCurrency(received)}</span>
          </div>
          <div className="row gap-3" style={{ justifyContent: 'space-between' }}>
            <span className="muted">יתרה פתוחה</span>
            <span className="tnum" style={{ fontWeight: 700 }}>{formatCurrency(balance)}</span>
          </div>
          <div className="row gap-3" style={{ justifyContent: 'space-between' }}>
            <span className="muted">מצב התשלום</span>
            <span>{PAYMENT_STATUS_LABELS[status]}</span>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>סכום שהתקבל (₪) *</label>
            <input
              className="input tnum" value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="0" dir="ltr" style={{ textAlign: 'right' }} inputMode="decimal" autoFocus
            />
          </div>
          <div className="field">
            <label>תאריך התשלום *</label>
            <input
              className="input" type="date" value={form.paidAt}
              onChange={(e) => set('paidAt', e.target.value)}
              dir="ltr" style={{ textAlign: 'right' }}
            />
          </div>
        </div>

        {willOverpay && (
          <div className="sub">
            הסכום גדול מהיתרה הפתוחה. התשלום יירשם במלואו, החיוב יסומן כשולם והיתרה תוצג כאפס.
          </div>
        )}

        {/* THE CORRECTION PATH. Without it a mistyped amount or date is
            permanent through the UI and permanently distorts actual revenue —
            cancelling the charge deliberately keeps its payments, so that is not
            a way back either. Deleting a payment is the only correction: a
            payment is immutable by design, so a wrong one is removed and
            re-recorded rather than edited in place. */}
        {ownPayments.length > 0 && (
          <div>
            <div className="panel-title" style={{ fontSize: '0.95rem', marginBottom: 6 }}>תשלומים שנרשמו</div>
            <div className="table-wrap">
              <table className="tbl">
                <tbody>
                  {ownPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="muted">{p.paidAt || '—'}</td>
                      <td className="tnum">{formatCurrency(p.amount)}</td>
                      <td style={{ textAlign: 'end' }}>
                        {onDelete && (
                          <button
                            className="icon-action del"
                            onClick={() => onDelete(p)}
                            disabled={saving}
                            aria-label="מחיקת תשלום"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sub" style={{ marginTop: 6 }}>
              תשלום שנרשם בטעות נמחק ונרשם מחדש — אין עריכה של תשלום קיים.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
