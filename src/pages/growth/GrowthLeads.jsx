import { Link } from 'react-router-dom';
import { Reveal } from '../../components/ui/motion.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader, EmptyState } from '../../components/ui/atoms.jsx';

// Growth OS · מיפוי לידים — scaffold only (no lead strategy logic yet).
export default function GrowthLeads() {
  return (
    <div>
      <SectionHeader
        title="מיפוי לידים"
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
            icon="target"
            title="בקרוב — מיפוי לידים ואסטרטגיית הצעות"
            hint="כאן נמפה לידים, נזהה הזדמנויות ונבנה אסטרטגיית הצעות מותאמת. עדיין בפיתוח."
          />
        </div>
      </Reveal>
    </div>
  );
}
