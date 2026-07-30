import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reducer } from '../../store/store.jsx';
import { saveLabel } from '../../lib/saveLabel.js';
import {
  receivablesTotals, actualRevenue, decorateCharge, chargeReceived,
} from '../../lib/receivables.js';

// ===================================================================
// F1 Core Receivables — the Finance screen.
//
// House pattern (no jsdom in this repo): the pages pull in store/router/motion
// and are not cleanly renderable under Vitest — so, like
// quoteFinanceSaveTruthfulness.test.js, we extract the ACTUAL shipped handlers
// from the source and EXECUTE them with injected deps (behavioural proof), run
// the REAL store reducer for the state transitions, and source-pin the JSX
// wiring that cannot be executed.
//
// The three claims this file exists to defend:
//   1. money is never shown as saved before the server confirms it;
//   2. recording a payment creates NO transaction — no shekel is counted twice;
//   3. in local/demo mode the whole area is truthfully unavailable rather than a
//      form that appears to save and does not.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const finance = read('../Finance.jsx');
const store = read('../../store/store.jsx');
const api = read('../../lib/api.js');
const chargeModal = read('../../components/forms/ChargeModal.jsx');
const paymentModal = read('../../components/forms/PaymentModal.jsx');

// ---- behavioural harness: run the real shipped handlers with injected deps ---
const extractHandler = (src, name, argName) => {
  const m = src.match(new RegExp(`const ${name} = async \\(${argName}\\) => \\{[\\s\\S]*?\\n  \\};`));
  if (!m) throw new Error(`handler not found: ${name}(${argName})`);
  return m[0];
};

function makeSaveCharge(deps) {
  // eslint-disable-next-line no-new-func
  const f = new Function(
    'chargeSavingRef', 'setChargeSaving', 'dispatch', 'toast', 'saveLabel', 'mode', 'setChargeEditing',
    `${extractHandler(finance, 'saveCharge', 'charge')}\nreturn saveCharge;`,
  );
  return f(deps.savingRef, deps.setSaving, deps.dispatch, deps.toast, saveLabel, deps.mode, deps.setEditing);
}

function makeSavePayment(deps) {
  // eslint-disable-next-line no-new-func
  const f = new Function(
    'paymentSavingRef', 'setPaymentSaving', 'dispatch', 'toast', 'saveLabel', 'mode', 'setPayingCharge',
    `${extractHandler(finance, 'savePayment', 'payment')}\nreturn savePayment;`,
  );
  return f(deps.savingRef, deps.setSaving, deps.dispatch, deps.toast, saveLabel, deps.mode, deps.setEditing);
}

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

function makeDeps(dispatchImpl, mode = 'supabase') {
  const calls = { dispatched: [], toasts: [], closed: 0, savingStates: [] };
  return {
    calls,
    savingRef: { current: false },
    setSaving: (v) => calls.savingStates.push(v),
    dispatch: (action) => { calls.dispatched.push(action); return dispatchImpl(action); },
    toast: (msg) => calls.toasts.push(msg),
    mode,
    setEditing: (v) => { if (v === null) calls.closed += 1; },
  };
}

// ---------------------------------------------------------------- handlers ---

