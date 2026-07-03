import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '../ui/Icon.jsx';
import { NAV_SECTIONS } from './sidebarNav.js';

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
          {NAV_SECTIONS.map((section) => (
            <div className="nav-group" key={section.label}>
              <div className="nav-group-label">{section.label}</div>
              {section.items.map((item) => (
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
            </div>
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
