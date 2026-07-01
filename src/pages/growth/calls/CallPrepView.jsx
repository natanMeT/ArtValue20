import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../components/ui/Icon.jsx';
import { Reveal, StaggerGroup } from '../../../components/ui/motion.jsx';
import { EmptyState } from '../../../components/ui/atoms.jsx';
import { levelMeta, formatBand, PRICE_DISCLAIMER } from '../../../data/growthLeads.js';
import { categoryById as contentCategoryById, formatById } from '../../../data/growthContentAds.js';

// Card header: small icon chip + title (reuses the lead-detail section styles).
function Head({ icon, title }) {
  return (
    <div className="ld-section-head">
      <span className="ld-section-ico"><Icon name={icon} size={15} /></span>
      <h3 className="ld-section-title">{title}</h3>
    </div>
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

// Local, safe "copy to clipboard" button — copies verbatim static text.
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
    <button type="button" className="ld-copy" onClick={copy} aria-label={label}>
      <Icon name={done ? 'check' : 'copy'} size={13} />
      {done ? 'הועתק' : label}
    </button>
  );
}

// Truncate a snippet for preview (keeps the full text available via copy).
const snippetOf = (s, n = 130) => (s && s.length > n ? `${s.slice(0, n).trimEnd()}…` : (s || ''));