describe('Finance.saveCharge · BEHAVIOURAL (real shipped handler)', () => {
  it('creating a charge dispatches ADD_CHARGE exactly once and closes on success', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: true }));
    await makeSaveCharge(deps)({ serviceDate: '2026-02-15', paymentTerms: 'net60', amountTotal: 1180 });
    expect(deps.calls.dispatched.map((a) => a.type)).toEqual(['ADD_CHARGE']);
    expect(deps.calls.closed).toBe(1);
    expect(deps.calls.toasts).toEqual([`החיוב נוצר · ${saveLabel('supabase')}`]);
  });

  it('an id on the payload means UPDATE_CHARGE, never a second ADD', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: true }));
    await makeSaveCharge(deps)({ id: 'ch1', serviceDate: '2026-02-15', amountTotal: 500 });
    expect(deps.calls.dispatched.map((a) => a.type)).toEqual(['UPDATE_CHARGE']);
  });

  it('rapid double submit in the SAME TICK dispatches EXACTLY ONCE — no duplicate invoice', async () => {
    const d = deferred();
    const deps = makeDeps(() => d.promise);
    const saveCharge = makeSaveCharge(deps);
    const p1 = saveCharge({ serviceDate: '2026-02-15', amountTotal: 1000 });
    const p2 = saveCharge({ serviceDate: '2026-02-15', amountTotal: 1000 });
    d.resolve({ ok: true });
    await Promise.all([p1, p2]);
    expect(deps.calls.dispatched).toHaveLength(1);
    expect(deps.calls.toasts).toHaveLength(1);
    expect(deps.savingRef.current).toBe(false); // latch released
  });

  it('FAILURE { ok:false }: no success toast, modal stays open, retry possible', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: false }));
    const saveCharge = makeSaveCharge(deps);
    await saveCharge({ serviceDate: '2026-02-15', amountTotal: 1000 });
    expect(deps.calls.toasts).toHaveLength(0);        // nothing claims a save
    expect(deps.calls.closed).toBe(0);                // submitted values kept
    expect(deps.calls.savingStates).toEqual([true, false]);
    await saveCharge({ serviceDate: '2026-02-15', amountTotal: 1000 });
    expect(deps.calls.dispatched).toHaveLength(2);    // latch released for retry
  });

  it('a REJECTED dispatch still releases the latch and claims no success', async () => {
    const deps = makeDeps(() => Promise.reject(new Error('boom')));
    await expect(makeSaveCharge(deps)({ serviceDate: '2026-02-15', amountTotal: 1 })).rejects.toThrow('boom');
    expect(deps.calls.toasts).toHaveLength(0);
    expect(deps.calls.closed).toBe(0);
    expect(deps.savingRef.current).toBe(false);
  });
});

describe('Finance.savePayment · BEHAVIOURAL (real shipped handler)', () => {
  it('recording a payment dispatches ADD_PAYMENT and NOTHING ELSE', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: true }));
    await makeSavePayment(deps)({ chargeId: 'ch1', amount: 400, paidAt: '2026-03-01' });
    // THE NO-DOUBLE-COUNT ASSERTION, at the handler level: exactly one action,
    // and it is not a transaction.
    expect(deps.calls.dispatched.map((a) => a.type)).toEqual(['ADD_PAYMENT']);
    expect(deps.calls.dispatched.some((a) => String(a.type).includes('_TX'))).toBe(false);
    expect(deps.calls.toasts).toEqual([`התשלום נרשם · ${saveLabel('supabase')}`]);
  });

  it('rapid double submit records ONE payment, not two', async () => {
    const d = deferred();
    const deps = makeDeps(() => d.promise);
    const savePayment = makeSavePayment(deps);
    const p1 = savePayment({ chargeId: 'ch1', amount: 400, paidAt: '2026-03-01' });
    const p2 = savePayment({ chargeId: 'ch1', amount: 400, paidAt: '2026-03-01' });
    d.resolve({ ok: true });
    await Promise.all([p1, p2]);
    expect(deps.calls.dispatched).toHaveLength(1);
  });

  it('FAILURE: the payment modal stays open and nothing claims the money arrived', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: false }));
    await makeSavePayment(deps)({ chargeId: 'ch1', amount: 400, paidAt: '2026-03-01' });
    expect(deps.calls.toasts).toHaveLength(0);
    expect(deps.calls.closed).toBe(0);
  });

  it('local mode still labels the source truthfully via the REAL saveLabel', async () => {
    const deps = makeDeps(() => Promise.resolve({ ok: true }), 'local');
    await makeSavePayment(deps)({ chargeId: 'ch1', amount: 1, paidAt: '2026-03-01' });
    expect(deps.calls.toasts[0]).toContain(saveLabel('local'));
  });
});

// ------------------------------------------------------- store transitions ---

