import Icon from '../../../components/ui/Icon.jsx';
import { serviceById, actionById, levelMeta, formatBand } from '../../../data/growthLeads.js';

// One lead-category card. Presentational only — click/Enter opens the detail panel.
export default function LeadCategoryCard({ category, onSelect }) {
  const offer = serviceById(category.offerId);
  const action = actionById(category.action);
  const pot = levelMeta('salesPotential', category.salesPotential);
  const urg = levelMeta('urgency', category.urgency);

  const open = () => onSelect?.(category);
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  };

  return (
    <div
      className="card panel lead-card"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKey}
      aria-label={`פרטי אסטרטגיה — ${category.label}`}
    >
      <div className="row between gap-2">
        <span className="lead-ico"><Icon name={category.icon} size={20} /></span>
        <span className={`badge ${pot.cls}`}><span className="dot" />{pot.label}</span>
      </div>

      <h3 className="lead-name">{category.label}</h3>
      <p className="muted lead-who">{category.who}</p>
      {category.pains?.[0] && <p className="dim lead-pain">כאב עיקרי: {category.pains[0]}</p>}

      <div className="lead-chips">
        {offer && <span className="lead-chip"><Icon name="briefcase" size={13} /> {offer.name}</span>}
        {offer && <span className="lead-chip price"><Icon name="wallet" size={13} /> {formatBand(offer)}</span>}
      </div>

      <div className="row between gap-2 lead-foot">
        <span className={`badge ${urg.cls}`}><span className="dot" />{urg.label}</span>
        {action && <span className="lead-action"><Icon name={action.icon} size={14} /> {action.label}</span>}
      </div>
    </div>
  );
}
