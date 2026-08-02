import { useMemo, useState, useEffect } from 'react';
import Icon from '../components/ui/Icon.jsx';
import { SectionHeader } from '../components/ui/atoms.jsx';
import { useStore } from '../store/store.jsx';
import {
  CALENDAR_ACTIONS, CALENDAR_DISCLAIMER, FEASIBILITY,
  planFromTargets, weeklyBreakdown,
} from '../data/growthCalendar.js';
import {
  derivePlanDefaults, hasDerivedValue,
  PLAN_SOURCE_LABELS, TARGET_SOURCE_NOTE, NO_DATA_NOTE,
} from '../lib/planDefaults.js';

// ===================================================================
// Monthly Plan (/plan) — READ-ONLY planner.
//
// WHAT IT IS: the deterministic planning math from growthCalendar.js, fed by
// the ACCOUNT'S OWN durable data instead of hard-coded assumptions.
//
// WHAT IT IS NOT, deliberately and permanently in this slice:
//   * NOT persisted   — no store dispatch, no api call, no localStorage
//   * NOT a task/campaign generator — it creates nothing
//   * NOT Jake/AI     — no prompt, no gateway call
//   * NOT /growth     — this route is OUTSIDE GrowthBetaGate and links NOWHERE
//                       into Growth OS. Growth stays contained exactly as it is.
//
// THIS IS ALSO NOT /schedule. /schedule holds durable `appointments` (a real
// time of day). This plans monthly activity VOLUME and stores nothing. And it
// is not /growth/calendar, which is the same math over demo lead data behind
// the beta gate.
//
// ⚠️ NO framer-motion entrance wrappers on this page, on purpose. Reveal /
// StaggerGroup start at opacity 0 and animate in on requestAnimationFrame; in a
// hidden/automated browser pane rAF never fires, so the whole page measures as
// invisible and a real layout defect becomes indistinguishable from a frozen
// animation. This page must be measurable, so it renders statically.
// ===================================================================

// The five editable assumptions. Labels/steps match the existing Growth
// planner so the two never disagree about what a field means.
const FIELDS = [
  { key: 'target', label: 'יעד הכנסה חודשי (₪)', min: 0, step: 500 },
  { key: 'avgDeal', label: 'גודל עסקה ממוצע (₪)', min: 0, step: 250 },
  { key: 'closeRate', label: 'סיכוי סגירה (%)', min: 0, max: 100, step: 1 },
  { key: 'qualifyRate', label: 'יחס פנייה → ליד מתעניין (%)', min: 0, max: 100, step: 1 },
  { key: 'workDays', label: 'ימי עבודה זמינים בחודש', min: 0, max: 31, step: 1 },
];

function Stat({ label, value, icon, children }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-ico"><Icon name={icon} size={18} /></span>
      </div>
      <div className="kpi-value tnum">{value}</div>
      {children}
    </div>
  );
}

