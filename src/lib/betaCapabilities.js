// ===================================================================
// Beta capability classification — ONE source of truth for "false-success
// containment" (slice S0A). In authenticated cloud beta mode, a set of
// entity mutations are Memory-Only: they change React state but are NOT
// durably persisted (store.jsx `persist()` has no route for them and
// api.js `fetchAll()` never reads them back), so on refresh they vanish.
//
// This module classifies, in one place:
//   1. store dispatch action types → durable vs memory-only  (isMemoryOnlyDispatch)
//   2. Jake action ops             → durable / beta_unavailable / unknown
//   3. which product modules are hidden in beta               (BETA_HIDDEN_MODULES)
//   4. the calm Hebrew copy used everywhere containment surfaces
//
// Pure, dependency-free. Enforcement sites (store.jsx, Assistant.jsx, pages,
// Sidebar) import from here and gate on the authenticated-cloud signal
// (isSupabaseConfigured) — this module never decides the mode itself.
// ===================================================================

// Durable dispatch action types — EXACTLY the ones store.jsx `persist()` routes
// to a Supabase api.* call. Keep this in lockstep with persist() in store.jsx.
export const DURABLE_DISPATCH = new Set([
  'ADD_CLIENT', 'UPDATE_CLIENT', 'DELETE_CLIENT',
  'ADD_QUOTE', 'UPDATE_QUOTE', 'DELETE_QUOTE',
  'ADD_TX', 'UPDATE_TX', 'DELETE_TX',
  'ADD_LEAD', 'UPDATE_LEAD', 'DELETE_LEAD',
  // S0B: tasks are now durably persisted (store.jsx persist() + api.*Task + fetchAll).
  'ADD_TASK', 'UPDATE_TASK', 'DELETE_TASK',
]);

// Memory-only ENTITY mutations — dispatched, reduced into state, but never
// persisted or re-fetched in cloud mode. These are the false-success surface.
export const MEMORY_ONLY_DISPATCH = new Set([
  'ADD_PROJECT', 'UPDATE_PROJECT', 'DELETE_PROJECT',
  // S0B: ADD_TASK / UPDATE_TASK / DELETE_TASK moved to DURABLE_DISPATCH.
  'ADD_ITEM', 'UPDATE_ITEM', 'DELETE_ITEM',
  'ADD_LINK', 'UPDATE_LINK', 'DELETE_LINK',
  'ADD_FILE', 'UPDATE_FILE', 'DELETE_FILE',
  'ADD_COMM', 'UPDATE_COMM', 'DELETE_COMM',
]);

// A dispatch that changes a Memory-Only entity — the store firewall blocks these
// in authenticated cloud mode so nothing mutates and no caller can claim a save.
export function isMemoryOnlyDispatch(type) {
  return MEMORY_ONLY_DISPATCH.has(type);
}

// ---- Jake action-op classification ------------------------------------------
// Every op here maps to the store dispatch type(s) its handler emits
// (src/lib/jakeAgent.js ACTION_HANDLERS). Ops whose ONLY durable effect is a
// durable dispatch are allowed; ops that resolve to a Memory-Only dispatch are
// beta-unavailable. Anything not listed fails closed as UNKNOWN.
export const JAKE_DURABLE_OPS = new Set([
  'add_client', 'update_client', 'delete_client',
  'add_quote', 'update_quote_status', 'delete_quote',
  // add_income / add_expense dispatch a persisted ADD_TX → durable.
  'add_income', 'add_expense', 'move_pipeline',
  'add_income_from_clients', 'remove_duplicate_clients',
  'add_lead', 'update_lead', 'delete_lead',
  'update_tx', 'delete_tx',
  // S0B: individual task ops now dispatch durable ADD/UPDATE/DELETE_TASK.
  'add_task', 'update_task', 'delete_task',
]);

export const JAKE_BETA_UNAVAILABLE_OPS = new Set([
  'add_item', 'update_item', 'add_stock', 'remove_stock', 'delete_item',
  'add_project', 'update_project', 'delete_project',
  // S0B: add_task / update_task / delete_task moved to JAKE_DURABLE_OPS.
  // mark_paid dispatches only UPDATE_CLIENT and relies on the reducer's
  // syncClientIncome() to SYNTHESISE an auto income transaction in memory —
  // that transaction is never persisted (no ADD_TX), so the "income recorded"
  // claim is false in cloud mode. Not durable → beta-unavailable.
  'mark_paid',
]);

