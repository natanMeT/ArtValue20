import Icon from '../../../components/ui/Icon.jsx';

// Local-state planning inputs. Controlled by the parent page (no persistence).
const FIELDS = [
  { key: 'target',      label: 'יעד הכנסה חודשי (₪)',        min: 0, step: 500 },
  { key: 'avgDeal',     label: 'גודל עסקה ממוצע (₪)',         min: 0, step: 250 },
  { key: 'closeRate',   label: 'סיכוי סגירה (%)',             min: 0, max: 100, step: 1 },
  { key: 'qualifyRate', label: 'יחס פנייה → ליד מתעניין (%)', min: 0, max: 100, step: 1 },
  { key: 'workDays',    label: 'ימי עבודה זמינים בחודש',       min: 0, max: 31, step: 1 },
];

export default function GrowthCalendarControls({ values, onChange, onReset }) {
  const set = (key) => (e) => onChange(key, e.target.value);
  return (
    <div className="card panel gc-controls">
      <div className="row between gap-2" style={{ marginBottom: 12 }}>
        <strong>הנחות תכנון</strong>
        <button className="btn btn-ghost btn-sm" onClick={onReset}>
          <Icon name="refresh" size={15} /> אפס לברירת מחדל
        </button>
      </div>
      <div className="form-grid">
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`gc-${f.key}`}>{f.label}</label>
            <input
              id={`gc-${f.key}`}
              className="input tnum"
              type="number"
              inputMode="numeric"
              min={f.min}
              max={f.max}
              step={f.step}
              value={values[f.key]}
              onChange={set(f.key)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
