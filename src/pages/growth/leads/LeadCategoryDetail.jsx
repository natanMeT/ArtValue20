import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../../components/ui/Modal.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import {
  serviceById, actionById, levelMeta, formatBand, PRICE_DISCLAIMER,
} from '../../../data/growthLeads.js';
import {
  matchContentTemplates, categoryById as contentCategoryById, formatById,
} from '../../../data/growthContentAds.js';

// Section wrapper: small icon + label header, then content. Purely presentational.
function Section({ icon, label, children }) {
  return (
    <section className="ld-section">
      <div className="ld-section-head">
        <span className="ld-section-ico"><Icon name={icon} size={15} /></span>
        <h4 className="ld-section-title">{label}</h4>
      </div>
      {children}
    </section>
  );
}

// One qualitative axis (potential / urgency / close probability) as a captioned badge.
function Axis({ axis, value, caption }) {
  const meta = levelMeta(axis, value);
  return (
    <div className="ld-axis">
      <span className="ld-axis-cap">{caption}</span>
      <span className={`badge ${meta.cls}`}><span className="dot" />{meta.label}</span>
    </div>
  );
}

// Local, safe "copy to clipboard" button — copies verbatim existing field text.
// No network, no persistence. Silently no-ops if the clipboard API is unavailable.
function CopyBtn({ text, label = 'העתק', copiedLabel = 'הועתק' }) {
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
    <button type="button" className="ld-copy" onClick={copy} aria-label={label}>
      <Icon name={done ? 'check' : 'copy'} size={13} />
      {done ? copiedLabel : label}
    </button>
  );
}

