import { Link } from 'react-router-dom';
import { StaggerGroup, Reveal } from '../../components/ui/motion.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { SectionHeader } from '../../components/ui/atoms.jsx';
import { GROWTH_MODULES } from './growthNav.js';
import BusinessBrainPanel from '../../components/growth/BusinessBrainPanel.jsx';

// Growth OS hub — entry point to the ArtValue business-growth modules.
// Slice 1: navigation + scaffold only (no logic, no persistence).
export default function Growth() {
  return (
    <div>
      <SectionHeader
        title="Growth OS"
        sub="מרכז הצמיחה העסקית שלך — לידים, תכנון פעולה ושיחות במקום אחד"
      />

      <Reveal>
        <div className="card panel" style={{ marginBottom: 18 }}>
          <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
            כאן מנהלים את הצמיחה של העסק: מתחילים בלוח הפעולה החודשי, ממשיכים
            למיפוי לידים ולהכנת שיחות, ומשתמשים בספריית התוכן לפרסום. כל
            המודולים פעילים ומחוברים — זהו המסך המרכזי שמחבר ביניהם.
          </p>
        </div>
      </Reveal>

      <Reveal>
        <BusinessBrainPanel />
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
                <span className="badge badge-completed"><span className="dot" />פעיל</span>
              </div>
              <h3 style={{ fontSize: '1.12rem', margin: 0 }}>{m.title}</h3>
              <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>{m.desc}</p>
            </Link>
          </Reveal>
        ))}
      </StaggerGroup>
    </div>
  );
}
