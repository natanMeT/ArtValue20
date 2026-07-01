import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader } from '../../components/ui/atoms.jsx';
import { CALL_CATEGORIES, buildCallPrep } from '../../data/growthCalls.js';
import CallPrepView from './calls/CallPrepView.jsx';

// Growth OS · שיחות ופולואפים — static, deterministic call & follow-up prep.
// Reuses existing Growth OS data only (lead mapping + content library). No
// persistence, no store, no AI, no JaceOS/assistant wiring, no messaging,
// no publishing. `selected` is local UI state only.
export default function Calls() {
  const [selectedId, setSelectedId] = useState(CALL_CATEGORIES[0]?.id || '');
  const prep = useMemo(() => buildCallPrep(selectedId), [selectedId]);

  return (
    <div>
      <SectionHeader
        title="שיחות ופולואפים"
        sub="הכנה לשיחות, הודעות המשך ותסריטי פתיחה לפי סוג לקוח."
        action={
          <Link className="btn btn-ghost btn-sm" to="/growth">
            <Icon name="chevronR" size={16} /> חזרה ל-Growth OS
          </Link>
        }
      />

      <p className="dim price-note" style={{ margin: '0 2px 14px' }}>
        <Icon name="spark" size={13} /> בחר סוג לקוח וקבל תמונת מצב, תסריט פתיחה, טיפול בהתנגדות ותבניות פולואפ מוכנות. הכל מקומי — בלי שליחה אוטומטית.
      </p>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="filter-tabs hide-scroll" style={{ overflowX: 'auto', maxWidth: '100%' }}>
          {CALL_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`filter-tab ${selectedId === c.id ? 'active' : ''}`}
              onClick={() => setSelectedId(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <CallPrepView prep={prep} />
    </div>
  );
}
