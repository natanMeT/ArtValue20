import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { buildSeed, uid } from '../data/seed.js';
import { OUTREACH_EXTRA, OUTREACH_SEED_VERSION } from '../data/outreach.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import * as api from '../lib/api.js';
import { isMemoryOnlyDispatch, isWholeStoreReplaceDispatch } from '../lib/betaCapabilities.js';
import { userFacingError } from '../lib/userFacingError.js';
import { createReconcileScheduler } from '../lib/reconcileScheduler.js';

const DATA_KEY = 'artvalue_data';
const THEME_KEY = 'artvalue_theme';

const EMPTY = {
  clients: [], quotes: [], transactions: [], outreachLeads: [],
  projects: [], tasks: [], plinks: [], pfiles: [], comms: [], inventory: [],
  activity: [], // audit log / memory — append-only event trail (last 200)
  businessProfile: null, // S0D: durable per-account Business Context (null = unconfigured)
  // F1 Core Receivables: expected billing (charges) and money that actually
  // arrived (payments). CLOUD-ONLY — there is no seed, no local reducer entry
  // point and no localStorage fallback, so in local/demo mode these stay empty
  // and the Finance screen says so rather than showing a form that saves nothing.
  charges: [], payments: [],
  meta: {},
};

// Ensure the audit-log array exists (backward-compat for stores created before it).
function ensureActivity(d) { if (d && !Array.isArray(d.activity)) d.activity = []; return d; }

// ---------------- localStorage helpers ----------------
function loadLocal() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return ensureActivity(buildSeed());
    const parsed = JSON.parse(raw);
    if (!parsed.clients || !parsed.quotes || !parsed.transactions) return ensureActivity(buildSeed());
    // backward-compat: backfill modules added in later versions
    if (!parsed.outreachLeads) parsed.outreachLeads = buildSeed().outreachLeads;
    if (!parsed.inventory) parsed.inventory = [];
    return ensureActivity(migrateProduction(migrateStudio(migrateOutreach(parsed))));
  } catch {
    return ensureActivity(buildSeed());
  }
}

// One-time production cleanup: clear the demo customer data, keep the
// Lead-Research ideas. Runs once per install (gated by meta.prodV).
function migrateProduction(parsed) {
  if (parsed.meta?.prodV >= 1) return parsed;
  return {
    ...parsed,
    clients: [], quotes: [], transactions: [],
    projects: [], tasks: [], plinks: [], pfiles: [], comms: [],
    meta: { ...(parsed.meta || {}), prodV: 1 },
  };
}

// One-time seeding of the studio modules into an existing local store.
function migrateStudio(parsed) {
  if (parsed.meta?.studioV >= 1) return parsed;
  const s = buildSeed();
  const out = { ...parsed };
  if (!parsed.projects) out.projects = s.projects;
  if (!parsed.tasks) out.tasks = s.tasks;
  if (!parsed.plinks) out.plinks = s.plinks;
  if (!parsed.pfiles) out.pfiles = s.pfiles;
  if (!parsed.comms) out.comms = s.comms;
  // enrich existing clients with next-action + pipeline fields
  const enriched = (parsed.clients || []).map((c) => ({
    nextAction: '', nextActionDate: null,
    pipelineStage: c.pipelineStage || 'lead',
    ...c,
  }));
  // add demo clients referenced by the seeded projects, if missing
  const haveIds = new Set(enriched.map((c) => c.id));
  const missing = s.clients.filter((c) => ['cl_tzipori', 'cl_michaelfish'].includes(c.id) && !haveIds.has(c.id));
  out.clients = [...missing, ...enriched];
  out.meta = { ...(parsed.meta || {}), studioV: 1 };
  return out;
}

