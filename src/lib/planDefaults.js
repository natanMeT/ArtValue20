// ===================================================================
// planDefaults — derive the Monthly Plan's five planning assumptions from the
// account's ALREADY-HYDRATED durable data.
//
// PURE. No network, no `api.js`, no `supabase.js`, no store, no Date.now().
// It receives a plain snapshot object and an injected `now`, and returns
// numbers plus a PROVENANCE label for each one. Nothing here is persisted and
// nothing here is a financial report.
//
// WHY PROVENANCE IS PART OF THE RETURN VALUE, not a UI afterthought:
// a planning number that came from the account and a planning number that is a
// hard-coded default look identical on screen. The screen must be able to say
// which is which for EVERY field, so the deriving layer is what decides it —
// the renderer only prints what it is told.
//
// The fallbacks are CALENDAR_DEFAULTS, imported rather than re-declared, so
// there is exactly one definition of "the default plan" in the product.
// `growthCalendar.js` is READ-ONLY to this module.
// ===================================================================

import { CALENDAR_DEFAULTS } from '../data/growthCalendar.js';
import { quoteTotal } from './calc.js';

// ---- provenance vocabulary --------------------------------------------------
// Every value returned by derivePlanDefaults() carries exactly one of these.
export const PLAN_SOURCES = Object.freeze([
  'default', 'recordedLastMonth', 'acceptedQuotes', 'allQuotes', 'decidedQuotes',
]);

export const PLAN_SOURCE_LABELS = Object.freeze({
  default: 'ברירת מחדל',
  recordedLastMonth: 'לפי הכנסות שנרשמו בחודש שעבר',
  acceptedQuotes: 'מהצעות שאושרו',
  allQuotes: 'מכלל ההצעות',
  decidedQuotes: 'מהצעות שהוכרעו',
});

// ⚠️ TRUTHFULNESS NOTE, shown on screen beside the target whenever it was
// derived. The two income routes are summed on purpose -- that is the widest
// honest reading of "what came in" -- but the same money CAN legitimately be
// recorded on both (a payment against a charge AND an income transaction), so
// this number is a planning starting point and NOT a reconciled accounting
// figure. Saying so is cheaper than being quietly wrong.
export const TARGET_SOURCE_NOTE =
  'סכום ההכנסות שנרשמו בחודש שעבר (תשלומים על חיובים + תנועות הכנסה). ' +
  'אותה הכנסה עשויה להירשם בשני המסלולים, ולכן זו נקודת פתיחה לתכנון — לא דוח כספי סופי.';

// The sentence shown when NOTHING could be derived. Field-level labels already
// say "ברירת מחדל" five times; this states the consequence once, plainly.
export const NO_DATA_NOTE =
  'עדיין אין מספיק נתונים בחשבון — אלה הנחות ברירת מחדל. אפשר לערוך את כולן.';

// ---- small numeric guards (no NaN, no Infinity, no negatives) ---------------
const asArray = (v) => (Array.isArray(v) ? v : []);

