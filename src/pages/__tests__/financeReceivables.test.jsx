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

  it('DELETE_CLIENT nulls the charge links the DATABASE would null', () => {
    // Codex round 11, P2: charges_client_same_owner_fk is SET NULL (client_id)
    // and quotes cascade, so after the server delete the charge holds NULL for
    // both. Leaving the dead ids in local state means opening and saving that
    // charge resubmits a reference that no longer exists and fails the FK.
    let s = { ...base, clients: [{ id: 'cl1', name: 'X' }], quotes: [{ id: 'q1', clientId: 'cl1' }] };
    s = reducer(s, { type: 'ADD_CHARGE', payload: { id: 'ch1', clientId: 'cl1', quoteId: 'q1', amountTotal: 100, lifecycle: 'open' } });
    s = reducer(s, { type: 'DELETE_CLIENT', id: 'cl1' });
    expect(s.charges).toHaveLength(1);           // the charge SURVIVES (ledger rule)
    expect(s.charges[0].clientId).toBe(null);    // ...with the link cleared
    expect(s.charges[0].quoteId).toBe(null);     // ...including the cascaded quote
    expect(s.charges[0].amountTotal).toBe(100);  // ...and nothing else touched
  });

  it('DELETE_QUOTE nulls only the quote link', () => {
    let s = reducer({ ...base, quotes: [{ id: 'q1', clientId: 'cl1' }] },
      { type: 'ADD_CHARGE', payload: { id: 'ch1', clientId: 'cl1', quoteId: 'q1', amountTotal: 100, lifecycle: 'open' } });
    s = reducer(s, { type: 'DELETE_QUOTE', id: 'q1' });
    expect(s.charges[0].quoteId).toBe(null);
    expect(s.charges[0].clientId).toBe('cl1');   // the client link is untouched
  });

  it('an UNRELATED client or quote delete leaves charge links alone', () => {
    // Positive control for the two cases above: a filter that nulled everything
    // would pass them both.
    let s = { ...base, clients: [{ id: 'cl2', name: 'Y' }], quotes: [{ id: 'q2', clientId: 'cl2' }] };
    s = reducer(s, { type: 'ADD_CHARGE', payload: { id: 'ch1', clientId: 'cl1', quoteId: 'q1', amountTotal: 100, lifecycle: 'open' } });
    s = reducer(s, { type: 'DELETE_CLIENT', id: 'cl2' });
    s = reducer(s, { type: 'DELETE_QUOTE', id: 'q2' });
    expect(s.charges[0].clientId).toBe('cl1');
    expect(s.charges[0].quoteId).toBe('q1');
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
    // The persist call is now wrapped in trackWrite() so the reconcile scheduler
    // knows a write is in flight. The confirmed-write ORDER is what matters and
    // is unchanged: setData still runs inside the SUCCESS callback only.
    expect(branch).toContain('trackWrite(persistReceivable(act, userId)).then(');
    expect(branch.indexOf('persistReceivable')).toBeLessThan(branch.indexOf('setData('));
  });

  it('restores authoritative state before settling { ok: false }', () => {
    // S0B/F1 guarantee unchanged; the mechanism moved from a direct refetch to
    // the coalesced, quiesce-gated reconcile (stale-list race slice).
    expect(branch).toMatch(/await requestReconcile\(\);\s*return \{ ok: false, error: e \}/);
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

  it('bulkUpload imports charges and payments — a restore must not drop them', () => {
    // Codex round 2, P1: fetchAll returns charges/payments and the Settings
    // backup is a dump of the whole store, so an importer that skipped them
    // would silently lose every receivable while still reporting success.
    const bulk = api.slice(api.indexOf('export async function bulkUpload('), api.indexOf('// Pure mapping helpers exported'));
    expect(bulk.length).toBeGreaterThan(500);
    expect(bulk).toContain("supabase.from('charges').insert(chargeRows)");
    expect(bulk).toContain("supabase.from('payments').insert(paymentRows)");
    // Parents are REMAPPED, exactly like clients — a raw old id would dangle.
    expect(bulk).toContain('quoteIdMap[c.quoteId]');
    expect(bulk).toContain('clientIdMap[c.clientId]');
    expect(bulk).toContain('chargeIdMap[p.chargeId]');
    expect(bulk).toContain('quoteIdMap[q.id] = id');
    // Rows go through the SAME validators as a direct save.
    expect(bulk).toContain('validateCharge(');
    expect(bulk).toContain('validatePayment(');
    // A cancelled charge must not come back open — but it is restored to
    // cancelled only AFTER its payments are in. Codex round 5, P1: inserting it
    // cancelled first makes trg_payments_reject_cancelled reject the whole
    // payment batch, after clients/quotes/transactions/charges were already
    // committed in separate requests — a half-restored account. A cancelled
    // charge legitimately keeps the payments it received, so the restore order
    // is: charges open -> payments -> restore the cancelled lifecycle.
    expect(bulk).toContain("lifecycle: 'open',");
    // Codex round 14, P2: validateCharge() does NOT check the lifecycle — a
    // create always starts 'open', so it has none to choose. An import does, and
    // an unrecognised one (legacy 'archived', missing field) must not be
    // silently activated: that would inflate open receivables and allow new
    // payments against what may have been a cancelled record.
    expect(bulk).toContain('CHARGE_LIFECYCLES.includes(c.lifecycle)');
    expect(bulk).toMatch(/if \(!CHARGE_LIFECYCLES\.includes\(c\.lifecycle\)\) \{ chargesSkipped \+= 1; continue; \}/);
    expect(bulk).toContain("if (c.lifecycle === 'cancelled') cancelledChargeIds.push(id)");
    expect(bulk).toContain(".update({ lifecycle: 'cancelled' })");
    expect(bulk).toContain(".in('id', cancelledChargeIds)");
    // ORDER IS THE FIX: the lifecycle restore must come after the payment insert.
    expect(bulk.indexOf("from('payments').insert(paymentRows)"))
      .toBeLessThan(bulk.indexOf(".update({ lifecycle: 'cancelled' })"));
    // What could not be imported is COUNTED, not silently dropped.
    // Codex round 6, P2: a charge the CURRENT validator rejects is skipped, and
    // that strands its payments too — both losses are counted and returned, so a
    // restore cannot claim success while quietly losing receivables.
    expect(bulk).toContain('chargesSkipped += 1');
    expect(bulk).toContain('paymentsSkipped');
    expect(bulk).toContain('chargesSkipped, paymentsSkipped,');
    expect(bulk).toMatch(/charges: chargeRows\.length, payments: paymentRows\.length/);
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

  it('states, beside the number, the one duplicate the system cannot prevent', () => {
    // Codex P1: both entry paths exist and nothing links a transaction to a
    // charge, so the same receipt CAN be entered twice. The screen says so where
    // it matters rather than the code claiming an unearned guarantee.
    expect(finance).toContain('כסף שהתקבל עבור חיוב נרשם כאן בלבד, דרך ״רישום תשלום״');
    expect(finance).toContain('יופיע פעמיים בהכנסה בפועל');
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

  it('renders ONLY an http/https invoice link', () => {
    // Codex round 7, P2: the third layer, after the write boundary and the
    // column CHECK. A row written before charges_invoice_url_scheme existed must
    // not make this page emit a `javascript:` href.
    expect(finance).toContain('isSafeInvoiceUrl(c.invoiceUrl) && (');
    expect(finance).not.toContain('{c.invoiceUrl && (');
    expect(finance).toContain('isSafeInvoiceUrl');
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

  it('warns on an ALREADY PAID charge too — the balance-zero case', () => {
    // Codex round 2, P2: a `balance > 0` conjunct suppressed the warning exactly
    // when it mattered most. A paid charge has balance 0, the page still offers
    // "record payment", so every amount is an overpayment and none was flagged.
    expect(paymentModal).toContain('const willOverpay = Number(form.amount) > balance;');
    expect(paymentModal).not.toMatch(/willOverpay = [^;]*balance > 0/);
  });

  it('a payment delete goes through a CONFIRMATION, like every other destructive control', () => {
    // Codex round 3, P2: the trash control dispatched immediately, unlike
    // transaction deletion and charge cancellation on the same page — a stray
    // click permanently removed real received revenue and moved every aggregate.
    expect(paymentModal).toContain('onDelete(p)');
    expect(finance).toContain('onDelete={setToDeletePayment}');   // opens the dialog
    expect(finance).toContain('open={!!toDeletePayment}');
    expect(finance).toContain('onConfirm={deletePayment}');
    expect(finance).toContain('הסכום ירד מההכנסה בפועל');
    // The dispatch is reachable ONLY from the confirmed handler.
    const handler = finance.slice(finance.indexOf('const deletePayment = async'), finance.indexOf('const cancelCharge'));
    expect(handler).toContain("dispatch({ type: 'DELETE_PAYMENT', id: payment.id })");
    expect(handler).toContain('const payment = toDeletePayment;');
  });

  it('EVERY cancelled charge stays reachable — including one with no payments', () => {
    // Codex round 3, P2: the open-charge filter was the only way into
    // PaymentModal, so cancelling a charge hid the only surface that can delete
    // its payments — while those payments stayed in actual revenue.
    // Codex round 9, P2: the fix then filtered on `received > 0`, so an
    // accidentally cancelled UNPAID charge was invisible in both lists and
    // nothing could set it back to open. The list is now unfiltered.
    expect(finance).toContain('cancelledCharges');
    expect(finance).toContain('charges.filter((c) => !isChargeOpen(c))');
    expect(finance).not.toContain('.filter((c) => c.received > 0)');
    expect(finance).toContain('חיובים שבוטלו');
    expect(finance).toMatch(/cancelledCharges\.map\(\(c\) => \([\s\S]{0,900}reopenCharge\(c\)/);
  });

  it('a cancelled charge can be REACTIVATED — the lifecycle graph is symmetric', () => {
    // The database allows open <-> cancelled freely (declared limitation L3), so
    // a UI that can only cancel makes an accidental cancel permanent.
    expect(finance).toContain("dispatch({ type: 'REOPEN_CHARGE', id: charge.id })");
    expect(finance).toContain('החזרה לפעיל');
    expect(store).toContain("case 'REOPEN_CHARGE':");
    expect(store).toContain("'CANCEL_CHARGE', 'REOPEN_CHARGE'");
    expect(store).toContain('api.reopenCharge(action.id)');
    expect(api).toContain('export async function reopenCharge(');
    // ...and reopening writes ONLY the lifecycle, like cancelling.
    const fn = api.slice(api.indexOf('export async function reopenCharge('), api.indexOf('* Delete ONE charge.'));
    expect(fn).toContain("update({ lifecycle: 'open' })");
    expect(fn).not.toContain('amount');
  });

  it('...but no NEW payment can be recorded against a cancelled charge', () => {
    expect(paymentModal).toContain("const cancelled = charge?.lifecycle === 'cancelled';");
    expect(paymentModal).toContain('disabled={saving || cancelled}');
    expect(paymentModal).toContain('if (cancelled) return;'); // not just the button
    expect(paymentModal).toContain('החיוב בוטל, ולכן לא ניתן לרשום עליו תשלום חדש');
  });

  it('and the client guard is declared ADVISORY — the server is the authority', () => {
    // Codex round 4, P2: this prop is a snapshot from when the modal opened, so
    // another device cancelling the charge in between would walk straight past
    // it, as would any direct API caller. The rule lives in
    // trg_payments_reject_cancelled; the client only makes the refusal readable.
    expect(paymentModal).toContain('trg_payments_reject_cancelled');
    expect(paymentModal).toMatch(/ADVISORY/);
    expect(api).toContain('trg_payments_reject_cancelled');
    // createPayment deliberately does NOT pre-check the lifecycle client-side.
    const createPayment = api.slice(api.indexOf('export async function createPayment('), api.indexOf('/** Delete ONE payment'));
    expect(createPayment).not.toContain('cancelled');
  });

  it('offers a CORRECTION path — a mistyped payment can be removed', () => {
    // Codex round 2, P2: DELETE_PAYMENT existed in api/store with nothing in the
    // UI dispatching it, so a wrong amount permanently distorted actual revenue
    // (cancelling the charge deliberately keeps its payments).
    expect(paymentModal).toContain('ownPayments');
    expect(paymentModal).toContain('onDelete(p)');
    expect(paymentModal).toContain('תשלומים שנרשמו');
    expect(paymentModal).toContain('אין עריכה של תשלום קיים');
    // ...and the page really wires it to the durable dispatch (behind the
    // confirmation asserted above).
    expect(finance).toContain("dispatch({ type: 'DELETE_PAYMENT', id: payment.id })");
    expect(finance).toContain('payments={payments}');
  });

  it('shows the derived status and validates through the shared validator', () => {
    expect(paymentModal).toContain('chargePaymentStatus(charge?.amountTotal, received)');
    expect(paymentModal).toContain('validatePayment(payload)');
  });
});

// ===================================================================
// Codex round 21, P2 — the import result message.
//
// `api.bulkUpload` has counted `chargesSkipped` / `paymentsSkipped` since round 2
// (a charge the current validator rejects, and every payment stranded by one),
// and the Settings toast reported neither the receivables it DID import nor the
// rows it dropped — so a lossy restore rendered as an unqualified success. Same
// failure class as S0A: the screen must never claim more than actually landed.
//
// BEHAVIOURAL, not source-pinned: the SHIPPED builder is extracted from
// Settings.jsx and EXECUTED with real count objects (house pattern, above).
// ===================================================================

const settings = read('../Settings.jsx');

const importResultToast = (() => {
  const start = settings.indexOf('export function importResultToast(');
  if (start === -1) throw new Error('importResultToast not found in Settings.jsx');
  // The first line that is a bare `}` closes it. (`\r?\n` — the repo checks out
  // with CRLF on Windows and a `\n}` search finds nothing.)
  const m = settings.slice(start).match(/\r?\n\}\r?\n/);
  if (!m) throw new Error('importResultToast body not terminated');
  const text = settings.slice(start, start + m.index + m[0].length).replace('export function', 'function');
  // eslint-disable-next-line no-new-func
  return new Function(`${text}\nreturn importResultToast;`)();
})();

const FULL = {
  clients: 3, quotes: 2, transactions: 5, leads: 1, tasks: 4, businessProfile: 1,
  charges: 7, payments: 6, chargesSkipped: 0, paymentsSkipped: 0,
};

describe('Settings.importResultToast · BEHAVIOURAL (real shipped builder)', () => {
  it('POSITIVE CONTROL — the extractor really produced the shipped function', () => {
    expect(typeof importResultToast).toBe('function');
    expect(importResultToast(FULL).message.length).toBeGreaterThan(20);
  });

  it('names the imported charges and payments, like every other kind', () => {
    const { message, kind } = importResultToast(FULL);
    expect(message).toContain('7 חיובים');
    expect(message).toContain('6 תשלומים');
    // ...without losing anything it already reported.
    expect(message).toContain('3 לקוחות');
    expect(message).toContain('2 הצעות');
    expect(message).toContain('5 תנועות');
    expect(message).toContain('1 פניות');
    expect(kind).toBe('success');
  });

  it('a CLEAN import is still reported as a success', () => {
    // The whole point of the skipped counts is that they distinguish. A builder
    // that shouted on every import would carry no information at all.
    expect(importResultToast({ ...FULL, chargesSkipped: 0, paymentsSkipped: 0 }).kind).toBe('success');
    expect(importResultToast(FULL).message).not.toContain('דולגו');
  });

  it('THE DEFECT: skipped charges are stated, and success is NOT declared', () => {
    const { message, kind } = importResultToast({ ...FULL, charges: 5, chargesSkipped: 2 });
    expect(message).toContain('דולגו 2 חיובים');
    expect(message).toContain('· חלקי:');
    // 'error' is the only kind Toaster does not render with a success check.
    expect(kind).toBe('error');
    // ...and it still says what DID land, so the user knows the balance.
    expect(message).toContain('5 חיובים');
  });

  it('THE DEFECT: skipped payments alone are enough to withhold success', () => {
    const { message, kind } = importResultToast({ ...FULL, payments: 4, paymentsSkipped: 2 });
    expect(message).toContain('דולגו 0 חיובים ו-2 תשלומים');
    expect(kind).toBe('error');
  });

  it('both kinds skipped are reported separately, never summed away', () => {
    const { message, kind } = importResultToast({
      ...FULL, charges: 1, payments: 0, chargesSkipped: 6, paymentsSkipped: 6,
    });
    expect(message).toContain('דולגו 6 חיובים ו-6 תשלומים');
    expect(kind).toBe('error');
    // A single "12 skipped" total would hide which half was lost.
    expect(message).not.toContain('12');
  });

  it('a missing count is 0, never `undefined` in the user-facing text', () => {
    // bulkUpload always returns every field; a hostile/legacy object must still
    // produce a readable sentence rather than "יובאו undefined לקוחות".
    const { message, kind } = importResultToast({});
    expect(message).not.toContain('undefined');
    expect(message).toContain('0 חיובים');
    expect(message).toContain('0 תשלומים');
    expect(kind).toBe('success');
  });

  it('local/demo mode (counts === null) keeps its own message', () => {
    // There, the parsed file REPLACES the store wholesale — nothing is skipped
    // and there are no per-kind counts to report.
    for (const empty of [null, undefined]) {
      const { message, kind } = importResultToast(empty);
      expect(message).toBe('הנתונים יובאו בהצלחה');
      expect(kind).toBe('success');
    }
  });

  it('the LEAD is the only thing the two writers may differ on', () => {
    // Same counts, both writers: identical figures, identical kind, different
    // opening word — because the two are reached from different buttons and the
    // toast still has to say WHICH action ran.
    const imported = importResultToast(FULL);
    const uploaded = importResultToast(FULL, 'הועלו לענן:');
    expect(imported.message.startsWith('יובאו ')).toBe(true);
    expect(uploaded.message.startsWith('הועלו לענן: ')).toBe(true);
    expect(uploaded.kind).toBe(imported.kind);
    // Everything after the lead is byte-identical — one rule, not two.
    expect(uploaded.message.replace('הועלו לענן:', 'יובאו')).toBe(imported.message);
  });

  it('runMigrate reports skipped rows too — the SAME false-success defect', () => {
    // Codex round 21 follow-up: importData was fixed and runMigrate was not,
    // although both call api.bulkUpload. An unqualified "uploaded to cloud" over
    // a lossy upload is the identical failure, one button away.
    const { message, kind } = importResultToast(
      { ...FULL, charges: 4, payments: 2, chargesSkipped: 3, paymentsSkipped: 4 },
      'הועלו לענן:',
    );
    expect(message).toContain('הועלו לענן:');
    expect(message).toContain('4 חיובים');
    expect(message).toContain('2 תשלומים');
    expect(message).toContain('דולגו 3 חיובים ו-4 תשלומים');
    expect(kind).toBe('error');
  });

  it('a CLEAN cloud upload is still a plain success', () => {
    const { message, kind } = importResultToast(FULL, 'הועלו לענן:');
    expect(kind).toBe('success');
    expect(message).not.toContain('דולגו');
  });

  it('runMigrate really calls the shared builder, KIND included', () => {
    expect(settings).toContain("const result = importResultToast(counts, 'הועלו לענן:');");
    // BOTH call sites must pass the kind through. A single `toContain` here was
    // satisfied by importData's line and said nothing about runMigrate — a
    // measured negative control (dropping runMigrate's `result.kind`) passed
    // against it. Counting is what makes the assertion cover both writers.
    expect((settings.match(/toast\(result\.message, result\.kind\);/g) || []).length).toBe(2);
    expect(settings).not.toMatch(/toast\(result\.message\);/);
    // The old hand-rolled message — no charges, no payments, no skipped counts,
    // and unconditionally a success — is gone.
    expect(settings).not.toContain('toast(`הועלו לענן:');
    // ...and there is exactly ONE summary template in the file: two would be two
    // rules, free to drift, which is the whole reason this was shared.
    expect(settings.match(/לקוחות, \$\{counts\.quotes/g) || []).toHaveLength(1);
    // Both CALL SITES (`const result = ...`), one builder — the declaration
    // itself also matches `importResultToast(counts`, so it is excluded.
    expect((settings.match(/= importResultToast\(counts/g) || []).length).toBe(2);
    expect((settings.match(/export function importResultToast\(/g) || []).length).toBe(1);
  });

  it('the page really uses this builder, and passes the KIND through', () => {
    // A builder nothing calls would make every assertion above decorative.
    expect(settings).toContain('const result = importResultToast(counts);');
    expect(settings).toContain('toast(result.message, result.kind);');
    // The old unqualified message is gone.
    expect(settings).not.toContain("toast(counts ? `יובאו");
  });
});

// ===================================================================
// Finance Charge Safe Delete.
//
// THE RULE: deleting a charge must never destroy a payment.
//
// It is enforced in public.delete_charge_if_unpaid, not here. What this block
// defends is the CLIENT half: that the control is gated on the EXISTENCE of a
// payment row rather than on `received`, and that a server refusal is reported
// as a refusal. The gate is convenience; the tests say so where it matters.
// ===================================================================

// Build the shipped gating predicate out of Finance.jsx itself, with useMemo
// stubbed. Executing the real lines is the point — a re-implementation here
// could not catch the predicate being changed back to a sum.
function makeHasPaymentRow(payments) {
  const setSrc = finance.match(/const chargeIdsWithPayments = useMemo\([\s\S]*?\n  \);/);
  const predSrc = finance.match(/const hasPaymentRow = .*;/);
  if (!setSrc || !predSrc) throw new Error('gating predicate not found in Finance.jsx');
  // eslint-disable-next-line no-new-func
  return new Function('payments', 'useMemo', `${setSrc[0]}\n${predSrc[0]}\nreturn hasPaymentRow;`)(
    payments, (fn) => fn(),
  );
}

function makeDeleteChargeConfirmed(deps, charge) {
  const m = finance.match(/const deleteChargeConfirmed = async \(\) => \{[\s\S]*?\n  \};/);
  if (!m) throw new Error('deleteChargeConfirmed not found in Finance.jsx');
  // eslint-disable-next-line no-new-func
  return new Function('toDeleteCharge', 'setToDeleteCharge', 'dispatch', 'toast',
    `${m[0]}\nreturn deleteChargeConfirmed;`)(
    charge, deps.setToDeleteCharge, deps.dispatch, deps.toast,
  );
}

function deleteDeps(dispatchImpl) {
  const calls = { dispatched: [], toasts: [], cleared: 0 };
  return {
    calls,
    setToDeleteCharge: (v) => { if (v === null) calls.cleared += 1; },
    dispatch: (a) => { calls.dispatched.push(a); return dispatchImpl(a); },
    toast: (m) => calls.toasts.push(m),
  };
}

describe('Finance charge delete · the gate is ROW EXISTENCE, never a sum', () => {
  it('a charge with no payment row is deletable', () => {
    const has = makeHasPaymentRow([{ id: 'p1', chargeId: 'other', amount: 400 }]);
    expect(has({ id: 'ch1' })).toBe(false);
  });

  it('a charge with a payment row is NOT deletable', () => {
    const has = makeHasPaymentRow([{ id: 'p1', chargeId: 'ch1', amount: 400 }]);
    expect(has({ id: 'ch1' })).toBe(true);
  });

  it('THE DEFECT THIS GATE EXISTS FOR: received === 0 while a payment row EXISTS', () => {
    // `received` is a SUM over rows the client could parse. A row whose amount
    // is unusable contributes 0 — so a `received === 0` gate would offer delete
    // on a charge that still owns a payment row, and the FK CASCADE would take
    // it. Existence does not have that failure mode.
    const payments = [{ id: 'p1', chargeId: 'ch1', amount: 'junk' }];
    expect(chargeReceived('ch1', payments)).toBe(0);        // the sum says "empty"...
    expect(makeHasPaymentRow(payments)({ id: 'ch1' })).toBe(true); // ...existence says otherwise
  });

  it('an empty payments list gates nothing shut', () => {
    expect(makeHasPaymentRow([])({ id: 'ch1' })).toBe(false);
  });
});

describe('Finance.deleteChargeConfirmed · BEHAVIOURAL (real shipped handler)', () => {
  it('dispatches DELETE_CHARGE exactly once, with the id, and toasts on success', async () => {
    const deps = deleteDeps(() => Promise.resolve({ ok: true }));
    await makeDeleteChargeConfirmed(deps, { id: 'ch1', amountTotal: 1000 })();
    expect(deps.calls.dispatched).toEqual([{ type: 'DELETE_CHARGE', id: 'ch1' }]);
    expect(deps.calls.toasts).toEqual(['החיוב נמחק']);
    expect(deps.calls.cleared).toBe(1); // the dialog closes either way
  });

  it('a SERVER REFUSAL claims no success — the charge stays on screen', async () => {
    // The RPC refuses (23514 / P0002); the store returns { ok: false } and shows
    // its own error toast. This handler must add no success toast on top of it.
    const deps = deleteDeps(() => Promise.resolve({ ok: false }));
    await makeDeleteChargeConfirmed(deps, { id: 'ch1', amountTotal: 1000 })();
    expect(deps.calls.dispatched).toHaveLength(1);
    expect(deps.calls.toasts).toEqual([]);
  });

  it('no charge selected dispatches nothing at all', async () => {
    const deps = deleteDeps(() => Promise.resolve({ ok: true }));
    await makeDeleteChargeConfirmed(deps, null)();
    expect(deps.calls.dispatched).toEqual([]);
    expect(deps.calls.toasts).toEqual([]);
  });
});

describe('Finance charge delete · JSX pins', () => {
  it('BOTH tables gate the control on !hasPaymentRow(c) — open and cancelled', () => {
    expect((finance.match(/\{!hasPaymentRow\(c\) && \(/g) || []).length).toBe(2);
    expect((finance.match(/onClick=\{\(\) => setToDeleteCharge\(c\)\}/g) || []).length).toBe(2);
  });

  it('the gate is NOT written in terms of received / balance', () => {
    // A negative control for the whole slice: the sum-based gate is the defect.
    expect(finance).not.toMatch(/c\.received === 0 &&/);
    expect(finance).not.toMatch(/received === 0 \? .*setToDeleteCharge/);
    expect(finance).toContain('new Set(payments.map((p) => p.chargeId))');
  });

  it('the confirm dialog names the amount and states that no payments exist', () => {
    expect(finance).toContain('onConfirm={deleteChargeConfirmed}');
    expect(finance).toContain('open={!!toDeleteCharge}');
    expect(finance).toContain('לא רשומים עליו תשלומים');
    expect(finance).toContain('הפעולה אינה הפיכה');
  });

  it('the delete dialog is mounted INSIDE the cloud-only block — none of it exists in demo mode', () => {
    const cloudBlock = finance.slice(finance.indexOf('{cloud && ('));
    expect(cloudBlock).toContain('open={!!toDeleteCharge}');
    // ...and the tables that carry the buttons are inside the cloud branch too.
    const localBranch = finance.slice(
      finance.indexOf('{!cloud ? <ReceivablesUnavailable /> : ('),
      finance.indexOf('<TransactionModal'),
    );
    expect(localBranch).toContain('setToDeleteCharge');
    expect(finance.slice(finance.indexOf('function ReceivablesUnavailable'), finance.indexOf('export default function Finance')))
      .not.toContain('setToDeleteCharge');
  });

  it('the UI comments say the gate is convenience and the RPC is the enforcement', () => {
    expect(finance).toContain('public.delete_charge_if_unpaid');
    expect(finance).toMatch(/CONVENIENCE|convenience/);
  });
});

describe('api.deleteCharge · goes through the RPC and switches on SQLSTATE', () => {
  const fn = api.slice(api.indexOf('const CHARGE_DELETE_HAS_PAYMENTS'), api.indexOf('export async function createPayment('));
  // CODE ONLY. The doc comment above deleteCharge NAMES the unsafe call it
  // replaced, so a whole-text search would match the explanation instead of a
  // regression — the same trap securityDefinerGrants.test.js strips for.
  const stripJs = (src) => src
    .split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '\n');
  const fnCode = stripJs(fn);
  const apiCode = stripJs(api);

  it('calls the guarded RPC, never a direct table delete', () => {
    expect(fnCode).toContain("supabase.rpc('delete_charge_if_unpaid', { p_charge_id: chargeId })");
    // THE REGRESSION THIS PINS: the old body was a plain cascade-triggering
    // delete. If it ever comes back, payments start disappearing again.
    expect(fnCode).not.toContain("from('charges').delete()");
    expect(apiCode).not.toMatch(/from\('charges'\)\s*\.delete\(\)/);
  });

  it('classifies by error.code only — never by message text', () => {
    expect(fn).toContain("const CHARGE_DELETE_HAS_PAYMENTS = '23514'");
    expect(fn).toContain("const CHARGE_DELETE_NOT_FOUND = 'P0002'");
    expect(fn).toContain('error.code === CHARGE_DELETE_HAS_PAYMENTS');
    expect(fn).toContain('error.code === CHARGE_DELETE_NOT_FOUND');
    expect(fn).not.toMatch(/error\.message\.(includes|match|indexOf)/);
  });

  it('an UNRECOGNISED error is rethrown, not swallowed into a friendly lie', () => {
    // `\r?` because this repo's JS sources are CRLF.
    expect(fnCode).toMatch(/\n\s*throw error;\r?\n/);
  });

  it('both refusals carry a user-facing Hebrew message', () => {
    expect(fn).toContain('לחיוב הזה רשומים תשלומים');
    expect(fn).toContain('החיוב לא נמצא');
    expect((fn.match(/engineError\(/g) || []).length).toBe(2);
  });
});

describe('Gap 2 — cancelled-charge payments still count, now stated on screen', () => {
  it('the behaviour is UNCHANGED: actualRevenue still counts them', () => {
    const seed = { charges: [], payments: [], transactions: [], activity: [] };
    let s = reducer(seed, { type: 'ADD_CHARGE', payload: { id: 'ch1', amountTotal: 1000, lifecycle: 'open' } });
    s = reducer(s, { type: 'ADD_PAYMENT', payload: { id: 'p1', chargeId: 'ch1', amount: 400 } });
    s = reducer(s, { type: 'CANCEL_CHARGE', id: 'ch1' });
    expect(actualRevenue(s.payments, s.transactions).total).toBe(400);
    expect(receivablesTotals(s.charges, s.payments).received).toBe(0);
  });

  it('and the screen now says so beside the number', () => {
    expect(finance).toContain('הכנסה בפועל כוללת גם תשלומים שהתקבלו על חיובים שבוטלו');
  });
});
