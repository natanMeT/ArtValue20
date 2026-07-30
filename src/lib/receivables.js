// ===================================================================
// receivables — the SINGLE pure boundary for Core Receivables (F1).
//
// THE ONE DISTINCTION THIS MODULE EXISTS FOR:
//   a CHARGE is money the business EXPECTS to be billed.
//   a PAYMENT is money that ACTUALLY ARRIVED against a charge.
// They are two different tables and two different facts. Before this slice the
// product had only `transactions`, which conflated "we will invoice this" with
// "this was received" — and therefore could not answer "how much is still
// open?" without guessing.
//
// PAYMENTS ARE THE SOURCE OF TRUTH FOR RECEIVED REVENUE ON A CHARGE. Recording
// a payment must never also create an income `transaction`: that would count the
// same shekel twice. Legacy income transactions stay exactly as they are and are
// added ALONGSIDE payments (see actualRevenue) — never merged into them.
//
// PAYMENT STATUS IS DERIVED, NEVER STORED. There is no status column on
// public.charges and no way to write one:
//     received >= total  -> 'paid'
//     0 < received < total -> 'partially_paid'
//     received == 0      -> 'expected'
// A stored status is a second copy of a rule that is free to drift from the
// amounts; the amounts are the only thing anybody can audit.
//
// LIFECYCLE IS A DIFFERENT AXIS. `open` / `cancelled` says whether the charge is
// still a claim at all. It never says anything about money, and money never says
// anything about it.
//
// Pure + dependency-free: NO store, NO network, NO React, NO Supabase,
// NO clock, NO randomness, NO locale-dependent parsing. Mirrors the
// campaigns.js / assetLibrary.js / businessProfile.js precedent.
//
// AUTHORITY. Every rule here is a CLIENT-SIDE MIRROR of a server rule, kept so
// the user gets a truthful message instead of an opaque failure. The server is
// authoritative in every case:
//   * amount > 0 / bounded text -> the charges_* / payments_* CHECK constraints
//   * kind / terms / lifecycle  -> charges_kind_allowed, charges_terms_allowed,
//                                  charges_lifecycle_allowed
//   * invoice_url <= 2048       -> charges_invoice_url_bounded
//   * ownership                 -> RLS, four policies per table
//   * same-owner relationships  -> the five COMPOSITE foreign keys
// When the two disagree, the SERVER wins and its refusal is surfaced as a
// failure. This file never decides that a write succeeded.
// ===================================================================

// ---------------- vocabularies (frozen) ----------------

/** Mirrors charges_terms_allowed. */
export const PAYMENT_TERMS = Object.freeze(['immediate', 'net30', 'net60', 'net90']);

/**
 * Days added AFTER the end of the service month. `immediate` is 0 days, which
 * still means end-of-month — not "today". Billing terms in this market are
 * counted from the close of the service month, never from the service date.
 */
export const PAYMENT_TERMS_DAYS = Object.freeze({
  immediate: 0, net30: 30, net60: 60, net90: 90,
});

export const PAYMENT_TERMS_LABELS = Object.freeze({
  immediate: 'שוטף',
  net30: 'שוטף + 30',
  net60: 'שוטף + 60',
  net90: 'שוטף + 90',
});

/** Mirrors charges_kind_allowed. */
export const CHARGE_KINDS = Object.freeze(['deposit', 'partial', 'final']);

export const CHARGE_KIND_LABELS = Object.freeze({
  deposit: 'מקדמה',
  partial: 'תשלום ביניים',
  final: 'תשלום סופי',
});

/** Mirrors charges_lifecycle_allowed. Exactly two states, by design. */
export const CHARGE_LIFECYCLES = Object.freeze(['open', 'cancelled']);

export const CHARGE_LIFECYCLE_LABELS = Object.freeze({
  open: 'פעיל',
  cancelled: 'בוטל',
});

/** Mirrors charges_due_source_allowed — whether due_date was computed or typed. */
export const DUE_DATE_SOURCES = Object.freeze(['computed', 'manual']);

