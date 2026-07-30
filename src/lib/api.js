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
import {
  validateAssetUpload, sanitizeAssetMeta, normalizeAssetRow, sortAssetsNewestFirst,
} from './assetLibrary.js';
import {
  validateCampaign, canCreateWithin, canTransition,
  normalizeCampaignRow, sortCampaignsNewestFirst, CAMPAIGN_QUOTA,
} from './campaigns.js';
import {
  validateCharge, validatePayment,
  normalizeChargeRow, normalizePaymentRow, CHARGE_LIFECYCLES,
} from './receivables.js';
import {
  validateAppointment, normalizeAppointmentRow, sortByStart, APPOINTMENT_STATUSES,
} from './schedule.js';
import { engineError } from './userFacingError.js';

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
// F1 Core Receivables: charge write map (camel → snake). It is an ALLOW-LIST,
// and what it OMITS is the point — there is no payment-status key here because
// there is no such column: status is derived from amount_total and the sum of
// payments (src/lib/receivables.js). `lifecycle` is written on create ('open')
// and by cancelCharge alone. created_at/updated_at are server-managed.
const CHARGE_FIELDS = {
  clientId: 'client_id', quoteId: 'quote_id', kind: 'kind',
  paymentTerms: 'payment_terms', serviceDate: 'service_date',
  dueDate: 'due_date', dueDateSource: 'due_date_source',
  amountTotal: 'amount_total', description: 'description',
  invoiceUrl: 'invoice_url', lifecycle: 'lifecycle',
};
// F1: payment write map. A payment is immutable in this slice — it is created
// or deleted, never edited — so this map is used only by the insert.
const PAYMENT_FIELDS = {
  chargeId: 'charge_id', amount: 'amount', paidAt: 'paid_at',
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
  const [clientsRes, quotesRes, itemsRes, txRes, leadsRes, tasksRes, bpRes, chargesRes, paymentsRes] = await Promise.all([
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    supabase.from('quote_items').select('*').order('position', { ascending: true }),
    supabase.from('transactions').select('*').order('date', { ascending: false }),
    supabase.from('outreach_leads').select('*').order('created_at', { ascending: true }),
    supabase.from('tasks').select('*').order('created_at', { ascending: false }),
    // S0D: one row per user (user_id PK); RLS scopes to the signed-in account.
    supabase.from('business_profile').select('*').limit(1),
    // F1: expected billing and money actually received. Both are RLS-scoped.
    supabase.from('charges').select('*').order('due_date', { ascending: true }),
    supabase.from('payments').select('*').order('paid_at', { ascending: false }),
  ]);
  guard(clientsRes.error); guard(quotesRes.error); guard(itemsRes.error); guard(txRes.error); guard(leadsRes.error); guard(tasksRes.error); guard(bpRes.error);
  guard(chargesRes.error); guard(paymentsRes.error);

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
    // F1: a row that cannot be trusted is DROPPED by the normalizer rather than
    // rendered as a half-charge with a plausible-looking balance.
    charges: (chargesRes.data || []).map(normalizeChargeRow).filter(Boolean),
    payments: (paymentsRes.data || []).map(normalizePaymentRow).filter(Boolean),
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
  // F1: quote ids are remapped like client ids, so an imported charge can point
  // at the quote it came from instead of losing the link.
  const quoteIdMap = {};
  for (const q of data.quotes || []) {
    const id = uuid();
    quoteIdMap[q.id] = id;
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

  // F1: charges + payments are part of `data` (fetchAll returns them, and the
  // Settings backup is a dump of the whole store), so an importer that skipped
  // them would silently drop every receivable from a restore while still
  // reporting success. Charges go through the SAME validator as a direct save,
  // so a malformed row is skipped rather than half-written.
  const chargeIdMap = {};
  const chargeRows = [];
  const cancelledChargeIds = [];
  // A charge the CURRENT validator rejects (a legacy kind, a malformed date) is
  // skipped rather than half-written — and skipping it also strands every
  // payment that pointed at it, since no id mapping exists. Both losses are
  // COUNTED and returned: an import that quietly loses receivables while
  // reporting success is the false-success failure this codebase keeps closing.
  let chargesSkipped = 0;
  for (const c of data.charges || []) {
    const v = validateCharge({
      ...c,
      // The remapped parents. An unknown id becomes NULL rather than a dangling
      // reference — the composite FK would reject it, and losing a link is a far
      // smaller loss than losing the charge.
      clientId: clientIdMap[c.clientId] || null,
      quoteId: quoteIdMap[c.quoteId] || null,
      // A manual due date must survive the round trip verbatim; a computed one
      // is left to the validator so it stays consistent with the terms.
      dueDate: c.dueDateSource === 'manual' ? c.dueDate : '',
    });
    if (!v.ok) { chargesSkipped += 1; continue; }
    // The lifecycle is NOT covered by validateCharge(): that validator always
    // creates in 'open', because a create has no lifecycle to choose. An import
    // does — and an unrecognised one (a legacy 'archived', a missing field) must
    // not be silently activated. Activating it would inflate open receivables
    // and let new payments be recorded against what may have been a cancelled
    // record. Unknown -> skipped and counted, like any other unusable row.
    if (!CHARGE_LIFECYCLES.includes(c.lifecycle)) { chargesSkipped += 1; continue; }
    const id = uuid();
    chargeIdMap[c.id] = id;
    chargeRows.push({
      id,
      user_id: userId,
      ...mapToRow(v.value, CHARGE_FIELDS),
      // EVERY charge is inserted `open`, including the cancelled ones.
      //
      // trg_payments_reject_cancelled refuses a payment whose charge is already
      // cancelled — correct for a live write, and fatal for a RESTORE, because a
      // cancelled charge legitimately keeps the payments it received. Inserting
      // it cancelled first would have the trigger reject the whole payment batch
      // after clients, quotes, transactions and charges were already committed
      // in separate requests, leaving a half-restored account.
      //
      // So the historical payments go in first and the cancelled lifecycle is
      // restored afterwards (the trigger guards payment writes, not lifecycle
      // updates). `cancelledChargeIds` carries the ids that still need it.
      lifecycle: 'open',
    });
    if (c.lifecycle === 'cancelled') cancelledChargeIds.push(id);
  }
  if (chargeRows.length) guard((await supabase.from('charges').insert(chargeRows)).error);

  // A payment whose charge did not survive the import is DROPPED, not orphaned:
  // charge_id is NOT NULL and the composite FK would refuse it, so keeping it
  // would fail the whole import. The count is returned so the caller can report
  // what actually landed instead of implying everything did.
  const paymentRows = [];
  let paymentsSkipped = 0;
  for (const p of data.payments || []) {
    const chargeId = chargeIdMap[p.chargeId];
    if (!chargeId) { paymentsSkipped += 1; continue; }
    const v = validatePayment({ chargeId, amount: p.amount, paidAt: p.paidAt });
    if (!v.ok) { paymentsSkipped += 1; continue; }
    paymentRows.push({ id: uuid(), user_id: userId, ...mapToRow(v.value, PAYMENT_FIELDS) });
  }
  if (paymentRows.length) guard((await supabase.from('payments').insert(paymentRows)).error);

  // ...and only now restore the cancelled lifecycle, once every historical
  // payment is in. One statement for the whole set.
  if (cancelledChargeIds.length) {
    guard((await supabase.from('charges')
      .update({ lifecycle: 'cancelled' })
      .in('id', cancelledChargeIds)).error);
  }

  return {
    clients: clientRows.length, quotes: quoteRows.length, transactions: txRows.length,
    leads: leadRows.length, tasks: taskRows.length, businessProfile,
    charges: chargeRows.length, payments: paymentRows.length,
    chargesSkipped, paymentsSkipped,
  };
}

// Pure mapping helpers exported for focused unit tests (S0B + S0D).
export { uuid, mapToRow, rowToClient, rowToTask, rowToBusinessProfile, CLIENT_FIELDS, TASK_FIELDS, BUSINESS_PROFILE_FIELDS, nullifyBlankDates };

// ===================================================================
// Asset Library slice 1 — durable cloud gallery images.
//
// The ONE ordering rule, applied to both directions:
//   ALWAYS FAIL TOWARD THE VISIBLE STATE.
// An orphaned OBJECT is invisible forever — it occupies storage and quota
// that nothing in the product can show or reclaim. A dangling ROW is visible:
// it renders as a broken item the user can delete. So:
//
//   create: ROW first, then BYTES.
//     * row insert fails    -> nothing was written anywhere. Visible failure.
//     * byte upload fails   -> a dangling row remains. Visible failure, and
//       the row is DELIBERATELY NOT cleaned up: a "failed" upload that
//       actually landed would leave an invisible orphan object, which is the
//       one direction this rule forbids.
//
//   delete: OBJECT first, then ROW.
//     * object remove fails -> the row is NOT deleted. Nothing claims success.
//     * row delete fails    -> a dangling row remains. Visible, retryable.
//
// Bytes are reached ONLY through short-lived signed URLs. The bucket is
// private, and the public-URL helper is never called anywhere in the product —
// an invariant scanned by assetLibraryMigration.test.js (which is why that
// helper's name is not spelled out here: the scan would match this comment).
// ===================================================================

const ASSET_BUCKET = 'assets';
const ASSET_SIGNED_URL_TTL = 300; // seconds — short-lived by design

// Map the canonical in-memory asset onto its row. Kept inline (not a field map)
// because every value is derived from the validated upload, not from user input.
function assetToRow(userId, assetId, v, meta) {
  return {
    id: assetId,
    user_id: userId,
    ext: v.ext,
    mime: v.mime,
    byte_size: v.byteSize,
    storage_path: v.path,
    kind: 'image',
    source: meta.source ?? null,
    prompt: meta.prompt ?? null,
    preset: meta.preset ?? null,
    engine: meta.engine ?? null,
  };
}

/**
 * List the signed-in account's assets, newest first, each with a short-lived
 * signed URL. RLS scopes the select; the path CHECK guarantees every returned
 * row describes this account's own object.
 *
 * A row whose object is missing (a dangling row) keeps `url: null` and is
 * still returned — the user must be able to SEE and delete it.
 */
export async function listAssets() {
  const res = await supabase.from('assets').select('*').order('created_at', { ascending: false });
  guard(res.error);
  const items = (res.data || []).map(normalizeAssetRow).filter(Boolean);
  if (!items.length) return [];

  // One signed-URL call for the whole page. A per-path error is NOT fatal:
  // that item simply has no url and renders as dangling.
  const { data: signed } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrls(items.map((it) => it.storagePath), ASSET_SIGNED_URL_TTL);
  const urlByPath = new Map((signed || []).map((s) => [s.path, s.error ? null : s.signedUrl]));

  return sortAssetsNewestFirst(items.map((it) => ({ ...it, url: urlByPath.get(it.storagePath) || null })));
}

/**
 * Persist ONE image. `currentCount` is the account's known asset count and is
 * used only for a truthful pre-refusal — the 40-asset quota is enforced by the
 * storage.objects INSERT policy, which is what actually stops the write.
 *
 * Resolves with the created asset id. Rejects on ANY failure; the caller shows
 * success only after this resolves (persist-first, no optimistic gallery item).
 */
export async function createAsset(userId, blob, meta = {}, currentCount = 0) {
  const assetId = uuid();
  const v = validateAssetUpload({
    userId, assetId, mime: blob?.type, byteSize: blob?.size, currentCount,
  });
  if (!v.ok) {
    const err = new Error(v.error);
    err.userSafe = true; // already a truthful Hebrew message
    throw err;
  }

  // 1) ROW FIRST. If this fails nothing exists anywhere.
  guard((await supabase.from('assets').insert(assetToRow(userId, assetId, v, sanitizeAssetMeta(meta)))).error);

  // 2) THEN BYTES. `upsert: false` is REQUIRED: there is no UPDATE policy on
  // storage.objects for this bucket, so an overwrite is rejected by policy
  // rather than silently accepted.
  const up = await supabase.storage.from(ASSET_BUCKET).upload(v.path, blob, {
    contentType: v.mime,
    upsert: false,
  });
  if (up.error) {
    // The row stays. See the ordering rule above — cleaning it up here risks
    // deleting the record of an object that actually landed.
    const err = new Error('הקובץ לא הועלה לענן. הפריט מופיע כשבור בגלריה — אפשר למחוק אותו ולנסות שוב.');
    err.userSafe = true;
    err.cause = up.error;
    err.danglingAssetId = assetId;
    throw err;
  }
  return assetId;
}

/**
 * Delete ONE asset: object first, then row. Rejects if the object could not be
 * removed — in that case the row is untouched and nothing claims success.
 */
export async function deleteAsset(storagePath, assetId) {
  const rm = await supabase.storage.from(ASSET_BUCKET).remove([storagePath]);
  guard(rm.error); // object still there -> row NOT deleted, no false success
  guard((await supabase.from('assets').delete().eq('id', assetId)).error);
  return true;
}

// ===================================================================
// Campaigns slice 1 — the durable per-account BUSINESS campaign.
//
// NAMING BOUNDARY: this is public.campaigns, NOT the device-local creative
// session in `src/creative/v2/campaignStore.js`. See src/lib/campaigns.js.
//
// There is no Storage side and no second write, so none of the Asset Library's
// ordering rules apply here: every operation below is ONE statement whose
// success or failure is the whole truth. Nothing reports success on a rejected
// write — `guard()` rethrows and the caller surfaces the failure.
//
// Every client-side rule invoked here is ADVISORY (a truthful pre-refusal).
// The server is the authority: RLS for ownership, the WITH CHECK for the
// 200-row quota, trg_campaigns_status_transition for the lifecycle.
// ===================================================================

/** The signed-in account's campaigns, newest first. RLS scopes the select. */
export async function listCampaigns() {
  const res = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
  guard(res.error);
  return sortCampaignsNewestFirst((res.data || []).map(normalizeCampaignRow).filter(Boolean));
}

/**
 * Create ONE campaign in status 'draft'. `currentCount` is the account's known
 * campaign count, used ONLY for a truthful pre-refusal — the 200-row quota is
 * enforced by the INSERT policy's WITH CHECK.
 * Resolves with the created campaign id. Rejects on ANY failure.
 */
export async function createCampaign(userId, input = {}, currentCount = 0) {
  if (!canCreateWithin(currentCount)) {
    const err = new Error(`הגעת למכסת ${CAMPAIGN_QUOTA} הקמפיינים לחשבון. אפשר למחוק קמפיין קיים ולנסות שוב.`);
    err.userSafe = true;
    throw err;
  }
  const v = validateCampaign(input);
  if (!v.ok) {
    const err = new Error(v.errors[0]);
    err.userSafe = true;
    err.validationErrors = v.errors;
    throw err;
  }
  const id = uuid();
  guard((await supabase.from('campaigns').insert({
    id,
    user_id: userId,
    title: v.value.title,
    objective: v.value.objective,
    status: 'draft',
    start_date: v.value.startDate,
    end_date: v.value.endDate,
  })).error);
  return id;
}

/**
 * Update the editable fields of ONE campaign. Status is NOT changed here —
 * a lifecycle move goes through setCampaignStatus so the transition rule has
 * exactly one client-side entry point.
 */
export async function updateCampaign(campaignId, input = {}) {
  const v = validateCampaign(input);
  if (!v.ok) {
    const err = new Error(v.errors[0]);
    err.userSafe = true;
    err.validationErrors = v.errors;
    throw err;
  }
  guard((await supabase.from('campaigns').update({
    title: v.value.title,
    objective: v.value.objective,
    start_date: v.value.startDate,
    end_date: v.value.endDate,
  }).eq('id', campaignId)).error);
  return true;
}

/**
 * Move ONE campaign to `to`. The pre-check is advisory and exists so an
 * illegal move fails with a readable message instead of a raw 23514; the
 * trigger refuses it server-side either way, including when this check is
 * wrong or bypassed.
 */
export async function setCampaignStatus(campaignId, from, to) {
  if (!canTransition(from, to)) {
    const err = new Error('לא ניתן לעבור למצב הזה מהמצב הנוכחי.');
    err.userSafe = true;
    throw err;
  }
  guard((await supabase.from('campaigns').update({ status: to }).eq('id', campaignId)).error);
  return true;
}

/** Delete ONE campaign. RLS scopes it to the owner. */
export async function deleteCampaign(campaignId) {
  guard((await supabase.from('campaigns').delete().eq('id', campaignId)).error);
  return true;
}

// ===================================================================
// F1 Core Receivables — expected billing (charges) vs. money that actually
// arrived (payments).
//
// PAYMENTS ARE THE SOURCE OF TRUTH FOR RECEIVED REVENUE, and this file is where
// that is enforced in the IO layer: NOTHING below writes to `transactions`.
// Recording a payment creates exactly ONE row, in `payments`. A parallel income
// transaction would count the same shekel twice, and there is no code path here
// that could create one. (What this cannot prevent is a user recording the same
// receipt through the transaction form as well -- see the note on actualRevenue
// in receivables.js and L6 in the migration.)
//
// There is no Storage side and no second write, so none of the Asset Library's
// ordering rules apply: every operation below is ONE statement whose success or
// failure is the whole truth. `guard()` rethrows and the caller surfaces it.
//
// Every client-side rule invoked here is ADVISORY (a truthful pre-refusal). The
// server is the authority: RLS for ownership, the five composite foreign keys
// for same-owner relationships, the CHECK constraints for domains and bounds,
// and trg_payments_reject_cancelled for "no payment against a cancelled charge"
// — which is why createPayment does not pre-check the lifecycle: a client-side
// snapshot of it could be stale, and the refusal is the server's to make.
// ===================================================================

/** The signed-in account's charges, soonest due first. RLS scopes the select. */
export async function listCharges() {
  const res = await supabase.from('charges').select('*').order('due_date', { ascending: true });
  guard(res.error);
  return (res.data || []).map(normalizeChargeRow).filter(Boolean);
}

/** The signed-in account's payments, newest first. RLS scopes the select. */
export async function listPayments() {
  const res = await supabase.from('payments').select('*').order('paid_at', { ascending: false });
  guard(res.error);
  return (res.data || []).map(normalizePaymentRow).filter(Boolean);
}

/**
 * Create ONE charge. Validated AT THE BOUNDARY (defense in depth — the modal
 * validates too), then inserted as a single row in lifecycle 'open'.
 *
 * The due date is resolved by the shared validator: absent → computed from the
 * service month + terms and stamped `computed`; supplied → honoured verbatim and
 * stamped `manual`, so the screen can say which one it is showing.
 *
 * Resolves with the CREATED ROW as the server stored it. Rejects on ANY failure.
 */
export async function createCharge(userId, input = {}) {
  const v = validateCharge(input);
  if (!v.ok) {
    const err = new Error(v.errors[0]);
    err.userSafe = true;
    err.validationErrors = v.errors;
    throw err;
  }
  const id = uuid();
  // `.select().single()` deliberately: the store applies the SERVER'S row to
  // local state rather than reconstructing what it hopes was written. A
  // reconstructed row is a guess that looks like a fact.
  const res = await supabase.from('charges').insert({
    id, user_id: userId, ...mapToRow(v.value, CHARGE_FIELDS),
  }).select().single();
  guard(res.error);
  const charge = normalizeChargeRow(res.data);
  if (!charge) throw new Error('charges: the created row did not come back in a usable shape');
  return charge;
}

/**
 * Update the editable fields of ONE charge. `lifecycle` is NOT changed here — a
 * cancellation goes through cancelCharge so there is exactly one client-side
 * entry point for it, mirroring setCampaignStatus.
 */
export async function updateCharge(chargeId, input = {}) {
  const v = validateCharge(input);
  if (!v.ok) {
    const err = new Error(v.errors[0]);
    err.userSafe = true;
    err.validationErrors = v.errors;
    throw err;
  }
  const { lifecycle, ...editable } = v.value; // eslint-disable-line no-unused-vars
  const res = await supabase.from('charges')
    .update(mapToRow(editable, CHARGE_FIELDS)).eq('id', chargeId).select().single();
  guard(res.error);
  const charge = normalizeChargeRow(res.data);
  if (!charge) throw new Error('charges: the updated row did not come back in a usable shape');
  return charge;
}

/**
 * Cancel ONE charge. The lifecycle is the ONLY thing this touches: cancelling a
 * claim must never rewrite the money that was already received against it, and
 * the payments rows are left exactly where they are.
 */
export async function cancelCharge(chargeId) {
  guard((await supabase.from('charges').update({ lifecycle: 'cancelled' }).eq('id', chargeId)).error);
  return true;
}

/**
 * Reopen ONE cancelled charge. The lifecycle graph is symmetric by design
 * (open <-> cancelled, declared limitation L3), so this is the other half of
 * cancelCharge — without it an accidental cancellation is permanent through the
 * UI, and the charge is a durable row nothing can reach.
 */
export async function reopenCharge(chargeId) {
  guard((await supabase.from('charges').update({ lifecycle: 'open' }).eq('id', chargeId)).error);
  return true;
}

// SQLSTATEs raised by public.delete_charge_if_unpaid. THE CODE IS THE CONTRACT —
// never the message text, which is diagnostic, untranslated and free to change.
const CHARGE_DELETE_HAS_PAYMENTS = '23514';
const CHARGE_DELETE_NOT_FOUND = 'P0002';

/**
 * Delete ONE charge — and ONLY if it has no payment row.
 *
 * This goes through the `delete_charge_if_unpaid` RPC and NEVER through a plain
 * `from('charges').delete()`. The direct delete is what this function used to
 * do, and it was unsafe: `payments_charge_same_owner_fk` is ON DELETE CASCADE,
 * so it silently destroyed every payment attached to the charge. Payments are
 * the source of truth for received revenue; losing one moves actual revenue and
 * cannot be undone.
 *
 * The Finance screen only offers the control when it holds no payment for the
 * charge, but that check is a CONVENIENCE over possibly-stale client state. The
 * RPC is the enforcement: it locks the charge, checks payment-row EXISTENCE
 * server-side (not a sum, and not RLS-filtered), and refuses otherwise.
 *
 * Rejects with a `userMessage`-bearing Error on the two expected refusals, so
 * the store renders truthful Hebrew instead of a generic failure.
 */
export async function deleteCharge(chargeId) {
  const { error } = await supabase.rpc('delete_charge_if_unpaid', { p_charge_id: chargeId });
  if (!error) return true;
  if (error.code === CHARGE_DELETE_HAS_PAYMENTS) {
    throw engineError(
      `delete_charge_if_unpaid refused ${chargeId}: the charge has payment rows`,
      'לחיוב הזה רשומים תשלומים, ולכן אי אפשר למחוק אותו. אפשר לבטל אותו, או למחוק קודם את התשלומים.',
    );
  }
  if (error.code === CHARGE_DELETE_NOT_FOUND) {
    // Not-found and not-owned are the SAME code by design — the server does not
    // distinguish them, and neither does this message.
    throw engineError(
      `delete_charge_if_unpaid: charge ${chargeId} not found for this account`,
      'החיוב לא נמצא. ייתכן שהוא כבר נמחק — רענן/י את המסך.',
    );
  }
  throw error;
}

/**
 * Record ONE payment against a charge. This is the ONLY way received revenue
 * enters the product, and it writes to `payments` and nothing else — there is
 * deliberately no accompanying `transactions` insert anywhere in this function.
 *
 * Resolves with the CREATED ROW as the server stored it. Rejects on ANY failure.
 */
export async function createPayment(userId, input = {}) {
  const v = validatePayment(input);
  if (!v.ok) {
    const err = new Error(v.errors[0]);
    err.userSafe = true;
    err.validationErrors = v.errors;
    throw err;
  }
  const id = uuid();
  const res = await supabase.from('payments').insert({
    id, user_id: userId, ...mapToRow(v.value, PAYMENT_FIELDS),
  }).select().single();
  guard(res.error);
  const payment = normalizePaymentRow(res.data);
  if (!payment) throw new Error('payments: the created row did not come back in a usable shape');
  return payment;
}

/** Delete ONE payment (a correction). RLS scopes it to the owner. */
export async function deletePayment(paymentId) {
  guard((await supabase.from('payments').delete().eq('id', paymentId)).error);
  return true;
}

// Pure mapping helpers exported for focused unit tests (F1).
export { CHARGE_FIELDS, PAYMENT_FIELDS };

// ===================================================================
// Schedule Core slice 1 — durable appointments / lessons / events.
//
// CLOUD-ONLY, exactly like Campaigns: there is no local reducer, no seed and no
// localStorage fallback for an appointment, so the screen renders a truthful
// unavailable state in the local demo rather than a form that would persist
// nothing. Nothing here is routed through store.jsx's persist() — the page owns
// its own state and re-reads from the server after every write, which is the
// Campaigns precedent and the reason a row appears on screen only once the
// server has returned it.
//
// Every client-side rule invoked here is ADVISORY (a truthful pre-refusal). The
// server is the authority: RLS for ownership, the two composite foreign keys
// for the same-owner client and task links, and the CHECK constraints for the
// kind / status domains, the title and notes bounds, and end-after-start.
//
// NAMING BOUNDARY: this is `public.appointments`. It is NOT the Growth OS
// monthly action calendar (`src/data/growthCalendar.js`), it never reads it,
// and nothing in this block may import from `src/pages/growth/**`.
// ===================================================================

// Appointment write map (camel -> snake). An ALLOW-LIST: id and user_id are set
// explicitly on insert, created_at/updated_at are server-managed (default now()
// + trg_appointments_updated), and `status` is written on create and by
// setAppointmentStatus alone.
const APPOINTMENT_FIELDS = {
  kind: 'kind', title: 'title', clientId: 'client_id', taskId: 'task_id',
  startAt: 'start_at', endAt: 'end_at', notes: 'notes',
};

/** Raise the validator's first error as a user-safe Error. */
function refuse(errors) {
  const err = new Error(errors[0]);
  err.userSafe = true;
  err.validationErrors = errors;
  return err;
}

/**
 * The signed-in account's appointments, earliest first. RLS scopes the select.
 * Ordered by start_at server-side to match idx_appointments_user_start, and
 * re-sorted client-side so a malformed-row drop cannot leave a gap in the order.
 */
export async function listAppointments() {
  const res = await supabase.from('appointments').select('*').order('start_at', { ascending: true });
  guard(res.error);
  return sortByStart((res.data || []).map(normalizeAppointmentRow).filter(Boolean));
}

/**
 * Create ONE appointment. Resolves with the CREATED ROW as the server stored
 * it — never a locally reconstructed object. Rejects on ANY failure.
 *
 * No quota and no pre-count: this slice declares none (see the migration).
 */
export async function createAppointment(userId, input = {}) {
  const v = validateAppointment(input);
  if (!v.ok) throw refuse(v.errors);
  const id = uuid();
  const res = await supabase.from('appointments').insert({
    id, user_id: userId, status: v.value.status, ...mapToRow(v.value, APPOINTMENT_FIELDS),
  }).select().single();
  guard(res.error);
  const appointment = normalizeAppointmentRow(res.data);
  if (!appointment) throw new Error('appointments: the created row did not come back in a usable shape');
  return appointment;
}

/**
 * Update the editable fields of ONE appointment. Status is NOT changed here —
 * an outcome moves through setAppointmentStatus, so there is exactly one
 * client-side entry point for it, mirroring setCampaignStatus.
 */
export async function updateAppointment(appointmentId, input = {}) {
  const v = validateAppointment(input);
  if (!v.ok) throw refuse(v.errors);
  const res = await supabase.from('appointments')
    .update(mapToRow(v.value, APPOINTMENT_FIELDS))
    .eq('id', appointmentId).select().single();
  guard(res.error);
  const appointment = normalizeAppointmentRow(res.data);
  if (!appointment) throw new Error('appointments: the updated row did not come back in a usable shape');
  return appointment;
}

/**
 * Record the OUTCOME of one appointment. Every status is reachable from every
 * other on purpose (declared limitation L5): a no-show corrected to completed,
 * or a cancellation undone, are ordinary corrections, and there is no trigger
 * to refuse them. The domain itself is still the server's to enforce —
 * appointments_status_allowed refuses anything outside the four values.
 */
export async function setAppointmentStatus(appointmentId, to) {
  if (!APPOINTMENT_STATUSES.includes(to)) {
    const err = new Error('הסטטוס אינו מוכר.');
    err.userSafe = true;
    throw err;
  }
  guard((await supabase.from('appointments').update({ status: to }).eq('id', appointmentId)).error);
  return true;
}

/**
 * Delete ONE appointment. RLS scopes it to the owner. Cancelling is the
 * non-destructive option and is what the UI offers first — a cancelled lesson
 * that is still on the record is a fact worth keeping.
 */
export async function deleteAppointment(appointmentId) {
  guard((await supabase.from('appointments').delete().eq('id', appointmentId)).error);
  return true;
}

// Pure mapping helper exported for focused unit tests (Schedule Core slice 1).
export { APPOINTMENT_FIELDS };