// One-time append of newly-added starter leads to an existing local list.
// Version-gated + id-keyed: never duplicates, never resurrects deleted leads.
function migrateOutreach(parsed) {
  const seedV = parsed.meta?.outreachSeedV || 0;
  if (seedV >= OUTREACH_SEED_VERSION) return parsed;
  const existingIds = new Set((parsed.outreachLeads || []).map((l) => l.id));
  const toAdd = OUTREACH_EXTRA.filter((e) => !existingIds.has(e.id)).map((e) => ({
    id: e.id, name: e.name, category: e.category, status: 'pending', clientId: null, need: e.need || '',
  }));
  return {
    ...parsed,
    outreachLeads: [...(parsed.outreachLeads || []), ...toAdd],
    meta: { ...(parsed.meta || {}), outreachSeedV: OUTREACH_SEED_VERSION },
  };
}

// Keep an auto income transaction in sync with a "completed & paid" client.
// Linked by clientId + auto:true. Created/updated/removed as the client changes.
function syncClientIncome(transactions, client) {
  const list = transactions || [];
  const existing = list.find((t) => t.auto && t.clientId === client.id);
  const paid = client.status === 'completed_paid' && Number(client.value) > 0;
  if (paid) {
    const tx = {
      id: existing?.id || uid('tx'),
      type: 'income',
      amount: Number(client.value) || 0,
      category: 'פרויקט',
      date: client.paidDate || client.date || new Date().toISOString().slice(0, 10),
      description: `תשלום פרויקט · ${client.name}`,
      clientId: client.id,
      auto: true,
    };
    return existing ? list.map((t) => (t.id === existing.id ? { ...t, ...tx } : t)) : [tx, ...list];
  }
  return existing ? list.filter((t) => t.id !== existing.id) : list;
}

// ---------------- activity log (audit memory) ----------------
// Append-only event trail so the app (and ג'יק) can answer "what changed / what
// was X before" from REAL recorded history instead of guessing. Capped at 200.
const ils = (n) => (Number(n) || 0).toLocaleString('he-IL');
function act(kind, summary, extra = {}) {
  return { id: uid('ev'), ts: new Date().toISOString(), kind, summary, ...extra };
}
function pushAct(state, entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  return [...list, ...(state.activity || [])].slice(0, 200);
}