export const DUE_DATE_SOURCE_LABELS = Object.freeze({
  computed: 'מחושב מתנאי התשלום',
  manual: 'הוזן ידנית',
});

/** DERIVED ONLY — there is no such column, and nothing may write one. */
export const PAYMENT_STATUSES = Object.freeze(['expected', 'partially_paid', 'paid']);

export const PAYMENT_STATUS_LABELS = Object.freeze({
  expected: 'צפוי',
  partially_paid: 'שולם חלקית',
  paid: 'שולם',
});

// Badge classes reused from the existing design system (no new CSS).
export const PAYMENT_STATUS_CLASS = Object.freeze({
  expected: 'badge-payment',
  partially_paid: 'badge-neutral',
  paid: 'badge-completed',
});

/** Mirrors the bounded-text CHECK constraints. */
export const RECEIVABLES_LIMITS = Object.freeze({
  description: 200,
  invoiceUrl: 2048,
  // numeric(14,2) — the largest value the column can hold.
  amount: 999999999999.99,
});

// ---------------- money ----------------

// numeric(14,2) on the server. Rounding HERE keeps the client's arithmetic on
// the same grid as the column, so a balance never renders as 0.009999999.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const isMoney = (v) => typeof v === 'number' && Number.isFinite(v);

/** Coerce to a finite number, or NaN. Never throws, never returns 0 for junk. */
function money(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    const s = v.trim();
    // Deliberately strict: '' / '12abc' / '1,200' are NOT money. A silent 0 here
    // would persist a charge for nothing.
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }
  return NaN;
}

// ---------------- date-only arithmetic (timezone-independent) ----------------
//
// Every date in this module is a calendar date, never an instant. All math runs
// on UTC epoch-day arithmetic and never touches the local timezone: `new
// Date('2026-02-15')` is UTC midnight but `.getMonth()` reads it in local time,
// so in any negative-offset zone the same string is the 14th. That single detail
// is how a due date lands one day early for half the world.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

function parseDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  // Date.UTC maps years 0-99 onto 1900+; reject them rather than silently
  // shifting the century.
  if (y < 100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  // Rejects a well-formed string that is not a real calendar date (2026-02-31).
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d, t };
}

const fmtUtc = (t) => new Date(t).toISOString().slice(0, 10);

/** Is `s` a valid ISO calendar date (YYYY-MM-DD)? */
export function isCalendarDate(s) {
  return parseDate(s) !== null;
}

/** Last calendar day of the month `s` falls in. Invalid input -> null. */
export function endOfMonth(s) {
  const p = parseDate(s);
  if (!p) return null;
  // Day 0 of the NEXT month is the last day of this one — leap years included,
  // with no month-length table to keep in step.
  return fmtUtc(Date.UTC(p.y, p.m, 0));
}

/** `s` shifted by `n` whole days. Non-integer `n` or invalid `s` -> null. */
export function addDays(s, n) {
  const p = parseDate(s);
  if (!p || !Number.isInteger(n)) return null;
  return fmtUtc(p.t + n * DAY_MS);
}

/**
 * THE DUE-DATE RULE: end of the SERVICE month, then + 0/30/60/90 days.
 *
 * Worked control (pinned by a test, and by the migration's comment):
 *   2026-02-15 + net60 -> end of month 2026-02-28 -> +60 days -> 2026-04-29.
 *
 * Invalid date or unknown terms -> null. Never a guessed date.
 */
export function computeDueDate(serviceDate, terms) {
  const eom = endOfMonth(serviceDate);
  if (!eom) return null;
  if (!PAYMENT_TERMS.includes(terms)) return null;
  return addDays(eom, PAYMENT_TERMS_DAYS[terms]);
}

// ---------------- derived money facts ----------------

const str = (v) => (v == null ? '' : String(v)).trim();

/** A charge still claimable. Cancelled charges are excluded from every total. */
export function isChargeOpen(charge) {
  return !!charge && charge.lifecycle === 'open';
}

