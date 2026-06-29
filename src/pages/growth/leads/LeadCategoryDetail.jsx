import Modal from '../../../components/ui/Modal.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import {
  serviceById, actionById, levelMeta, formatBand, PRICE_DISCLAIMER,
} from '../../../data/growthLeads.js';

function Block({ label, children }) {
  return (
    <div className="ld-block">
      <div className="ld-label">{label}</div>
      {children}
    </div>
  );
}

// Full strategy view for one lead category, shown in a Modal. Presentational only.
export default function LeadCategoryDetail({ category, onClose }) {
  if (!category) return null;
  const offer = serviceById(category.offerId);
  const entry = category.entryOfferId ? serviceById(category.entryOfferId) : null;
  const action = actionById(category.action);
  const pot = levelMeta('salesPotential', category.salesPotential);
  const urg = levelMeta('urgency', category.urgency);
  const close = levelMeta('closeProbability', category.closeProbability);
  const upsell = (category.upsell || []).map(serviceById).filter(Boolean);

  return (
    <Modal open={!!category} onClose={onClose} title={category.label} subtitle={category.who} maxWidth={620}>
      <div className="lead-detail">
        <div className="ld-badges">
          <span className={`badge ${pot.cls}`}><span className="dot" />{pot.label}</span>
          <span className={`badge ${urg.cls}`}><span className="dot" />{urg.label}</span>
          <span className={`badge ${close.cls}`}><span className="dot" />{close.label}</span>
        </div>

        <Block label="כאבים עיקריים">
          <ul className="ld-list">
            {category.pains.map((p, i) => <li key={i} className="muted">{p}</li>)}
          </ul>
        </Block>

        <Block label="מה להציע">
          <div className="lead-chips">
            {offer && <span className="lead-chip"><Icon name="briefcase" size={13} /> {offer.name}</span>}
            {offer && <span className="lead-chip price"><Icon name="wallet" size={13} /> {formatBand(offer)}</span>}
          </div>
          {entry && entry.id !== offer?.id && (
            <p className="dim" style={{ margin: '6px 0 0' }}>
              נקודת כניסה: {entry.name} · {formatBand(entry)}
            </p>
          )}
        </Block>

        <Block label="למה זה מתאים"><p className="muted" style={{ margin: 0 }}>{category.whyFit}</p></Block>
        <Block label="הערך ללקוח"><p className="muted" style={{ margin: 0 }}>{category.expectedValue}</p></Block>

        <Block label="פעולה מומלצת">
          {action && <span className="lead-action"><Icon name={action.icon} size={15} /> {action.label}</span>}
        </Block>

        <Block label="מה להראות (פרוף / דמו)">
          <ul className="ld-list">
            {category.proof.map((p, i) => <li key={i} className="muted">{p}</li>)}
          </ul>
        </Block>

        <Block label="התנגדות צפויה"><p className="muted" style={{ margin: 0 }}>{category.objection}</p></Block>
        <Block label="תשובה מומלצת"><p className="muted" style={{ margin: 0 }}>{category.response}</p></Block>

        {upsell.length > 0 && (
          <Block label="מסלול Upsell">
            <div className="lead-chips">
              {upsell.map((s) => (
                <span key={s.id} className="lead-chip"><Icon name="trendUp" size={13} /> {s.name} · {formatBand(s)}</span>
              ))}
            </div>
          </Block>
        )}

        <p className="dim price-note">{PRICE_DISCLAIMER}</p>
      </div>
    </Modal>
  );
}
