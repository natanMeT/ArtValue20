import Icon from '../../../components/ui/Icon.jsx';
import { CALENDAR_ACTIONS } from '../../../data/growthCalendar.js';

// One of the four weekly focus cards. Presentational.
export default function GrowthWeekCard({ week }) {
  // Show only the actions that have a count this week (keeps cards uncluttered).
  const chips = CALENDAR_ACTIONS
    .map((a) => ({ ...a, count: week.actions[a.key] || 0 }))
    .filter((a) => a.count > 0);

  return (
    <div className="card panel gc-week">
      <h3 className="gc-week-title">{week.title}</h3>
      <p className="muted gc-week-instruction">{week.instruction}</p>
      <div className="lead-chips">
        {chips.length === 0 && <span className="dim">אין פעולות מתוכננות לשבוע זה.</span>}
        {chips.map((a) => (
          <span key={a.key} className="lead-chip">
            <Icon name={a.icon} size={13} /> {a.label} · <span className="tnum">{a.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
