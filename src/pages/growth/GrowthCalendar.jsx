import { Link } from 'react-router-dom';
import { Reveal } from '../../components/ui/motion.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader, EmptyState } from '../../components/ui/atoms.jsx';

// Growth OS · לוח פעולה חודשי — scaffold only (no calendar algorithm yet).
export default function GrowthCalendar() {
  return (
    <div>
      <SectionHeader
        title="לוח פעולה חודשי"
        sub="חלק מ-Growth OS — מרכז הצמיחה של Art Value"
        action={
          <Link className="btn btn-ghost btn-sm" to="/growth">
            <Icon name="chevronR" size={16} /> חזרה ל-Growth OS
          </Link>
        }
      />

      <Reveal>
        <div className="card panel">
          <EmptyState
            icon="calendar"
            title="בקרוב — תכנון פעולות חודשי לפי יעד הכנסה"
            hint="כאן נבנה לוח פעולות חודשי שמתורגם מיעד הכנסה לפעולות שבועיות. עדיין בפיתוח."
          />
        </div>
      </Reveal>
    </div>
  );
}