/** Finite number or null. Rejects NaN, ±Infinity, non-numeric strings. */
function finite(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// ---- calendar-month matching, by STRING PREFIX -----------------------------
// `payments.paid_at` and `transactions.date` are both PostgreSQL `date`, i.e.
// 'YYYY-MM-DD' strings. Comparing the 'YYYY-MM' prefix is exact and has no
// timezone behaviour at all. `new Date('2026-07-15')` parses as UTC midnight
// and then reads back in LOCAL time, so in any negative-UTC-offset zone it
// reports the previous month -- a bug that would never reproduce here.
export function monthKey(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})(?:\D|$)/.exec(value);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** 'YYYY-MM' of the calendar month BEFORE `now`. Crosses the year boundary. */
export function previousMonthKey(now) {
  const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  let year = d.getFullYear();
  let month = d.getMonth(); // 0-based; subtracting 1 gives the previous month
  if (month === 0) { year -= 1; month = 11; } else { month -= 1; }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// ---- quote helpers ----------------------------------------------------------
/** Mean quote total over `list`, ignoring non-positive totals. null if none. */
function averageQuoteTotal(list) {
  let sum = 0;
  let count = 0;
  for (const q of list) {
    const total = finite(quoteTotal(q));
    if (total === null || total <= 0) continue;
    sum += total;
    count += 1;
  }
  if (count === 0) return null;
  // Rounded to the nearest 100: a planning assumption presented to the agora
  // would imply a precision the estimate does not have.
  return Math.max(1, Math.round(sum / count / 100) * 100);
}

// ---- the deriver ------------------------------------------------------------
/**
 * @param {object} snapshot  { quotes, payments, transactions } -- the store's
 *   already-hydrated, account-scoped data. Missing keys are treated as empty.
 * @param {Date}   now       injected clock. Never read from the environment.
 * @returns {{ values: {target,avgDeal,closeRate,qualifyRate,workDays},
 *             sources: {target,avgDeal,closeRate,qualifyRate,workDays} }}
 */
export function derivePlanDefaults(snapshot = {}, now = undefined) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const quotes = asArray(snap.quotes);
  const payments = asArray(snap.payments);
  const transactions = asArray(snap.transactions);

  // ---- target: income RECORDED in the previous calendar month ----
  const lastMonth = previousMonthKey(now);
  let recorded = 0;
  let sawIncome = false;

  for (const p of payments) {
    if (!p || monthKey(p.paidAt) !== lastMonth) continue;
    const amount = finite(p.amount);
    if (amount === null || amount <= 0) continue;
    recorded += amount;
    sawIncome = true;
  }
  for (const t of transactions) {
    if (!t || t.type !== 'income' || monthKey(t.date) !== lastMonth) continue;
    const amount = finite(t.amount);
    if (amount === null || amount <= 0) continue;
    recorded += amount;
    sawIncome = true;
  }

  const target = sawIncome ? Math.round(recorded) : CALENDAR_DEFAULTS.target;
  const targetSource = sawIncome ? 'recordedLastMonth' : 'default';

  // ---- avgDeal: accepted quotes, then all quotes, then the default ----
  const accepted = quotes.filter((q) => q && q.status === 'accepted');
  const rejected = quotes.filter((q) => q && q.status === 'rejected');

  const avgAccepted = averageQuoteTotal(accepted);
  const avgAll = avgAccepted === null ? averageQuoteTotal(quotes) : null;

  let avgDeal = CALENDAR_DEFAULTS.avgDeal;
  let avgDealSource = 'default';
  if (avgAccepted !== null) {
    avgDeal = avgAccepted;
    avgDealSource = 'acceptedQuotes';
  } else if (avgAll !== null) {
    avgDeal = avgAll;
    avgDealSource = 'allQuotes';
  }

  // ---- closeRate: accepted / DECIDED quotes ----
  // The denominator is deliberately accepted+rejected, NOT every quote. A
  // draft or a quote still awaiting an answer has not lost -- counting it as a
  // loss would report a close rate lower than reality and inflate every
  // downstream activity number.
  const decided = accepted.length + rejected.length;
  let closeRate = CALENDAR_DEFAULTS.closeRate;
  let closeRateSource = 'default';
  if (decided > 0) {
    // clamped to >=1: an all-rejected history must not divide by zero
    // downstream, and 0% would make the plan infinite rather than honest.
    closeRate = clamp(Math.round((accepted.length / decided) * 100), 1, 100);
    closeRateSource = 'decidedQuotes';
  }

  // ---- qualifyRate / workDays: NO SOURCE EXISTS ----
  // Nothing in the schema records outreach->interested conversion or available
  // working days. Inventing a derivation would be a guess wearing a label that
  // says "from your data". They stay defaults, always, and say so.
  return {
    values: {
      target,
      avgDeal,
      closeRate,
      qualifyRate: CALENDAR_DEFAULTS.qualifyRate,
      workDays: CALENDAR_DEFAULTS.workDays,
    },
    sources: {
      target: targetSource,
      avgDeal: avgDealSource,
      closeRate: closeRateSource,
      qualifyRate: 'default',
      workDays: 'default',
    },
  };
}

/** True when at least one assumption came from the account's own data. */
export function hasDerivedValue(sources) {
  if (!sources || typeof sources !== 'object') return false;
  return Object.values(sources).some((s) => s && s !== 'default');
}
