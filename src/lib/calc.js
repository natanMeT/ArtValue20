// Derived calculations — all KPIs/charts compute from live data.
import { monthLabel } from './format.js';

// ---- Quote math ----
export function quoteSubtotal(quote) {
  if (!quote?.items) return 0;
  return quote.items.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0),
    0
  );
}
export function quoteVat(quote) {
  return quoteSubtotal(quote) * ((Number(quote?.vatRate) || 0) / 100);
}
export function quoteTotal(quote) {
  return quoteSubtotal(quote) + quoteVat(quote);
}

// ---- Same calendar month helpers ----
function sameMonth(dateStr, ref) {
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

// ---- Finance aggregates ----
export function financeTotals(transactions) {
  let income = 0,
    expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += Number(t.amount) || 0;
    else expense += Number(t.amount) || 0;
  }
  return { income, expense, net: income - expense };
}

export function monthTotals(transactions, ref = new Date()) {
  let income = 0,
    expense = 0;
  for (const t of transactions) {
    if (!sameMonth(t.date, ref)) continue;
    if (t.type === 'income') income += Number(t.amount) || 0;
    else expense += Number(t.amount) || 0;
  }
  return { income, expense, net: income - expense };
}

// Build last-N-months series for charts: [{ key, label, income, expense, net }]
export function monthlySeries(transactions, n = 12) {
  const buckets = [];
  const ref = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      year: d.getFullYear(),
      month: d.getMonth(),
      label: monthLabel(d.toISOString()),
      income: 0,
      expense: 0,
      net: 0,
    });
  }
  const map = new Map(buckets.map((b) => [b.key, b]));
  for (const t of transactions) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = map.get(key);
    if (!b) continue;
    if (t.type === 'income') b.income += Number(t.amount) || 0;
    else b.expense += Number(t.amount) || 0;
  }
  buckets.forEach((b) => (b.net = b.income - b.expense));
  return buckets;
}

// ---- Inventory aggregates (computed in code — always exact) ----
export function inventoryTotals(items = []) {
  let count = 0;
  let totalQty = 0;
  let totalValue = 0;
  let totalCost = 0;
  let low = 0;
  let out = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const price = Number(it.unitPrice) || 0;
    const cost = Number(it.cost) || 0;
    const th = Number(it.lowThreshold) || 0;
    count += 1;
    totalQty += qty;
    totalValue += qty * price;
    totalCost += qty * cost;
    if (qty <= 0) out += 1;
    else if (th > 0 && qty <= th) low += 1;
  }
  return { count, totalQty, totalValue, totalCost, low, out };
}

export function lowStockItems(items = []) {
  return (items || []).filter((it) => {
    const qty = Number(it.qty) || 0;
    const th = Number(it.lowThreshold) || 0;
    return qty <= 0 || (th > 0 && qty <= th);
  });
}

// ---- Client aggregates ----
export function clientBreakdown(clients) {
  const counts = { lead: 0, active: 0, completed: 0, lost: 0 };
  for (const c of clients) {
    const key = c.status === 'completed_paid' ? 'completed' : c.status;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function pipelineValue(clients) {
  // open opportunities = leads + active
  return clients
    .filter((c) => c.status === 'lead' || c.status === 'active')
    .reduce((s, c) => s + (Number(c.value) || 0), 0);
}

// ---- Dashboard KPI bundle ----
export function dashboardKpis({ clients, quotes, transactions }) {
  const month = monthTotals(transactions);
  const activeClients = clients.filter(
    (c) => c.status === 'active' || c.status === 'lead'
  ).length;
  const pendingQuotes = quotes.filter(
    (q) => q.status === 'sent' || q.status === 'viewed' || q.status === 'draft'
  ).length;
  return {
    revenue: month.income,
    expenses: month.expense,
    profit: month.net,
    activeClients,
    pendingQuotes,
    pipeline: pipelineValue(clients),
  };
}

// percentage change vs previous month (for KPI deltas)
export function momChange(transactions, type) {
  const ref = new Date();
  const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const cur = monthTotals(transactions, ref);
  const old = monthTotals(transactions, prev);
  const pick = (o) => (type === 'income' ? o.income : type === 'expense' ? o.expense : o.net);
  const a = pick(cur);
  const b = pick(old);
  if (!b) return null;
  return ((a - b) / Math.abs(b)) * 100;
}
