import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildClientProfile, clientCharges, clientPayments, clientMoney,
  clientNextAction, clientTasks, clientAppointments, clientQuotes,
} from '../../components/clients/clientProfile.js';

// ===================================================================
// Client Profile slice 1.
//
// House pattern (no jsdom in this repo): the profile's real logic lives in pure
// selectors, so it is EXECUTED here; the JSX wiring that cannot be executed is
// source-pinned.
//
// The claims this file exists to defend:
//   1. a client with no data yields empty sets — never a fabricated one;
//   2. tasks, diary rows, charges, payments and quotes are the client's OWN;
//   3. the balance is right, including the charge reached through a quote and
//      the charge carrying BOTH links (counted once);
//   4. no row belonging to another account can enter the profile;
//   5. the panel writes nothing, and the diary's unavailability is stated
//      rather than rendered as "none".
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const page = read('../Clients.jsx');
const panel = read('../../components/clients/ClientProfilePanel.jsx');
const selectors = read('../../components/clients/clientProfile.js');

const U = 'user-1';
const OTHER = 'user-2';

const client = { id: 'c1', name: 'לקוח', nextAction: '', nextActionDate: null };

const fixture = () => ({
  tasks: [
    { id: 't1', clientId: 'c1', userId: U, title: 'לחזור ללקוח', status: 'new', deadline: '2026-08-04', priority: 'urgent' },
    { id: 't2', clientId: 'c1', userId: U, title: 'לשלוח קובץ', status: 'done', deadline: '2026-07-01' },
    { id: 't3', clientId: 'c2', userId: U, title: 'של לקוח אחר', status: 'new', deadline: '2026-07-02' },
  ],
  quotes: [
    { id: 'q1', clientId: 'c1', userId: U, number: '2026-001', date: '2026-07-10', status: 'accepted', items: [] },
    { id: 'q9', clientId: 'c2', userId: U, number: '2026-009', date: '2026-07-11', status: 'draft', items: [] },
  ],
  charges: [
    // direct link
    { id: 'ch1', userId: U, clientId: 'c1', quoteId: null, kind: 'deposit', lifecycle: 'open', amountTotal: 1000, dueDate: '2026-08-01' },
    // reached only through the client's quote
    { id: 'ch2', userId: U, clientId: null, quoteId: 'q1', kind: 'final', lifecycle: 'open', amountTotal: 500, dueDate: '2026-09-01' },
    // BOTH links — must be counted exactly once
    { id: 'ch3', userId: U, clientId: 'c1', quoteId: 'q1', kind: 'partial', lifecycle: 'open', amountTotal: 200, dueDate: '2026-09-05' },
    // cancelled: excluded from the totals, still listed
    { id: 'ch4', userId: U, clientId: 'c1', quoteId: null, kind: 'partial', lifecycle: 'cancelled', amountTotal: 900, dueDate: '2026-09-09' },
    // another client's charge
    { id: 'chX', userId: U, clientId: 'c2', quoteId: null, kind: 'deposit', lifecycle: 'open', amountTotal: 7777, dueDate: '2026-08-01' },
  ],
  payments: [
    { id: 'p1', userId: U, chargeId: 'ch1', amount: 400, paidAt: '2026-07-20' },
    { id: 'p2', userId: U, chargeId: 'ch2', amount: 500, paidAt: '2026-07-25' },
    { id: 'pX', userId: U, chargeId: 'chX', amount: 7777, paidAt: '2026-07-26' },
  ],
});

const appointments = [
  { id: 'a1', userId: U, clientId: 'c1', title: 'שיעור ראשון', kind: 'lesson', status: 'planned', startAt: '2026-08-02T09:00:00.000Z', endAt: '2026-08-02T10:00:00.000Z' },
  { id: 'a2', userId: U, clientId: 'c1', title: 'פגישה שהתקיימה', kind: 'appointment', status: 'completed', startAt: '2026-07-02T09:00:00.000Z', endAt: null },
  { id: 'a3', userId: U, clientId: 'c2', title: 'של אחר', kind: 'event', status: 'planned', startAt: '2026-08-01T09:00:00.000Z', endAt: null },
];