describe('store reducer · the receivables state transitions (REAL reducer)', () => {
  const base = { charges: [], payments: [], transactions: [], activity: [] };

  it('ADD_CHARGE inserts the charge and creates NO transaction', () => {
    const s = reducer(base, { type: 'ADD_CHARGE', payload: { id: 'ch1', amountTotal: 1000, lifecycle: 'open' } });
    expect(s.charges).toHaveLength(1);
    expect(s.transactions).toHaveLength(0);
  });

  it('a PARTIAL payment moves the charge to partially_paid with a real balance', () => {
    let s = reducer(base, { type: 'ADD_CHARGE', payload: { id: 'ch1', amountTotal: 1000, lifecycle: 'open' } });
    s = reducer(s, { type: 'ADD_PAYMENT', payload: { id: 'p1', chargeId: 'ch1', amount: 400 } });
    const decorated = decorateCharge(s.charges[0], s.payments);
    expect(decorated.received).toBe(400);
    expect(decorated.balance).toBe(600);
    expect(decorated.paymentStatus).toBe('partially_paid');
    expect(s.transactions).toHaveLength(0);   // still no transaction
  });

  it('a FULL payment closes the balance and reads paid', () => {
    let s = reducer(base, { type: 'ADD_CHARGE', payload: { id: 'ch1', amountTotal: 1000, lifecycle: 'open' } });
    s = reducer(s, { type: 'ADD_PAYMENT', payload: { id: 'p1', chargeId: 'ch1', amount: 400 } });
    s = reducer(s, { type: 'ADD_PAYMENT', payload: { id: 'p2', chargeId: 'ch1', amount: 600 } });
    const decorated = decorateCharge(s.charges[0], s.payments);
    expect(decorated.received).toBe(1000);
    expect(decorated.balance).toBe(0);
    expect(decorated.paymentStatus).toBe('paid');
  });

  it('NO DUPLICATE TRANSACTION: not one receivables action ever touches transactions', () => {
    // The measured defect class this guards (S0A / syncClientIncome): a money
    // event that also synthesised an income transaction, so the same shekel
    // appeared twice. Every receivables case is exercised here, from a state
    // that already HAS a transaction, and the ledger must come out identical.
    const seed = { ...base, transactions: [{ id: 'tx1', type: 'income', amount: 300 }] };
    const actions = [
      { type: 'ADD_CHARGE', payload: { id: 'ch1', amountTotal: 1000, lifecycle: 'open' } },
      { type: 'ADD_PAYMENT', payload: { id: 'p1', chargeId: 'ch1', amount: 1000 } },
      { type: 'UPDATE_CHARGE', payload: { id: 'ch1', amountTotal: 1200 } },
      { type: 'CANCEL_CHARGE', id: 'ch1' },
      { type: 'DELETE_PAYMENT', id: 'p1' },
      { type: 'DELETE_CHARGE', id: 'ch1' },
    ];
    const out = actions.reduce((s, a) => reducer(s, a), seed);
    expect(out.transactions).toEqual(seed.transactions);
    expect(out.transactions).toHaveLength(1);
  });

  it('CANCEL_CHARGE flips lifecycle only — the payments stay recorded', () => {
    let s = reducer(base, { type: 'ADD_CHARGE', payload: { id: 'ch1', amountTotal: 1000, lifecycle: 'open' } });
    s = reducer(s, { type: 'ADD_PAYMENT', payload: { id: 'p1', chargeId: 'ch1', amount: 400 } });
    s = reducer(s, { type: 'CANCEL_CHARGE', id: 'ch1' });
    expect(s.charges[0].lifecycle).toBe('cancelled');
    expect(s.payments).toHaveLength(1);
    // A cancelled charge leaves the KPIs...
    expect(receivablesTotals(s.charges, s.payments)).toEqual({ expected: 0, received: 0, open: 0, overpaid: 0 });
    // ...but the money that arrived is still revenue.
    expect(actualRevenue(s.payments, s.transactions).total).toBe(400);
  });

  it('DELETE_CHARGE removes its payments too, mirroring the FK cascade', () => {
    let s = reducer(base, { type: 'ADD_CHARGE', payload: { id: 'ch1', amountTotal: 1000, lifecycle: 'open' } });
    s = reducer(s, { type: 'ADD_PAYMENT', payload: { id: 'p1', chargeId: 'ch1', amount: 400 } });
    s = reducer(s, { type: 'ADD_PAYMENT', payload: { id: 'p2', chargeId: 'other', amount: 50 } });
    s = reducer(s, { type: 'DELETE_CHARGE', id: 'ch1' });
    expect(s.charges).toHaveLength(0);
    expect(s.payments.map((p) => p.id)).toEqual(['p2']); // only the linked ones go
  });

  it('the KPI triple over a mixed set', () => {
    const charges = [
      { id: 'a', amountTotal: 1000, lifecycle: 'open' },
      { id: 'b', amountTotal: 500, lifecycle: 'open' },
      { id: 'c', amountTotal: 900, lifecycle: 'cancelled' },
    ];
    const payments = [{ chargeId: 'a', amount: 1000 }, { chargeId: 'b', amount: 200 }, { chargeId: 'c', amount: 900 }];
    expect(receivablesTotals(charges, payments)).toEqual({
      expected: 1500, received: 1200, open: 300, overpaid: 0,
    });
    expect(chargeReceived('b', payments)).toBe(200);
  });
});

