// ===================================================================
// Supabase data-access layer for Art Value.
// Keeps the SAME in-memory shape the UI already uses:
//   client: { id, name, contact, phone, email, status, value, date, source, projectType, notes }
//   quote:  { id, number, clientId, date, validDays, vatRate, status, notes, items:[{id,desc,qty,price}] }
//   tx:     { id, type, amount, category, date, description, clientId }
// Only this file knows about snake_case columns and the quote_items table.
// ===================================================================
import { supabase } from './supabase.js';

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

function mapToRow(obj, fieldMap) {
  const row = {};
  for (const k of Object.keys(fieldMap)) {
    if (k in obj && obj[k] !== undefined) row[fieldMap[k]] = obj[k];
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

function guard(error) {
  if (error) throw error;
}

// ===================================================================
// Read everything for the signed-in user (RLS scopes to their rows).
// ===================================================================
export async function fetchAll() {
  const [clientsRes, quotesRes, itemsRes, txRes, leadsRes] = await Promise.all([
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    supabase.from('quote_items').select('*').order('position', { ascending: true }),
    supabase.from('transactions').select('*').order('date', { ascending: false }),
    supabase.from('outreach_leads').select('*').order('created_at', { ascending: true }),
  ]);
  guard(clientsRes.error); guard(quotesRes.error); guard(itemsRes.error); guard(txRes.error); guard(leadsRes.error);

  const itemsByQuote = {};
  for (const it of itemsRes.data) (itemsByQuote[it.quote_id] ||= []).push(rowToItem(it));

  const quotes = quotesRes.data.map((q) => ({ ...rowToQuote(q), items: itemsByQuote[q.id] || [] }));

  return {
    clients: clientsRes.data.map(rowToClient),
    quotes,
    transactions: txRes.data.map(rowToTx),
    outreachLeads: leadsRes.data.map(rowToLead),
    meta: { source: 'supabase' },
  };
}

// ===================================================================
// Mutations — each takes the already-known record (ids assigned in store).
// ===================================================================
export async function createClient(userId, client) {
  guard((await supabase.from('clients').insert({ id: client.id, user_id: userId, ...mapToRow(client, CLIENT_FIELDS) })).error);
}
export async function updateClient(client) {
  guard((await supabase.from('clients').update(mapToRow(client, CLIENT_FIELDS)).eq('id', client.id)).error);
}
export async function deleteClient(id) {
  // FK cascade removes the client's quotes + their items.
  guard((await supabase.from('clients').delete().eq('id', id)).error);
}

async function writeItems(userId, quoteId, items) {
  guard((await supabase.from('quote_items').delete().eq('quote_id', quoteId)).error);
  if (items && items.length) {
    const rows = items.map((it, i) => ({
      user_id: userId, quote_id: quoteId,
      description: it.desc || '', qty: Number(it.qty) || 1, price: Number(it.price) || 0, position: i,
    }));
    guard((await supabase.from('quote_items').insert(rows)).error);
  }
}

export async function createQuote(userId, quote) {
  guard((await supabase.from('quotes').insert({ id: quote.id, user_id: userId, ...mapToRow(quote, QUOTE_FIELDS) })).error);
  await writeItems(userId, quote.id, quote.items);
}
export async function updateQuote(userId, quote) {
  const row = mapToRow(quote, QUOTE_FIELDS);
  if (Object.keys(row).length) guard((await supabase.from('quotes').update(row).eq('id', quote.id)).error);
  if (quote.items !== undefined) await writeItems(userId, quote.id, quote.items);
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

// ===================================================================
// Bulk upload (migration from localStorage / JSON backup import).
// Remaps old ids → fresh uuids so FKs stay consistent. Returns counts.
// ===================================================================
export async function bulkUpload(userId, data) {
  const clientIdMap = {};
  const clientRows = (data.clients || []).map((c) => {
    const id = uuid();
    clientIdMap[c.id] = id;
    return { id, user_id: userId, ...mapToRow(c, CLIENT_FIELDS) };
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

  return { clients: clientRows.length, quotes: quoteRows.length, transactions: txRows.length, leads: leadRows.length };
}

export { uuid };