// ---------------------------------------------------------------- empty client

describe('a client with no data', () => {
  const empty = buildClientProfile({ id: 'zz', name: 'ריק' }, { tasks: [], quotes: [], charges: [], payments: [] }, [], U);

  it('has empty sets everywhere and no next action', () => {
    expect(empty.tasks.open).toEqual([]);
    expect(empty.tasks.done).toEqual([]);
    expect(empty.appointments.all).toEqual([]);
    expect(empty.quotes).toEqual([]);
    expect(empty.money.charges).toEqual([]);
    expect(empty.money.payments).toEqual([]);
    expect(empty.nextAction).toBe(null);
  });

  it('reports a zero balance rather than a missing one', () => {
    expect(empty.money.totals).toEqual({ expected: 0, received: 0, open: 0, overpaid: 0 });
  });

  it('does not invent data when the collections are missing entirely', () => {
    const none = buildClientProfile({ id: 'zz' }, {}, undefined, U);
    expect(none.tasks.open).toEqual([]);
    expect(none.money.totals.open).toBe(0);
    expect(none.nextAction).toBe(null);
  });
});

// ------------------------------------------------------------------- ownership

describe('linking', () => {
  const data = fixture();

  it('shows only this client\'s tasks, split open / done', () => {
    const t = clientTasks('c1', data.tasks, U);
    expect(t.open.map((x) => x.id)).toEqual(['t1']);
    expect(t.done.map((x) => x.id)).toEqual(['t2']);
  });

  it('shows only this client\'s diary rows, earliest first', () => {
    const a = clientAppointments('c1', appointments, U);
    expect(a.all.map((x) => x.id)).toEqual(['a2', 'a1']);
    expect(a.planned.map((x) => x.id)).toEqual(['a1']);
  });

  it('shows only this client\'s quotes', () => {
    expect(clientQuotes('c1', data.quotes, U).map((q) => q.id)).toEqual(['q1']);
  });

  it('collects charges by client_id AND by quote_id, each exactly once', () => {
    expect(clientCharges('c1', data.charges, data.quotes, U).map((c) => c.id).sort())
      .toEqual(['ch1', 'ch2', 'ch3', 'ch4']);
  });

  it('collects only the payments of those charges', () => {
    const mine = clientCharges('c1', data.charges, data.quotes, U);
    expect(clientPayments(mine, data.payments, U).map((p) => p.id)).toEqual(['p2', 'p1']);
  });
});

// --------------------------------------------------------------------- balance

describe('balance', () => {
  const data = fixture();
  const money = clientMoney('c1', data, U);

  it('sums open charges only, and the client\'s own money only', () => {
    // open: 1000 + 500 + 200 = 1700; received against them: 400 + 500 = 900
    expect(money.totals.expected).toBe(1700);
    expect(money.totals.received).toBe(900);
    expect(money.totals.open).toBe(800);
    expect(money.totals.overpaid).toBe(0);
    expect(money.cancelledCount).toBe(1);
  });

  it('derives a per-charge balance and payment status', () => {
    const by = Object.fromEntries(money.charges.map((c) => [c.id, c]));
    expect(by.ch1.balance).toBe(600);
    expect(by.ch1.paymentStatus).toBe('partially_paid');
    expect(by.ch2.balance).toBe(0);
    expect(by.ch2.paymentStatus).toBe('paid');
    expect(by.ch3.paymentStatus).toBe('expected');
  });

  it('never lets an overpayment on one charge hide another\'s open balance', () => {
    const d = fixture();
    d.payments.push({ id: 'p3', userId: U, chargeId: 'ch2', amount: 300, paidAt: '2026-07-28' });
    const m = clientMoney('c1', d, U);
    expect(m.totals.open).toBe(800);
    expect(m.totals.overpaid).toBe(300);
  });
});