// ------------------------------------------------- store / api source pins ---

describe('store · receivables are a CONFIRMED write, and cloud-only', () => {
  const branch = store.slice(
    store.indexOf('if (isReceivablesDispatch(act.type))'),
    store.indexOf('// S0D truthful write'),
  );

  it('the branch exists (positive control for the slice above)', () => {
    expect(branch.length).toBeGreaterThan(200);
  });

  it('persists BEFORE the reducer applies — no optimistic charge or payment', () => {
    expect(branch).toContain('persistReceivable(act, userId).then(');
    // setData runs inside the SUCCESS callback, never before the call.
    expect(branch.indexOf('persistReceivable')).toBeLessThan(branch.indexOf('setData('));
  });

  it('restores authoritative state before settling { ok: false }', () => {
    expect(branch).toMatch(/await refetch\(\);\s*return \{ ok: false, error: e \}/);
  });

  it('refuses receivables dispatches outright in local/demo mode', () => {
    expect(store).toContain("if (isReceivablesDispatch(action.type)) {");
    expect(store).toContain("return Promise.resolve({ ok: false, reason: 'cloud_only' });");
    // ...and the refusal comes BEFORE the local reducer would mutate anything.
    const local = store.slice(store.indexOf('if (!supabaseEnabled) {'), store.indexOf('// Beta false-success containment'));
    expect(local.indexOf('isReceivablesDispatch')).toBeLessThan(local.indexOf('setData((d) => reducer(d, action))'));
  });

  it('routes every receivables action, and only to receivables api calls', () => {
    // Bounded at the NEXT top-level function: persistReceivable is declared
    // above persist(), so slicing to `const StoreCtx` would swallow persist()'s
    // api.createTx cases and the "no transaction here" assertion below would be
    // testing the wrong function.
    const from = store.indexOf('function persistReceivable(');
    const router = store.slice(from, store.indexOf('\nfunction ', from + 1));
    for (const t of ['ADD_CHARGE', 'UPDATE_CHARGE', 'CANCEL_CHARGE', 'DELETE_CHARGE', 'ADD_PAYMENT', 'DELETE_PAYMENT']) {
      expect(router).toContain(`case '${t}':`);
    }
    expect(router).not.toMatch(/api\.(createTx|updateTx|deleteTx)/);
    // An unknown receivables type must reject, never silently resolve.
    expect(router).toContain('unrouted receivables dispatch');
  });

  it('does NOT go through persist() — that router is kept in lockstep with betaCapabilities', () => {
    const persistBody = store.slice(store.indexOf('function persist('), store.indexOf('const StoreCtx'));
    const persistOnly = persistBody.slice(0, persistBody.indexOf('function persistReceivable('));
    for (const t of ['ADD_CHARGE', 'ADD_PAYMENT']) {
      expect(persistOnly).not.toContain(`case '${t}':`);
    }
  });

  it('the receivables reducer cases never touch state.transactions', () => {
    const cases = store.slice(store.indexOf("case 'ADD_CHARGE':"), store.indexOf("// ---- communication ----"));
    expect(cases.length).toBeGreaterThan(200);
    expect(cases).not.toContain('transactions:');
    expect(cases).not.toContain('syncClientIncome');
  });

  it('hydration reads both tables into the store shape', () => {
    expect(store).toMatch(/charges: \[\], payments: \[\]/);
    expect(api).toContain("supabase.from('charges').select('*')");
    expect(api).toContain("supabase.from('payments').select('*')");
    expect(api).toContain('charges: (chargesRes.data || []).map(normalizeChargeRow).filter(Boolean)');
    expect(api).toContain('payments: (paymentsRes.data || []).map(normalizePaymentRow).filter(Boolean)');
  });
});

