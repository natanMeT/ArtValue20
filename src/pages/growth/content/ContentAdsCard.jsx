import Icon from '../../../components/ui/Icon.jsx';
import { categoryById, formatById } from '../../../data/growthContentAds.js';

// One content/ad template card. Presentational only — click/Enter opens the detail modal.
export default function ContentAdsCard({ item, onSelect }) {
  const cat = categoryById(item.categoryId);
  const formats = (item.formats || []).map(formatById).filter(Boolean);

  const open = () => onSelect?.(item);
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  };

  return (
    <div
      className="card panel ads-card"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKey}
      aria-label={`תבנית פרסום — ${item.title}`}
    >
      <div className="row between gap-2">
        <span className="ads-ico"><Icon name={cat?.icon || 'image'} size={18} /></span>
        {cat && <span className="badge badge-neutral"><span className="dot" />{cat.label}</span>}
      </div>

      <h3 className="ads-title">{item.title}</h3>
      <p className="muted ads-goal">{item.goal}</p>

      <div className="ads-chips ads-card-foot">
        {item.tone && <span className="ads-chip tone"><Icon name="spark" size={12} /> {item.tone}</span>}
        {formats.slice(0, 2).map((f) => (
          <span key={f.id} className="ads-chip"><Icon name={f.icon} size={12} /> {f.name}</span>
        ))}
      </div>
    </div>
  );
}
