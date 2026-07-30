import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { StaggerGroup, Reveal, ScrollReveal } from '../components/ui/motion.jsx';
import CountUp from '../components/ui/CountUp.jsx';
import Icon from '../components/ui/Icon.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import TransactionModal from '../components/forms/TransactionModal.jsx';
import ChargeModal from '../components/forms/ChargeModal.jsx';
import PaymentModal from '../components/forms/PaymentModal.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { RevenueExpenseChart, MonthlyBarChart } from '../components/charts/charts.jsx';
import { financeTotals, monthlySeries, monthTotals } from '../lib/calc.js';
import { formatCurrency, formatDate } from '../lib/format.js';
import { saveLabel } from '../lib/saveLabel.js';
import {
  receivablesTotals, actualRevenue, decorateCharge, sortChargesByDueDate,
  isChargeOpen, chargeReceived,
  CHARGE_KIND_LABELS, PAYMENT_TERMS_LABELS,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_CLASS, DUE_DATE_SOURCE_LABELS,
} from '../lib/receivables.js';

function StatCard({ label, value, icon, tone }) {
  const color = tone === 'income' ? 'var(--lime-deep)' : tone === 'expense' ? '#ef7a7a' : tone === 'net' ? 'var(--text)' : 'var(--text)';
  return (
    <Reveal>
      <motion.div className="card kpi" whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
        <div className="kpi-top">
          <span className="kpi-label">{label}</span>
          <span className="kpi-ico" style={tone === 'income' ? { background: 'var(--lime)', color: 'var(--on-lime)', borderColor: 'transparent' } : undefined}>
            <Icon name={icon} size={18} />
          </span>
        </div>
        <div className="kpi-value tnum" style={{ color }}>
          <CountUp value={value} format={(n) => formatCurrency(n)} />
        </div>
      </motion.div>
    </Reveal>
  );
}

// ===================================================================
// F1 Core Receivables on the Finance screen.
//
// TWO DIFFERENT FACTS, KEPT APART ON PURPOSE:
//   the existing KPI strip and charts describe TRANSACTIONS — the ledger of
//   income and expenses, unchanged by this slice;
//   the receivables block below describes CHARGES and PAYMENTS — what is still
//   owed, and what actually arrived.
// The existing KPIs are deliberately NOT rewritten to fold payments in: they
// have a defined meaning that other parts of the product and the owner already
// read. Instead the receivables block states the combined figure explicitly
// (actualRevenue) and shows both of its parts, so the relationship between the
// two areas is visible rather than implied.
//
// THE SYSTEM never records one receipt twice: a payment writes one `payments`
// row and never an income `transaction` (store.jsx / api.js). It cannot stop a
// PERSON entering the same receipt on both paths — nothing links a transaction
// to a charge — so the two parts are shown SEPARATELY and the screen says which
// path charge money belongs on. See actualRevenue() in receivables.js and L6.
//
// CLOUD-ONLY: receivables have no local reducer, no seed and no localStorage
// fallback. In local/demo mode the block renders a truthful unavailable state
// instead of a form that would appear to save and would not.
// ===================================================================

function ReceivablesUnavailable() {
  return (
    <ScrollReveal className="b-span-12" style={{ marginTop: 16 }}>
      <div className="card panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">חיובים ותשלומים</div>
            <div className="sub">מעקב אחרי כסף שאמור להיכנס מול כסף שנכנס בפועל</div>
          </div>
        </div>
        <EmptyState
          icon="lock"
          title="זמין רק בחשבון בענן"
          hint="חיובים ותשלומים נשמרים בענן בלבד ומשויכים לחשבון. במצב ההדגמה המקומי אין להם אחסון עמיד, ולכן האזור אינו פעיל כאן — כדי לא להציג טופס ששומר לכאורה ולא שומר בפועל."
        />
      </div>
    </ScrollReveal>
  );
}