// ---------------- pure reducer (shared by both modes for in-memory state) ----------------
// S0A: `action.suppressAutoIncome` (set by the CLOUD dispatch, never by callers)
// skips syncClientIncome() — the synthesized auto income transaction is Memory-
// Only in cloud mode (persist() writes only the client; there is no ADD_TX), so
// it would appear in Finance and vanish on refresh. The reducer stays pure and
// mode-unaware: the flag is data on the action, applied at the store boundary.
export function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return buildSeed();
    case 'IMPORT':
      return action.payload;

    case 'ADD_CLIENT': {
      const client = { ...action.payload, id: action.payload.id || uid('cl') };
      const ev = act('client_add', `נוסף לקוח "${client.name}"${Number(client.value) ? ` (שווי ${ils(client.value)} ₪)` : ''}`, { entity: 'client', name: client.name, after: Number(client.value) || 0 });
      return { ...state, clients: [client, ...state.clients], transactions: action.suppressAutoIncome ? state.transactions : syncClientIncome(state.transactions, client), activity: pushAct(state, ev) };
    }
    case 'UPDATE_CLIENT': {
      const prev = state.clients.find((c) => c.id === action.payload.id);
      const clients = state.clients.map((c) => (c.id === action.payload.id ? { ...c, ...action.payload } : c));
      const merged = clients.find((c) => c.id === action.payload.id);
      const evs = [];
      if (prev && merged) {
        if (action.payload.value !== undefined && Number(prev.value || 0) !== Number(merged.value || 0)) {
          evs.push(act('client_value', `שווי "${merged.name}": ${ils(prev.value)} ₪ → ${ils(merged.value)} ₪`, { entity: 'client', name: merged.name, before: Number(prev.value) || 0, after: Number(merged.value) || 0 }));
        }
        if (action.payload.status !== undefined && prev.status !== merged.status) {
          evs.push(act('client_status', `סטטוס "${merged.name}": ${prev.status} → ${merged.status}`, { entity: 'client', name: merged.name, before: prev.status, after: merged.status }));
        }
      }
      return { ...state, clients, transactions: merged && !action.suppressAutoIncome ? syncClientIncome(state.transactions, merged) : state.transactions, activity: evs.length ? pushAct(state, evs) : state.activity };
    }
    case 'DELETE_CLIENT': {
      const gone = state.clients.find((c) => c.id === action.id);
      // F1: MIRROR THE DATABASE. charges_client_same_owner_fk is
      // ON DELETE SET NULL (client_id) and quotes cascade — so after this delete
      // the server holds charges with client_id NULL, and with quote_id NULL for
      // any charge that pointed at one of the cascaded quotes. Leaving the local
      // charge objects carrying the dead ids means opening and saving that charge
      // resubmits a reference that no longer exists and fails the FK.
      const goneQuoteIds = new Set(state.quotes.filter((q) => q.clientId === action.id).map((q) => q.id));
      return {
        ...state,
        clients: state.clients.filter((c) => c.id !== action.id),
        quotes: state.quotes.filter((q) => q.clientId !== action.id),
        transactions: state.transactions.filter((t) => !(t.auto && t.clientId === action.id)),
        charges: (state.charges || []).map((c) => (
          (c.clientId === action.id || goneQuoteIds.has(c.quoteId))
            ? {
              ...c,
              clientId: c.clientId === action.id ? null : c.clientId,
              quoteId: goneQuoteIds.has(c.quoteId) ? null : c.quoteId,
            }
            : c
        )),
        activity: gone ? pushAct(state, act('client_delete', `נמחק לקוח "${gone.name}"`, { entity: 'client', name: gone.name })) : state.activity,
      };
    }

    case 'ADD_QUOTE':
      return { ...state, quotes: [{ ...action.payload, id: action.payload.id || uid('qt') }, ...state.quotes] };
    case 'UPDATE_QUOTE':
      return { ...state, quotes: state.quotes.map((q) => (q.id === action.payload.id ? { ...q, ...action.payload } : q)) };
    case 'DELETE_QUOTE':
      return {
        ...state,
        quotes: state.quotes.filter((q) => q.id !== action.id),
        // F1: mirrors charges_quote_same_owner_fk ON DELETE SET NULL (quote_id).
        // A charge outlives the quote it came from; only the link goes.
        charges: (state.charges || []).map((c) => (c.quoteId === action.id ? { ...c, quoteId: null } : c)),
      };

    case 'ADD_TX': {
      const tx = { ...action.payload, id: action.payload.id || uid('tx') };
      const inc = tx.type === 'income';
      const ev = act(inc ? 'income' : 'expense', `${inc ? 'נרשמה הכנסה' : 'נרשמה הוצאה'} ${ils(tx.amount)} ₪${tx.description ? ` · ${tx.description}` : ''}`, { amount: Number(tx.amount) || 0 });
      return { ...state, transactions: [tx, ...state.transactions], activity: pushAct(state, ev) };
    }
    case 'UPDATE_TX':
      return { ...state, transactions: state.transactions.map((t) => (t.id === action.payload.id ? { ...t, ...action.payload } : t)) };
    case 'DELETE_TX':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id) };

    // ---- outreach leads ----
    case 'ADD_LEAD':
      return { ...state, outreachLeads: [{ ...action.payload, id: action.payload.id || uid('lead') }, ...(state.outreachLeads || [])] };
    case 'UPDATE_LEAD':
      return { ...state, outreachLeads: (state.outreachLeads || []).map((l) => (l.id === action.payload.id ? { ...l, ...action.payload } : l)) };
    case 'DELETE_LEAD':
      return { ...state, outreachLeads: (state.outreachLeads || []).filter((l) => l.id !== action.id) };

    // ---- projects (cascade tasks/links/files/comms on delete) ----
    case 'ADD_PROJECT':
      return { ...state, projects: [{ ...action.payload, id: action.payload.id || uid('pr') }, ...(state.projects || [])] };
    case 'UPDATE_PROJECT':
      return { ...state, projects: (state.projects || []).map((p) => (p.id === action.payload.id ? { ...p, ...action.payload } : p)) };
    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: (state.projects || []).filter((p) => p.id !== action.id),
        tasks: (state.tasks || []).filter((t) => t.projectId !== action.id),
        plinks: (state.plinks || []).filter((l) => l.projectId !== action.id),
        pfiles: (state.pfiles || []).filter((f) => f.projectId !== action.id),
        comms: (state.comms || []).filter((c) => c.projectId !== action.id),
      };

    // ---- tasks ----
    case 'ADD_TASK':
      return { ...state, tasks: [{ ...action.payload, id: action.payload.id || uid('tk') }, ...(state.tasks || [])] };
    case 'UPDATE_TASK':
      return { ...state, tasks: (state.tasks || []).map((t) => (t.id === action.payload.id ? { ...t, ...action.payload } : t)) };
    case 'DELETE_TASK':
      return { ...state, tasks: (state.tasks || []).filter((t) => t.id !== action.id) };

    // ---- project links ----
    case 'ADD_LINK':
      return { ...state, plinks: [{ ...action.payload, id: action.payload.id || uid('ln') }, ...(state.plinks || [])] };
    case 'UPDATE_LINK':
      return { ...state, plinks: (state.plinks || []).map((l) => (l.id === action.payload.id ? { ...l, ...action.payload } : l)) };
    case 'DELETE_LINK':
      return { ...state, plinks: (state.plinks || []).filter((l) => l.id !== action.id) };

    // ---- project files ----
    case 'ADD_FILE':
      return { ...state, pfiles: [{ ...action.payload, id: action.payload.id || uid('fl') }, ...(state.pfiles || [])] };
    case 'UPDATE_FILE':
      return { ...state, pfiles: (state.pfiles || []).map((f) => (f.id === action.payload.id ? { ...f, ...action.payload } : f)) };
    case 'DELETE_FILE':
      return { ...state, pfiles: (state.pfiles || []).filter((f) => f.id !== action.id) };

    // ---- inventory ----
    case 'ADD_ITEM':
      return { ...state, inventory: [{ ...action.payload, id: action.payload.id || uid('it') }, ...(state.inventory || [])] };
    case 'UPDATE_ITEM':
      return { ...state, inventory: (state.inventory || []).map((i) => (i.id === action.payload.id ? { ...i, ...action.payload } : i)) };
    case 'DELETE_ITEM':
      return { ...state, inventory: (state.inventory || []).filter((i) => i.id !== action.id) };

    // ---- business profile (S0D) ----
    case 'SAVE_BUSINESS_PROFILE':
      return { ...state, businessProfile: action.payload };

    // ---- receivables (F1) ----
    // These cases apply ONLY AFTER the server has confirmed the write (see the
    // confirmed-write branch in dispatch). They are never optimistic.
    //
    // NOTE WHAT IS ABSENT AND MUST STAY ABSENT: not one of these cases touches
    // `state.transactions`. A payment is received revenue on its own terms;
    // synthesising an income transaction beside it would count the same shekel
    // twice — the exact defect syncClientIncome() produced for clients (S0A).
    case 'ADD_CHARGE':
      return { ...state, charges: [action.payload, ...(state.charges || [])] };
    case 'UPDATE_CHARGE':
      return { ...state, charges: (state.charges || []).map((c) => (c.id === action.payload.id ? { ...c, ...action.payload } : c)) };
    case 'CANCEL_CHARGE':
      return { ...state, charges: (state.charges || []).map((c) => (c.id === action.id ? { ...c, lifecycle: 'cancelled' } : c)) };
    case 'REOPEN_CHARGE':
      return { ...state, charges: (state.charges || []).map((c) => (c.id === action.id ? { ...c, lifecycle: 'open' } : c)) };
    case 'DELETE_CHARGE':
      return {
        ...state,
        charges: (state.charges || []).filter((c) => c.id !== action.id),
        // Mirrors payments_charge_same_owner_fk ON DELETE CASCADE, so the screen
        // never shows payments attached to a charge the server has removed.
        payments: (state.payments || []).filter((p) => p.chargeId !== action.id),
      };
    case 'ADD_PAYMENT':
      return { ...state, payments: [action.payload, ...(state.payments || [])] };
    case 'DELETE_PAYMENT':
      return { ...state, payments: (state.payments || []).filter((p) => p.id !== action.id) };

    // ---- communication ----
    case 'ADD_COMM':
      return { ...state, comms: [{ ...action.payload, id: action.payload.id || uid('cm') }, ...(state.comms || [])] };
    case 'UPDATE_COMM':
      return { ...state, comms: (state.comms || []).map((c) => (c.id === action.payload.id ? { ...c, ...action.payload } : c)) };
    case 'DELETE_COMM':
      return { ...state, comms: (state.comms || []).filter((c) => c.id !== action.id) };

    default:
      return state;
  }
}

