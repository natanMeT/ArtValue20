import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from '../../components/ui/motion.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader } from '../../components/ui/atoms.jsx';
import {
  CONTENT_LIBRARY_ITEMS, FILTERS, STATS, POSITIONING, matchesFilter,
} from '../../data/growthContentAds.js';
import ContentAdsGrid from './content/ContentAdsGrid.jsx';
import ContentAdsDetail from './content/ContentAdsDetail.jsx';

// Growth OS · ספריית פרסום ותוכן (Content & Ads Library)
// Static, presentational, deterministic. No persistence, no store, no AI,
// no publishing, no messaging. `filter` and `selected` are local UI state only.
export default function GrowthContentAds() {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const visible = useMemo(
    () => CONTENT_LIBRARY_ITEMS.filter((i) => matchesFilter(i, filter)),
    [filter],
  );

  return (
    <div>
      <SectionHeader
        title="ספריית פרסום ותוכן"
        sub="מאגר פרומטים, רעיונות ותבניות פרסום לשמירה על נוכחות עקבית."
        action={
          <Link className="btn btn-ghost btn-sm" to="/growth">
            <Icon name="chevronR" size={16} /> חזרה ל-Growth OS
          </Link>
        }
      />

      <Reveal>
        <div className="kpi-grid ads-stats">
          <div className="card kpi">
            <div className="kpi-top"><span className="kpi-label">קטגוריות</span><span className="kpi-ico"><Icon name="dashboard" size={18} /></span></div>
            <div className="kpi-value tnum">{STATS.categories}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-top"><span className="kpi-label">תבניות</span><span className="kpi-ico"><Icon name="image" size={18} /></span></div>
            <div className="kpi-value tnum">{STATS.items}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-top"><span className="kpi-label">פורמטים</span><span className="kpi-ico"><Icon name="filter" size={18} /></span></div>
            <div className="kpi-value tnum">{STATS.formats}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-top"><span className="kpi-label">קריאות לפעולה</span><span className="kpi-ico"><Icon name="send" size={18} /></span></div>
            <div className="kpi-value tnum">{STATS.ctas}</div>
          </div>
        </div>
      </Reveal>

      <p className="dim price-note" style={{ margin: '4px 2px 16px' }}>
        <Icon name="spark" size={13} /> מסר ליבה: {POSITIONING.core}
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

      <ContentAdsGrid items={visible} onSelect={setSelected} />

      <ContentAdsDetail item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