// delete_all (bulk) is entity-scoped: only durable entities may proceed.
const BULK_MEMORY_ONLY_ENTITIES = new Set(['inventory', 'projects', 'tasks']);
const BULK_DURABLE_ENTITIES = new Set(['clients', 'leads', 'quotes', 'transactions']);

export const JAKE_ACTION = {
  DURABLE: 'durable',
  BETA_UNAVAILABLE: 'beta_unavailable',
  UNKNOWN: 'unknown',
};

// Classify a single Jake action object. `op` is read from the action so callers
// can pass the raw action straight through.
export function classifyJakeAction(action) {
  const op = action && (action.op || action.type || action.action);
  if (!op) return JAKE_ACTION.UNKNOWN;
  if (op === 'delete_all') {
    // Fail closed: a missing/empty/unknown bulk target is NEVER assumed to be
    // inventory (or anything else). Only explicitly recognised entities classify.
    const entity = action.entity || action.scope || action.type2;
    if (!entity) return JAKE_ACTION.UNKNOWN;
    if (BULK_MEMORY_ONLY_ENTITIES.has(entity)) return JAKE_ACTION.BETA_UNAVAILABLE;
    if (BULK_DURABLE_ENTITIES.has(entity)) return JAKE_ACTION.DURABLE;
    return JAKE_ACTION.UNKNOWN; // unrecognised bulk target → fail closed
  }
  if (JAKE_DURABLE_OPS.has(op)) return JAKE_ACTION.DURABLE;
  if (JAKE_BETA_UNAVAILABLE_OPS.has(op)) return JAKE_ACTION.BETA_UNAVAILABLE;
  return JAKE_ACTION.UNKNOWN;
}

// ---- auto-income synthesis guard --------------------------------------------
// syncClientIncome() (store.jsx reducer) SYNTHESISES an auto income transaction
// whenever a client resolves to completed_paid with value>0 — on ADD_CLIENT and
// UPDATE_CLIENT. That transaction is memory-only (persist() writes just the
// client row; there is no ADD_TX). So a Jake add_client/update_client payload
// that lands a client in completed_paid+value would make Jake claim an income
// that vanishes on refresh. This detects that payload from the action + a live
// (read-only) client snapshot — bounded, no lookup beyond the in-memory list.
const PAID_STATUS = new Set([
  'completed_paid', 'שולם', 'הושלם ושולם', 'הושלם ועבר תשלום',
]);
const isPaidStatus = (s) => s != null && PAID_STATUS.has(String(s).trim().toLowerCase());
const num = (v) => Number(v) || 0;

function findClientByRef(clients, ref) {
  const q = String(ref || '').trim().toLowerCase();
  if (!q) return null;
  const list = Array.isArray(clients) ? clients : [];
  return (
    list.find((c) => (c.name || '').toLowerCase() === q) ||
    list.find((c) => { const n = (c.name || '').toLowerCase(); return n && (n.includes(q) || q.includes(n)); }) ||
    null
  );
}

export function triggersAutoIncome(action, clients = []) {
  const op = action && (action.op || action.type || action.action);
  if (op === 'add_client') {
    return isPaidStatus(action.status) && num(action.value) > 0;
  }
  if (op === 'update_client') {
    const s = (action.set && typeof action.set === 'object') ? { ...action, ...action.set } : action;
    const c = findClientByRef(clients, s.client || s.name || s.match);
    const status = s.status != null ? s.status : c && c.status;
    const rawVal = s.value ?? s.newValue ?? s.amount;
    const value = rawVal != null ? num(rawVal) : (c ? num(c.value) : 0);
    return isPaidStatus(status) && value > 0;
  }
  return false;
}

// Which Memory-Only capability a module op touches — for grouping the message.
function opCapabilityLabel(action) {
  const op = String((action && (action.op || action.type || action.action)) || '');
  if (op === 'delete_all') {
    const entity = action.entity || action.scope;
    if (entity === 'projects') return 'פרויקטים';
    if (entity === 'tasks') return 'משימות';
    if (entity === 'inventory') return 'מלאי';
    return '';
  }
  if (op.includes('task')) return 'משימות';
  if (op.includes('project')) return 'פרויקטים';
  if (op.includes('item') || op.includes('stock')) return 'מלאי';
  return '';
}

