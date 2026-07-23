import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { askJake } from '../../lib/askJake.js';
import { isSupabaseConfigured } from '../../lib/supabase.js';
import {
  BUSINESS_BRAIN, buildPosterBrief, buildMonthlyContentPlanSeed,
  buildServiceCampaignSeed, buildStudioPromptSeed,
} from '../../data/businessBrain.js';

// ===================================================================
// BusinessBrainPanel — reusable Ask-Jake surface for the merged Business
// Brain (Option B). Presentational + click-only: each button builds a
// deterministic prompt seed and hands it to the existing askJake helper
// (the only place that touches the window event seam). NO engine wiring,
// NO effects, NO auto-dispatch, NO store/network/model. The service
// <select> is local UI state; its
// value is the BUSINESS_BRAIN.services object KEY (which the builders'
// findService resolves, and which button 4 uses for a direct name lookup).
// ===================================================================

// [key, service] pairs — the select options, in catalog order.
const SERVICE_ENTRIES = Object.entries(BUSINESS_BRAIN.services);

export default function BusinessBrainPanel() {
  const [serviceId, setServiceId] = useState('crm');

  // S0D containment: in authenticated cloud beta this panel would SHOW (copy +
  // ArtValue service list) and SEND (Ask-Jake brand seeds) hardcoded ArtValue
  // business facts to ANY signed-in account. Until the account-aware Growth
  // follow-up, render a truthful neutral note instead — no ArtValue values, no
  // active brand-seed actions. Local/demo (single-tenant ArtValue rig) is
  // unchanged (full panel below).
  if (isSupabaseConfigured) {
    return (
      <div className="card panel" style={{ marginBottom: 18 }}>
        <div className="panel-title row gap-2" style={{ marginBottom: 6 }}>
          <Icon name="spark" size={18} style={{ color: 'var(--lime-deep)' }} /> המוח העסקי של ג׳יק
        </div>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
          הכלי הזה עדיין אינו זמין בגרסת הבטא. בקרוב הוא יעבוד לפי ההקשר העסקי שתגדיר
          ב<strong>הגדרות → הקשר עסקי</strong>, כדי שג׳יק יכין בריפים, קמפיינים ותוכן לפי העסק שלך.
        </p>
      </div>
    );
  }

  return (
    <div className="card panel" style={{ marginBottom: 18 }}>
      <div className="panel-title row gap-2" style={{ marginBottom: 6 }}>
        <Icon name="spark" size={18} style={{ color: 'var(--lime-deep)' }} /> המוח העסקי של ג׳יק
      </div>
      <p className="muted" style={{ margin: '0 0 14px', lineHeight: 1.7 }}>
        בחר שירות, וג׳יק יכין עבורך בריף, קמפיין, חודש תוכן או פרומפט ל־Studio לפי השפה של ArtValue.
      </p>

      <div className="field" style={{ marginBottom: 14 }}>
        <label><Icon name="target" size={13} /> בחר שירות</label>
        <select
          className="select"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          {SERVICE_ENTRIES.map(([key, svc]) => (
            <option key={key} value={key}>{svc.name}</option>
          ))}
        </select>
      </div>

      <div className="row gap-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => askJake(buildPosterBrief(serviceId))}>
          <Icon name="image" size={15} /> תכין פוסטר לשירות
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => askJake(buildServiceCampaignSeed(serviceId))}>
          <Icon name="target" size={15} /> בנה קמפיין לשירות
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => askJake(buildMonthlyContentPlanSeed({ focusService: serviceId }))}>
          <Icon name="calendar" size={15} /> תכנן חודש תוכן
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => askJake(buildStudioPromptSeed('fast-image', BUSINESS_BRAIN.services[serviceId]?.name))}>
          <Icon name="wand" size={15} /> בריף ל-Studio
        </button>
      </div>

      <p className="dim" style={{ margin: '12px 2px 0', fontSize: '0.78rem', lineHeight: 1.6 }}>
        <Icon name="spark" size={12} /> הכפתורים שולחים לג׳יק בקשה מוכנה בלבד. שום פעולה לא מתבצעת בלי אישור שלך.
      </p>
    </div>
  );
}