/** Sum of the payments belonging to `chargeId`. Unknown ids sum to 0. */
export function chargeReceived(chargeId, payments) {
  const id = str(chargeId);
  if (!id) return 0;
  let sum = 0;
  for (const p of Array.isArray(payments) ? payments : []) {
    if (!p || str(p.chargeId) !== id) continue;
    const a = money(p.amount);
    if (!Number.isNaN(a)) sum += a;
  }
  return round2(sum);
}

/**
 * Open balance = max(total - received, 0).
 *
 * OVERPAYMENT POLICY, stated once: an overpayment is ALLOWED (a customer who
 * transfers too much is a real event, and refusing to record it would make the
 * ledger lie). It never produces a negative balance — the balance clamps at 0
 * and the charge reads 'paid'. The surplus is visible through
 * receivablesTotals().overpaid, not through a negative number nobody can chase.
 * The database does NOT forbid it either (a CHECK cannot sum a child table);
 * this is a declared, deliberate limit, not an oversight.
 */
export function openBalance(total, received) {
  const t = money(total);
  const r = money(received);
  if (Number.isNaN(t)) return 0;
  const rec = Number.isNaN(r) ? 0 : r;
  return round2(Math.max(t - rec, 0));
}

/**
 * The DERIVED payment status. This is the only definition in the product; no
 * column stores it and no API accepts it.
 */
export function chargePaymentStatus(total, received) {
  const t = money(total);
  const r = money(received);
  const rec = Number.isNaN(r) ? 0 : r;
  // A charge with an unusable total cannot be called paid on the strength of a
  // payment — fail toward "expected", the state that still asks for attention.
  if (Number.isNaN(t) || t <= 0) return rec > 0 ? 'paid' : 'expected';
  if (rec >= t) return 'paid';
  if (rec > 0) return 'partially_paid';
  return 'expected';
}

/**
 * Decorate one charge with its derived money facts. Pure: the input object is
 * never mutated, and no field named `status` is ever written onto the charge.
 */
export function decorateCharge(charge, payments) {
  if (!charge || typeof charge !== 'object') return null;
  const received = chargeReceived(charge.id, payments);
  const total = round2(Number.isNaN(money(charge.amountTotal)) ? 0 : money(charge.amountTotal));
  return {
    ...charge,
    received,
    balance: openBalance(total, received),
    paymentStatus: chargePaymentStatus(total, received),
  };
}

/**
 * The receivables KPI triple, over OPEN charges only.
 *   expected — everything still billed (incl. VAT)
 *   received — everything actually paid against those charges
 *   open     — the sum of per-charge balances, each clamped at 0. Deliberately
 *              NOT `expected - received`: one overpaid charge would otherwise
 *              cancel out another charge's genuinely open balance and the screen
 *              would under-report what is owed.
 *   overpaid — the surplus, so it is visible somewhere rather than swallowed.
 */
export function receivablesTotals(charges, payments) {
  let expected = 0;
  let received = 0;
  let open = 0;
  let overpaid = 0;
  for (const c of Array.isArray(charges) ? charges : []) {
    if (!isChargeOpen(c)) continue;
    const t = money(c.amountTotal);
    const total = Number.isNaN(t) ? 0 : t;
    const rec = chargeReceived(c.id, payments);
    expected += total;
    received += rec;
    open += Math.max(total - rec, 0);
    overpaid += Math.max(rec - total, 0);
  }
  return {
    expected: round2(expected),
    received: round2(received),
    open: round2(open),
    overpaid: round2(overpaid),
  };
}

/**
 * ACTUAL REVENUE, and the no-double-count rule in one function.
 *
 * Payments are the truth for charge-backed revenue. Legacy income transactions
 * predate charges and are the truth for everything else. They are ADDED, never
 * merged: because recording a payment never creates a transaction (and nothing
 * in the product converts one into the other), no shekel can appear in both.
 * Expenses stay transaction-only and are untouched by this slice.
 */