// Why a given blocked action was contained (drives the calm message).
const REASON = { MODULE: 'memory_module', INCOME: 'auto_income', UNKNOWN: 'unknown' };
function blockReason(action, clients) {
  const op = action && (action.op || action.type || action.action);
  if (op === 'mark_paid') return REASON.INCOME;
  if ((op === 'add_client' || op === 'update_client') && triggersAutoIncome(action, clients)) return REASON.INCOME;
  const cls = classifyJakeAction(action);
  if (cls === JAKE_ACTION.BETA_UNAVAILABLE) return REASON.MODULE;
  return REASON.UNKNOWN;
}

// Partition a batch of Jake actions for the current mode. In local mode every
// action persists to localStorage (durable) so nothing is blocked. In cloud
// beta mode, durable actions flow to the normal propose→confirm→execute card and
// beta-unavailable / unknown / non-durable-income actions are blocked with a
// calm message. `clients` is a live read-only snapshot used only to detect the
// auto-income-synthesis payload — no external lookup.
export function partitionJakeActions(actions, { isCloudBeta, clients = [] } = {}) {
  const list = Array.isArray(actions) ? actions : [];
  if (!isCloudBeta) return { allowed: list, blocked: [], message: '' };
  const allowed = [];
  const blocked = [];
  for (const a of list) {
    const durable = classifyJakeAction(a) === JAKE_ACTION.DURABLE;
    // A durable-op payload that would synthesise a memory-only auto income is
    // NOT fully durable → contain it too (add_client/update_client → completed_paid).
    if (durable && !triggersAutoIncome(a, clients)) allowed.push(a);
    else blocked.push(a);
  }
  return { allowed, blocked, message: blocked.length ? betaBlockedMessage(blocked, clients) : '' };
}

// ---- calm Hebrew copy (centralised) -----------------------------------------
export const BETA_MESSAGES = {
  // Generic hidden-module state (Projects / Inventory / Templates / Activity).
  // (S0B removed the tasks/follow-ups note — both are now durably persisted.)
  moduleTitle: 'עדיין לא בגרסת הבטא',
  moduleHint: 'המודול עדיין אינו זמין בגרסת הבטא.',
};

// One concise, truthful Hebrew message explaining why Jake did not perform the
// request. Groups blocked actions by reason (Memory-Only module / non-durable
// auto-income / unknown) and never claims anything was recorded.
export function betaBlockedMessage(blocked, clients = []) {
  const list = Array.isArray(blocked) ? blocked : [];
  const reasons = new Set(list.map((a) => blockReason(a, clients)));
  const parts = [];
  if (reasons.has(REASON.MODULE)) {
    const caps = [...new Set(list
      .filter((a) => blockReason(a, clients) === REASON.MODULE)
      .map(opCapabilityLabel).filter(Boolean))];
    parts.push(caps.length
      ? `הפעולה על ${caps.join(' ו')} עדיין אינה נשמרת בענן בגרסת הבטא, אז לא ביצעתי אותה.`
      : 'הפעולה הזו עדיין אינה זמינה לשמירה בענן בגרסת הבטא, אז לא ביצעתי אותה.');
  }
  if (reasons.has(REASON.INCOME)) {
    parts.push('רישום תשלום/הכנסה אוטומטית מלקוח עדיין אינו נשמר בענן בגרסת הבטא, אז לא ביצעתי אותו. ' +
      'אפשר לרשום הכנסה ישירה שכן נשמרת.');
  }
  if (!parts.length) {
    // Only unknown/unclassifiable mutations.
    return 'לא זיהיתי פעולה נתמכת לשמירה בענן בגרסת הבטא, אז לא ביצעתי דבר.';
  }
  parts.push('לקוחות, לידים, הצעות מחיר ותנועות כספיות כן נשמרים.');
  return parts.join(' ');
}

// Product modules hidden from beta navigation (still route-registered, but the
// page renders a restrained unavailable state instead of a creation UI). Activity
// is included: its entries are reducer-generated, memory-only, absent from
// fetchAll() — they disappear on refresh, so it must not be presented as durable.
export const BETA_HIDDEN_MODULES = new Set(['projects', 'inventory', 'templates', 'activity']);
