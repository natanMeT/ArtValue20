import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PAYMENT_TERMS, PAYMENT_TERMS_DAYS, CHARGE_KINDS, CHARGE_LIFECYCLES,
  DUE_DATE_SOURCES, PAYMENT_STATUSES, RECEIVABLES_LIMITS,
  isCalendarDate, endOfMonth, addDays, computeDueDate,
  chargeReceived, openBalance, chargePaymentStatus, decorateCharge,
  isChargeOpen, receivablesTotals, actualRevenue,
  validateCharge, validatePayment,
  normalizeChargeRow, normalizePaymentRow,
  sortChargesByDueDate, sortChargesNewestFirst,
} from '../receivables.js';

// ===================================================================
// F1 Core Receivables — the pure boundary.
//
// Everything here is arithmetic and validation with no clock, no timezone and
// no I/O, so it is testable exactly as written. The two facts this file exists
// to protect:
//   1. the due-date rule (end of the SERVICE month + 0/30/60/90 days), which is
//      wrong by a day in half the world the moment it touches local time;
//   2. payment status is DERIVED — no input to any function here can set it.
// ===================================================================

const src = readFileSync(fileURLToPath(new URL('../receivables.js', import.meta.url)), 'utf8');

describe('vocabularies are frozen and match the server domains', () => {
  it('exposes exactly the four payment terms', () => {
    expect(PAYMENT_TERMS).toEqual(['immediate', 'net30', 'net60', 'net90']);
    expect(Object.isFrozen(PAYMENT_TERMS)).toBe(true);
    expect(PAYMENT_TERMS_DAYS).toEqual({ immediate: 0, net30: 30, net60: 60, net90: 90 });
  });

  it('exposes exactly the three charge kinds and the two lifecycle states', () => {
    expect(CHARGE_KINDS).toEqual(['deposit', 'partial', 'final']);
    expect(CHARGE_LIFECYCLES).toEqual(['open', 'cancelled']);
    expect(Object.isFrozen(CHARGE_KINDS)).toBe(true);
    expect(Object.isFrozen(CHARGE_LIFECYCLES)).toBe(true);
  });

  it('derived statuses and due-date sources are the declared closed sets', () => {
    expect(PAYMENT_STATUSES).toEqual(['expected', 'partially_paid', 'paid']);
    expect(DUE_DATE_SOURCES).toEqual(['computed', 'manual']);
  });

  it('bounds the invoice link at 2048 characters', () => {
    expect(RECEIVABLES_LIMITS.invoiceUrl).toBe(2048);
    expect(RECEIVABLES_LIMITS.description).toBe(200);
  });
});