// S0B: durable task dispatches use a confirmed-write path (persist BEFORE the
// reducer applies) so no task success can be shown before Supabase confirms.
const TASK_DISPATCH = new Set(['ADD_TASK', 'UPDATE_TASK', 'DELETE_TASK']);
const isTaskDispatch = (t) => TASK_DISPATCH.has(t);

// F1: durable receivables dispatches. Same confirmed-write contract as tasks —
// persist BEFORE the reducer applies, so nothing about money is ever shown as
// saved before the server has said so.
//
// These deliberately do NOT go through persist(). persist() is the entity
// router that betaCapabilities.DURABLE_DISPATCH is kept in lockstep with, and
// receivables are cloud-only rather than a beta-contained module — so they take
// the same direct-api route SAVE_BUSINESS_PROFILE (S0D) already uses.
const RECEIVABLES_DISPATCH = new Set([
  'ADD_CHARGE', 'UPDATE_CHARGE', 'CANCEL_CHARGE', 'REOPEN_CHARGE', 'DELETE_CHARGE',
  'ADD_PAYMENT', 'DELETE_PAYMENT',
]);
const isReceivablesDispatch = (t) => RECEIVABLES_DISPATCH.has(t);

/**
 * Route ONE receivables action to its api call and resolve with the action the
 * reducer should apply — carrying the SERVER'S row, never a reconstructed one.
 * Rejects on any failure; the caller shows no success and refetches.
 */