// ------------------------------------------------------------ account isolation

describe('account isolation', () => {
  it('drops every row owned by another account', () => {
    const d = fixture();
    for (const key of ['tasks', 'quotes', 'charges', 'payments']) {
      for (const row of d[key]) row.userId = OTHER;
    }
    const foreign = appointments.map((a) => ({ ...a, userId: OTHER }));
    const p = buildClientProfile(client, d, foreign, U);
    expect(p.tasks.open).toEqual([]);
    expect(p.quotes).toEqual([]);
    expect(p.money.charges).toEqual([]);
    expect(p.money.payments).toEqual([]);
    expect(p.appointments.all).toEqual([]);
    expect(p.money.totals.open).toBe(0);
  });

  it('a foreign payment cannot pay off this account\'s charge', () => {
    const d = fixture();
    d.payments = [{ id: 'pf', userId: OTHER, chargeId: 'ch1', amount: 1000, paidAt: '2026-07-20' }];
    expect(clientMoney('c1', d, U).totals.received).toBe(0);
  });
});

// ----------------------------------------------------------------- next action

describe('next action', () => {
  const data = fixture();

  it('prefers the follow-up written on the client itself', () => {
    const n = clientNextAction(
      { ...client, nextAction: 'להתקשר', nextActionDate: '2026-08-01' },
      { tasks: data.tasks, appointments }, U,
    );
    expect(n).toEqual({ source: 'client', text: 'להתקשר', date: '2026-08-01' });
  });

  it('falls back to the earliest OPEN task', () => {
    const n = clientNextAction(client, { tasks: data.tasks, appointments }, U);
    expect(n.source).toBe('task');
    expect(n.id).toBe('t1');
  });

  it('falls back to the earliest PLANNED diary row when no task is open', () => {
    const n = clientNextAction(client, { tasks: [], appointments }, U);
    expect(n.source).toBe('appointment');
    expect(n.id).toBe('a1');
  });

  it('returns null rather than inventing one', () => {
    expect(clientNextAction(client, { tasks: [], appointments: [] }, U)).toBe(null);
  });
});

// ------------------------------------------------------------- shipped wiring

describe('shipped wiring', () => {
  it('the Clients page renders the profile panel inside the detail modal', () => {
    expect(page).toContain("import ClientProfilePanel from '../components/clients/ClientProfilePanel.jsx'");
    expect(page).toContain('<ClientProfilePanel');
    expect(page).toContain('scheduleState={scheduleState}');
  });

  it('the diary is read read-only, and only in cloud mode', () => {
    expect(page).toContain('listAppointments');
    expect(page).not.toMatch(/createAppointment|updateAppointment|deleteAppointment|setAppointmentStatus/);
    expect(page).toContain("useState(isSupabaseConfigured ? 'loading' : 'unavailable')");
  });

  it('states the diary is unavailable instead of claiming there are none', () => {
    expect(panel).toContain("scheduleState !== 'ready'");
    expect(panel).toMatch(/unavailable: '[^']*בענן בלבד/);
    expect(panel).toMatch(/error: '[^']*לא הצלחתי לקרוא את היומן/);
  });

  it('the panel and its selectors write nothing', () => {
    expect(panel).not.toMatch(/dispatch|supabase|createCharge|recordPayment|type: '[A-Z_]+'/);
    expect(selectors).not.toMatch(/dispatch|supabase|insert\(|update\(|delete\(/);
  });

  it('the balance comes from the Finance definition, not a second one', () => {
    expect(selectors).toContain("from '../../lib/receivables.js'");
    expect(selectors).toContain('receivablesTotals');
  });

  it('every section has an empty state', () => {
    for (const t of [
      'אין פעולה הבאה',
      'אין חיובים מקושרים',
      'לא נרשמו תשלומים',
      'אין משימות המקושרות',
      'אין תורים, שיעורים או אירועים',
      'אין הצעות מחיר מקושרות',
    ]) expect(panel).toContain(t);
  });
});