export function actualRevenue(payments, transactions) {
  let fromPayments = 0;
  for (const p of Array.isArray(payments) ? payments : []) {
    const a = money(p && p.amount);
    if (!Number.isNaN(a)) fromPayments += a;
  }
  let fromTransactions = 0;
  for (const t of Array.isArray(transactions) ? transactions : []) {
    if (!t || t.type !== 'income') continue;
    const a = money(t.amount);
    if (!Number.isNaN(a)) fromTransactions += a;
  }
  return {
    fromPayments: round2(fromPayments),
    fromTransactions: round2(fromTransactions),
    total: round2(fromPayments + fromTransactions),
  };
}

// ---------------- validation ----------------

/**
 * Validate + normalize the editable fields of a CHARGE.
 *
 * Over-limit is a visible ERROR, never a silent truncation of saved data
 * (the businessProfile.js rule). A payment status is never accepted, because
 * there is nowhere to put it.
 *
 * `dueDate` is optional: absent -> computed from serviceDate + terms and marked
 * `dueDateSource: 'computed'`; present -> honoured verbatim and marked
 * `'manual'`, so the UI can say which one the user is looking at.
 *
 * @returns {{ ok: boolean, errors: string[], value: null | {
 *   clientId: string|null, quoteId: string|null, kind: string,
 *   paymentTerms: string, serviceDate: string, dueDate: string,
 *   dueDateSource: 'computed'|'manual', amountTotal: number,
 *   description: string|null, invoiceUrl: string|null, lifecycle: 'open' } }}
 */
export function validateCharge(input = {}) {
  const errors = [];
  const src = input && typeof input === 'object' ? input : {};

  const kind = str(src.kind) || 'final';
  if (!CHARGE_KINDS.includes(kind)) errors.push('סוג החיוב אינו מוכר');

  const paymentTerms = str(src.paymentTerms) || 'immediate';
  if (!PAYMENT_TERMS.includes(paymentTerms)) errors.push('תנאי התשלום אינם מוכרים');

  const serviceDate = str(src.serviceDate);
  if (!serviceDate) errors.push('תאריך השירות הוא שדה חובה');
  else if (!isCalendarDate(serviceDate)) errors.push('תאריך השירות חייב להיות בפורמט YYYY-MM-DD');

  // The manual override. A blank string means "no override", not an error.
  const dueRaw = str(src.dueDate);
  if (dueRaw && !isCalendarDate(dueRaw)) errors.push('תאריך הפירעון חייב להיות בפורמט YYYY-MM-DD');

  const amount = money(src.amountTotal);
  if (Number.isNaN(amount)) errors.push('סכום החיוב הוא שדה חובה');
  else if (amount <= 0) errors.push('סכום החיוב חייב להיות גדול מאפס');
  else if (amount > RECEIVABLES_LIMITS.amount) errors.push('סכום החיוב חורג מהמותר');

  const description = str(src.description);
  if (description.length > RECEIVABLES_LIMITS.description) {
    errors.push(`תיאור החיוב ארוך מ-${RECEIVABLES_LIMITS.description} תווים`);
  }

  const invoiceUrl = str(src.invoiceUrl);
  if (invoiceUrl.length > RECEIVABLES_LIMITS.invoiceUrl) {
    errors.push(`קישור החשבונית ארוך מ-${RECEIVABLES_LIMITS.invoiceUrl} תווים`);
  }

  if (errors.length) return { ok: false, errors, value: null };

  const dueDate = dueRaw || computeDueDate(serviceDate, paymentTerms);
  if (!dueDate) {
    // Unreachable given the checks above; kept because a null due date must
    // never reach a NOT NULL column as a silent empty string.
    return { ok: false, errors: ['לא ניתן לחשב תאריך פירעון מהנתונים שהוזנו'], value: null };
  }

  return {
    ok: true,
    errors: [],
    value: {
      clientId: str(src.clientId) || null,
      quoteId: str(src.quoteId) || null,
      kind,
      paymentTerms,
      serviceDate,
      dueDate,
      dueDateSource: dueRaw ? 'manual' : 'computed',
      amountTotal: round2(amount),
      description: description || null,
      invoiceUrl: invoiceUrl || null,
      // Lifecycle is never taken from the caller on create: a charge is born
      // open. Cancelling is its own explicit action.
      lifecycle: 'open',
    },
  };
}

