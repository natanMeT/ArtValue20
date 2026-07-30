// ===================================================================
// Client Profile slice 1 — the pure selectors behind the client profile.
//
// WHAT THIS IS: a read-only projection of data the product ALREADY holds
// (clients, tasks, appointments, charges, payments, quotes) onto one client.
// There is no new table, no new column, no migration and no write path here —
// every function in this file is pure and returns new arrays.
//
// WHERE THE DATA COMES FROM, precisely:
//   clients / tasks / quotes / charges / payments  -> store `data`, filled by
//     fetchAll() in src/lib/api.js (RLS-scoped to the signed-in account).
//   appointments                                   -> listAppointments() in
//     src/lib/api.js, read on demand by the profile panel. They are NOT in the
//     store, so in local/demo mode there are none to show and the panel says so
//     rather than implying the client has none.
//
// TWO LINKS TO A CHARGE, both real. `charges.client_id` is the direct link, and
// `charges.quote_id` reaches the client through the quote. A charge attached
// only to the quote is still that client's money, so both are collected and
// de-duplicated by id. Nothing invents a link that the row does not carry.
//
// PAYMENTS HAVE NO CLIENT COLUMN. `payments` links to `charges` only, so a
// client's receipts are exactly the payments of that client's charges — which
// is why the charge set is resolved first.
//
// ACCOUNT ISOLATION. Every collection is already RLS-scoped, but `userId` is
// accepted and enforced here too: a row carrying a different owner is dropped,
// never rendered. Two accounts' rows can never appear in one profile even if a
// stale read put them in the same array.
// ===================================================================

import {
  isChargeOpen, decorateCharge, receivablesTotals,
} from '../../lib/receivables.js';
import { sortByStart } from '../../lib/schedule.js';

const str = (v) => (v == null ? '' : String(v)).trim();
const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

/** A row belongs to the profile only if it carries no foreign owner. */
function sameOwner(row, userId) {
  if (!userId) return true;
  const owner = str(row.userId);
  return !owner || owner === str(userId);
}

const linkedTo = (row, clientId) => str(row.clientId) === str(clientId);

/** Open tasks first, each group by deadline (undated last), then by title. */
function byDeadline(a, b) {
  const da = str(a.deadline) || '9999-12-31';
  const db = str(b.deadline) || '9999-12-31';
  if (da !== db) return da.localeCompare(db);
  return str(a.title).localeCompare(str(b.title));
}

/**
 * The client's tasks, split into what still needs doing and what is finished.
 * `status === 'done'` is the same definition /tasks uses; nothing else counts.
 */
export function clientTasks(clientId, tasks, userId) {
  const mine = arr(tasks).filter((t) => linkedTo(t, clientId) && sameOwner(t, userId));
  return {
    open: mine.filter((t) => t.status !== 'done').sort(byDeadline),
    done: mine.filter((t) => t.status === 'done').sort(byDeadline),
  };
}

/** The client's diary rows, earliest first. Planned ones are surfaced apart. */
export function clientAppointments(clientId, appointments, userId) {
  const mine = arr(appointments).filter((a) => linkedTo(a, clientId) && sameOwner(a, userId));
  const all = sortByStart(mine);
  return { all, planned: all.filter((a) => a.status === 'planned') };
}

/** The client's quotes, newest first by date then id. */
export function clientQuotes(clientId, quotes, userId) {
  return arr(quotes)
    .filter((q) => linkedTo(q, clientId) && sameOwner(q, userId))
    .sort((a, b) => str(b.date).localeCompare(str(a.date)) || str(b.id).localeCompare(str(a.id)));
}

/**
 * Charges reached EITHER directly (client_id) OR through one of the client's
 * quotes (quote_id). De-duplicated by id — a charge carrying both links is one
 * charge, and counting it twice would double the balance.
 */
export function clientCharges(clientId, charges, quotes, userId) {
  const quoteIds = new Set(clientQuotes(clientId, quotes, userId).map((q) => str(q.id)));
  const seen = new Set();
  const out = [];
  for (const c of arr(charges)) {
    if (!sameOwner(c, userId)) continue;
    const id = str(c.id);
    if (!id || seen.has(id)) continue;
    if (!linkedTo(c, clientId) && !quoteIds.has(str(c.quoteId))) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}

/** The payments belonging to those charges, newest receipt first. */
export function clientPayments(charges, payments, userId) {
  const ids = new Set(arr(charges).map((c) => str(c.id)).filter(Boolean));
  return arr(payments)
    .filter((p) => sameOwner(p, userId) && ids.has(str(p.chargeId)))
    .sort((a, b) => str(b.paidAt).localeCompare(str(a.paidAt)));
}

/**
 * The client's money picture. Delegates to the ONE definition of expected /
 * received / open / overpaid that Finance already ships (receivablesTotals),
 * so the profile can never disagree with the Finance screen. Cancelled charges
 * are excluded from the totals there, and are returned separately here so the
 * panel can still show that they exist.
 */
export function clientMoney(clientId, { charges, payments, quotes } = {}, userId) {
  const mine = clientCharges(clientId, charges, quotes, userId);
  const receipts = clientPayments(mine, payments, userId);
  const open = mine.filter(isChargeOpen);
  return {
    charges: mine.map((c) => decorateCharge(c, receipts)).filter(Boolean),
    openCharges: open.map((c) => decorateCharge(c, receipts)).filter(Boolean),
    cancelledCount: mine.length - open.length,
    payments: receipts,
    totals: receivablesTotals(mine, receipts),
  };
}

/**
 * THE NEXT ACTION — one line, and it is never invented.
 *
 * Order of preference, each step falling through only when there is nothing
 * real to show: the follow-up the user typed on the client itself, then the
 * earliest open task, then the earliest planned diary row. When none of the
 * three exists the answer is null and the panel renders an empty state; it does
 * not manufacture a suggestion out of the client's status.
 */
export function clientNextAction(client, { tasks, appointments } = {}, userId) {
  if (!client) return null;
  const text = str(client.nextAction);
  if (text) return { source: 'client', text, date: str(client.nextActionDate) || null };

  const [task] = clientTasks(client.id, tasks, userId).open;
  if (task) return { source: 'task', text: str(task.title), date: str(task.deadline) || null, id: task.id };

  const [appt] = clientAppointments(client.id, appointments, userId).planned;
  if (appt) return { source: 'appointment', text: str(appt.title), date: str(appt.startAt) || null, id: appt.id };

  return null;
}

/**
 * Everything the profile panel renders, from one call. Kept here (not in the
 * component) so the acceptance tests can assert on it without a DOM.
 */
export function buildClientProfile(client, data = {}, appointments = [], userId) {
  if (!client) return null;
  const money = clientMoney(client.id, data, userId);
  return {
    tasks: clientTasks(client.id, data.tasks, userId),
    appointments: clientAppointments(client.id, appointments, userId),
    quotes: clientQuotes(client.id, data.quotes, userId),
    money,
    nextAction: clientNextAction(client, { tasks: data.tasks, appointments }, userId),
  };
}
