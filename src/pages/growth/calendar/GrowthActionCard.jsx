import { Link } from 'react-router-dom';
import Icon from '../../../components/ui/Icon.jsx';

// One monthly activity-volume card. Presentational; the optional `to` link
// navigates to the Growth OS module where this action is prepared (no
// automation — navigation only).
export default function GrowthActionCard({ icon, label, count, note, to, linkLabel }) {
  return (
    <div className="card kpi gc-action">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-ico"><Icon name={icon} size={18} /></span>
      </div>
      <div className="kpi-value tnum">{count}</div>
      {note && <p className="dim gc-action-note">{note}</p>}
      {to && (
        <Link className="btn btn-ghost btn-sm gc-action-go" to={to}>
          {linkLabel || 'למודול'} <Icon name="chevronL" size={14} />
        </Link>
      )}
    </div>
  );
}