// Presentational call-prep view for one lead category.
// Reads only the assembled `prep` object — no data access, no side effects.
export default function CallPrepView({ prep }) {
  if (!prep) {
    return (
      <div className="card panel">
        <EmptyState
          icon="phone"
          title="בחר סוג לקוח כדי להתחיל בהכנה"
          hint="בחירת קטגוריה תציג תמונת מצב, תסריט פתיחה, טיפול בהתנגדות ותבניות פולואפ."
        />
      </div>
    );
  }

  const { offer, entryOffer, hasEntry, action } = prep;
  const hasObjection = !!(prep.objection || prep.response);

  return (
    <StaggerGroup className="calls-stack">
      {/* 1 — Snapshot + recommended offer */}
      <Reveal>
        <div className="card panel calls-summary">
          <div className="calls-sum-head">
            <span className="ld-section-ico"><Icon name={prep.icon || 'target'} size={16} /></span>
            <div>
              <h3 className="calls-sum-title">{prep.label}</h3>
              {prep.who && <p className="muted calls-sum-who">{prep.who}</p>}
            </div>
          </div>

          {action && (
            <div className="ld-action-banner">
              <span className="ld-ab-ico"><Icon name={action.icon} size={17} /></span>
              <div>
                <div className="ld-ab-cap">הפעולה הבאה</div>
                <div className="ld-ab-label">{action.label}</div>
              </div>
            </div>
          )}

          <div className="lead-chips">
            {offer && <span className="lead-chip"><Icon name="briefcase" size={13} /> {offer.name}</span>}
            {offer && <span className="lead-chip price"><Icon name="wallet" size={13} /> {formatBand(offer)}</span>}
          </div>
          {hasEntry && (
            <div className="ld-entry">
              <Icon name="arrow" size={14} />
              <span>נקודת כניסה מומלצת: <b>{entryOffer.name}</b> · {formatBand(entryOffer)}</span>
            </div>
          )}
          <p className="dim price-note" style={{ margin: 0 }}>
            <Icon name="wallet" size={12} /> {PRICE_DISCLAIMER}
          </p>

          <div className="ld-axes">
            <Axis axis="salesPotential" value={prep.salesPotential} caption="פוטנציאל מכירה" />
            <Axis axis="urgency" value={prep.urgency} caption="דחיפות" />
            <Axis axis="closeProbability" value={prep.closeProbability} caption="סבירות סגירה" />
          </div>
        </div>
      </Reveal>

      {/* 2 — Call prep + objection handling (side by side on wide screens) */}
      <div className="calls-two">
        <Reveal>
          <div className="card panel calls-block">
            <Head icon="send" title="הכנה לשיחה" />
            {prep.whyFit && (
              <div className="ld-field">
                <div className="ld-field-row">
                  <span className="ld-label">זווית פתיחה</span>
                  <CopyBtn text={prep.whyFit} label="העתק פתיח" />
                </div>
                <p className="ld-text">{prep.whyFit}</p>
              </div>
            )}
            {prep.pains?.length > 0 && (
              <div className="ld-field">
                <span className="ld-label">כאבים לגעת בהם</span>
                <ul className="ld-list">
                  {prep.pains.map((p, i) => <li key={i} className="muted">{p}</li>)}
                </ul>
              </div>
            )}
            {prep.expectedValue && (
              <div className="ld-field">
                <span className="ld-label">הערך להוביל איתו</span>
                <p className="ld-text">{prep.expectedValue}</p>
              </div>
            )}
            {prep.proof?.length > 0 && (
              <div className="ld-field">
                <span className="ld-label">מה להראות (פרוף / דמו)</span>
                <ul className="ld-list">
                  {prep.proof.map((p, i) => <li key={i} className="muted">{p}</li>)}
                </ul>
              </div>
            )}
          </div>
        </Reveal>

        {hasObjection && (
          <Reveal>
            <div className="card panel calls-block">
              <Head icon="refresh" title="טיפול בהתנגדות" />
              {prep.objection && (
                <div className="ld-field">
                  <span className="ld-label">התנגדות צפויה</span>
                  <p className="ld-quote">{prep.objection}</p>
                </div>
              )}
              {prep.response && (
                <div className="ld-field">
                  <div className="ld-field-row">
                    <span className="ld-label">תשובה מומלצת</span>
                    <CopyBtn text={prep.response} label="העתק תשובה" />
                  </div>
                  <p className="ld-quote ok">{prep.response}</p>
                </div>
              )}
            </div>
          </Reveal>
        )}
      </div>

      {/* 3 — Follow-up / content templates (local copy + link into the library) */}
      <Reveal>
        <div className="card panel calls-block">
          <Head icon="whatsapp" title="תבניות פולואפ ותוכן" />
          <p className="ld-text" style={{ marginTop: -2 }}>
            תבניות מוכנות להודעות המשך ולפרסום שמתאימות ללקוח הזה. להעתקה מקומית בלבד — בלי שליחה אוטומטית.
          </p>
          {prep.templates.length > 0 ? (
            <div className="calls-tpls">
              {prep.templates.map((item) => {
                const cat = contentCategoryById(item.categoryId);
                const formats = (item.formats || []).map(formatById).filter(Boolean);
                const snippet = snippetOf(item.message);
                return (
                  <div key={item.id} className="calls-tpl">
                    <div className="calls-tpl-top">
                      <span className="calls-tpl-title">{item.title}</span>
                      {cat && <span className="badge badge-neutral"><span className="dot" />{cat.label}</span>}
                    </div>
                    {formats.length > 0 && (
                      <div className="lead-chips">
                        {formats.map((f) => (
                          <span key={f.id} className="lead-chip"><Icon name={f.icon} size={12} /> {f.name}</span>
                        ))}
                      </div>
                    )}
                    {item.cta && <div className="calls-tpl-cta"><Icon name="send" size={12} /> {item.cta}</div>}
                    {snippet && <p className="calls-tpl-snippet">{snippet}</p>}
                    <div className="calls-tpl-foot">
                      {item.message && <CopyBtn text={item.message} label="העתק תבנית" />}
                      <Link
                        to="/growth/content"
                        className="calls-tpl-open"
                        aria-label={`פתח בספריית הפרסום — ${item.title}`}
                      >
                        <Icon name="arrow" size={13} /> פתח בספריית הפרסום
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="dim">אין עדיין תבניות מתאימות לקטגוריה הזו.</p>
          )}
          <Link className="btn btn-ghost btn-sm" to="/growth/content" style={{ alignSelf: 'flex-start' }}>
            <Icon name="image" size={15} /> לכל ספריית הפרסום
          </Link>
        </div>
      </Reveal>
    </StaggerGroup>
  );
}