/**
 * Validate + normalize a PAYMENT. `chargeId` is mandatory — a payment that
 * belongs to nothing is not a payment.
 *
 * @returns {{ ok: boolean, errors: string[], value: null | {
 *   chargeId: string, amount: number, paidAt: string } }}
 */
export function validatePayment(input = {}) {
  const errors = [];
  const src = input && typeof input === 'object' ? input : {};

  const chargeId = str(src.chargeId);
  if (!chargeId) errors.push('לא נבחר חיוב לרישום התשלום');

  const amount = money(src.amount);
  if (Number.isNaN(amount)) errors.push('סכום התשלום הוא שדה חובה');
  else if (amount <= 0) errors.push('סכום התשלום חייב להיות גדול מאפס');
  else if (amount > RECEIVABLES_LIMITS.amount) errors.push('סכום התשלום חורג מהמותר');

  const paidAt = str(src.paidAt);
  if (!paidAt) errors.push('תאריך התשלום הוא שדה חובה');
  else if (!isCalendarDate(paidAt)) errors.push('תאריך התשלום חייב להיות בפורמט YYYY-MM-DD');

  if (errors.length) return { ok: false, errors, value: null };
  return { ok: true, errors: [], value: { chargeId, amount: round2(amount), paidAt } };
}

// ---------------- row normalization ----------------

/**
 * Cloud row -> the canonical camelCase in-memory shape. Returns null for a row
 * that cannot be trusted, so a malformed row is dropped rather than rendered as
 * a half-charge with a plausible-looking balance.
 */
export function normalizeChargeRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = str(row.id);
  const userId = str(row.user_id);
  const lifecycle = str(row.lifecycle);
  const kind = str(row.kind);
  const paymentTerms = str(row.payment_terms);
  const amountTotal = money(row.amount_total);
  if (!id || !userId) return null;
  if (!CHARGE_LIFECYCLES.includes(lifecycle)) return null;
  if (!CHARGE_KINDS.includes(kind)) return null;
  if (!PAYMENT_TERMS.includes(paymentTerms)) return null;
  if (Number.isNaN(amountTotal)) return null;
  const dueSource = str(row.due_date_source);
  return {
    id,
    userId,
    clientId: str(row.client_id) || null,
    quoteId: str(row.quote_id) || null,
    kind,
    paymentTerms,
    serviceDate: str(row.service_date) || null,
    dueDate: str(row.due_date) || null,
    dueDateSource: DUE_DATE_SOURCES.includes(dueSource) ? dueSource : 'computed',
    amountTotal: round2(amountTotal),
    description: str(row.description) || null,
    invoiceUrl: str(row.invoice_url) || null,
    lifecycle,
    createdAt: str(row.created_at) || null,
    updatedAt: str(row.updated_at) || null,
  };
}

/** Cloud row -> canonical payment. A payment with no charge or no amount is dropped. */
export function normalizePaymentRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = str(row.id);
  const userId = str(row.user_id);
  const chargeId = str(row.charge_id);
  const amount = money(row.amount);
  if (!id || !userId || !chargeId || Number.isNaN(amount)) return null;
  return {
    id,
    userId,
    chargeId,
    amount: round2(amount),
    paidAt: str(row.paid_at) || null,
    createdAt: str(row.created_at) || null,
    updatedAt: str(row.updated_at) || null,
  };
}

/** Open charges, soonest due first; charges with no due date sort last. */
export function sortChargesByDueDate(charges) {
  return [...(Array.isArray(charges) ? charges : [])]
    .filter(Boolean)
    .sort((a, b) => {
      const da = str(a.dueDate) || '9999-12-31';
      const db = str(b.dueDate) || '9999-12-31';
      if (da !== db) return da.localeCompare(db);
      return str(b.createdAt).localeCompare(str(a.createdAt));
    });
}

/** Newest first — the ordering charges_user_created_idx serves. */
export function sortChargesNewestFirst(charges) {
  return [...(Array.isArray(charges) ? charges : [])]
    .filter(Boolean)
    .sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)));
}

export { round2 as roundMoney, isMoney };
