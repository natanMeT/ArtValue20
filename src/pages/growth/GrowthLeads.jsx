import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from '../../components/ui/motion.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader } from '../../components/ui/atoms.jsx';
import {
  LEAD_CATEGORIES, FILTERS, STATS, PRICE_DISCLAIMER, matchesFilter,
} from '../../data/growthLeads.js';
import LeadCategoryGrid from './leads/LeadCategoryGrid.jsx';
import LeadCategoryDetail from './leads/LeadCategoryDetail.jsx';

// Growth OS · מיפוי לידים ואסטרטגיית הצעות (Slice 2)
// Static, presentational, deterministic. No persistence, no store, no AI.
// `filter` and `selected` are local UI state only.
export default function GrowthLeads() {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const visible = useMemo(
    () => LEAD_CATEGORIES.filter((c) => matchesFilter(c, filter)),
    [filter],
  );

  return (
    <div>
      <SectionHeader
        title="מיפוי לידים ואסטרטגיית הצעות"
        sub="כלי עבודה להחלטה: את מי לפנות, מה להציע, איזה ערך להראות ומה הפעולה הבאה."
        action={
          <Link className="btn btn-ghost btn-sm" to="/growth">
            <Icon name="chevronR" size={16} /> חזרה ל-Growth OS
          </Link>
        }
      />

      <Reveal>
        <div className="kpi-grid lead-stats">
          <div className="card kpi">
            <div className="kpi-top"><span className="kpi-label">קטגוריות לידים</span><span className="kpi-ico"><Icon name="target" size={18} /></span></div>
            <div className="kpi-value tnum">{STATS.categories}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-top"><span className="kpi-label">סוגי הצעות</span><span className="kpi-ico"><Icon name="briefcase" size={18} /></span></div>
            <div className="kpi-value tnum">{STATS.offerTypes}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-top"><span className="kpi-label">סוגי פעולה</span><span className="kpi-ico"><Icon name="send" size={18} /></span></div>
            <div className="kpi-value tnum">{STATS.actionTypes}</div>
          </div>
        </div>
      </Reveal>

      <p className="dim price-note" style={{ margin: '4px 2px 16px' }}>
        <Icon name="wallet" size={13} /> מחירים: {PRICE_DISCLAIMER}
      </p>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="filter-tabs hide-scroll" style={{ overflowX: 'auto', maxWidth: '100%' }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-tab ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <LeadCategoryGrid categories={visible} onSelect={setSelected} />

      <LeadCategoryDetail category={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
