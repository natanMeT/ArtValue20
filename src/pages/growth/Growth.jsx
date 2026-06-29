import { Link } from 'react-router-dom';
import { StaggerGroup, Reveal } from '../../components/ui/motion.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader } from '../../components/ui/atoms.jsx';
import { GROWTH_MODULES } from './growthNav.js';

// Growth OS hub — entry point to the ArtValue business-growth modules.
// Slice 1: navigation + scaffold only (no logic, no persistence).
export default function Growth() {
  return (
    <div>
      <SectionHeader
        title="Growth OS"
        sub="מרכז הצמיחה העסקית של Art Value — לידים, תכנון פעולה ושיחות במקום אחד"
      />

      <Reveal>
        <div className="card panel" style={{ marginBottom: 18 }}>
          <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
            כאן מנהלים את הצמיחה של העסק: מיפוי לידים ואסטרטגיית הצעות, תכנון פעולות
            חודשי לפי יעד הכנסה, ואימון שיחות ומכירות. המודולים ייפתחו בהדרגה — זהו
            המסך המרכזי שמחבר ביניהם.
          </p>
        </div>
      </Reveal>

      <StaggerGroup className="client-grid">
        {GROWTH_MODULES.map((m) => (
          <Reveal key={m.to}>
            <Link
              to={m.to}
              className="card panel"
              style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}
            >
              <div className="row between" style={{ gap: 12 }}>
                <span className="kpi-ico"><Icon name={m.icon} size={20} /></span>
                <span className="badge badge-neutral"><span className="dot" />בקרוב</span>
              </div>
              <h3 style={{ fontSize: '1.12rem', margin: 0 }}>{m.title}</h3>
              <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>{m.soon}</p>
            </Link>
          </Reveal>
        ))}
      </StaggerGroup>
    </div>
  );
}
