import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader } from '../../components/ui/atoms.jsx';
import { CALL_CATEGORIES, buildCallPrep, resolveCallCategoryId } from '../../data/growthCalls.js';
import { buildGrowthPromptSeed } from '../../data/growthContext.js';
import { askJake } from '../../lib/askJake.js';
import CallPrepView from './calls/CallPrepView.jsx';

// Growth OS · שיחות ופולואפים — static, deterministic call & follow-up prep.
// Reuses existing Growth OS data only (lead mapping + content library). No
// persistence, no store, no AI, no JaceOS/assistant wiring, no messaging,
// no publishing. `selected` is local UI state only.
// An optional ?category=<id> (e.g. from the Monthly Calendar) preselects a
// category; unknown/missing ids fall back safely to the first category.
export default function Calls() {
  const [searchParams] = useSearchParams();
  const paramId = searchParams.get('category');
  const [selectedId, setSelectedId] = useState(() => resolveCallCategoryId(paramId));

  // Re-sync when navigation brings a (new) category param while mounted.
  useEffect(() => {
    if (paramId) setSelectedId(resolveCallCategoryId(paramId));
  }, [paramId]);

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

      <div className="toolbar" style={{ marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
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
        {/* Explicit click → jake:ask with call-prep context for the selected category */}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => askJake(buildGrowthPromptSeed('call_prep', { categoryId: selectedId }))}
        >
          <Icon name="spark" size={15} /> הכן לי שיחה עם ג׳יק
        </button>
      </div>

      <CallPrepView prep={prep} />
    </div>
  );
}
