import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { StaggerGroup, Reveal, ScrollReveal } from '../components/ui/motion.jsx';
import CountUp from '../components/ui/CountUp.jsx';
import Icon from '../components/ui/Icon.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import TransactionModal from '../components/forms/TransactionModal.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { RevenueExpenseChart, MonthlyBarChart } from '../components/charts/charts.jsx';
import { financeTotals, monthlySeries, monthTotals } from '../lib/calc.js';
import { formatCurrency, formatDate } from '../lib/format.js';

function StatCard({ label, value, icon, tone }) {
  const color = tone === 'income' ? 'var(--lime-deep)' : tone === 'expense' ? '#ef7a7a' : tone === 'net' ? 'var(--text)' : 'var(--text)';
  return (
    <Reveal>
      <motion.div className="card kpi" whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
        <div className="kpi-top">
          <span className="kpi-label">{label}</span>
          <span className="kpi-ico" style={tone === 'income' ? { background: 'var(--lime)', color: 'var(--on-lime)', borderColor: 'transparent' } : undefined}>
            <Icon name={icon} size={18} />
          </span>
        </div>
        <div className="kpi-value tnum" style={{ color }}>
          <CountUp value={value} format={(n) => formatCurrency(n)} />
        </div>
      </motion.div>
    </Reveal>
  );
}

export default function Finance() {
  const { data, dispatch, toast } = useStore();
  const [editing, setEditing] = useState(null); // 'new' | tx
  const [toDelete, setToDelete] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  const totals = useMemo(() => financeTotals(data.transactions), [data.transactions]);
  const series = useMemo(() => monthlySeries(data.transactions, 12), [data.transactions]);
  const thisMonth = useMemo(() => monthTotals(data.transactions), [data.transactions]);

  const completedCount = data.clients.filter((c) => c.status === 'completed' || c.status === 'completed_paid' || c.status === 'active').length;
  const avgPerProject = completedCount ? totals.income / completedCount : 0;

  const rows = useMemo(() => {
    const arr = typeFilter === 'all' ? data.transactions : data.transactions.filter((t) => t.type === typeFilter);
    return [...arr].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [data.transactions, typeFilter]);

  const save = (tx) => {
    if (tx.id) {
      dispatch({ type: 'UPDATE_TX', payload: tx });
      toast('התנועה עודכנה · נשמר מקומית');
    } else {
      dispatch({ type: 'ADD_TX', payload: tx });
      toast('תנועה נוספה · נשמר מקומית');
    }
    setEditing(null);
  };

  const remove = () => {
    if (!toDelete) return;
    dispatch({ type: 'DELETE_TX', id: toDelete.id });
    toast('התנועה נמחקה', 'error');
    setToDelete(null);
  };

  return (
    <div>
      <SectionHeader
        title="פיננסים"
        sub="הכנסות, הוצאות ורווחיות"
        action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> תנועה חדשה</button>}
      />

      <StaggerGroup className="stat-strip">
        <StatCard label="סך הכנסות" value={totals.income} icon="trendUp" tone="income" />
        <StatCard label="סך הוצאות" value={totals.expense} icon="trendDown" tone="expense" />
        <StatCard label="רווח נקי" value={totals.net} icon="target" tone="net" />
        <StatCard label="ממוצע לפרויקט" value={avgPerProject} icon="briefcase" tone="avg" />
      </StaggerGroup>

      <div className="bento">
        <ScrollReveal className="b-span-7">
          <div className="card panel" style={{ height: '100%' }}>
            <div className="panel-head">
              <div>
                <div className="panel-title">תזרים שנתי</div>
                <div className="sub">הכנסות מול הוצאות · 12 חודשים</div>
              </div>
              <div className="legend">
                <span className="legend-item"><span className="legend-dot" style={{ background: '#d4ff3f' }} />הכנסות</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#c7bfff' }} />הוצאות</span>
              </div>
            </div>
            <RevenueExpenseChart data={series} height={250} />
          </div>
        </ScrollReveal>

        <ScrollReveal className="b-span-5" delay={0.05}>
          <div className="card panel" style={{ height: '100%' }}>
            <div className="panel-head">
              <div>
                <div className="panel-title">רווח נקי חודשי</div>
                <div className="sub">החודש הנוכחי מודגש</div>
              </div>
              <span className="tnum" style={{ fontWeight: 800, fontSize: '1.2rem', color: thisMonth.net >= 0 ? 'var(--lime-deep)' : '#ef7a7a' }}>
                {formatCurrency(thisMonth.net)}
              </span>
            </div>
            <MonthlyBarChart data={series} height={250} />
          </div>
        </ScrollReveal>
      </div>

      {/* Transactions table */}
      <ScrollReveal className="b-span-12" style={{ marginTop: 16 }}>
        <div className="card panel">
          <div className="panel-head">
            <div className="panel-title">תנועות אחרונות</div>
            <div className="seg">
              {[{ k: 'all', l: 'הכל' }, { k: 'income', l: 'הכנסות' }, { k: 'expense', l: 'הוצאות' }].map((t) => (
                <button key={t.k} className={typeFilter === t.k ? 'on' : ''} onClick={() => setTypeFilter(t.k)}>{t.l}</button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon="wallet" title="אין תנועות" hint="הוסף הכנסה או הוצאה ראשונה" action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> תנועה חדשה</button>} />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>תיאור</th>
                    <th>קטגוריה</th>
                    <th>תאריך</th>
                    <th>סכום</th>
                    <th style={{ textAlign: 'end' }}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 40).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="row gap-3">
                          <span className="activity-ico" style={{ width: 34, height: 34 }}>
                            <Icon name={t.type === 'income' ? 'trendUp' : 'trendDown'} size={16} style={{ color: t.type === 'income' ? 'var(--lime-deep)' : '#ef7a7a' }} />
                          </span>
                          <span style={{ fontWeight: 500 }}>{t.description || (t.type === 'income' ? 'הכנסה' : 'הוצאה')}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-neutral">{t.category}</span></td>
                      <td className="muted">{formatDate(t.date)}</td>
                      <td className="tnum" style={{ fontWeight: 700, color: t.type === 'income' ? 'var(--lime-deep)' : '#ef7a7a' }}>
                        {t.type === 'income' ? '+' : '−'}{formatCurrency(t.amount)}
                      </td>
                      <td>
                        <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                          <button className="icon-action" onClick={() => setEditing(t)} aria-label="עריכה"><Icon name="edit" size={15} /></button>
                          <button className="icon-action del" onClick={() => setToDelete(t)} aria-label="מחיקה"><Icon name="trash" size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ScrollReveal>

      <TransactionModal open={!!editing} onClose={() => setEditing(null)} onSave={save} initial={editing && editing !== 'new' ? editing : null} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} message={`למחוק את התנועה על סך ${formatCurrency(toDelete?.amount || 0)}?`} />
    </div>
  );
}
