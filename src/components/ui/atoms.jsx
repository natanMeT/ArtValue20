import { STATUS_LABELS, statusClass } from '../../lib/format.js';
import Icon from './Icon.jsx';

export function StatusBadge({ status }) {
  return (
    <span className={`badge ${statusClass(status)}`}>
      <span className="dot" />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function EmptyState({ icon = 'spark', title, hint, action }) {
  return (
    <div className="empty">
      <div className="empty-ico">
        <Icon name={icon} size={26} />
      </div>
      <h4>{title}</h4>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}

export function SectionHeader({ title, sub, action }) {
  return (
    <div className="row between" style={{ marginBottom: 18, gap: 14, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem' }}>{title}</h2>
        {sub && <p className="muted" style={{ marginTop: 4, fontSize: '0.92rem' }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function DemoTag({ children = 'נשמר מקומית במצב הדגמה' }) {
  return (
    <span className="demo-tag">
      <Icon name="spark" size={12} />
      {children}
    </span>
  );
}
