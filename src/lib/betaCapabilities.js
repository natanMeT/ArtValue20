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
]);

// Memory-only ENTITY mutations — dispatched, reduced into state, but never
// persisted or re-fetched in cloud mode. These are the false-success surface.
export const MEMORY_ONLY_DISPATCH = new Set([
  'ADD_PROJECT', 'UPDATE_PROJECT', 'DELETE_PROJECT',
  'ADD_TASK', 'UPDATE_TASK', 'DELETE_TASK',
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
  'mark_paid', 'add_income', 'add_expense', 'move_pipeline',
  'add_income_from_clients', 'remove_duplicate_clients',
  'add_lead', 'update_lead', 'delete_lead',
  'update_tx', 'delete_tx',
]);

export const JAKE_BETA_UNAVAILABLE_OPS = new Set([
  'add_item', 'update_item', 'add_stock', 'remove_stock', 'delete_item',
  'add_project', 'update_project', 'delete_project',
  'add_task', 'update_task', 'delete_task',
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
    const entity = action.entity || action.scope || action.type2 || 'inventory';
    if (BULK_MEMORY_ONLY_ENTITIES.has(entity)) return JAKE_ACTION.BETA_UNAVAILABLE;
    if (BULK_DURABLE_ENTITIES.has(entity)) return JAKE_ACTION.DURABLE;
    return JAKE_ACTION.UNKNOWN; // unrecognised bulk target → fail closed
  }
  if (JAKE_DURABLE_OPS.has(op)) return JAKE_ACTION.DURABLE;
  if (JAKE_BETA_UNAVAILABLE_OPS.has(op)) return JAKE_ACTION.BETA_UNAVAILABLE;
  return JAKE_ACTION.UNKNOWN;
}

// Which Memory-Only capability an op touches — for grouping the beta message.
function opCapabilityLabel(action) {
  const op = String((action && (action.op || action.type || action.action)) || '');
  if (op === 'delete_all') {
    const entity = action.entity || action.scope || 'inventory';
    if (entity === 'projects') return 'פרויקטים';
    if (entity === 'tasks') return 'משימות';
    return 'מלאי';
  }
  if (op.includes('task')) return 'משימות';
  if (op.includes('project')) return 'פרויקטים';
  if (op.includes('item') || op.includes('stock')) return 'מלאי';
  return '';
}

// Partition a batch of Jake actions for the current mode. In local mode every
// action persists to localStorage (durable) so nothing is blocked. In cloud
// beta mode, durable actions flow to the normal propose→confirm→execute card and
// beta-unavailable / unknown actions are blocked with a calm message.
export function partitionJakeActions(actions, { isCloudBeta } = {}) {
  const list = Array.isArray(actions) ? actions : [];
  if (!isCloudBeta) return { allowed: list, blocked: [], message: '' };
  const allowed = [];
  const blocked = [];
  for (const a of list) {
    const cls = classifyJakeAction(a);
    if (cls === JAKE_ACTION.DURABLE) allowed.push(a);
    else blocked.push(a);
  }
  return { allowed, blocked, message: blocked.length ? betaBlockedMessage(blocked) : '' };
}

// ---- calm Hebrew copy (centralised) -----------------------------------------
export const BETA_MESSAGES = {
  // Tasks / follow-ups screen note.
  tasks: 'שמירת משימות ופולואפים בענן עדיין אינה זמינה בגרסת הבטא.',
  // Generic hidden-module state (Projects / Inventory / Templates).
  moduleTitle: 'עדיין לא בגרסת הבטא',
  moduleHint: 'המודול עדיין אינו זמין בגרסת הבטא.',
};

// One concise Hebrew line explaining why Jake did not perform the request.
export function betaBlockedMessage(blocked) {
  const caps = [...new Set((blocked || []).map(opCapabilityLabel).filter(Boolean))];
  const known = blocked.some((a) => classifyJakeAction(a) === JAKE_ACTION.BETA_UNAVAILABLE);
  if (caps.length) {
    const list = caps.join(' ו');
    return `הפעולה על ${list} עדיין אינה נשמרת בענן בגרסת הבטא, אז לא ביצעתי אותה. ` +
      'לקוחות, לידים, הצעות מחיר ותנועות כספיות כן נשמרים.';
  }
  // Unknown / unclassifiable mutation → fail closed, no success claim.
  return known
    ? 'הפעולה הזו עדיין אינה זמינה לשמירה בענן בגרסת הבטא, אז לא ביצעתי אותה.'
    : 'לא זיהיתי פעולה נתמכת לביצוע, אז לא ביצעתי דבר.';
}

// Product modules hidden from beta navigation (still route-registered, but the
// page renders a restrained unavailable state instead of a creation UI).
export const BETA_HIDDEN_MODULES = new Set(['projects', 'inventory', 'templates']);
