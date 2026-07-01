import { useState } from 'react';
import Modal from '../../../components/ui/Modal.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import { categoryById, formatById } from '../../../data/growthContentAds.js';
import { serviceById } from '../../../data/growthLeads.js';

// Section wrapper: icon + label header (optional inline action), then content.
function Section({ icon, label, action, children }) {
  return (
    <section className="ads-section">
      <div className="ads-section-head">
        <span className="ads-section-ico"><Icon name={icon} size={15} /></span>
        <h4 className="ads-section-title">{label}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

// Local, safe "copy to clipboard" button — copies verbatim template text.
// No network, no persistence. Silently no-ops if the clipboard API is blocked.
function CopyBtn({ text, label = 'העתק' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }
    } catch {
      /* clipboard unavailable / blocked — non-fatal, do nothing */
    }
  };
  return (
    <button type="button" className="ads-copy" onClick={copy} aria-label={label}>
      <Icon name={done ? 'check' : 'copy'} size={13} />
      {done ? 'הועתק' : label}
    </button>
  );
}

// Full template view for one content/ad item, shown in a Modal.
// Presentational only — reads exclusively from the static content library.
export default function ContentAdsDetail({ item, onClose }) {
  if (!item) return null;
  const cat = categoryById(item.categoryId);
  const formats = (item.formats || []).map(formatById).filter(Boolean);
  const offers = (item.relatedOffers || []).map(serviceById).filter(Boolean);

  return (
    <Modal open={!!item} onClose={onClose} title={item.title} subtitle={cat ? cat.label : ''} maxWidth={660}>
      <div className="ads-detail">
        {item.description && <p className="muted ads-desc">{item.description}</p>}

        <div className="ads-chips">
          {item.tone && <span className="ads-chip tone"><Icon name="spark" size={12} /> {item.tone}</span>}
          {formats.map((f) => (
            <span key={f.id} className="ads-chip"><Icon name={f.icon} size={12} /> {f.name}</span>
          ))}
        </div>

        <Section icon="target" label="מטרה"><p className="ads-text">{item.goal}</p></Section>
        <Section icon="users" label="למי מתאים"><p className="ads-text">{item.bestFor}</p></Section>

        <Section icon="spark" label="הוק" action={<CopyBtn text={item.hook} label="העתק הוק" />}>
          <p className="ads-quote">{item.hook}</p>
        </Section>

        <Section icon="doc" label="מסר" action={<CopyBtn text={item.message} label="העתק מסר" />}>
          <p className="ads-text">{item.message}</p>
        </Section>

        <Section icon="send" label="קריאה לפעולה (CTA)" action={<CopyBtn text={item.cta} label="העתק CTA" />}>
          <p className="ads-quote ok">{item.cta}</p>
        </Section>

        <Section icon="wand" label="פרומפט ליצירה" action={<CopyBtn text={item.prompt} label="העתק פרומפט" />}>
          <p className="ads-prompt">{item.prompt}</p>
        </Section>

        <Section icon="image" label="הערת שימוש"><p className="ads-text">{item.usageNote}</p></Section>

        {(offers.length > 0 || (item.tags && item.tags.length > 0)) && (
          <Section icon="briefcase" label="הצעות ותגיות קשורות">
            {offers.length > 0 && (
              <div className="ads-chips">
                {offers.map((o) => (
                  <span key={o.id} className="ads-chip"><Icon name="briefcase" size={12} /> {o.name}</span>
                ))}
              </div>
            )}
            {item.tags && item.tags.length > 0 && (
              <div className="ads-chips">
                {item.tags.map((t) => <span key={t} className="ads-chip tag">#{t}</span>)}
              </div>
            )}
          </Section>
        )}
      </div>
    </Modal>
  );
}