// Full sales action-plan view for one lead category, shown in a Modal.
// Presentational only — reads exclusively from the existing growthLeads data model.
export default function LeadCategoryDetail({ category, onClose }) {
  if (!category) return null;
  const offer = serviceById(category.offerId);
  const entry = category.entryOfferId ? serviceById(category.entryOfferId) : null;
  const action = actionById(category.action);
  const upsell = (category.upsell || []).map(serviceById).filter(Boolean);
  const hasEntry = entry && entry.id !== offer?.id;

  // Deterministic link into the Content & Ads Library: templates whose relatedOffers
  // intersect this category's offer path (main → entry → upsell). Read-only, no mutation.
  const contentOfferIds = [category.offerId, category.entryOfferId, ...(category.upsell || [])].filter(Boolean);
  const contentMatches = matchContentTemplates(contentOfferIds, 4);
  const matchReason = (item) => {
    const id = contentOfferIds.find((o) => (item.relatedOffers || []).includes(o));
    const svc = id ? serviceById(id) : null;
    return svc ? svc.name : null;
  };

  return (
    <Modal open={!!category} onClose={onClose} title={category.label} subtitle={category.who} maxWidth={640}>
      <div className="lead-detail">
        {/* 1 — Snapshot: pains + qualitative read */}
        <Section icon="target" label="תמונת מצב">
          {category.pains?.length > 0 && (
            <ul className="ld-list">
              {category.pains.map((p, i) => <li key={i} className="muted">{p}</li>)}
            </ul>
          )}
          <div className="ld-axes">
            <Axis axis="salesPotential" value={category.salesPotential} caption="פוטנציאל מכירה" />
            <Axis axis="urgency" value={category.urgency} caption="דחיפות" />
            <Axis axis="closeProbability" value={category.closeProbability} caption="סבירות סגירה" />
          </div>
        </Section>

        {/* 2 — Recommended offer + entry point */}
        <Section icon="briefcase" label="ההצעה המומלצת">
          <div className="lead-chips">
            {offer && <span className="lead-chip"><Icon name="briefcase" size={13} /> {offer.name}</span>}
            {offer && <span className="lead-chip price"><Icon name="wallet" size={13} /> {formatBand(offer)}</span>}
          </div>
          {hasEntry && (
            <div className="ld-entry">
              <Icon name="arrow" size={14} />
              <span>נקודת כניסה מומלצת: <b>{entry.name}</b> · {formatBand(entry)}</span>
            </div>
          )}
          <p className="dim price-note" style={{ marginTop: 2 }}>
            <Icon name="wallet" size={12} /> {PRICE_DISCLAIMER}
          </p>
        </Section>

        {/* 3 — Action plan: the next move + how to open */}
        <Section icon="send" label="תכנית פעולה">
          {action && (
            <div className="ld-action-banner">
              <span className="ld-ab-ico"><Icon name={action.icon} size={17} /></span>
              <div>
                <div className="ld-ab-cap">הפעולה הבאה</div>
                <div className="ld-ab-label">{action.label}</div>
              </div>
            </div>
          )}
          {category.whyFit && (
            <div className="ld-field">
              <div className="ld-field-row">
                <span className="ld-label">זווית פתיחה</span>
                <CopyBtn text={category.whyFit} label="העתק פתיח" />
              </div>
              <p className="ld-text">{category.whyFit}</p>
            </div>
          )}
          {category.expectedValue && (
            <div className="ld-field">
              <span className="ld-label">הערך להוביל איתו</span>
              <p className="ld-text">{category.expectedValue}</p>
            </div>
          )}
        </Section>

        {/* 4 — Objection handling */}
        {(category.objection || category.response) && (
          <Section icon="refresh" label="טיפול בהתנגדות">
            {category.objection && (
              <div className="ld-field">
                <span className="ld-label">התנגדות צפויה</span>
                <p className="ld-quote">{category.objection}</p>
              </div>
            )}
            {category.response && (
              <div className="ld-field">
                <div className="ld-field-row">
                  <span className="ld-label">תשובה מומלצת</span>
                  <CopyBtn text={category.response} label="העתק תשובה" />
                </div>
                <p className="ld-quote ok">{category.response}</p>
              </div>
            )}
          </Section>
        )}

        {/* 5 — Proof / demo assets to show this lead type */}
        {category.proof?.length > 0 && (
          <Section icon="image" label="מה להראות (פרוף / דמו)">
            <ul className="ld-list">
              {category.proof.map((p, i) => <li key={i} className="muted">{p}</li>)}
            </ul>
          </Section>
        )}

        {/* 6 — Upsell path: logical offers after the entry point */}
        {upsell.length > 0 && (
          <Section icon="trendUp" label="מסלול Upsell">
            <div className="ld-upsell-flow">
              {upsell.map((s, i) => (
                <span key={s.id} className="ld-upsell-item">
                  {i > 0 && <span className="ld-flow-sep"><Icon name="chevronL" size={13} /></span>}
                  <span className="lead-chip"><Icon name="trendUp" size={13} /> {s.name} · {formatBand(s)}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* 7 — Matching content/ad templates (deterministic link into the library) */}
        <Section icon="image" label="תבניות פרסום מתאימות">
          <p className="ld-text" style={{ marginTop: -2 }}>
            רעיונות מוכנים מתוך ספריית הפרסום שמתאימים להצעה ולסוג הלקוח הזה.
          </p>
          {contentMatches.length > 0 ? (
            <div className="ld-matches">
              {contentMatches.map((item) => {
                const cat = contentCategoryById(item.categoryId);
                const formats = (item.formats || []).map(formatById).filter(Boolean);
                const reason = matchReason(item);
                return (
                  <Link
                    key={item.id}
                    to="/growth/content"
                    className="ld-match"
                    aria-label={`פתח בספריית הפרסום — ${item.title}`}
                  >
                    <div className="ld-match-top">
                      <span className="ld-match-title">{item.title}</span>
                      {cat && <span className="badge badge-neutral"><span className="dot" />{cat.label}</span>}
                    </div>
                    {formats.length > 0 && (
                      <div className="lead-chips">
                        {formats.map((f) => (
                          <span key={f.id} className="lead-chip"><Icon name={f.icon} size={12} /> {f.name}</span>
                        ))}
                      </div>
                    )}
                    <div className="ld-match-cta"><Icon name="send" size={12} /> {item.cta}</div>
                    {reason && <p className="ld-match-reason">מתאים ל: {reason}</p>}
                    <span className="ld-match-open"><Icon name="arrow" size={13} /> פתח בספריית הפרסום</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="dim">אין עדיין תבניות פרסום משויכות לקטגוריה הזו.</p>
          )}
        </Section>
      </div>
    </Modal>
  );
}
