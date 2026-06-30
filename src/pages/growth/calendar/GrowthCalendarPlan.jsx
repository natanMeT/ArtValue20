import Icon from '../../../components/ui/Icon.jsx';
import { FEASIBILITY, CALENDAR_DISCLAIMER } from '../../../data/growthCalendar.js';

function Stat({ label, value, icon }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-ico"><Icon name={icon} size={18} /></span>
      </div>
      <div className="kpi-value tnum">{value}</div>
    </div>
  );
}

// Live plan summary: required deals / leads / outreach + advisory daily load.
export default function GrowthCalendarPlan({ plan }) {
  const feas = FEASIBILITY[plan.feasibility] || FEASIBILITY.feasible;
  return (
    <div>
      <div className="kpi-grid gc-summary">
        <Stat label="עסקאות נדרשות" value={plan.dealsNeeded} icon="briefcase" />
        <Stat label="לידים מתעניינים נדרשים" value={plan.qualifiedLeadsNeeded} icon="target" />
        <Stat label="פניות להתחיל" value={plan.leadsToApproach} icon="send" />
        <div className="card kpi">
          <div className="kpi-top">
            <span className="kpi-label">עומס יומי משוער</span>
            <span className="kpi-ico"><Icon name="clock" size={18} /></span>
          </div>
          <div className="kpi-value tnum">{plan.perDay}<span className="dim" style={{ fontSize: '0.7rem' }}> /יום</span></div>
          <div style={{ marginTop: 8 }}>
            <span className={`badge ${feas.cls}`}><span className="dot" />{feas.label}</span>
          </div>
        </div>
      </div>
      <p className="dim price-note" style={{ margin: '10px 2px 0' }}>
        <Icon name="spark" size={13} /> {CALENDAR_DISCLAIMER}
      </p>
    </div>
  );
}
