import { useMemo, useState } from 'react';
import { useStore } from '../store/store.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { StaggerGroup, Reveal } from '../components/ui/motion.jsx';
import Icon from '../components/ui/Icon.jsx';

// Visual map for each audit-log event kind.
const KIND = {
  client_add: { icon: 'users', color: 'var(--lime-deep)' },
  client_value: { icon: 'edit', color: 'var(--text)' },
  client_status: { icon: 'check', color: 'var(--text)' },
  client_delete: { icon: 'trash', color: '#ef7a7a' },
  income: { icon: 'trendUp', color: 'var(--lime-deep)' },
  expense: { icon: 'trendDown', color: '#ef7a7a' },
};
const fmt = (ts) => {
  try { return new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};
const SEG = [{ k: 'all', l: 'הכל' }, { k: 'client', l: 'לקוחות' }, { k: 'income', l: 'הכנסות' }, { k: 'expense', l: 'הוצאות' }];

// The audit-log / memory, made visible — the same recorded history ג׳יק reads to
// answer "what changed / what was X before".
export default function Activity() {
  const { data } = useStore();
  const [filter, setFilter] = useState('all');
  const all = data.activity || [];
  const items = useMemo(() => (filter === 'all' ? all : all.filter((a) => (a.kind || '').startsWith(filter))), [all, filter]);

  return (
    <div>
      <SectionHeader title="יומן פעילות" sub="ההיסטוריה המלאה של השינויים במערכת — נרשמת אוטומטית, וג׳יק זוכר אותה" />
      <div className="card panel">
        <div className="panel-head">
          <div className="panel-title">{all.length} אירועים</div>
          <div className="seg">
            {SEG.map((s) => (
              <button key={s.k} className={filter === s.k ? 'on' : ''} onClick={() => setFilter(s.k)}>{s.l}</button>
            ))}
          </div>
        </div>
        {!items.length ? (
          <EmptyState icon="clock" title="עדיין אין פעילות" hint="כל שינוי — שווי לקוח, תשלום, הכנסה — יירשם כאן אוטומטית." />
        ) : (
          <StaggerGroup>
            {items.map((a, i) => {
              const m = KIND[a.kind] || { icon: 'clock', color: 'var(--text)' };
              return (
                <Reveal key={a.id || i}>
                  <div className="row between" style={{ padding: '13px 4px', borderBottom: i < items.length - 1 ? '1px solid var(--line)' : 'none', gap: 12 }}>
                    <div className="row gap-3" style={{ alignItems: 'center' }}>
                      <span className="activity-ico" style={{ width: 34, height: 34 }}>
                        <Icon name={m.icon} size={16} style={{ color: m.color }} />
                      </span>
                      <span style={{ fontWeight: 500 }}>{a.summary}</span>
                    </div>
                    <span className="muted tnum" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmt(a.ts)}</span>
                  </div>
                </Reveal>
              );
            })}
          </StaggerGroup>
        )}
      </div>
    </div>
  );
}
