import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { StaggerGroup, Reveal } from '../components/ui/motion.jsx';
import CountUp from '../components/ui/CountUp.jsx';
import Icon from '../components/ui/Icon.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import TaskModal from '../components/forms/TaskModal.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { TASK_STATUS, TASK_PRIORITY, labelOf, studioBadgeClass } from '../data/studio.js';
import { formatDate } from '../lib/format.js';

const DAY = 86400000;
const isToday = (d) => d && new Date(d).toDateString() === new Date().toDateString();
const inDays = (d, n) => { if (!d) return false; const diff = new Date(d).getTime() - Date.now(); return diff >= -DAY && diff <= n * DAY; };

const FILTERS = [
  { id: 'all', label: 'הכל' },
  { id: 'today', label: 'היום' },
  { id: 'week', label: 'השבוע' },
  { id: 'urgent', label: 'דחופות' },
  { id: 'await_client', label: 'ממתין ללקוח' },
  { id: 'done', label: 'הושלם' },
];

function KpiMini({ label, value, icon, accent }) {
  return (
    <Reveal>
      <motion.div className="card kpi" whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
        <div className="kpi-top">
          <span className="kpi-label">{label}</span>
          <span className="kpi-ico" style={accent ? { background: 'var(--lime)', color: 'var(--on-lime)', borderColor: 'transparent' } : undefined}><Icon name={icon} size={18} /></span>
        </div>
        <div className="kpi-value tnum"><CountUp value={value} format={(n) => String(Math.round(n))} /></div>
      </motion.div>
    </Reveal>
  );
}

export default function Tasks() {
  const { data, dispatch, toast } = useStore();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const tasks = data.tasks || [];
  const projName = (id) => (data.projects || []).find((p) => p.id === id)?.name || '—';
  const clientName = (id) => data.clients.find((c) => c.id === id)?.name || '—';

  const kpis = useMemo(() => ({
    today: tasks.filter((t) => t.status !== 'done' && isToday(t.deadline)).length,
    open: tasks.filter((t) => t.status !== 'done').length,
    awaitClient: tasks.filter((t) => t.status === 'await_client').length,
    week: tasks.filter((t) => t.status !== 'done' && inDays(t.deadline, 7)).length,
    urgent: tasks.filter((t) => t.status !== 'done' && t.priority === 'urgent').length,
  }), [tasks]);

  const list = useMemo(() => {
    let arr = tasks;
    if (filter === 'today') arr = tasks.filter((t) => isToday(t.deadline) && t.status !== 'done');
    else if (filter === 'week') arr = tasks.filter((t) => inDays(t.deadline, 7) && t.status !== 'done');
    else if (filter === 'urgent') arr = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done');
    else if (filter === 'await_client') arr = tasks.filter((t) => t.status === 'await_client');
    else if (filter === 'done') arr = tasks.filter((t) => t.status === 'done');
    return [...arr].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  }, [tasks, filter]);

  const save = (task) => {
    if (task.id) { dispatch({ type: 'UPDATE_TASK', payload: task }); toast('המשימה עודכנה'); }
    else { dispatch({ type: 'ADD_TASK', payload: task }); toast('משימה נוספה'); }
    setEditing(null);
  };
  const setStatus = (task, status) => { dispatch({ type: 'UPDATE_TASK', payload: { id: task.id, status } }); toast(`סטטוס: ${labelOf(TASK_STATUS, status)}`); };
  const remove = () => { if (toDelete) { dispatch({ type: 'DELETE_TASK', id: toDelete.id }); toast('המשימה נמחקה', 'error'); setToDelete(null); } };

  return (
    <div>
      <SectionHeader
        title="משימות"
        sub="ניהול עבודה יומית לפי לקוחות ופרויקטים"
        action={<button className="btn btn-primary" onClick={() => setEditing('new')} disabled={(data.projects || []).length === 0}><Icon name="plus" size={18} /> משימה חדשה</button>}
      />

      <StaggerGroup className="kpi-grid">
        <KpiMini label="להיום" value={kpis.today} icon="clock" accent />
        <KpiMini label="פתוחות" value={kpis.open} icon="check" />
        <KpiMini label="ממתינות ללקוח" value={kpis.awaitClient} icon="users" />
        <KpiMini label="דדליינים השבוע" value={kpis.week} icon="calendar" />
        <KpiMini label="דחופות" value={kpis.urgent} icon="target" />
      </StaggerGroup>

      <div className="toolbar" style={{ marginTop: 18 }}>
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button key={f.id} className={`filter-tab ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>

      <div className="card panel">
        {list.length === 0 ? (
          <EmptyState icon="check" title="אין משימות" hint="הוסף משימה חדשה" action={(data.projects || []).length > 0 && <button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> משימה חדשה</button>} />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>משימה</th><th>לקוח</th><th>פרויקט</th><th>סטטוס</th><th>עדיפות</th><th>דדליין</th><th style={{ textAlign: 'end' }}>פעולה</th></tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id} style={t.status === 'done' ? { opacity: 0.55 } : undefined}>
                    <td style={{ fontWeight: 500, maxWidth: 280 }}>{t.title}</td>
                    <td className="muted">{clientName(t.clientId)}</td>
                    <td className="muted">{projName(t.projectId)}</td>
                    <td>
                      <select className="select mini-select" value={t.status} onChange={(e) => setStatus(t, e.target.value)}>
                        {TASK_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </td>
                    <td><span className={`badge ${studioBadgeClass(t.priority)}`}><span className="dot" />{labelOf(TASK_PRIORITY, t.priority)}</span></td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{t.deadline ? formatDate(t.deadline) : '—'}</td>
                    <td>
                      <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                        {t.status !== 'done' && <button className="icon-action" onClick={() => setStatus(t, 'done')} title="סמן כהושלם" aria-label="הושלם"><Icon name="check" size={15} /></button>}
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

      <TaskModal open={!!editing} onClose={() => setEditing(null)} onSave={save} projects={data.projects || []} initial={editing && editing !== 'new' ? editing : null} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} message={`למחוק את המשימה "${toDelete?.title}"?`} />
    </div>
  );
}
