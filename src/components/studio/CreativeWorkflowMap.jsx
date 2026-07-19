import Icon from '../ui/Icon.jsx';
import { CREATIVE_WORKFLOWS, ENGINE_LABEL, CONSENT_NOTE } from '../../data/creativeWorkflows.js';

// ===================================================================
// CreativeWorkflowMap — presentational only. Renders the workflow catalog
// as cards grouped into פעיל / בקרוב. Live cards either activate an existing
// ImageStudio mode (onSelectMode) or link to an existing hash route; soon
// cards are disabled. No generation, no routing logic, no side effects.
// ===================================================================

function EngineBadge({ engine }) {
  return (
    <span className={`creative-workflow-badge cwm-engine-${engine}`}>
      {ENGINE_LABEL[engine] || engine}
    </span>
  );
}

function WorkflowCard({ w, activeMode, onSelectMode }) {
  const isSoon = w.status === 'soon';
  const isActive = Boolean(w.mode) && activeMode === w.mode;

  const cardBody = (
    <>
      <div className="creative-workflow-top">
        <EngineBadge engine={w.engine} />
        {isSoon && <span className="creative-workflow-badge cwm-soon">בקרוב</span>}
      </div>
      <div className="creative-workflow-title">{w.title}</div>
      <div className="creative-workflow-sub">{w.subtitle}</div>
      <p className="creative-workflow-desc">{w.description}</p>
      {w.tags?.length > 0 && (
        <div className="creative-workflow-tags">
          {w.tags.map((t) => <span key={t} className="creative-workflow-tag">{t}</span>)}
        </div>
      )}
      {w.consent && <p className="creative-workflow-consent"><Icon name="spark" size={11} /> {CONSENT_NOTE}</p>}
    </>
  );

  // Coming soon → disabled card, no action.
  if (isSoon) {
    return (
      <div className="creative-workflow-card is-soon" aria-disabled="true">
        {cardBody}
        <span className="creative-workflow-cta is-disabled">בקרוב</span>
      </div>
    );
  }

  // Live external route → plain hash anchor to an EXISTING route (no router logic).
  if (w.route) {
    return (
      <a className="creative-workflow-card" href={w.route}>
        {cardBody}
        <span className="creative-workflow-cta">{w.cta} <Icon name="chevronL" size={13} /></span>
      </a>
    );
  }

  // Live ImageStudio mode → activate the matching existing mode.
  return (
    <button
      type="button"
      className={`creative-workflow-card ${isActive ? 'is-active' : ''}`}
      onClick={() => onSelectMode?.(w.mode)}
    >
      {cardBody}
      <span className="creative-workflow-cta">{isActive ? 'פעיל כעת' : w.cta} <Icon name="chevronL" size={13} /></span>
    </button>
  );
}

export default function CreativeWorkflowMap({ workflows = CREATIVE_WORKFLOWS, activeMode, onSelectMode }) {
  const live = workflows.filter((w) => w.status === 'live');
  const soon = workflows.filter((w) => w.status === 'soon');

  return (
    <div className="creative-workflow-map">
      <div className="creative-workflow-head">
        <div className="creative-workflow-h-title row gap-2">
          <Icon name="wand" size={18} style={{ color: 'var(--lime-deep)' }} /> מפת ה־Workflows
        </div>
        <p className="creative-workflow-h-sub">
          תהליכים מקצועיים ומבוקרים — יצירה, עריכה, זהות, וידאו ומסחר — ישירות מתוך הסטודיו.
        </p>
      </div>

      {live.length > 0 && (
        <>
          <div className="creative-workflow-group-title">פעיל</div>
          <div className="creative-workflow-grid">
            {live.map((w) => <WorkflowCard key={w.id} w={w} activeMode={activeMode} onSelectMode={onSelectMode} />)}
          </div>
        </>
      )}

      {soon.length > 0 && (
        <>
          <div className="creative-workflow-group-title">בקרוב</div>
          <div className="creative-workflow-grid">
            {soon.map((w) => <WorkflowCard key={w.id} w={w} activeMode={activeMode} onSelectMode={onSelectMode} />)}
          </div>
        </>
      )}
    </div>
  );
}