describe('api · a payment writes to payments and to nothing else', () => {
  const createPayment = api.slice(api.indexOf('export async function createPayment('), api.indexOf('/** Delete ONE payment'));

  it('the function body exists (positive control)', () => {
    expect(createPayment.length).toBeGreaterThan(150);
  });

  it('touches no other table — in particular not transactions', () => {
    const tables = [...createPayment.matchAll(/supabase\.from\('(\w+)'\)/g)].map((m) => m[1]);
    expect(tables).toEqual(['payments']);
  });

  it('validates at the boundary and returns the SERVER row, not a reconstruction', () => {
    expect(createPayment).toContain('validatePayment(input)');
    expect(createPayment).toContain('.select().single()');
    expect(createPayment).toContain('normalizePaymentRow(res.data)');
  });

  it('the charge write map has no payment-status key — there is no such column', () => {
    const map = api.slice(api.indexOf('const CHARGE_FIELDS = {'), api.indexOf('const PAYMENT_FIELDS'));
    expect(map).not.toMatch(/\bstatus\b/);
    expect(map).not.toContain('paymentStatus');
    expect(map).toContain("amountTotal: 'amount_total'");
  });

  it('cancelCharge writes ONLY the lifecycle', () => {
    const fn = api.slice(api.indexOf('export async function cancelCharge('), api.indexOf('export async function deleteCharge('));
    expect(fn).toContain("update({ lifecycle: 'cancelled' })");
    expect(fn).not.toContain('amount');
  });
});

// --------------------------------------------------------------- JSX pins ---

describe('Finance page · cloud/local truthfulness', () => {
  it('the receivables area renders only in cloud mode', () => {
    expect(finance).toContain("const cloud = mode === 'supabase';");
    expect(finance).toContain('{!cloud ? <ReceivablesUnavailable /> : (');
    // The modals — the only way to write — are mounted behind the same flag.
    expect(finance).toContain('{cloud && (');
  });

  it('the local state says what is true, and never "not yet in the beta"', () => {
    const block = finance.slice(finance.indexOf('function ReceivablesUnavailable'), finance.indexOf('export default function Finance'));
    expect(block).toContain('זמין רק בחשבון בענן');
    expect(block).toContain('כדי לא להציג טופס ששומר לכאורה ולא שומר בפועל');
    expect(block).not.toContain('עדיין לא בגרסת הבטא'); // receivables ARE in the beta
  });

  it('shows the three receivables KPIs and names both parts of actual revenue', () => {
    expect(finance).toContain('label="צפוי לחיוב"');
    expect(finance).toContain('label="התקבל בפועל"');
    expect(finance).toContain('label="יתרה פתוחה"');
    expect(finance).toContain('revenue.fromPayments');
    expect(finance).toContain('revenue.fromTransactions');
    expect(finance).toContain('actualRevenue(payments, data.transactions)');
  });

  it('the EXISTING transaction KPIs are untouched by this slice', () => {
    expect(finance).toContain('<StatCard label="סך הכנסות" value={totals.income}');
    expect(finance).toContain('<StatCard label="סך הוצאות" value={totals.expense}');
    expect(finance).toContain('<StatCard label="רווח נקי" value={totals.net}');
    expect(finance).toContain('financeTotals(data.transactions)');
  });

  it('lists OPEN charges only, with the derived status badge', () => {
    expect(finance).toContain('charges.filter(isChargeOpen)');
    expect(finance).toContain('PAYMENT_STATUS_LABELS[c.paymentStatus]');
    expect(finance).toContain('sortChargesByDueDate');
  });

  it('says on every row whether the due date was computed or typed', () => {
    expect(finance).toContain('DUE_DATE_SOURCE_LABELS[c.dueDateSource]');
  });

  it('offers create, record-payment, cancel and the invoice link', () => {
    expect(finance).toContain("setChargeEditing('new')");
    expect(finance).toContain('setPayingCharge(c)');
    expect(finance).toContain('setToCancel(c)');
    expect(finance).toContain('href={c.invoiceUrl}');
    expect(finance).toContain('rel="noopener noreferrer"'); // an external link the user supplied
  });

  it('the receivables handlers never dispatch a transaction action', () => {
    // Each handler is isolated by its OWN extractor rather than by a span of the
    // file: the transaction `save` handler lives between them, and a span-based
    // slice would be asserting on the wrong code (and would have "found" ADD_TX
    // in a handler that never mentions it).
    for (const [name, arg] of [['saveCharge', 'charge'], ['savePayment', 'payment']]) {
      const body = extractHandler(finance, name, arg);
      expect(body.length, `${name} not extracted`).toBeGreaterThan(200);
      expect(body, `${name} must not write a transaction`).not.toContain('_TX');
    }
    // ...and the transaction handler beside them is untouched by this slice.
    expect(extractHandler(finance, 'save', 'tx')).toContain('ADD_TX');
  });
});

