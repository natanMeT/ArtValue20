import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import Icon from '../components/ui/Icon.jsx';
import { SectionHeader } from '../components/ui/atoms.jsx';
import { PIPELINE_STAGES } from '../data/studio.js';
import { formatCurrency, formatDateShort } from '../lib/format.js';

export default function Pipeline() {
  const { data, dispatch, toast } = useStore();
  const navigate = useNavigate();

  const byStage = useMemo(() => {
    const m = {};
    PIPELINE_STAGES.forEach((s) => (m[s.id] = []));
    data.clients.forEach((c) => {
      const st = c.pipelineStage && m[c.pipelineStage] ? c.pipelineStage : 'lead';
      m[st].push(c);
    });
    return m;
  }, [data.clients]);

  const move = (client, stage) => {
    dispatch({ type: 'UPDATE_CLIENT', payload: { id: client.id, pipelineStage: stage } });
    toast('הלקוח הועבר בפייפליין');
  };

  const total = data.clients.reduce((s, c) => s + (Number(c.value) || 0), 0);

  return (
    <div>
      <SectionHeader title="פייפליין" sub={`ניהול מכירות והתקדמות · שווי כולל ${formatCurrency(total)}`} />
      <div className="kanban">
        {PIPELINE_STAGES.map((stage) => {
          const items = byStage[stage.id] || [];
          const sum = items.reduce((s, c) => s + (Number(c.value) || 0), 0);
          return (
            <div key={stage.id} className="kanban-col">
              <div className="kanban-head">
                <span className="kanban-title">{stage.label}</span>
                <span className="kanban-count">{items.length}</span>
              </div>
              <div className="kanban-sum dim">{formatCurrency(sum)}</div>
              <div className="kanban-cards">
                {items.map((c) => (
                  <motion.div key={c.id} className="card kanban-card" whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{c.name}</div>
                    <div className="dim" style={{ fontSize: '0.76rem', marginTop: 2 }}>{c.projectType}</div>
                    <div className="row between" style={{ marginTop: 8 }}>
                      <span className="tnum" style={{ fontWeight: 700, color: 'var(--lime-deep)' }}>{formatCurrency(c.value)}</span>
                      <span className="dim" style={{ fontSize: '0.72rem' }}>{formatDateShort(c.date)}</span>
                    </div>
                    {c.nextAction && <div className="next-action" style={{ marginTop: 8, padding: '7px 10px', fontSize: '0.78rem' }}><Icon name="arrow" size={12} /><span>{c.nextAction}</span></div>}
                    <select className="select mini-select" style={{ marginTop: 8, width: '100%' }} value={c.pipelineStage || 'lead'} onChange={(e) => move(c, e.target.value)}>
                      {PIPELINE_STAGES.map((s) => <option key={s.id} value={s.id}>העבר ל: {s.label}</option>)}
                    </select>
                  </motion.div>
                ))}
                {items.length === 0 && <div className="kanban-empty dim">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
