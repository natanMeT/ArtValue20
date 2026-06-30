import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal, StaggerGroup } from '../../components/ui/motion.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader } from '../../components/ui/atoms.jsx';
import { PRICE_DISCLAIMER } from '../../data/growthLeads.js';
import {
  CALENDAR_DEFAULTS, CALENDAR_ACTIONS, planFromTargets, weeklyBreakdown, rankCategoryFocus,
} from '../../data/growthCalendar.js';
import GrowthCalendarControls from './calendar/GrowthCalendarControls.jsx';
import GrowthCalendarPlan from './calendar/GrowthCalendarPlan.jsx';
import GrowthActionCard from './calendar/GrowthActionCard.jsx';
import GrowthWeekCard from './calendar/GrowthWeekCard.jsx';

// Growth OS · לוח פעולה חודשי (Slice 3)
// Deterministic, presentational planner. Local UI state only — no persistence,
// no store, no AI, no calendar API.
export default function GrowthCalendar() {
  const [values, setValues] = useState(CALENDAR_DEFAULTS);

  const plan = useMemo(() => planFromTargets(values), [values]);
  const weeks = useMemo(() => weeklyBreakdown(plan), [plan]);
  const focus = useMemo(() => rankCategoryFocus(5), []);

  const onChange = (key, raw) => {
    // keep raw string empty → 0 so the field can be cleared while typing
    const v = raw === '' ? 0 : Number(raw);
    setValues((prev) => ({ ...prev, [key]: Number.isFinite(v) ? v : prev[key] }));
  };
  const onReset = () => setValues(CALENDAR_DEFAULTS);

  return (
    <div>
      <SectionHeader
        title="לוח פעולה חודשי"
        sub="תכנון חודשי שמתרגם יעד הכנסה לפעולות יומיות: פניות, שיחות, דמואים, פולואפים והצעות מחיר."
        action={
          <Link className="btn btn-ghost btn-sm" to="/growth">
            <Icon name="chevronR" size={16} /> חזרה ל-Growth OS
          </Link>
        }
      />

      <Reveal>
        <GrowthCalendarControls values={values} onChange={onChange} onReset={onReset} />
      </Reveal>

      <div style={{ marginTop: 18 }}>
        <Reveal><GrowthCalendarPlan plan={plan} /></Reveal>
      </div>

      <h3 className="gc-section-title">פעילות מומלצת החודש</h3>
      <StaggerGroup className="kpi-grid gc-actions">
        {CALENDAR_ACTIONS.map((a) => (
          <Reveal key={a.key}>
            <GrowthActionCard icon={a.icon} label={a.label} count={plan.actions[a.key]} note={a.note} />
          </Reveal>
        ))}
      </StaggerGroup>

      <h3 className="gc-section-title">פירוק שבועי</h3>
      <StaggerGroup className="client-grid">
        {weeks.map((w) => (
          <Reveal key={w.id} style={{ height: '100%' }}>
            <GrowthWeekCard week={w} />
          </Reveal>
        ))}
      </StaggerGroup>

      <h3 className="gc-section-title">קטגוריות לידים להתמקד בהן החודש</h3>
      <StaggerGroup className="client-grid">
        {focus.map((f) => (
          <Reveal key={f.id} style={{ height: '100%' }}>
            <div className="card panel gc-focus">
              <div className="row between gap-2">
                <h4 className="gc-focus-name">{f.label}</h4>
                <span className={`badge ${f.potential.cls}`}><span className="dot" />{f.potential.label}</span>
              </div>
              <p className="muted gc-focus-who">{f.who}</p>
              <p className="dim gc-focus-why">למה החודש: {f.whyFit}</p>
              <div className="lead-chips">
                <span className="lead-chip"><Icon name="briefcase" size={13} /> {f.offerName}</span>
                <span className="lead-chip price"><Icon name="wallet" size={13} /> {f.priceBand}</span>
              </div>
              <div className="row between gap-2 gc-focus-foot">
                <span className={`badge ${f.urgency.cls}`}><span className="dot" />{f.urgency.label}</span>
                {f.action && <span className="lead-action"><Icon name={f.action.icon} size={14} /> {f.action.label}</span>}
              </div>
            </div>
          </Reveal>
        ))}
      </StaggerGroup>

      <p className="dim price-note" style={{ margin: '16px 2px 0' }}>
        <Icon name="wallet" size={13} /> מחירים: {PRICE_DISCLAIMER}
      </p>
    </div>
  );
}