function persistReceivable(action, userId) {
  switch (action.type) {
    case 'ADD_CHARGE':
      return api.createCharge(userId, action.payload).then((charge) => ({ ...action, payload: charge }));
    case 'UPDATE_CHARGE':
      return api.updateCharge(action.payload.id, action.payload).then((charge) => ({ ...action, payload: charge }));
    case 'CANCEL_CHARGE':
      return api.cancelCharge(action.id).then(() => action);
    case 'REOPEN_CHARGE':
      return api.reopenCharge(action.id).then(() => action);
    case 'DELETE_CHARGE':
      return api.deleteCharge(action.id).then(() => action);
    case 'ADD_PAYMENT':
      // ONE write, to `payments`. No income transaction is created here, on
      // purpose — see the reducer note. Payments are the source of truth.
      return api.createPayment(userId, action.payload).then((payment) => ({ ...action, payload: payment }));
    case 'DELETE_PAYMENT':
      return api.deletePayment(action.id).then(() => action);
    default:
      return Promise.reject(new Error(`unrouted receivables dispatch: ${action.type}`));
  }
}

// Pre-assign a uuid for ADD actions so optimistic state and the DB row match.
function withId(action) {
  if (['ADD_CLIENT', 'ADD_QUOTE', 'ADD_TX', 'ADD_LEAD', 'ADD_PROJECT', 'ADD_TASK', 'ADD_LINK', 'ADD_FILE', 'ADD_COMM'].includes(action.type) && !action.payload.id) {
    return { ...action, payload: { ...action.payload, id: api.uuid() } };
  }
  return action;
}