export default function MonthlyPlan() {
  const { data } = useStore();

  // Derived ONCE per snapshot change. `now` is passed explicitly so the helper
  // never reads the clock itself (it stays unit-testable and deterministic).
  const derived = useMemo(
    () => derivePlanDefaults(
      { quotes: data.quotes, payments: data.payments, transactions: data.transactions },
      new Date(),
    ),
    [data.quotes, data.payments, data.transactions],
  );

  const [values, setValues] = useState(derived.values);

  // The store hydrates asynchronously in cloud mode, so the first render can
  // legitimately be an empty snapshot. Re-seed the fields when the derived
  // baseline changes -- this is local UI state only; nothing is saved either way.
  useEffect(() => { setValues(derived.values); }, [derived.values]);

  const plan = useMemo(() => planFromTargets(values), [values]);
  const weeks = useMemo(() => weeklyBreakdown(plan), [plan]);
  const feasibility = FEASIBILITY[plan.feasibility] || FEASIBILITY.feasible;

  const onChange = (key, raw) => {
    // an emptied field reads as 0 so it can be cleared while typing
    const next = raw === '' ? 0 : Number(raw);
    setValues((prev) => ({ ...prev, [key]: Number.isFinite(next) ? next : prev[key] }));
  };
  // Reset returns to the DERIVED baseline, not to the hard-coded defaults --
  // otherwise "reset" would silently discard the account's real numbers.
  const onReset = () => setValues(derived.values);

  const anyDerived = hasDerivedValue(derived.sources);

  return (
    <div>
      <SectionHeader
        title="תוכנית חודשית"
        sub="תרגום של יעד הכנסה חודשי לנפח הפעילות שנדרש כדי להגיע אליו: פניות, שיחות, פולואפים, דמואים והצעות מחיר."
      />

      {/* ⚠️ THE TRUTH BAR. Top of the page, plain visible text -- not a tooltip,
          not a title attribute, not collapsible, and never below the numbers it
          qualifies. A guard test fails if this disappears. */}
      <div className="card panel" data-testid="plan-disclaimer" style={{ marginBottom: 16 }}>
        <p className="price-note" style={{ margin: 0 }}>
          <Icon name="spark" size={14} /> {CALENDAR_DISCLAIMER}
        </p>
      </div>

      <div className="card panel gc-controls">
        <div className="row between gap-2" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          <strong>הנחות תכנון</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
            <Icon name="refresh" size={15} /> אפס להנחות שחושבו
          </button>
        </div>

        {!anyDerived && (
          <p className="dim" data-testid="plan-no-data" style={{ margin: '0 2px 12px' }}>
            {NO_DATA_NOTE}
          </p>
        )}

        <div className="form-grid">
          {FIELDS.map((f) => {
            const source = derived.sources[f.key];
            return (
              <div className="field" key={f.key}>
                <label htmlFor={`plan-${f.key}`}>{f.label}</label>
                <input
                  id={`plan-${f.key}`}
                  className="input tnum"
                  type="number"
                  inputMode="numeric"
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={values[f.key]}
                  onChange={(e) => onChange(f.key, e.target.value)}
                />
                {/* Per-field provenance. An account-derived number and a default
                    look identical otherwise, and the difference matters. */}
                <span className="dim" data-testid={`plan-source-${f.key}`} style={{ fontSize: '0.72rem' }}>
                  {PLAN_SOURCE_LABELS[source] || PLAN_SOURCE_LABELS.default}
                </span>
              </div>
            );
          })}
        </div>

        {/* The double-count caveat, shown only when the target really was
            derived from recorded income. */}
        {derived.sources.target === 'recordedLastMonth' && (
          <p className="dim" data-testid="plan-target-note" style={{ margin: '12px 2px 0', fontSize: '0.76rem' }}>
            <Icon name="wallet" size={13} /> {TARGET_SOURCE_NOTE}
          </p>
        )}
      </div>

      <h3 className="gc-section-title">מה זה אומר בפועל</h3>
      <div className="kpi-grid gc-summary">
        <Stat label="עסקאות נדרשות" value={plan.dealsNeeded} icon="briefcase" />
        <Stat label="לידים מתעניינים נדרשים" value={plan.qualifiedLeadsNeeded} icon="target" />
        <Stat label="פניות להתחיל" value={plan.leadsToApproach} icon="send" />
        <Stat label="עומס יומי משוער" value={<>{plan.perDay}<span className="dim" style={{ fontSize: '0.7rem' }}> /יום</span></>} icon="clock">
          <div style={{ marginTop: 8 }}>
            <span className={`badge ${feasibility.cls}`}><span className="dot" />{feasibility.label}</span>
          </div>
        </Stat>
      </div>

      <h3 className="gc-section-title">פעילות מומלצת החודש</h3>
      {/* Display only. No `to`, no <Link>, no navigation -- every Growth module
          these actions would be prepared in is beta-contained, and a card that
          links into a blocked screen is a promise the product cannot keep. */}
      <div className="kpi-grid gc-actions">
        {CALENDAR_ACTIONS.map((a) => (
          <div className="card kpi gc-action" key={a.key} data-testid={`plan-action-${a.key}`}>
            <div className="kpi-top">
              <span className="kpi-label">{a.label}</span>
              <span className="kpi-ico"><Icon name={a.icon} size={18} /></span>
            </div>
            <div className="kpi-value tnum">{plan.actions[a.key]}</div>
            <p className="dim gc-action-note">{a.note}</p>
          </div>
        ))}
      </div>

      <h3 className="gc-section-title">פירוק שבועי</h3>
      <div className="client-grid">
        {weeks.map((w) => {
          const chips = CALENDAR_ACTIONS
            .map((a) => ({ ...a, count: w.actions[a.key] || 0 }))
            .filter((a) => a.count > 0);
          return (
            <div className="card panel gc-week" key={w.id} data-testid={`plan-week-${w.id}`}>
              <h3 className="gc-week-title">{w.title}</h3>
              <p className="muted gc-week-instruction">{w.instruction}</p>
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
        })}
      </div>

      <p className="dim price-note" style={{ margin: '16px 2px 0' }}>
        <Icon name="spark" size={13} /> התוכנית מחושבת מחדש בכל שינוי ואינה נשמרת. היא אינה יוצרת משימות, קמפיינים או פגישות.
      </p>
    </div>
  );
}