describe('ChargeModal · no payment status, and an honest due date', () => {
  it('offers no payment-status control of any kind', () => {
    expect(chargeModal).not.toContain('PAYMENT_STATUS');
    expect(chargeModal).not.toMatch(/set\('status'/);
    expect(chargeModal).not.toMatch(/name="status"/);
  });

  it('computes the due date and stamps `computed` unless the user overrides', () => {
    expect(chargeModal).toContain('computeDueDate(form.serviceDate, form.paymentTerms)');
    // Not overriding sends NO dueDate, so the validator computes and stamps it.
    expect(chargeModal).toContain("dueDate: manualDue ? form.dueDate : ''");
  });

  it('says which one the field is showing, and stops recomputing once overridden', () => {
    expect(chargeModal).toContain('תאריך הפירעון הוזן ידנית ואינו מתעדכן לפי תנאי התשלום.');
    expect(chargeModal).toContain('תאריך הפירעון מחושב אוטומטית');
    expect(chargeModal).toContain('חזרה לחישוב אוטומטי');
    expect(chargeModal).toContain('disabled={!manualDue}');
  });

  it('validates through the SHARED validator the api boundary uses', () => {
    expect(chargeModal).toContain('validateCharge(payload)');
    expect(chargeModal).toContain("from '../../lib/receivables.js'");
  });

  it('bounds the invoice link at the shared limit rather than a copied number', () => {
    expect(chargeModal).toContain('maxLength={RECEIVABLES_LIMITS.invoiceUrl}');
    expect(chargeModal).not.toContain('maxLength={2048}');
  });

  it('states that the amount includes VAT', () => {
    expect(chargeModal).toContain('סכום כולל מע״מ');
  });
});

describe('PaymentModal · suggests the BALANCE, and is honest about overpayment', () => {
  it('prefills the open balance, never the charge total', () => {
    expect(paymentModal).toContain('balance > 0 ? String(balance) : \'\'');
    expect(paymentModal).toContain('openBalance(charge?.amountTotal, received)');
    expect(paymentModal).not.toContain('String(charge.amountTotal)');
  });

  it('leaves the payment date blank rather than assuming today (this module owns no clock)', () => {
    expect(paymentModal).toContain('paidAt: \'\'');
    expect(paymentModal).not.toContain('new Date()');
  });

  it('warns before an overpayment instead of refusing it', () => {
    expect(paymentModal).toContain('willOverpay');
    expect(paymentModal).toContain('היתרה תוצג כאפס');
  });

  it('shows the derived status and validates through the shared validator', () => {
    expect(paymentModal).toContain('chargePaymentStatus(charge?.amountTotal, received)');
    expect(paymentModal).toContain('validatePayment(payload)');
  });
});
