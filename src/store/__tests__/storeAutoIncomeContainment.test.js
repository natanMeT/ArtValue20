import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reducer } from '../store.jsx';

// ===================================================================
// S0A final correction — manual client auto-income containment.
// syncClientIncome() synthesizes an income transaction whenever a client
// resolves to completed_paid with value>0. In cloud mode that transaction is
// Memory-Only (persist() writes just the client row), so the CLOUD dispatch now
// stamps `suppressAutoIncome: true` on ADD_CLIENT / UPDATE_CLIENT before the
// reducer runs. This suite executes the REAL reducer for both modes and pins
// the dispatch wiring + ClientModal copy at source level.
// ===================================================================

const base = () => ({
  clients: [], quotes: [], transactions: [], outreachLeads: [],
  projects: [], tasks: [], plinks: [], pfiles: [], comms: [], inventory: [], activity: [],
});
const paidClient = { id: 'c1', name: 'דני כהן', status: 'completed_paid', value: 3000, date: '2026-07-21' };

describe('cloud mode (suppressAutoIncome flag) — no phantom Finance transaction', () => {
  it('ADD_CLIENT completed_paid+value: client added, activity logged, NO auto transaction', () => {
    const s = reducer(base(), { type: 'ADD_CLIENT', payload: paidClient, suppressAutoIncome: true });
    expect(s.clients).toHaveLength(1);
    expect(s.clients[0].status).toBe('completed_paid');
    expect(s.transactions).toEqual([]);            // <- the contained false-success
    expect(s.activity.length).toBeGreaterThan(0);  // normal audit entry still recorded
  });

  it('UPDATE_CLIENT that lands in completed_paid+value: client updates, NO auto transaction', () => {
    const s0 = { ...base(), clients: [{ ...paidClient, status: 'active' }] };
    const s = reducer(s0, { type: 'UPDATE_CLIENT', payload: { id: 'c1', status: 'completed_paid' }, suppressAutoIncome: true });
    expect(s.clients[0].status).toBe('completed_paid');
    expect(s.transactions).toEqual([]);
  });

  it('any update to an ALREADY-paid client does not re-synthesize a phantom transaction', () => {
    const s0 = { ...base(), clients: [paidClient] }; // paid, but no tx (cloud refresh state)
    const s = reducer(s0, { type: 'UPDATE_CLIENT', payload: { id: 'c1', value: 5000 }, suppressAutoIncome: true });
    expect(s.clients[0].value).toBe(5000);
    expect(s.transactions).toEqual([]);
  });

  it('the flag does not affect explicit ADD_TX (direct Finance income stays normal)', () => {
    const s = reducer(base(), { type: 'ADD_TX', payload: { type: 'income', amount: 800, description: 'הכנסה' } });
    expect(s.transactions).toHaveLength(1);
  });
});

describe('local/demo mode (no flag) — durable localStorage auto-income unchanged', () => {
  it('ADD_CLIENT completed_paid+value still creates the auto income transaction', () => {
    const s = reducer(base(), { type: 'ADD_CLIENT', payload: paidClient });
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0]).toMatchObject({ auto: true, type: 'income', amount: 3000, clientId: 'c1' });
  });

  it('UPDATE_CLIENT to completed_paid creates it; value change updates it; leaving paid removes it', () => {
    let s = { ...base(), clients: [{ ...paidClient, status: 'active' }] };
    s = reducer(s, { type: 'UPDATE_CLIENT', payload: { id: 'c1', status: 'completed_paid' } });
    expect(s.transactions).toHaveLength(1);
    s = reducer(s, { type: 'UPDATE_CLIENT', payload: { id: 'c1', value: 4500 } });
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0].amount).toBe(4500);
    s = reducer(s, { type: 'UPDATE_CLIENT', payload: { id: 'c1', status: 'active' } });
    expect(s.transactions).toEqual([]);
  });
});

// ---- source pins: dispatch wiring + ClientModal copy ----
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const storeSrc = read('../store.jsx');
const modalSrc = read('../../components/forms/ClientModal.jsx');

describe('dispatch wiring (source pins)', () => {
  it('the CLOUD dispatch stamps suppressAutoIncome on ADD_CLIENT/UPDATE_CLIENT before the reducer', () => {
    expect(storeSrc.includes("(act.type === 'ADD_CLIENT' || act.type === 'UPDATE_CLIENT')")).toBe(true);
    expect(storeSrc.includes('{ ...act, suppressAutoIncome: true }')).toBe(true);
    expect(storeSrc.includes('setData((d) => reducer(d, guarded))')).toBe(true);
  });

  it('persist() still receives the ORIGINAL unflagged action (persisted payload untouched)', () => {
    expect(storeSrc.includes('persist(act, userId)')).toBe(true);
    expect(storeSrc.includes('persist(guarded')).toBe(false);
  });

  it('the LOCAL dispatch branch never applies the flag (durable auto-income preserved)', () => {
    const localBranch = storeSrc.slice(storeSrc.indexOf('if (!supabaseEnabled) {'), storeSrc.indexOf('isMemoryOnlyDispatch'));
    expect(localBranch.includes('suppressAutoIncome')).toBe(false);
  });

  it('no caller sets the flag itself — only the store boundary', () => {
    // The flag appears in store.jsx (dispatch + reducer) and nowhere in pages/components/lib callers.
    expect((storeSrc.match(/suppressAutoIncome/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(modalSrc.includes('suppressAutoIncome')).toBe(false);
  });
});

describe('ClientModal copy (source pins)', () => {
  it('cloud mode no longer promises an automatic Finance income record', () => {
    // The old promise survives ONLY inside the non-cloud (local/demo) ternary branch.
    const cloudBranch = modalSrc.split('isSupabaseConfigured')[1] || '';
    const cloudText = cloudBranch.split(':')[0] || '';
    expect(cloudText.includes('ייווצר אוטומטית')).toBe(false);
  });

  it('cloud mode shows the truthful beta guidance (save persists, income via Finance)', () => {
    expect(modalSrc.includes('סטטוס התשלום ושווי הלקוח יישמרו')).toBe(true);
    expect(modalSrc.includes('רישום הכנסה אוטומטי עדיין אינו זמין בגרסת הבטא')).toBe(true);
    expect(modalSrc.includes('במסך הפיננסים')).toBe(true);
  });

  it('local/demo copy is unchanged', () => {
    expect(modalSrc.includes('ייווצר אוטומטית <b>רישום הכנסה</b> בסכום השווי, בתאריך התשלום')).toBe(true);
  });

  it('saving a completed_paid client is NOT blocked — the modal still validates and submits', () => {
    expect(modalSrc.includes("if (form.status === 'completed_paid' && !(Number(form.value) > 0)) e.value = 1;")).toBe(true);
    expect(modalSrc.includes('onSave({ ...form, value: Number(form.value) || 0 })')).toBe(true);
  });
});