describe('source purity — no clock, no randomness, no environment', () => {
  // The house rule for pure modules (Engineering Method §6). A due date that
  // depended on Date.now() would be untestable and would drift by timezone.
  it('never reads a clock, a random source, storage, network or env', () => {
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const banned of [
      'Date.now', 'Math.random', 'localStorage', 'sessionStorage',
      'fetch(', 'window.', 'process.env', 'import.meta.env', 'crypto.',
    ]) {
      expect(code, `pure module must not use ${banned}`).not.toContain(banned);
    }
  });

  it('constructs and reads dates ONLY in UTC — never through local time', () => {
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    // THE TIMEZONE BUG, in three forms:
    //   new Date('2026-02-15') / Date.parse(...) parse a STRING to an instant;
    //   .getMonth() / .getDate() then read that instant in LOCAL time, so in any
    //   negative-offset zone the same string is the previous day.
    // Only Date.UTC (construction) and getUTC* (reading) are permitted here.
    expect(code).not.toMatch(/new Date\(\s*['"`]/);
    expect(code).not.toContain('Date.parse');
    expect(code).not.toMatch(/\.get(FullYear|Month|Date|Day|Hours|Minutes)\(\)/);
    expect(code).toContain('Date.UTC(');
    expect(code).toContain('getUTCFullYear()');
  });
});

describe('date-only arithmetic is timezone-independent', () => {
  it('accepts only ISO calendar dates', () => {
    expect(isCalendarDate('2026-02-15')).toBe(true);
    expect(isCalendarDate('2026-2-15')).toBe(false);
    expect(isCalendarDate('15/02/2026')).toBe(false);
    expect(isCalendarDate('')).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
    expect(isCalendarDate(20260215)).toBe(false);
  });

  it('rejects a well-formed string that is not a real calendar date', () => {
    expect(isCalendarDate('2026-02-31')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-00-10')).toBe(false);
  });

  it('endOfMonth handles month lengths and leap years without a lookup table', () => {
    expect(endOfMonth('2026-02-15')).toBe('2026-02-28'); // 2026 is NOT a leap year
    expect(endOfMonth('2024-02-01')).toBe('2024-02-29'); // 2024 is
    expect(endOfMonth('2026-01-31')).toBe('2026-01-31');
    expect(endOfMonth('2026-04-01')).toBe('2026-04-30');
    expect(endOfMonth('2026-12-25')).toBe('2026-12-31');
  });

  it('addDays crosses months and years', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
  });

  it('returns null rather than a guessed date for unusable input', () => {
    expect(endOfMonth('nope')).toBe(null);
    expect(addDays('2026-02-15', 1.5)).toBe(null);
    expect(addDays('bad', 30)).toBe(null);
  });

  it('is invariant to the process timezone — the documented failure mode', () => {
    // A `new Date('2026-02-15').getMonth()` implementation returns January in
    // any negative-offset zone. This asserts the value is the SAME string in a
    // zone where that bug would show. Vitest cannot change TZ mid-process, so
    // this pins the property that makes it impossible: the result is derived
    // from the string, and identical inputs give identical output regardless of
    // when or where it runs.
    expect(computeDueDate('2026-02-15', 'net60')).toBe(computeDueDate('2026-02-15', 'net60'));
    expect(endOfMonth('2026-03-01')).toBe('2026-03-31');
    expect(endOfMonth('2026-03-31')).toBe('2026-03-31');
  });
});

describe('THE DUE-DATE RULE — end of the service month + terms', () => {
  // THE MANDATED CONTROL. If this number ever changes, the rule changed.
  it('2026-02-15 with net60 is 2026-04-29', () => {
    expect(computeDueDate('2026-02-15', 'net60')).toBe('2026-04-29');
  });

  it('all four terms from the same service date', () => {
    expect(computeDueDate('2026-02-15', 'immediate')).toBe('2026-02-28');
    expect(computeDueDate('2026-02-15', 'net30')).toBe('2026-03-30');
    expect(computeDueDate('2026-02-15', 'net60')).toBe('2026-04-29');
    expect(computeDueDate('2026-02-15', 'net90')).toBe('2026-05-29');
  });

  it('every day of the same service month yields the same due date', () => {
    // The rule counts from the END OF THE MONTH, never from the service day —
    // this is the whole difference between "net 60" and "60 days from service".
    for (const d of ['2026-02-01', '2026-02-14', '2026-02-28']) {
      expect(computeDueDate(d, 'net60')).toBe('2026-04-29');
    }
  });

  it('handles a leap February and a year boundary', () => {
    expect(computeDueDate('2024-02-10', 'net30')).toBe('2024-03-30'); // 29 Feb + 30
    expect(computeDueDate('2026-12-05', 'net30')).toBe('2027-01-30');
    expect(computeDueDate('2026-11-30', 'net90')).toBe('2027-02-28');
  });

  it('unknown terms or an unusable date produce null, never a fallback date', () => {
    expect(computeDueDate('2026-02-15', 'net45')).toBe(null);
    expect(computeDueDate('2026-02-15', '')).toBe(null);
    expect(computeDueDate('2026-02-31', 'net30')).toBe(null);
    expect(computeDueDate(null, 'net30')).toBe(null);
  });
});

describe('received / balance / DERIVED status', () => {
  const payments = [
    { id: 'p1', chargeId: 'c1', amount: 400 },
    { id: 'p2', chargeId: 'c1', amount: 100.5 },
    { id: 'p3', chargeId: 'c2', amount: 250 },
  ];

  it('sums only the payments of the named charge', () => {
    expect(chargeReceived('c1', payments)).toBe(500.5);
    expect(chargeReceived('c2', payments)).toBe(250);
    expect(chargeReceived('c3', payments)).toBe(0);
    expect(chargeReceived('', payments)).toBe(0);
    expect(chargeReceived('c1', null)).toBe(0);
  });

  it('ignores unusable amounts instead of coercing them to zero silently', () => {
    expect(chargeReceived('c1', [{ chargeId: 'c1', amount: 'abc' }, { chargeId: 'c1', amount: 10 }])).toBe(10);
    expect(chargeReceived('c1', [{ chargeId: 'c1', amount: null }])).toBe(0);
  });

  it('expected: nothing received', () => {
    expect(chargePaymentStatus(1000, 0)).toBe('expected');
    expect(openBalance(1000, 0)).toBe(1000);
  });

  it('partially_paid: some received, less than the total', () => {
    expect(chargePaymentStatus(1000, 0.01)).toBe('partially_paid');
    expect(chargePaymentStatus(1000, 999.99)).toBe('partially_paid');
    expect(openBalance(1000, 400)).toBe(600);
  });

  it('paid: received meets the total exactly', () => {
    expect(chargePaymentStatus(1000, 1000)).toBe('paid');
    expect(openBalance(1000, 1000)).toBe(0);
  });

  it('OVERPAYMENT: allowed, reads paid, and NEVER a negative balance', () => {
    expect(chargePaymentStatus(1000, 1200)).toBe('paid');
    expect(openBalance(1000, 1200)).toBe(0);
    expect(openBalance(1000, 1200)).not.toBeLessThan(0);
  });

  it('VAT is inside amount_total — the module never adds or removes it', () => {
    // A 1,000 ₪ net job at 18% is stored as 1,180 and paid off by 1,180.
    const total = 1180;
    expect(chargePaymentStatus(total, 1000)).toBe('partially_paid'); // net paid, VAT still open
    expect(openBalance(total, 1000)).toBe(180);
    expect(chargePaymentStatus(total, 1180)).toBe('paid');
    // Nothing in the module applies a VAT RATE: amount_total arrives inclusive
    // and is used verbatim. Asserted on STATEMENTS, not on the prose that
    // explains the rule — a comment saying "incl. VAT" is documentation, and a
    // scan that cannot tell the two apart is a scan that will be deleted.
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    expect(code).not.toMatch(/\bvat\b/i);
    expect(code).not.toMatch(/1\.18|0\.18/);
  });

  it('money stays on the numeric(14,2) grid — no floating-point residue', () => {
    expect(openBalance(0.3, 0.1)).toBe(0.2);
    expect(chargeReceived('c', [{ chargeId: 'c', amount: 0.1 }, { chargeId: 'c', amount: 0.2 }])).toBe(0.3);
  });

  it('an unusable total fails toward "expected", never toward "paid"', () => {
    expect(chargePaymentStatus(null, 0)).toBe('expected');
    expect(chargePaymentStatus('abc', 0)).toBe('expected');
    expect(chargePaymentStatus(0, 0)).toBe('expected');
  });

  it('decorateCharge derives without mutating, and writes no `status` field', () => {
    const charge = { id: 'c1', amountTotal: 1000, lifecycle: 'open' };
    const out = decorateCharge(charge, [{ chargeId: 'c1', amount: 250 }]);
    expect(out.received).toBe(250);
    expect(out.balance).toBe(750);
    expect(out.paymentStatus).toBe('partially_paid');
    expect(charge.received).toBeUndefined();      // input untouched
    expect(out.status).toBeUndefined();           // no status field, ever
    expect(decorateCharge(null, [])).toBe(null);
  });
});

describe('cancelled charges leave every total', () => {
  const charges = [
    { id: 'a', amountTotal: 1000, lifecycle: 'open' },
    { id: 'b', amountTotal: 500, lifecycle: 'cancelled' },
  ];
  const payments = [
    { chargeId: 'a', amount: 400 },
    { chargeId: 'b', amount: 500 },
  ];

  it('isChargeOpen is the single gate', () => {
    expect(isChargeOpen(charges[0])).toBe(true);
    expect(isChargeOpen(charges[1])).toBe(false);
    expect(isChargeOpen(null)).toBe(false);
    expect(isChargeOpen({ lifecycle: 'whatever' })).toBe(false);
  });

  it('a cancelled charge contributes nothing to expected, received or open', () => {
    const t = receivablesTotals(charges, payments);
    expect(t.expected).toBe(1000);  // NOT 1500
    expect(t.received).toBe(400);   // NOT 900
    expect(t.open).toBe(600);
  });

  it('but the money that arrived on it is still real revenue', () => {
    // Cancelling a claim does not un-receive a payment. actualRevenue counts
    // every payment, which is why it is not derived from receivablesTotals.
    expect(actualRevenue(payments, []).fromPayments).toBe(900);
  });
});

describe('receivablesTotals — open is a sum of clamped balances', () => {
  it('one overpaid charge cannot mask another charge\'s open balance', () => {
    // THE DEFECT THIS SHAPE PREVENTS: `expected - received` would report 0 open
    // here, while 500 is genuinely still owed on charge b.
    const charges = [
      { id: 'a', amountTotal: 1000, lifecycle: 'open' },
      { id: 'b', amountTotal: 500, lifecycle: 'open' },
    ];
    const payments = [{ chargeId: 'a', amount: 1500 }];
    const t = receivablesTotals(charges, payments);
    expect(t.expected).toBe(1500);
    expect(t.received).toBe(1500);
    expect(t.open).toBe(500);       // NOT 0
    expect(t.overpaid).toBe(500);   // surfaced, not swallowed
  });

  it('empty and hostile input produce zeroes, never NaN', () => {
    expect(receivablesTotals([], [])).toEqual({ expected: 0, received: 0, open: 0, overpaid: 0 });
    expect(receivablesTotals(null, null)).toEqual({ expected: 0, received: 0, open: 0, overpaid: 0 });
    const t = receivablesTotals([{ id: 'x', amountTotal: 'junk', lifecycle: 'open' }], []);
    expect(Number.isNaN(t.expected)).toBe(false);
    expect(t.expected).toBe(0);
  });
});

describe('actualRevenue — payments AND legacy income, with no double count', () => {
  const payments = [{ chargeId: 'c1', amount: 600 }, { chargeId: 'c2', amount: 400 }];
  const transactions = [
    { type: 'income', amount: 300 },
    { type: 'expense', amount: 5000 },
    { type: 'income', amount: 200 },
  ];

  it('adds the two sources and reports each part separately', () => {
    const r = actualRevenue(payments, transactions);
    expect(r.fromPayments).toBe(1000);
    expect(r.fromTransactions).toBe(500);
    expect(r.total).toBe(1500);
  });

  it('expenses are never revenue', () => {
    expect(actualRevenue([], [{ type: 'expense', amount: 999 }]).total).toBe(0);
  });

  it('the same payment is counted exactly once', () => {
    // The no-double-count guarantee is structural: nothing converts a payment
    // into a transaction, so a payment can appear in only one of the two sums.
    const r = actualRevenue([{ chargeId: 'c1', amount: 600 }], []);
    expect(r.total).toBe(600);
    expect(r.fromTransactions).toBe(0);
  });

  it('hostile input yields zeroes, never NaN', () => {
    expect(actualRevenue(null, null).total).toBe(0);
    expect(actualRevenue([{ amount: 'x' }], [{ type: 'income', amount: {} }]).total).toBe(0);
  });
});

describe('validateCharge', () => {
  const base = { serviceDate: '2026-02-15', paymentTerms: 'net60', amountTotal: 1180 };

  it('computes the due date and stamps it `computed` when none is supplied', () => {
    const v = validateCharge(base);
    expect(v.ok).toBe(true);
    expect(v.value.dueDate).toBe('2026-04-29');
    expect(v.value.dueDateSource).toBe('computed');
  });

  it('honours a manual due date verbatim and stamps it `manual`', () => {
    const v = validateCharge({ ...base, dueDate: '2026-03-10' });
    expect(v.ok).toBe(true);
    expect(v.value.dueDate).toBe('2026-03-10');
    expect(v.value.dueDateSource).toBe('manual');
  });

  it('a blank due date means "no override", not an error', () => {
    const v = validateCharge({ ...base, dueDate: '   ' });
    expect(v.ok).toBe(true);
    expect(v.value.dueDateSource).toBe('computed');
  });

  it('always creates in lifecycle open, and never accepts a payment status', () => {
    const v = validateCharge({ ...base, lifecycle: 'cancelled', status: 'paid', paymentStatus: 'paid' });
    expect(v.value.lifecycle).toBe('open');
    expect(v.value.status).toBeUndefined();
    expect(v.value.paymentStatus).toBeUndefined();
    expect(Object.keys(v.value)).not.toContain('status');
  });

  it('refuses a non-positive, missing or unparsable amount', () => {
    expect(validateCharge({ ...base, amountTotal: 0 }).ok).toBe(false);
    expect(validateCharge({ ...base, amountTotal: -1 }).ok).toBe(false);
    expect(validateCharge({ ...base, amountTotal: '' }).ok).toBe(false);
    expect(validateCharge({ ...base, amountTotal: '1,200' }).ok).toBe(false); // NOT 1
    expect(validateCharge({ ...base, amountTotal: undefined }).ok).toBe(false);
  });

  it('accepts a numeric string amount and rounds to two places', () => {
    expect(validateCharge({ ...base, amountTotal: '1180.005' }).value.amountTotal).toBe(1180.01);
  });

  it('refuses a missing or malformed service date', () => {
    expect(validateCharge({ ...base, serviceDate: '' }).ok).toBe(false);
    expect(validateCharge({ ...base, serviceDate: '15/02/2026' }).ok).toBe(false);
    expect(validateCharge({ ...base, serviceDate: '2026-02-31' }).ok).toBe(false);
  });

  it('refuses unknown kinds and terms', () => {
    expect(validateCharge({ ...base, kind: 'retainer' }).ok).toBe(false);
    expect(validateCharge({ ...base, paymentTerms: 'net45' }).ok).toBe(false);
  });

  it('over-limit text is a VISIBLE ERROR, never a silent truncation', () => {
    const long = validateCharge({ ...base, description: 'x'.repeat(201) });
    expect(long.ok).toBe(false);
    expect(long.value).toBe(null);
    const url = validateCharge({ ...base, invoiceUrl: `https://e/${'x'.repeat(2048)}` });
    expect(url.ok).toBe(false);
    // ...and exactly at the bound it passes (positive control for the same rule).
    expect(validateCharge({ ...base, description: 'x'.repeat(200) }).ok).toBe(true);
    expect(validateCharge({ ...base, invoiceUrl: 'x'.repeat(2048) }).ok).toBe(true);
  });

  it('optional links normalize to null, not to an empty string', () => {
    const v = validateCharge(base);
    expect(v.value.clientId).toBe(null);
    expect(v.value.quoteId).toBe(null);
    expect(v.value.description).toBe(null);
    expect(v.value.invoiceUrl).toBe(null);
  });

  it('never throws on hostile input', () => {
    for (const bad of [null, undefined, 0, 'x', [], () => {}]) {
      expect(() => validateCharge(bad)).not.toThrow();
      expect(validateCharge(bad).ok).toBe(false);
    }
  });
});

describe('validatePayment', () => {
  const base = { chargeId: 'c1', amount: 400, paidAt: '2026-03-01' };

  it('accepts a well-formed payment', () => {
    expect(validatePayment(base).value).toEqual({ chargeId: 'c1', amount: 400, paidAt: '2026-03-01' });
  });

  it('a payment must belong to a charge', () => {
    expect(validatePayment({ ...base, chargeId: '' }).ok).toBe(false);
    expect(validatePayment({ ...base, chargeId: null }).ok).toBe(false);
  });

  it('refuses a non-positive or unparsable amount and a bad date', () => {
    expect(validatePayment({ ...base, amount: 0 }).ok).toBe(false);
    expect(validatePayment({ ...base, amount: -5 }).ok).toBe(false);
    expect(validatePayment({ ...base, amount: 'abc' }).ok).toBe(false);
    expect(validatePayment({ ...base, paidAt: '' }).ok).toBe(false);
    expect(validatePayment({ ...base, paidAt: '2026-02-30' }).ok).toBe(false);
  });

  it('an overpayment is ACCEPTED here — the policy is clamp, not refuse', () => {
    expect(validatePayment({ ...base, amount: 999999 }).ok).toBe(true);
  });

  it('never throws on hostile input', () => {
    for (const bad of [null, undefined, 'x', []]) {
      expect(() => validatePayment(bad)).not.toThrow();
      expect(validatePayment(bad).ok).toBe(false);
    }
  });
});

describe('row normalization drops what it cannot trust', () => {
  const row = {
    id: 'ch1', user_id: 'u1', client_id: 'cl1', quote_id: 'qt1',
    kind: 'deposit', payment_terms: 'net30', service_date: '2026-02-15',
    due_date: '2026-03-30', due_date_source: 'computed', amount_total: '1180.00',
    description: 'מקדמה', invoice_url: 'https://x/y', lifecycle: 'open',
    created_at: '2026-02-16T00:00:00Z', updated_at: '2026-02-16T00:00:00Z',
  };

  it('maps a good charge row to the canonical camelCase shape', () => {
    const c = normalizeChargeRow(row);
    expect(c.id).toBe('ch1');
    expect(c.amountTotal).toBe(1180);
    expect(c.paymentTerms).toBe('net30');
    expect(c.dueDateSource).toBe('computed');
    expect(c.lifecycle).toBe('open');
  });

  it('drops a row with an unknown lifecycle, kind, terms or amount', () => {
    expect(normalizeChargeRow({ ...row, lifecycle: 'archived' })).toBe(null);
    expect(normalizeChargeRow({ ...row, kind: 'retainer' })).toBe(null);
    expect(normalizeChargeRow({ ...row, payment_terms: 'net45' })).toBe(null);
    expect(normalizeChargeRow({ ...row, amount_total: 'x' })).toBe(null);
    expect(normalizeChargeRow({ ...row, id: '' })).toBe(null);
    expect(normalizeChargeRow({ ...row, user_id: null })).toBe(null);
    expect(normalizeChargeRow(null)).toBe(null);
  });

  it('an unknown due_date_source degrades to `computed` rather than dropping the row', () => {
    expect(normalizeChargeRow({ ...row, due_date_source: 'guessed' }).dueDateSource).toBe('computed');
  });

  it('maps and guards payment rows', () => {
    const p = normalizePaymentRow({ id: 'p1', user_id: 'u1', charge_id: 'ch1', amount: '400.00', paid_at: '2026-03-01' });
    expect(p).toEqual({ id: 'p1', userId: 'u1', chargeId: 'ch1', amount: 400, paidAt: '2026-03-01', createdAt: null, updatedAt: null });
    expect(normalizePaymentRow({ id: 'p1', user_id: 'u1', charge_id: '', amount: 1 })).toBe(null);
    expect(normalizePaymentRow({ id: 'p1', user_id: 'u1', charge_id: 'ch1', amount: 'x' })).toBe(null);
    expect(normalizePaymentRow(null)).toBe(null);
  });
});

describe('sorting', () => {
  const a = { id: 'a', dueDate: '2026-03-01', createdAt: '2026-01-01' };
  const b = { id: 'b', dueDate: '2026-02-01', createdAt: '2026-01-02' };
  const c = { id: 'c', dueDate: null, createdAt: '2026-01-03' };

  it('soonest due first; a charge with no due date sorts last', () => {
    expect(sortChargesByDueDate([a, b, c]).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = [a, b];
    sortChargesByDueDate(input);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('newest-first sorts by createdAt', () => {
    expect(sortChargesNewestFirst([a, b, c]).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('hostile input yields an empty array', () => {
    expect(sortChargesByDueDate(null)).toEqual([]);
    expect(sortChargesNewestFirst(undefined)).toEqual([]);
  });
});