// Route a (resolved) action to the right Supabase api call.
function persist(action, userId) {
  switch (action.type) {
    case 'ADD_CLIENT': return api.createClient(userId, action.payload);
    case 'UPDATE_CLIENT': return api.updateClient(action.payload);
    case 'DELETE_CLIENT': return api.deleteClient(action.id);
    case 'ADD_QUOTE': return api.createQuote(userId, action.payload);
    case 'UPDATE_QUOTE': return api.updateQuote(userId, action.payload);
    case 'DELETE_QUOTE': return api.deleteQuote(action.id);
    case 'ADD_TX': return api.createTx(userId, action.payload);
    case 'UPDATE_TX': return api.updateTx(action.payload);
    case 'DELETE_TX': return api.deleteTx(action.id);
    case 'ADD_LEAD': return api.createLead(userId, action.payload);
    case 'UPDATE_LEAD': return api.updateLead(action.payload);
    case 'DELETE_LEAD': return api.deleteLead(action.id);
    case 'ADD_TASK': return api.createTask(userId, action.payload);
    case 'UPDATE_TASK': return api.updateTask(action.payload);
    case 'DELETE_TASK': return api.deleteTask(action.id);
    default: return Promise.resolve();
  }
}

const StoreCtx = createContext(null);
const ToastCtx = createContext(null);

