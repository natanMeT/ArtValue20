import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { buildSeed, uid } from '../data/seed.js';
import { OUTREACH_EXTRA, OUTREACH_SEED_VERSION } from '../data/outreach.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import * as api from '../lib/api.js';

const DATA_KEY = 'artvalue_data';
const THEME_KEY = 'artvalue_theme';

const EMPTY = {
  clients: [], quotes: [], transactions: [], outreachLeads: [],
  projects: [], tasks: [], plinks: [], pfiles: [], comms: [], inventory: [],
  activity: [], // audit log / memory — append-only event trail (last 200)
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
function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return buildSeed();
    case 'IMPORT':
      return action.payload;

    case 'ADD_CLIENT': {
      const client = { ...action.payload, id: action.payload.id || uid('cl') };
      const ev = act('client_add', `נוסף לקוח "${client.name}"${Number(client.value) ? ` (שווי ${ils(client.value)} ₪)` : ''}`, { entity: 'client', name: client.name, after: Number(client.value) || 0 });
      return { ...state, clients: [client, ...state.clients], transactions: syncClientIncome(state.transactions, client), activity: pushAct(state, ev) };
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
      return { ...state, clients, transactions: merged ? syncClientIncome(state.transactions, merged) : state.transactions, activity: evs.length ? pushAct(state, evs) : state.activity };
    }
    case 'DELETE_CLIENT': {
      const gone = state.clients.find((c) => c.id === action.id);
      return {
        ...state,
        clients: state.clients.filter((c) => c.id !== action.id),
        quotes: state.quotes.filter((q) => q.clientId !== action.id),
        transactions: state.transactions.filter((t) => !(t.auto && t.clientId === action.id)),
        activity: gone ? pushAct(state, act('client_delete', `נמחק לקוח "${gone.name}"`, { entity: 'client', name: gone.name })) : state.activity,
      };
    }

    case 'ADD_QUOTE':
      return { ...state, quotes: [{ ...action.payload, id: action.payload.id || uid('qt') }, ...state.quotes] };
    case 'UPDATE_QUOTE':
      return { ...state, quotes: state.quotes.map((q) => (q.id === action.payload.id ? { ...q, ...action.payload } : q)) };
    case 'DELETE_QUOTE':
      return { ...state, quotes: state.quotes.filter((q) => q.id !== action.id) };

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
      setError(e.message || 'שגיאת טעינה');
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

  // ---- dispatch (same signature in both modes) ----
  const dispatch = useCallback(
    (action) => {
      if (!supabaseEnabled) {
        setData((d) => reducer(d, action));
        return;
      }
      const act = withId(action);
      setData((d) => reducer(d, act)); // optimistic
      const userId = session?.user?.id;
      if (!userId) return;
      persist(act, userId).catch((e) => {
        console.error(e);
        toast('שגיאה בשמירה לשרת — מרענן נתונים', 'error');
        refetch();
      });
    },
    [supabaseEnabled, session, refetch, toast]
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
