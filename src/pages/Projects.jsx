import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { StaggerGroup, Reveal } from '../components/ui/motion.jsx';
import Icon from '../components/ui/Icon.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import ProjectModal from '../components/forms/ProjectModal.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { PROJECT_STATUS, SERVICE_TYPES, TEMPLATES, serviceLabel, labelOf, studioBadgeClass } from '../data/studio.js';
import { formatCurrency, formatDate } from '../lib/format.js';
import { uid } from '../data/seed.js';

const FILTERS = [{ id: 'all', label: 'הכל' }, ...PROJECT_STATUS];

function StudioBadge({ id, list }) {
  return <span className={`badge ${studioBadgeClass(id)}`}><span className="dot" />{labelOf(list, id)}</span>;
}

export default function Projects() {
  const { data, dispatch, toast } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // 'new' | project
  const [toDelete, setToDelete] = useState(null);

  const projects = data.projects || [];
  const openTasks = (pid) => (data.tasks || []).filter((t) => t.projectId === pid && t.status !== 'done').length;

  const list = useMemo(
    () => (filter === 'all' ? projects : projects.filter((p) => p.status === filter)),
    [projects, filter]
  );
  const counts = useMemo(() => {
    const m = { all: projects.length };
    PROJECT_STATUS.forEach((s) => (m[s.id] = projects.filter((p) => p.status === s.id).length));
    return m;
  }, [projects]);

  const save = (project) => {
    if (project.id) {
      dispatch({ type: 'UPDATE_PROJECT', payload: project });
      toast('הפרויקט עודכן · נשמר מקומית');
    } else {
      const id = uid('pr');
      dispatch({ type: 'ADD_PROJECT', payload: { ...project, id } });
      // generate tasks from template
      const tpl = TEMPLATES.find((t) => t.id === project.templateId);
      if (tpl) {
        tpl.tasks.forEach((title) =>
          dispatch({ type: 'ADD_TASK', payload: { projectId: id, clientId: project.clientId || null, title, status: 'new', priority: 'normal', deadline: null, assignee: 'נתן', linkRef: '', notes: '' } })
        );
        toast(`הפרויקט נוצר עם ${tpl.tasks.length} משימות מהתבנית`);
      } else {
        toast('פרויקט נוצר · נשמר מקומית');
      }
    }
    setEditing(null);
  };

  const remove = () => {
    if (!toDelete) return;
    dispatch({ type: 'DELETE_PROJECT', id: toDelete.id });
    toast('הפרויקט נמחק', 'error');
    setToDelete(null);
  };

  return (
    <div>
      <SectionHeader
        title="פרויקטים"
        sub="ניהול עבודות, סטטוסים, קבצים ומשימות לפי לקוח"
        action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> פרויקט חדש</button>}
      />

      <div className="toolbar">
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button key={f.id} className={`filter-tab ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label} <span style={{ opacity: 0.6 }}>{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon="briefcase" title="אין פרויקטים" hint={filter !== 'all' ? 'נסה סינון אחר' : 'פתח את הפרויקט הראשון'} action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> פרויקט חדש</button>} />
        </div>
      ) : (
        <StaggerGroup className="client-grid">
          {list.map((p) => (
            <Reveal key={p.id}>
              <motion.div className="card project-card" whileHover={{ scale: 1.015, y: -2 }} transition={{ duration: 0.2 }} onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="project-name">{p.name}</div>
                    <div className="dim" style={{ fontSize: '0.8rem', marginTop: 2 }}>{p.clientName} · {serviceLabel(p.serviceType)}</div>
                  </div>
                  <StudioBadge id={p.status} list={PROJECT_STATUS} />
                </div>

                <div className="proj-progress">
                  <div className="row between" style={{ fontSize: '0.74rem', marginBottom: 5 }}>
                    <span className="dim">התקדמות</span>
                    <span className="tnum" style={{ fontWeight: 700 }}>{p.progress || 0}%</span>
                  </div>
                  <div className="progress-track"><span className="progress-fill" style={{ width: `${p.progress || 0}%` }} /></div>
                </div>

                <div className="row between" style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div>
                    <div className="dim" style={{ fontSize: '0.72rem' }}>שווי</div>
                    <div className="tnum" style={{ fontSize: '1.05rem', fontWeight: 800 }}>{p.internal ? 'פנימי' : formatCurrency(p.value)}</div>
                  </div>
                  <div style={{ textAlign: 'end' }}>
                    <div className="dim" style={{ fontSize: '0.72rem' }}>דדליין</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{p.deadline ? formatDate(p.deadline) : 'פתוח'}</div>
                  </div>
                </div>

                {p.nextAction && (
                  <div className="next-action">
                    <Icon name="arrow" size={14} />
                    <span><b>הבא:</b> {p.nextAction}</span>
                  </div>
                )}

                <div className="row between" onClick={(e) => e.stopPropagation()}>
                  <span className="badge badge-neutral"><Icon name="check" size={13} /> {openTasks(p.id)} משימות פתוחות</span>
                  <div className="row gap-2">
                    <button className="icon-action" onClick={() => navigate(`/projects/${p.id}`)} title="פתיחה" aria-label="פתיחה"><Icon name="arrow" size={16} /></button>
                    <button className="icon-action" onClick={() => setEditing(p)} title="עריכה" aria-label="עריכה"><Icon name="edit" size={15} /></button>
                    <button className="icon-action del" onClick={() => setToDelete(p)} title="מחיקה" aria-label="מחיקה"><Icon name="trash" size={15} /></button>
                  </div>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </StaggerGroup>
      )}

      <ProjectModal open={!!editing} onClose={() => setEditing(null)} onSave={save} clients={data.clients} initial={editing && editing !== 'new' ? editing : null} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} message={`למחוק את "${toDelete?.name}"? פעולה זו תמחק גם את המשימות, הקישורים והקבצים של הפרויקט.`} />
    </div>
  );
}

export { StudioBadge };
