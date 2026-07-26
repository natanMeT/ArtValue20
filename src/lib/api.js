// ===================================================================
// Supabase data-access layer for Art Value.
// Keeps the SAME in-memory shape the UI already uses:
//   client: { id, name, contact, phone, email, status, value, date, source, projectType, notes }
//   quote:  { id, number, clientId, date, validDays, vatRate, status, notes, items:[{id,desc,qty,price}] }
//   tx:     { id, type, amount, category, date, description, clientId }
// Only this file knows about snake_case columns and the quote_items table.
// ===================================================================
import { supabase } from './supabase.js';
import { validateBusinessProfile, normalizeBusinessProfile } from './businessProfile.js';

const uuid = () =>
  (crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

// ---- field maps (camel → snake) for partial updates ----
const CLIENT_FIELDS = {
  name: 'name', contact: 'contact', phone: 'phone', email: 'email',
  status: 'status', value: 'value', date: 'date', source: 'source',
  projectType: 'project_type', notes: 'notes',
  // S0B: durable client follow-up.
  nextAction: 'next_action', nextActionDate: 'next_action_date',
};
const QUOTE_FIELDS = {
  number: 'number', clientId: 'client_id', date: 'date', validDays: 'valid_days',
  vatRate: 'vat_rate', status: 'status', notes: 'notes',
};
const TX_FIELDS = {
  type: 'type', amount: 'amount', category: 'category', date: 'date',
  description: 'description', clientId: 'client_id',
};
const LEAD_FIELDS = {
  name: 'name', category: 'category', status: 'status', clientId: 'client_id', need: 'need',
};
// S0B: task write map (camel → snake). created_at/updated_at are server-managed
// (default now() + trigger) and are read-only (mapped back only in rowToTask).
const TASK_FIELDS = {
  title: 'title', projectId: 'project_id', clientId: 'client_id',
  status: 'status', priority: 'priority', deadline: 'deadline',
  assignee: 'assignee', linkRef: 'link_ref', notes: 'notes',
};
// S0D: business_profile write map (camel → snake). user_id is the PK (from the
// session), created_at/updated_at are server-managed. Values arrive already
// normalized by businessProfile.js (arrays/jsonb passed straight through).
const BUSINESS_PROFILE_FIELDS = {
  businessName: 'business_name', positioning: 'positioning',
  audiences: 'audiences', tone: 'tone', differentiators: 'differentiators',
  services: 'services', brandPalette: 'brand_palette',
};

function mapToRow(obj, fieldMap) {
  const row = {};
  for (const k of Object.keys(fieldMap)) {
    if (k in obj && obj[k] !== undefined) row[fieldMap[k]] = obj[k];
  }
  return row;
}

// PostgreSQL rejects '' for a `date` column. Optional date fields must write
// null, not '' — normalize ONLY these date columns at the DB boundary (task
// deadline, client follow-up date) so createTask/updateTask/createClient/
// updateClient, Jake-originated writes, and bulkUpload/import are all safe.
// Deliberately scoped: never a blanket empty-string → null conversion.
const BLANK_DATE_COLS = ['deadline', 'next_action_date'];
function nullifyBlankDates(row) {
  for (const c of BLANK_DATE_COLS) {
    if (c in row && row[c] === '') row[c] = null;
  }
  return row;
}

// ---- row → in-memory shape ----
function rowToClient(r) {
  return {
    id: r.id, name: r.name, contact: r.contact || '', phone: r.phone || '',
    email: r.email || '', status: r.status, value: Number(r.value) || 0,
    date: r.date, source: r.source || '', projectType: r.project_type || '',
    notes: r.notes || '',
    // S0B: durable client follow-up.
    nextAction: r.next_action || '', nextActionDate: r.next_action_date || null,
  };
}
function rowToQuote(r) {
  return {
    id: r.id, number: r.number, clientId: r.client_id, date: r.date,
    validDays: r.valid_days ?? 30, vatRate: Number(r.vat_rate) ?? 18,
    status: r.status, notes: r.notes || '', items: [],
  };
}
function rowToItem(r) {
  return { id: r.id, desc: r.description || '', qty: Number(r.qty) || 0, price: Number(r.price) || 0 };
}
function rowToTx(r) {
  return {
    id: r.id, type: r.type, amount: Number(r.amount) || 0, category: r.category || '',
    date: r.date, description: r.description || '', clientId: r.client_id || null,
  };
}
function rowToLead(r) {
  return { id: r.id, name: r.name, category: r.category, status: r.status, clientId: r.client_id || null, need: r.need || '' };
}
function rowToTask(r) {
  return {
    id: r.id, projectId: r.project_id || null, clientId: r.client_id || null,
    title: r.title || '', status: r.status || 'new', priority: r.priority || 'normal',
    deadline: r.deadline || null, assignee: r.assignee || '', linkRef: r.link_ref || '',
    notes: r.notes || '', createdAt: r.created_at || null, updatedAt: r.updated_at || null,
  };
}
// S0D: hydrate a business_profile row THROUGH the shared validator, so a
// malformed / legacy / partial cloud row → null (treated as unconfigured →
// neutral brain), never a misleading configured profile. IDs/timestamps are
// intentionally dropped (not business context). Returns the canonical camelCase
// shape or null.
function rowToBusinessProfile(r) {
  if (!r) return null;
  return normalizeBusinessProfile({
    businessName: r.business_name || '',
    positioning: r.positioning || '',
    audiences: Array.isArray(r.audiences) ? r.audiences : [],
    tone: Array.isArray(r.tone) ? r.tone : [],
    differentiators: Array.isArray(r.differentiators) ? r.differentiators : [],
    services: Array.isArray(r.services) ? r.services : [],
    brandPalette: r.brand_palette || null,
  });
}

function guard(error) {
  if (error) throw error;
}

// ===================================================================
// Read everything for the signed-in user (RLS scopes to their rows).
// ===================================================================
export async function fetchAll() {
  const [clientsRes, quotesRes, itemsRes, txRes, leadsRes, tasksRes, bpRes] = await Promise.all([
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    supabase.from('quote_items').select('*').order('position', { ascending: true }),
    supabase.from('transactions').select('*').order('date', { ascending: false }),
    supabase.from('outreach_leads').select('*').order('created_at', { ascending: true }),
    supabase.from('tasks').select('*').order('created_at', { ascending: false }),
    // S0D: one row per user (user_id PK); RLS scopes to the signed-in account.
    supabase.from('business_profile').select('*').limit(1),
  ]);
  guard(clientsRes.error); guard(quotesRes.error); guard(itemsRes.error); guard(txRes.error); guard(leadsRes.error); guard(tasksRes.error); guard(bpRes.error);

  const itemsByQuote = {};
  for (const it of itemsRes.data) (itemsByQuote[it.quote_id] ||= []).push(rowToItem(it));

  const quotes = quotesRes.data.map((q) => ({ ...rowToQuote(q), items: itemsByQuote[q.id] || [] }));

  return {
    clients: clientsRes.data.map(rowToClient),
    quotes,
    transactions: txRes.data.map(rowToTx),
    outreachLeads: leadsRes.data.map(rowToLead),
    tasks: tasksRes.data.map(rowToTask),
    // S0D: durable per-account Business Context (null when unconfigured/malformed).
    businessProfile: rowToBusinessProfile((bpRes.data && bpRes.data[0]) || null),
    meta: { source: 'supabase' },
  };
}

// ===================================================================
// Mutations — each takes the already-known record (ids assigned in store).
// ===================================================================
export async function createClient(userId, client) {
  guard((await supabase.from('clients').insert({ id: client.id, user_id: userId, ...nullifyBlankDates(mapToRow(client, CLIENT_FIELDS)) })).error);
}
export async function updateClient(client) {
  guard((await supabase.from('clients').update(nullifyBlankDates(mapToRow(client, CLIENT_FIELDS))).eq('id', client.id)).error);
}
export async function deleteClient(id) {
  // FK cascade removes the client's quotes + their items.
  guard((await supabase.from('clients').delete().eq('id', id)).error);
}

// ---- atomic quote save (P1) ----
// The old flow wrote the quotes parent and then quote_items in SEPARATE
// PostgREST statements — an item failure left a partially persisted quote
// (and a retry could mint a second one). Both create and update now go
// through ONE save_quote_atomic RPC call: the parent write and the full
// item-snapshot replacement run inside a single database transaction, so
// they succeed together or roll back together. Ownership is derived from
// auth.uid() inside the function — the signed-in session, never a
// client-supplied user_id (the userId parameter is kept for the store's
// call signature but is NOT sent to the database).
export function buildQuoteItemRows(items) {
  return (items || []).map((it, i) => ({
    description: it.desc || '', qty: Number(it.qty) || 1, price: Number(it.price) || 0, position: i,
  }));
}
export function buildQuoteRpcArgs(mode, quote) {
  return {
    p_mode: mode,
    p_quote: { id: quote.id, ...mapToRow(quote, QUOTE_FIELDS) },
    // update with items undefined keeps the existing items (null → no
    // replacement); create always sends the full snapshot ([] = no items).
    p_items: mode === 'update' && quote.items === undefined ? null : buildQuoteItemRows(quote.items),
  };
}

export async function createQuote(userId, quote) {
  guard((await supabase.rpc('save_quote_atomic', buildQuoteRpcArgs('create', quote))).error);
}
export async function updateQuote(userId, quote) {
  guard((await supabase.rpc('save_quote_atomic', buildQuoteRpcArgs('update', quote))).error);
}
export async function deleteQuote(id) {
  guard((await supabase.from('quotes').delete().eq('id', id)).error);
}

export async function createTx(userId, tx) {
  guard((await supabase.from('transactions').insert({ id: tx.id, user_id: userId, ...mapToRow(tx, TX_FIELDS) })).error);
}
export async function updateTx(tx) {
  guard((await supabase.from('transactions').update(mapToRow(tx, TX_FIELDS)).eq('id', tx.id)).error);
}
export async function deleteTx(id) {
  guard((await supabase.from('transactions').delete().eq('id', id)).error);
}

export async function createLead(userId, lead) {
  guard((await supabase.from('outreach_leads').insert({ id: lead.id, user_id: userId, ...mapToRow(lead, LEAD_FIELDS) })).error);
}
export async function updateLead(lead) {
  guard((await supabase.from('outreach_leads').update(mapToRow(lead, LEAD_FIELDS)).eq('id', lead.id)).error);
}
export async function deleteLead(id) {
  guard((await supabase.from('outreach_leads').delete().eq('id', id)).error);
}

// ---- tasks (S0B) ----
export async function createTask(userId, task) {
  guard((await supabase.from('tasks').insert({ id: task.id, user_id: userId, ...nullifyBlankDates(mapToRow(task, TASK_FIELDS)) })).error);
}
export async function updateTask(task) {
  guard((await supabase.from('tasks').update(nullifyBlankDates(mapToRow(task, TASK_FIELDS))).eq('id', task.id)).error);
}
export async function deleteTask(id) {
  guard((await supabase.from('tasks').delete().eq('id', id)).error);
}

// ---- business profile (S0D) ----
// Validate AT THE BOUNDARY (defense in depth — the editor validates too), then
// upsert on the user_id PK. Throws on invalid input (persist-first caller shows
// no false success). Returns the normalized value that was written.
export async function upsertBusinessProfile(userId, profile) {
  const { ok, value, errors } = validateBusinessProfile(profile);
  if (!ok || !value) {
    const err = new Error('פרופיל עסקי לא תקין');
    err.details = errors;
    throw err;
  }
  const row = { user_id: userId, ...mapToRow(value, BUSINESS_PROFILE_FIELDS) };
  guard((await supabase.from('business_profile').upsert(row, { onConflict: 'user_id' })).error);
  return value;
}

// S0B: build task rows for bulkUpload — fresh TEXT id, client_id remapped
// through clientIdMap, project_id retained (nullable text, no FK), blank
// deadline → null. Pure + exported for focused tests. Empty/missing → [].
export function buildBulkTaskRows(tasks, userId, clientIdMap = {}) {
  return (tasks || []).map((t) => nullifyBlankDates({
    id: uuid(), user_id: userId, ...mapToRow(t, TASK_FIELDS), client_id: clientIdMap[t.clientId] || null,
  }));
}

// ===================================================================
// Bulk upload (migration from localStorage / JSON backup import).
// Remaps old ids → fresh uuids so FKs stay consistent. Returns counts.
// ===================================================================
export async function bulkUpload(userId, data) {
  const clientIdMap = {};
  const clientRows = (data.clients || []).map((c) => {
    const id = uuid();
    clientIdMap[c.id] = id;
    return nullifyBlankDates({ id, user_id: userId, ...mapToRow(c, CLIENT_FIELDS) });
  });
  if (clientRows.length) guard((await supabase.from('clients').insert(clientRows)).error);

  const quoteRows = [];
  const itemRows = [];
  for (const q of data.quotes || []) {
    const id = uuid();
    quoteRows.push({ id, user_id: userId, ...mapToRow(q, QUOTE_FIELDS), client_id: clientIdMap[q.clientId] || null });
    (q.items || []).forEach((it, i) =>
      itemRows.push({ user_id: userId, quote_id: id, description: it.desc || '', qty: Number(it.qty) || 1, price: Number(it.price) || 0, position: i })
    );
  }
  if (quoteRows.length) guard((await supabase.from('quotes').insert(quoteRows)).error);
  if (itemRows.length) guard((await supabase.from('quote_items').insert(itemRows)).error);

  const txRows = (data.transactions || []).map((t) => ({
    id: uuid(), user_id: userId, ...mapToRow(t, TX_FIELDS), client_id: clientIdMap[t.clientId] || null,
  }));
  if (txRows.length) guard((await supabase.from('transactions').insert(txRows)).error);

  const leadRows = (data.outreachLeads || []).map((l) => ({
    id: uuid(), user_id: userId, ...mapToRow(l, LEAD_FIELDS), client_id: clientIdMap[l.clientId] || null,
  }));
  if (leadRows.length) guard((await supabase.from('outreach_leads').insert(leadRows)).error);

  // S0B: tasks are durable — import/migrate them too (else refetch() silently
  // drops them). Fresh TEXT id, client_id remapped, project_id retained (no FK).
  const taskRows = buildBulkTaskRows(data.tasks, userId, clientIdMap);
  if (taskRows.length) guard((await supabase.from('tasks').insert(taskRows)).error);

  // S0D: business profile (one row per user) — import through the SAME validator
  // as a direct save; invalid or absent → skipped (never a partial/silent write).
  let businessProfile = 0;
  if (data.businessProfile) {
    const { ok, value } = validateBusinessProfile(data.businessProfile);
    if (ok && value) {
      guard((await supabase.from('business_profile')
        .upsert({ user_id: userId, ...mapToRow(value, BUSINESS_PROFILE_FIELDS) }, { onConflict: 'user_id' })).error);
      businessProfile = 1;
    }
  }

  return { clients: clientRows.length, quotes: quoteRows.length, transactions: txRows.length, leads: leadRows.length, tasks: taskRows.length, businessProfile };
}

// Pure mapping helpers exported for focused unit tests (S0B + S0D).
export { uuid, mapToRow, rowToClient, rowToTask, rowToBusinessProfile, CLIENT_FIELDS, TASK_FIELDS, BUSINESS_PROFILE_FIELDS, nullifyBlankDates };
