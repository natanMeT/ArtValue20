import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { StaggerGroup, Reveal } from '../components/ui/motion.jsx';
import CountUp from '../components/ui/CountUp.jsx';
import Icon from '../components/ui/Icon.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import ItemModal from '../components/forms/ItemModal.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { inventoryTotals } from '../lib/calc.js';
import { formatCurrency } from '../lib/format.js';

// Show agorot only when the amount isn't a whole shekel (so ₪0.25 / ₪1.5 stay precise).
const money = (n) => formatCurrency(n, { decimals: Number.isInteger(Number(n)) ? 0 : 2 });

function itemState(it) {
  const qty = Number(it.qty) || 0;
  const th = Number(it.lowThreshold) || 0;
  if (qty <= 0) return { key: 'out', label: 'אזל', cls: 'badge-lost' };
  if (th > 0 && qty <= th) return { key: 'low', label: 'מלאי נמוך', cls: 'badge-payment' };
  return { key: 'ok', label: 'תקין', cls: 'badge-completed' };
}

const FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'ok', label: 'תקין' },
  { key: 'low', label: 'מלאי נמוך' },
  { key: 'out', label: 'אזל' },
];

function StatCard({ label, value, icon, tone, money }) {
  const color = tone === 'low' ? '#e0a93b' : tone === 'out' ? '#ef7a7a' : tone === 'value' ? 'var(--lime-deep)' : 'var(--text)';
  return (
    <Reveal>
      <motion.div className="card kpi" whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
        <div className="kpi-top">
          <span className="kpi-label">{label}</span>
          <span className="kpi-ico"><Icon name={icon} size={18} /></span>
        </div>
        <div className="kpi-value tnum" style={{ color }}>
          <CountUp value={value} format={(n) => (money ? formatCurrency(n) : Math.round(n).toLocaleString('he-IL'))} />
        </div>
      </motion.div>
    </Reveal>
  );
}

export default function Inventory() {
  const { data, dispatch, toast } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const items = data.inventory || [];
  const totals = useMemo(() => inventoryTotals(items), [items]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== 'all' && itemState(it).key !== filter) return false;
      if (!term) return true;
      return [it.name, it.sku, it.category, it.supplier].some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [items, q, filter]);

  const save = (item) => {
    if (item.id) { dispatch({ type: 'UPDATE_ITEM', payload: item }); toast('הפריט עודכן · נשמר מקומית'); }
    else { dispatch({ type: 'ADD_ITEM', payload: item }); toast('פריט נוסף למלאי · נשמר מקומית'); }
    setEditing(null);
  };

  const adjust = (it, delta) => {
    const qty = Math.max(0, (Number(it.qty) || 0) + delta);
    dispatch({ type: 'UPDATE_ITEM', payload: { id: it.id, qty, updatedAt: new Date().toISOString().slice(0, 10) } });
  };

  const remove = () => {
    if (!toDelete) return;
    dispatch({ type: 'DELETE_ITEM', id: toDelete.id });
    toast('הפריט נמחק', 'error');
    setToDelete(null);
  };

  return (
    <div>
      <SectionHeader
        title="מלאי"
        sub="ניהול פריטים, כמויות, ערך מלאי והתראות מלאי נמוך"
        action={<button className="btn btn-primary" onClick={() => setEditing({})}><Icon name="plus" size={17} /> פריט חדש</button>}
      />

      <StaggerGroup className="kpi-grid" style={{ marginBottom: 18 }}>
        <StatCard label="סה״כ פריטים" value={totals.count} icon="dashboard" />
        <StatCard label="ערך המלאי" value={totals.totalValue} icon="wallet" tone="value" money />
        <StatCard label="מלאי נמוך" value={totals.low} icon="trendDown" tone="low" />
        <StatCard label="אזל מהמלאי" value={totals.out} icon="x" tone="out" />
      </StaggerGroup>

      <div className="toolbar">
        <div className="search-box">
          <span className="ico"><Icon name="search" size={18} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש פריט, מק״ט, קטגוריה או ספק..." />
        </div>
        <div className="filter-tabs hide-scroll" style={{ overflowX: 'auto', maxWidth: '100%' }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`filter-tab ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
      </div>

      <Reveal>
        <div className="card panel">
          {list.length === 0 ? (
            <EmptyState icon="dashboard" title="אין פריטים במלאי" hint="הוסף פריט ראשון כדי להתחיל לנהל מלאי" action={<button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size={15} /> פריט חדש</button>} />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>פריט</th><th>קטגוריה</th><th>כמות</th><th>מחיר יח׳</th><th>ערך</th><th>סטטוס</th><th style={{ textAlign: 'end' }}></th></tr>
                </thead>
                <tbody>
                  {list.map((it) => {
                    const st = itemState(it);
                    const qty = Number(it.qty) || 0;
                    return (
                      <tr key={it.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{it.name}</div>
                          {(it.sku || it.supplier) && <div className="dim" style={{ fontSize: '0.76rem' }}>{[it.sku, it.supplier].filter(Boolean).join(' · ')}</div>}
                        </td>
                        <td><span className="badge badge-neutral">{it.category}</span></td>
                        <td>
                          <div className="row gap-2" style={{ alignItems: 'center' }}>
                            <button className="qty-btn" onClick={() => adjust(it, -1)} aria-label="הפחת">−</button>
                            <span className="tnum" style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{qty}</span>
                            <button className="qty-btn" onClick={() => adjust(it, 1)} aria-label="הוסף">+</button>
                          </div>
                        </td>
                        <td className="tnum muted">{money(Number(it.unitPrice) || 0)}</td>
                        <td className="tnum" style={{ fontWeight: 700 }}>{money(qty * (Number(it.unitPrice) || 0))}</td>
                        <td><span className={`badge ${st.cls}`}><span className="dot" />{st.label}</span></td>
                        <td>
                          <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                            <button className="icon-action" onClick={() => setEditing(it)} aria-label="עריכה"><Icon name="edit" size={14} /></button>
                            <button className="icon-action del" onClick={() => setToDelete(it)} aria-label="מחיקה"><Icon name="trash" size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Reveal>

      <ItemModal open={!!editing} onClose={() => setEditing(null)} onSave={save} initial={editing && editing.id ? editing : null} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="מחיקת פריט"
        confirmLabel="מחק"
        message={`למחוק את "${toDelete?.name}" מהמלאי? פעולה זו אינה ניתנת לשחזור.`}
      />
    </div>
  );
}
