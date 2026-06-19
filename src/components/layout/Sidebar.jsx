import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '../ui/Icon.jsx';

const NAV = [
  { to: '/', label: 'דאשבורד', icon: 'dashboard', end: true },
  { to: '/clients', label: 'לקוחות', icon: 'users' },
  { to: '/outreach', label: 'מחקר לידים', icon: 'send' },
  { to: '/projects', label: 'פרויקטים', icon: 'briefcase' },
  { to: '/tasks', label: 'משימות', icon: 'check' },
  { to: '/pipeline', label: 'פייפליין', icon: 'filter' },
  { to: '/quotes', label: 'הצעות מחיר', icon: 'doc' },
  { to: '/diagnose', label: 'אבחון AI', icon: 'spark' },
  { to: '/adstudio', label: 'סטודיו פרסום', icon: 'spark' },
  { to: '/studio', label: 'מחולל תמונות', icon: 'image' },
  { to: '/workflow', label: 'סטודיו Workflow', icon: 'filter' },
  { to: '/fooocus', label: 'Fooocus', icon: 'image' },
  { to: '/finance', label: 'פיננסים', icon: 'wallet' },
  { to: '/activity', label: 'יומן פעילות', icon: 'clock' },
  { to: '/inventory', label: 'מלאי', icon: 'dashboard' },
  { to: '/assets', label: 'קבצים וקישורים', icon: 'link' },
  { to: '/templates', label: 'תבניות', icon: 'copy' },
];

export default function Sidebar({ open, onClose }) {
  const navigate = useNavigate();
  return (
    <>
      <div className={`sidebar-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
              <path d="M20 44 L32 18 L44 44" fill="none" stroke="var(--on-lime)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="25" y1="37" x2="39" y2="37" stroke="var(--on-lime)" strokeWidth="5.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="brand-name">Art Value</div>
            <div className="brand-sub">מערכת ניהול</div>
          </div>
        </div>

        <button className="btn btn-primary btn-block sidebar-cta" onClick={() => { navigate('/intake'); onClose?.(); }}>
          <Icon name="plus" size={18} /> ליד חדש
        </button>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span layoutId="nav-active" className="nav-active-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                  )}
                  <span className="nav-ico"><Icon name={item.icon} size={19} /></span>
                  <span className="nav-label">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <NavLink to="/settings" onClick={onClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="nav-active" className="nav-active-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                )}
                <span className="nav-ico"><Icon name="settings" size={19} /></span>
                <span className="nav-label">הגדרות</span>
              </>
            )}
          </NavLink>
          <div className="demo-pill">
            <span className="demo-dot" />
            מצב הדגמה — דאטה מקומית
          </div>
        </div>
      </aside>
    </>
  );
}
