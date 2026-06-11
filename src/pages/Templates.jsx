import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { StaggerGroup, Reveal } from '../components/ui/motion.jsx';
import Icon from '../components/ui/Icon.jsx';
import ProjectModal from '../components/forms/ProjectModal.jsx';
import { SectionHeader } from '../components/ui/atoms.jsx';
import { TEMPLATES, serviceLabel } from '../data/studio.js';
import { uid } from '../data/seed.js';

export default function Templates() {
  const { data, dispatch, toast } = useStore();
  const navigate = useNavigate();
  const [preset, setPreset] = useState(null); // template to base a new project on

  const create = (project) => {
    const id = uid('pr');
    dispatch({ type: 'ADD_PROJECT', payload: { ...project, id } });
    const tpl = TEMPLATES.find((t) => t.id === project.templateId);
    if (tpl) {
      tpl.tasks.forEach((title) =>
        dispatch({ type: 'ADD_TASK', payload: { projectId: id, clientId: project.clientId || null, title, status: 'new', priority: 'normal', deadline: null, assignee: 'נתן', linkRef: '', notes: '' } })
      );
    }
    toast('פרויקט נוצר מהתבנית');
    setPreset(null);
    navigate(`/projects/${id}`);
  };

  return (
    <div>
      <SectionHeader title="תבניות" sub="תבניות מוכנות לפתיחת פרויקטים ומשימות אוטומטיות" />

      <StaggerGroup className="client-grid">
        {TEMPLATES.map((t) => (
          <Reveal key={t.id}>
            <motion.div className="card panel template-card" whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
              <div className="row between">
                <div className="row gap-3">
                  <span className="kpi-ico" style={{ background: 'var(--lime)', color: 'var(--on-lime)', borderColor: 'transparent' }}><Icon name="copy" size={18} /></span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.02rem' }}>{t.name}</div>
                    <div className="dim" style={{ fontSize: '0.78rem' }}>{serviceLabel(t.serviceType)} · {t.tasks.length} משימות</div>
                  </div>
                </div>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '12px 0' }}>{t.desc}</p>
              <div className="tpl-tasks">
                {t.tasks.slice(0, 6).map((task, i) => (
                  <div key={i} className="tpl-task"><span className="tpl-num">{i + 1}</span>{task}</div>
                ))}
                {t.tasks.length > 6 && <div className="dim" style={{ fontSize: '0.8rem', paddingInlineStart: 28 }}>+ עוד {t.tasks.length - 6} משימות…</div>}
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => setPreset(t)} disabled={data.clients.length === 0}>
                <Icon name="plus" size={17} /> צור פרויקט מהתבנית
              </button>
            </motion.div>
          </Reveal>
        ))}
      </StaggerGroup>

      <ProjectModal
        open={!!preset}
        onClose={() => setPreset(null)}
        onSave={create}
        clients={data.clients}
        initial={preset ? { name: preset.name, serviceType: preset.serviceType, templateId: preset.id, status: 'active', progress: 0, clientId: data.clients[0]?.id || '' } : null}
      />
    </div>
  );
}