export function StoreProvider({ children }) {
  const supabaseEnabled = isSupabaseConfigured;

  // ---- toasts (shared) ----
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const toast = useCallback((message, kind = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // ---- data ----
  const [data, setData] = useState(() => (supabaseEnabled ? EMPTY : loadLocal()));

  // ---- auth / status ----
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabaseEnabled); // local mode → instantly ready
  const [loading, setLoading] = useState(supabaseEnabled); // first fetch
  const [error, setError] = useState(null);

  // ---- theme ----
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0e0e0e' : '#f1f2ec');
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  // ---- localStorage persistence (LOCAL mode only) ----
  useEffect(() => {
    if (supabaseEnabled) return;
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }, [data, supabaseEnabled]);

  // ---- Supabase: track auth session ----
  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      setAuthReady(true);
      if (!session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      setAuthReady(true);
      if (!session) { setData(EMPTY); setLoading(false); }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [supabaseEnabled]);

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const fresh = await api.fetchAll();
      setData(fresh);
    } catch (e) {
      console.error(e);
      // This `error` is exposed on the store context and rendered. A Supabase /
      // network Error message (row-level-security text, endpoint URLs, PostgREST
      // codes) must not become the user-visible string.
      setError(userFacingError(e, 'שגיאת טעינה'));
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- Supabase: load data when a session appears ----
  useEffect(() => {
    if (!supabaseEnabled || !session) return;
    setLoading(true);
    refetch();
  }, [supabaseEnabled, session, refetch]);

  // ---- authoritative reconcile after a FAILED write (not the same as refetch) ----
  // A write failure used to call `refetch()` directly. That was a lost-update
  // bug whenever writes ran concurrently: `refetch` does `setData(fresh)` — an
  // ABSOLUTE replacement — so a response produced before the sibling writes
  // committed restored rows the server had already deleted. Measured in owner
  // QA on a partial bulk delete: the message said "3 deleted, 1 failed" and the
  // database agreed exactly, while the LIST still showed all four.
  //
  // The scheduler coalesces concurrent failures into ONE fetch and issues it
  // only once no write is in flight, so it cannot race a sibling. `refetch`
  // itself is untouched and still used for hydration and imports.
  //
  // ⚠️ FOLLOW-UP, NOT CLOSED HERE: those direct `refetch()` calls do not go
  // through the scheduler, so an import's refetch can still overlap a reconcile
  // with no ordering guarantee between the two absolute writes. Rare and
  // pre-existing; its own slice.
  //
  // `apply` mirrors refetch's success pair (setData + clear the error) so a
  // reconcile leaves exactly the state a refetch would have left.
  const scheduler = useMemo(() => createReconcileScheduler({
    fetchAll: () => api.fetchAll(),
    apply: (fresh) => { setData(fresh); setError(null); },
    // `onError` receives an ALREADY-SANITISED message — the scheduler crosses
    // the userFacingError boundary itself, so no raw provider text can reach
    // this state and be rendered.
    onError: (userMessage) => setError(userMessage),
  }), []);
  const { trackWrite, requestReconcile } = scheduler;

  // ---- dispatch (same signature in both modes) ----
  const dispatch = useCallback(
    (action) => {
      if (!supabaseEnabled) {
        // F1: receivables are CLOUD-ONLY. In local/demo mode there is no durable
        // store for them, so the dispatch is refused OUTRIGHT — nothing mutates
        // and no caller can claim a save. This is the S0A false-success rule in
        // the other direction: S0A contained local-only modules that pretended
        // to persist in the cloud; here a cloud-only module must not pretend to
        // persist locally. The Finance screen never offers these controls in
        // local mode; this is the belt to that UI's braces.
        if (isReceivablesDispatch(action.type)) {
          return Promise.resolve({ ok: false, reason: 'cloud_only' });
        }
        setData((d) => reducer(d, action));
        return Promise.resolve({ ok: true }); // local mode: localStorage is durable
      }
      // Beta false-success containment (S0A): Memory-Only entity mutations are
      // NOT durably persisted in cloud mode (no persist()/fetchAll route). Block
      // before mutating so nothing changes and no caller can claim a save. Local
      // mode is unaffected (handled above — localStorage is durable there).
      if (isMemoryOnlyDispatch(action.type)) return Promise.resolve({ ok: false });
      // T2 — whole-store replacement (RESET / IMPORT) has no cloud persist()
      // route either: the optimistic apply below would swap the account's
      // on-screen data for unsaved seed/demo content and then resolve
      // { ok: true } from persist()'s default case — a false success that a
      // refresh silently reverts. Refuse BEFORE any state change. Local mode
      // is handled above and keeps both (localStorage is durable there). The
      // cloud backup import (importBackup → api.bulkUpload + refetch) never
      // dispatches IMPORT and stays fully functional.
      if (isWholeStoreReplaceDispatch(action.type)) {
        return Promise.resolve({ ok: false, reason: 'cloud_unavailable' });
      }
      const act = withId(action);
      const userId = session?.user?.id;

      // S0B truthful write for durable Tasks: persist BEFORE applying the reducer.
      // No optimistic task state — callers show success only after this resolves
      // { ok: true }. On failure nothing is applied locally and we refetch the
      // authoritative state (no false Task state, no silent local fallback).
      if (isTaskDispatch(act.type)) {
        if (!userId) return Promise.resolve({ ok: false });
        return trackWrite(persist(act, userId)).then(
          () => { setData((d) => reducer(d, act)); return { ok: true }; },
          async (e) => { console.error(e); toast('שגיאה בשמירת המשימה לשרת', 'error'); await requestReconcile(); return { ok: false, error: e }; }
        );
      }

      // F1 truthful write for durable Receivables: persist BEFORE applying the
      // reducer. No optimistic charge and no optimistic payment — a KPI about
      // money must never move before the server has confirmed the row. On
      // failure nothing is applied locally and we refetch the authoritative
      // state, so a rejected write cannot leave a phantom balance on screen.
      if (isReceivablesDispatch(act.type)) {
        if (!userId) return Promise.resolve({ ok: false });
        return trackWrite(persistReceivable(act, userId)).then(
          (confirmed) => { setData((d) => reducer(d, confirmed)); return { ok: true }; },
          async (e) => {
            console.error(e);
            toast(userFacingError(e, 'שגיאה בשמירת החיוב/התשלום לשרת'), 'error');
            await requestReconcile();
            return { ok: false, error: e };
          }
        );
      }

      // S0D truthful write for the durable Business Context: persist BEFORE the
      // reducer applies. This is a single-row upsert (not entity CRUD), so it
      // calls the api directly rather than the persist() entity router — the
      // editor commits to the store only on { ok: true }; on failure nothing is
      // applied and we refetch the authoritative state (no false "saved"
      // profile, no silent local fallback).
      if (act.type === 'SAVE_BUSINESS_PROFILE') {
        if (!userId) return Promise.resolve({ ok: false });
        return trackWrite(api.upsertBusinessProfile(userId, act.payload)).then(
          () => { setData((d) => reducer(d, act)); return { ok: true }; },
          async (e) => { console.error(e); toast('שגיאה בשמירת ההקשר העסקי לשרת', 'error'); await requestReconcile(); return { ok: false, error: e }; }
        );
      }

      // S0A: in cloud mode the reducer must not synthesize the auto income
      // transaction for a paid client — it would be Memory-Only (persist writes
      // only the client row). The flag rides on the ACTION, not the payload, so
      // the row persisted to Supabase is untouched; persist() receives the
      // original unflagged action.
      const guarded = (act.type === 'ADD_CLIENT' || act.type === 'UPDATE_CLIENT')
        ? { ...act, suppressAutoIncome: true }
        : act;
      setData((d) => reducer(d, guarded)); // optimistic (durable non-task entities)
      if (!userId) return Promise.resolve({ ok: false });
      // Resolve with a settled result (never rejects) so existing non-awaiting
      // callers are unaffected, while follow-up-bearing client saves can await
      // confirmation before showing success.
      return trackWrite(persist(act, userId)).then(
        () => ({ ok: true }),
        async (e) => {
          console.error(e);
          toast('שגיאה בשמירה לשרת — מרענן נתונים', 'error');
          // S0B, unchanged in substance: authoritative cloud state is applied
          // BEFORE this settles { ok: false }. Only the mechanism moved — the
          // reconcile waits for concurrent writes to finish first, so it can no
          // longer restore rows a sibling delete has already removed.
          await requestReconcile();
          return { ok: false, error: e };
        }
      );
    },
    // `refetch` left the list with the failure paths: dispatch now reconciles
    // through the scheduler instead. `trackWrite` / `requestReconcile` are
    // stable (useMemo, no deps), so the callback identity is unchanged.
    [supabaseEnabled, session, trackWrite, requestReconcile, toast]
  );

  // ---- auth actions ----
  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // ---- migration / import ----
  const migrateFromLocal = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) throw new Error('not signed in');
    let parsed;
    try { parsed = JSON.parse(localStorage.getItem(DATA_KEY) || ''); } catch { parsed = null; }
    if (!parsed || !parsed.clients) throw new Error('אין נתונים מקומיים לייבוא');
    const counts = await api.bulkUpload(userId, parsed);
    await refetch();
    return counts;
  }, [session, refetch]);

  // import a parsed JSON backup (mode-aware)
  const importBackup = useCallback(async (parsed) => {
    if (!supabaseEnabled) {
      setData(parsed);
      return null;
    }
    const userId = session?.user?.id;
    if (!userId) throw new Error('not signed in');
    const counts = await api.bulkUpload(userId, parsed);
    await refetch();
    return counts;
  }, [supabaseEnabled, session, refetch]);

  const value = {
    data, dispatch, theme, toggleTheme, toast,
    // mode + auth
    supabaseEnabled, mode: supabaseEnabled ? 'supabase' : 'local',
    session, authReady, loading, error, refetch,
    signIn, signOut, migrateFromLocal, importBackup,
  };

  return (
    <StoreCtx.Provider value={value}>
      <ToastCtx.Provider value={{ toasts, toast, dismissToast }}>{children}</ToastCtx.Provider>
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export function useToasts() {
  return useContext(ToastCtx);
}
