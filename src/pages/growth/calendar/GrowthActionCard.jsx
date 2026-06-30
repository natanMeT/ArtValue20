import Icon from '../../../components/ui/Icon.jsx';

// One monthly activity-volume card. Presentational.
export default function GrowthActionCard({ icon, label, count, note }) {
  return (
    <div className="card kpi gc-action">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-ico"><Icon name={icon} size={18} /></span>
      </div>
      <div className="kpi-value tnum">{count}</div>
      {note && <p className="dim gc-action-note">{note}</p>}
    </div>
  );
}
