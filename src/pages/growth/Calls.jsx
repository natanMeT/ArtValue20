import { Link } from 'react-router-dom';
import { Reveal } from '../../components/ui/motion.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader, EmptyState } from '../../components/ui/atoms.jsx';

// Growth OS · שיחות — scaffold only.
// Future slice will reuse the existing JaceOS assistant as a sales coach / call
// simulator. This page does NOT wire JaceOS or add any assistant engine.
export default function Calls() {
  return (
    <div>
      <SectionHeader
        title="שיחות"
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
            icon="phone"
            title="בקרוב — אימון שיחות ומכירות עם JaceOS"
            hint="בהמשך נרחיב את JaceOS הקיים לאימון שיחות וסימולציית מכירות. כרגע זהו שלד בלבד."
          />
        </div>
      </Reveal>
    </div>
  );
}