export default function Finance() {
  const { data, dispatch, toast, mode } = useStore();
  const [editing, setEditing] = useState(null); // 'new' | tx
  const [toDelete, setToDelete] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  // F1 receivables UI state.
  const [chargeEditing, setChargeEditing] = useState(null); // 'new' | charge
  const [payingCharge, setPayingCharge] = useState(null);
  const [toCancel, setToCancel] = useState(null);
  const [toDeletePayment, setToDeletePayment] = useState(null);
  const chargeSavingRef = useRef(false);
  const [chargeSaving, setChargeSaving] = useState(false);
  const paymentSavingRef = useRef(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  // In-flight save guard. The ref is the SYNCHRONOUS latch (two click events can
  // run in the same tick, before any rerender — state alone cannot block that);
  // `saving` is the visible pending state that disables the modal submit.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => financeTotals(data.transactions), [data.transactions]);
  const series = useMemo(() => monthlySeries(data.transactions, 12), [data.transactions]);
  const thisMonth = useMemo(() => monthTotals(data.transactions), [data.transactions]);

  const completedCount = data.clients.filter((c) => c.status === 'completed' || c.status === 'completed_paid' || c.status === 'active').length;
  const avgPerProject = completedCount ? totals.income / completedCount : 0;

  const rows = useMemo(() => {
    const arr = typeFilter === 'all' ? data.transactions : data.transactions.filter((t) => t.type === typeFilter);
    return [...arr].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [data.transactions, typeFilter]);

  // ---- receivables (F1) ----
  const cloud = mode === 'supabase';
  const charges = data.charges || [];
  const payments = data.payments || [];
  // Open charges only. A cancelled charge is not a claim, so it appears in no
  // total and not in THIS list — its payments stay recorded and stay visible
  // through actual revenue, because the money did arrive. (A cancelled charge
  // that still holds payments gets its own reachable row below.)
  const openCharges = useMemo(
    () => sortChargesByDueDate(charges.filter(isChargeOpen)).map((c) => decorateCharge(c, payments)),
    [charges, payments],
  );
  // A cancelled charge leaves the KPIs and the open list — but its payments are
  // still counted in actual revenue, so if it holds any, it must stay REACHABLE:
  // PaymentModal is the only correction surface, and a charge nothing can open
  // is a mistyped payment nobody can fix.
  const cancelledWithPayments = useMemo(
    () => sortChargesByDueDate(charges.filter((c) => !isChargeOpen(c)))
      .map((c) => decorateCharge(c, payments))
      .filter((c) => c.received > 0),
    [charges, payments],
  );
  const recTotals = useMemo(() => receivablesTotals(charges, payments), [charges, payments]);
  const revenue = useMemo(() => actualRevenue(payments, data.transactions), [payments, data.transactions]);
  const clientName = (id) => data.clients.find((c) => c.id === id)?.name || '—';

  // Same confirmed-write contract as the transaction `save` above: await the
  // store's settled { ok }, show success ONLY on ok:true, and hold the modal
  // open with the submitted values on failure. The ref is the SYNCHRONOUS latch
  // (two clicks can land in one tick, before any rerender) so exactly one write
  // is dispatched per submit — a duplicate charge is a duplicate invoice.
  const saveCharge = async (charge) => {
    if (chargeSavingRef.current) return;
    chargeSavingRef.current = true;
    setChargeSaving(true);
    try {
      const res = await dispatch(charge.id
        ? { type: 'UPDATE_CHARGE', payload: charge }
        : { type: 'ADD_CHARGE', payload: charge });
      if (res?.ok === false) return;
      toast(charge.id ? `החיוב עודכן · ${saveLabel(mode)}` : `החיוב נוצר · ${saveLabel(mode)}`);
      setChargeEditing(null);
    } finally {
      chargeSavingRef.current = false;
      setChargeSaving(false);
    }
  };

  // Recording a payment dispatches ADD_PAYMENT and NOTHING ELSE. There is no
  // ADD_TX beside it, on purpose: payments are the source of truth for received
  // revenue, and a parallel income transaction would count the same shekel twice.
  const savePayment = async (payment) => {
    if (paymentSavingRef.current) return;
    paymentSavingRef.current = true;
    setPaymentSaving(true);
    try {
      const res = await dispatch({ type: 'ADD_PAYMENT', payload: payment });
      if (res?.ok === false) return;
      toast(`התשלום נרשם · ${saveLabel(mode)}`);
      setPayingCharge(null);
    } finally {
      paymentSavingRef.current = false;
      setPaymentSaving(false);
    }
  };

  // The correction path for a mistyped payment. A payment is immutable by
  // design, so a wrong one is DELETED and re-recorded — without this the error
  // is permanent through the UI and permanently distorts actual revenue
  // (cancelling the charge deliberately keeps its payments).
  // Routed through a confirmation, like every other destructive control on this
  // page. Deleting a payment removes a durable record of real money and moves
  // every aggregate, so a stray click must not be enough.
  const deletePayment = async () => {
    const payment = toDeletePayment;
    setToDeletePayment(null);
    if (!payment) return;
    const res = await dispatch({ type: 'DELETE_PAYMENT', id: payment.id });
    if (res?.ok !== false) toast('התשלום נמחק');
  };

  const cancelCharge = async () => {
    if (!toCancel) return;
    const res = await dispatch({ type: 'CANCEL_CHARGE', id: toCancel.id });
    if (res?.ok !== false) toast('החיוב בוטל');
    setToCancel(null);
  };

  // Await the store's settled { ok } result — show success and close the modal
  // ONLY on ok:true (same contract as Clients.save, S0B). On failure the store
  // shows its error toast and restores authoritative cloud state; we keep the
  // modal open with the submitted values for correction, no success toast.
  // The savingRef latch guarantees EXACTLY ONE dispatch per in-flight save —
  // a second submit while the write is pending returns immediately (no second
  // row, no duplicate transaction). Both latch and visible state release in
  // finally, so after a failure the user can correct and resubmit.
  const save = async (tx) => {
    if (savingRef.current) return; // already in flight — block same-tick re-entry
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await dispatch(tx.id
        ? { type: 'UPDATE_TX', payload: tx }
        : { type: 'ADD_TX', payload: tx });
      if (res?.ok === false) return;
      toast(tx.id ? `התנועה עודכנה · ${saveLabel(mode)}` : `תנועה נוספה · ${saveLabel(mode)}`);
      setEditing(null);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const remove = () => {
    if (!toDelete) return;
    dispatch({ type: 'DELETE_TX', id: toDelete.id });
    toast('התנועה נמחקה', 'error');
    setToDelete(null);
  };

  return (
    <div>
      <SectionHeader
        title="פיננסים"
        sub="הכנסות, הוצאות ורווחיות"
        action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> תנועה חדשה</button>}
      />

      <StaggerGroup className="stat-strip">
        <StatCard label="סך הכנסות" value={totals.income} icon="trendUp" tone="income" />
        <StatCard label="סך הוצאות" value={totals.expense} icon="trendDown" tone="expense" />
        <StatCard label="רווח נקי" value={totals.net} icon="target" tone="net" />
        <StatCard label="ממוצע לפרויקט" value={avgPerProject} icon="briefcase" tone="avg" />
      </StaggerGroup>

      <div className="bento">
        <ScrollReveal className="b-span-7">
          <div className="card panel" style={{ height: '100%' }}>
            <div className="panel-head">
              <div>
                <div className="panel-title">תזרים שנתי</div>
                <div className="sub">הכנסות מול הוצאות · 12 חודשים</div>
              </div>
              <div className="legend">
                <span className="legend-item"><span className="legend-dot" style={{ background: '#d4ff3f' }} />הכנסות</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#c7bfff' }} />הוצאות</span>
              </div>
            </div>
            <RevenueExpenseChart data={series} height={250} />
          </div>
        </ScrollReveal>

        <ScrollReveal className="b-span-5" delay={0.05}>
          <div className="card panel" style={{ height: '100%' }}>
            <div className="panel-head">
              <div>
                <div className="panel-title">רווח נקי חודשי</div>
                <div className="sub">החודש הנוכחי מודגש</div>
              </div>
              <span className="tnum" style={{ fontWeight: 800, fontSize: '1.2rem', color: thisMonth.net >= 0 ? 'var(--lime-deep)' : '#ef7a7a' }}>
                {formatCurrency(thisMonth.net)}
              </span>
            </div>
            <MonthlyBarChart data={series} height={250} />
          </div>
        </ScrollReveal>
      </div>

      {/* Transactions table */}
      <ScrollReveal className="b-span-12" style={{ marginTop: 16 }}>
        <div className="card panel">
          <div className="panel-head">
            <div className="panel-title">תנועות אחרונות</div>
            <div className="seg">
              {[{ k: 'all', l: 'הכל' }, { k: 'income', l: 'הכנסות' }, { k: 'expense', l: 'הוצאות' }].map((t) => (
                <button key={t.k} className={typeFilter === t.k ? 'on' : ''} onClick={() => setTypeFilter(t.k)}>{t.l}</button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon="wallet" title="אין תנועות" hint="הוסף הכנסה או הוצאה ראשונה" action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> תנועה חדשה</button>} />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>תיאור</th>
                    <th>קטגוריה</th>
                    <th>תאריך</th>
                    <th>סכום</th>
                    <th style={{ textAlign: 'end' }}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 40).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="row gap-3">
                          <span className="activity-ico" style={{ width: 34, height: 34 }}>
                            <Icon name={t.type === 'income' ? 'trendUp' : 'trendDown'} size={16} style={{ color: t.type === 'income' ? 'var(--lime-deep)' : '#ef7a7a' }} />
                          </span>
                          <span style={{ fontWeight: 500 }}>{t.description || (t.type === 'income' ? 'הכנסה' : 'הוצאה')}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-neutral">{t.category}</span></td>
                      <td className="muted">{formatDate(t.date)}</td>
                      <td className="tnum" style={{ fontWeight: 700, color: t.type === 'income' ? 'var(--lime-deep)' : '#ef7a7a' }}>
                        {t.type === 'income' ? '+' : '−'}{formatCurrency(t.amount)}
                      </td>
                      <td>
                        <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                          <button className="icon-action" onClick={() => setEditing(t)} aria-label="עריכה"><Icon name="edit" size={15} /></button>
                          <button className="icon-action del" onClick={() => setToDelete(t)} aria-label="מחיקה"><Icon name="trash" size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ScrollReveal>

      {/* ---- F1 Core Receivables ---- */}
      {!cloud ? <ReceivablesUnavailable /> : (
        <>
          <StaggerGroup className="stat-strip" style={{ marginTop: 16 }}>
            <StatCard label="צפוי לחיוב" value={recTotals.expected} icon="target" tone="avg" />
            <StatCard label="התקבל בפועל" value={recTotals.received} icon="trendUp" tone="income" />
            <StatCard label="יתרה פתוחה" value={recTotals.open} icon="wallet" tone="expense" />
          </StaggerGroup>

          <ScrollReveal className="b-span-12" style={{ marginTop: 16 }}>
            <div className="card panel">
              <div className="panel-head">
                <div>
                  <div className="panel-title">חיובים פתוחים</div>
                  {/* The two parts are named explicitly, so "actual revenue" is
                      never a number the user has to take on trust. */}
                  <div className="sub">
                    {`הכנסה בפועל: ${formatCurrency(revenue.total)} — מתוכה ${formatCurrency(revenue.fromPayments)} תשלומים על חיובים ו-${formatCurrency(revenue.fromTransactions)} הכנסות שנרשמו ישירות`}
                  </div>
                  {/* The one thing the system cannot prevent for the user: the
                      same receipt entered on both paths. Said plainly, next to
                      the number it would distort. */}
                  <div className="sub">
                    כסף שהתקבל עבור חיוב נרשם כאן בלבד, דרך ״רישום תשלום״. רישום של אותו כסף גם כתנועת הכנסה יופיע פעמיים בהכנסה בפועל.
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => setChargeEditing('new')}>
                  <Icon name="plus" size={18} /> חיוב חדש
                </button>
              </div>

              {recTotals.overpaid > 0 && (
                <div className="sub" style={{ marginBottom: 8 }}>
                  {`נרשמו תשלומים בסך ${formatCurrency(recTotals.overpaid)} מעבר לסכום החיוב. היתרה הפתוחה אינה יורדת מתחת לאפס.`}
                </div>
              )}

              {openCharges.length === 0 ? (
                <EmptyState
                  icon="wallet"
                  title="אין חיובים פתוחים"
                  hint="חיוב הוא כסף שאמור להיגבות. תשלום הוא כסף שהתקבל בפועל עבורו."
                  action={<button className="btn btn-primary" onClick={() => setChargeEditing('new')}><Icon name="plus" size={18} /> חיוב חדש</button>}
                />
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>לקוח</th>
                        <th>סוג</th>
                        <th>תנאי תשלום</th>
                        <th>פירעון</th>
                        <th>סכום</th>
                        <th>התקבל</th>
                        <th>יתרה</th>
                        <th>מצב</th>
                        <th style={{ textAlign: 'end' }}>פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openCharges.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500 }}>{clientName(c.clientId)}</td>
                          <td><span className="badge badge-neutral">{CHARGE_KIND_LABELS[c.kind]}</span></td>
                          <td className="muted">{PAYMENT_TERMS_LABELS[c.paymentTerms]}</td>
                          <td className="muted">
                            {formatDate(c.dueDate)}
                            {/* Says which one it is, every row — a computed date
                                and a hand-typed one are not the same fact. */}
                            <div className="sub">{DUE_DATE_SOURCE_LABELS[c.dueDateSource]}</div>
                          </td>
                          <td className="tnum">{formatCurrency(c.amountTotal)}</td>
                          <td className="tnum">{formatCurrency(c.received)}</td>
                          <td className="tnum" style={{ fontWeight: 700 }}>{formatCurrency(c.balance)}</td>
                          <td><span className={`badge ${PAYMENT_STATUS_CLASS[c.paymentStatus]}`}>{PAYMENT_STATUS_LABELS[c.paymentStatus]}</span></td>
                          <td>
                            <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                              {c.invoiceUrl && (
                                <a className="icon-action" href={c.invoiceUrl} target="_blank" rel="noopener noreferrer" aria-label="חשבונית">
                                  <Icon name="link" size={15} />
                                </a>
                              )}
                              <button className="btn btn-ghost" onClick={() => setPayingCharge(c)}>רישום תשלום</button>
                              <button className="icon-action" onClick={() => setChargeEditing(c)} aria-label="עריכה"><Icon name="edit" size={15} /></button>
                              <button className="icon-action del" onClick={() => setToCancel(c)} aria-label="ביטול חיוב"><Icon name="x" size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Cancelled charges that still hold payments. They are out of
                  every KPI, but their money is still in actual revenue — so a
                  mistyped payment on one must remain correctable. Without this
                  row, cancelling a charge would hide the only surface that can
                  delete its payments. */}
              {cancelledWithPayments.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="panel-title" style={{ fontSize: '0.95rem' }}>חיובים שבוטלו עם תשלומים שנרשמו</div>
                  <div className="sub" style={{ marginBottom: 8 }}>
                    החיובים האלה אינם נספרים בצפוי, בהתקבל או ביתרה — אבל הכסף שהתקבל עליהם נשאר בהכנסה בפועל. אפשר לפתוח אותם כדי לתקן תשלום שנרשם בטעות.
                  </div>
                  <div className="table-wrap">
                    <table className="tbl">
                      <tbody>
                        {cancelledWithPayments.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 500 }}>{clientName(c.clientId)}</td>
                            <td><span className="badge badge-lost">בוטל</span></td>
                            <td className="tnum">{formatCurrency(c.received)}</td>
                            <td style={{ textAlign: 'end' }}>
                              <button className="btn btn-ghost" onClick={() => setPayingCharge(c)}>תשלומים</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </ScrollReveal>
        </>
      )}

      <TransactionModal open={!!editing} onClose={() => setEditing(null)} onSave={save} initial={editing && editing !== 'new' ? editing : null} saving={saving} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} message={`למחוק את התנועה על סך ${formatCurrency(toDelete?.amount || 0)}?`} />

      {cloud && (
        <>
          <ChargeModal
            open={!!chargeEditing}
            onClose={() => setChargeEditing(null)}
            onSave={saveCharge}
            initial={chargeEditing && chargeEditing !== 'new' ? chargeEditing : null}
            clients={data.clients}
            quotes={data.quotes}
            saving={chargeSaving}
          />
          <PaymentModal
            open={!!payingCharge}
            onClose={() => setPayingCharge(null)}
            onSave={savePayment}
            onDelete={setToDeletePayment}
            charge={payingCharge}
            received={payingCharge ? chargeReceived(payingCharge.id, payments) : 0}
            payments={payments}
            saving={paymentSaving}
          />
          <ConfirmDialog
            open={!!toDeletePayment}
            onClose={() => setToDeletePayment(null)}
            onConfirm={deletePayment}
            message={`למחוק את התשלום על סך ${formatCurrency(toDeletePayment?.amount || 0)}? הסכום ירד מההכנסה בפועל ומהיתרה של החיוב.`}
          />
          <ConfirmDialog
            open={!!toCancel}
            onClose={() => setToCancel(null)}
            onConfirm={cancelCharge}
            message={`לבטל את החיוב על סך ${formatCurrency(toCancel?.amountTotal || 0)}? התשלומים שכבר נרשמו יישארו רשומים.`}
          />
        </>
      )}
    </div>
  );
}
