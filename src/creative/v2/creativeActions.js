// ===================================================================
// Creative actions (Phase 8) — the SIX named, schema'd, audited orchestration
// steps for the creative slice. NOT placed in Jake's generic CRUD registry
// (those are sync store mutations); these are async orchestration that REUSE
// Jake's propose→confirm→execute UI for the two mutating actions. Each is
// dependency-injected (adapter, store, pack) so integration tests run with a
// fake adapter + in-memory store and never touch the LLM.
//
// Confirmation policy (per spec):
//   read-only / generative (NO confirm): analyze_marketing_need,
//     create_campaign_brief, run_creative_director, list_campaign_concepts
//   state-changing (CONFIRM): select_campaign_concept, save_campaign
// ===================================================================
import { buildCreativeContext } from './contextBuilder.js';
import { validateConceptDiversity } from './diversity.js';
import { logCreativeEvent } from './logging.js';

export class CreativeOrchestratorError extends Error {
  constructor(code, message, details = null) { super(message); this.name = 'CreativeOrchestratorError'; this.code = code; this.details = details; }
}

/** Action catalogue (metadata used by Jake / permissions / audit). */
export const CREATIVE_ACTIONS = Object.freeze([
  { name: 'analyze_marketing_need', description: 'מנתח את בקשת המשתמש לצורך שיווקי מובנה (מטרה, ערוץ, פורמט, הצעה)', confirm: false, permission: 'analyze' },
  { name: 'create_campaign_brief', description: 'בונה בריף קמפיין קנוני מנתוני ה-CRM ויוצר טיוטת קמפיין', confirm: false, permission: 'brief' },
  { name: 'run_creative_director', description: 'מריץ את מנהל הקריאייטיב (V1) דרך האדפטר ומחזיר שלושה קונספטים', confirm: false, permission: 'generate' },
  { name: 'list_campaign_concepts', description: 'מציג את הקונספטים של קמפיין', confirm: false, permission: 'generate' },
  { name: 'select_campaign_concept', description: 'בוחר קונספט אחד — דורש אישור', confirm: true, permission: 'select' },
  { name: 'save_campaign', description: 'שומר את מצב הקמפיין — דורש אישור', confirm: true, permission: 'save' },
]);

// ---- heuristic Hebrew parse for analyze_marketing_need (deterministic, no LLM) ----
const OBJECTIVE_RULES = [
  { re: /(ליד|לידים|פניות|פנייה)/, v: 'generate_leads' },
  { re: /(להחזיר|לקוחות שנטשו|ריאקטיב|לקוחות ישנים)/, v: 'customer_reactivation' },
  { re: /(מכירה|מכירות|למכור|הכנסות)/, v: 'increase_sales' },
  { re: /(שירות|שירותים)/, v: 'promote_service' },
  { re: /(מוצר|מוצרים)/, v: 'promote_product' },
  { re: /(מותג|מודעות|brand|חשיפה)/, v: 'brand_awareness' },
];
const CHANNEL_RULES = [
  { re: /(סטורי|story|סטורית)/, v: 'instagram_story' },
  { re: /(אינסטגרם|instagram|אינסטה)/, v: 'instagram_post' },
  { re: /(פייסבוק|facebook)/, v: 'facebook_post' },
  { re: /(וואטסאפ|whatsapp|וצאפ)/, v: 'whatsapp' },
  { re: /(הדפסה|פלייר|מודעה מודפסת|print|עיתון)/, v: 'print' },
];

export function analyzeMarketingNeed(text) {
  const t = String(text || '');
  const objective = (OBJECTIVE_RULES.find((r) => r.re.test(t)) || {}).v || 'brand_awareness';
  const channel = (CHANNEL_RULES.find((r) => r.re.test(t)) || {}).v || 'instagram_post';
  const format = channel === 'instagram_story' ? '9:16' : channel === 'print' ? 'A4' : '4:5';
  // offer: capture a "מבצע/הצעה ..." clause if present
  const offerMatch = t.match(/(?:מבצע|הצעה|דיל)[:\s]+([^.!?\n]{3,80})/);
  const offer = offerMatch ? offerMatch[1].trim() : undefined;
  // audience: capture after "עבור" / "ל-" if present
  const audMatch = t.match(/עבור\s+([^.!?\n]{3,80})/);
  const targetAudience = audMatch ? audMatch[1].trim() : undefined;
  const need = { objective, channel, format, offer, targetAudience, rawRequest: t.slice(0, 300) };
  logCreativeEvent('creative_brief_created', { stage: 'analyze', objective, channel, format });
  return need;
}

/**
 * Build the orchestrator. Mutations go through `store`; generation through `adapter`.
 * @param {{ adapter:{run:Function}, store:object, pack:object, getData:()=>object,
 *           user?:string, tenantId?:string, log?:Function }} deps
 */
export function createCreativeOrchestrator(deps) {
  const { adapter, store, pack, getData } = deps || {};
  if (!adapter || typeof adapter.run !== 'function') throw new CreativeOrchestratorError('MISCONFIGURED', 'orchestrator requires an adapter with run()');
  if (!store) throw new CreativeOrchestratorError('MISCONFIGURED', 'orchestrator requires a campaign store');
  if (!pack) throw new CreativeOrchestratorError('MISCONFIGURED', 'orchestrator requires a pack');
  const log = deps.log || logCreativeEvent;
  const tenantId = deps.tenantId || pack.id || 'artvalue';
  const user = deps.user;

  function ensurePermission(name) {
    const meta = CREATIVE_ACTIONS.find((a) => a.name === name);
    const perm = meta && meta.permission;
    const perms = pack.creativePermissions || {};
    if (perm && perms[perm] === false) throw new CreativeOrchestratorError('FORBIDDEN', `הפעולה ${name} אינה מורשית לעסק זה`);
  }

  return {
    actions: CREATIVE_ACTIONS,

    analyzeMarketingNeed(text) { ensurePermission('analyze_marketing_need'); return analyzeMarketingNeed(text); },

    /** create_campaign_brief — canonical request + a draft campaign record. */
    createCampaignBrief({ need, requestId } = {}) {
      ensurePermission('create_campaign_brief');
      const data = (typeof getData === 'function' ? getData() : {}) || {};
      const request = buildCreativeContext({
        data, pack, objective: need.objective, channel: need.channel, format: need.format,
        offer: need.offer, targetAudience: need.targetAudience, tenantId, userId: user, requestId,
      });
      log('creative_request_validated', { requestId: request.requestId, tenantId, objective: request.campaign.objective });
      const record = store.createDraft({
        tenantId, requestId: request.requestId, objective: request.campaign.objective,
        targetAudience: request.campaign.targetAudience, channel: request.campaign.channel,
        format: request.campaign.format, createdBy: user,
      });
      log('creative_brief_created', { requestId: request.requestId, campaignId: record.id });
      return { request, campaignId: record.id };
    },

    /** run_creative_director — adapter (→ frozen V1) + diversity + attach concepts. */
    async runCreativeDirector({ request, campaignId, maxAttempts = 2 } = {}) {
      ensurePermission('run_creative_director');
      log('creative_adapter_mapping_started', { requestId: request.requestId, campaignId });
      let result = null;
      let diversity = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        log('creative_engine_started', { requestId: request.requestId, campaignId, attempt });
        try {
          result = await adapter.run(request);
        } catch (e) {
          lastErr = e;
          log('creative_engine_failed', { requestId: request.requestId, campaignId, attempt, code: e && e.code, error: e && e.message });
          continue;
        }
        log('creative_engine_completed', { requestId: request.requestId, campaignId, attempt });
        log('creative_output_normalized', { requestId: request.requestId, campaignId });
        log('creative_output_validated', { requestId: request.requestId, campaignId });
        diversity = validateConceptDiversity(result.concepts, { expected: 3 });
        if (diversity.ok) break;
      }
      if (!result) {
        throw new CreativeOrchestratorError('ENGINE_FAILED', 'מנוע הקריאייטיב לא הצליח להפיק תוצאה', lastErr && (lastErr.code || lastErr.message));
      }
      if (diversity && !diversity.ok) {
        throw new CreativeOrchestratorError('CONCEPTS_TOO_SIMILAR', 'הקונספטים שהתקבלו דומים מדי — כדאי לנסות שוב', diversity.issues);
      }
      const record = store.attachConcepts(campaignId, { strategy: result.strategy, concepts: result.concepts });
      log('creative_concepts_ready', { requestId: request.requestId, campaignId, count: result.concepts.length });
      return { result, diversity, campaignId: record.id };
    },

    /** list_campaign_concepts — read-only. */
    listConcepts(campaignId) {
      ensurePermission('list_campaign_concepts');
      const rec = store.get(campaignId);
      if (!rec) throw new CreativeOrchestratorError('NOT_FOUND', `קמפיין לא נמצא: ${campaignId}`);
      return rec.concepts || [];
    },

    /** select_campaign_concept — PROPOSAL only (no mutation). For the confirm card. */
    proposeSelection({ campaignId, conceptId } = {}) {
      ensurePermission('select_campaign_concept');
      const rec = store.get(campaignId);
      if (!rec) throw new CreativeOrchestratorError('NOT_FOUND', `קמפיין לא נמצא: ${campaignId}`);
      const concept = (rec.concepts || []).find((c) => c.id === conceptId);
      if (!concept) throw new CreativeOrchestratorError('UNKNOWN_CONCEPT', `קונספט לא נמצא: ${conceptId}`);
      log('creative_concept_selection_proposed', { campaignId, conceptId });
      return { campaignId, conceptId, conceptName: concept.name };
    },

    /** select_campaign_concept + save_campaign — the CONFIRMED mutation. */
    confirmSelection({ campaignId, conceptId } = {}) {
      ensurePermission('select_campaign_concept');
      const before = store.get(campaignId);
      if (!before) throw new CreativeOrchestratorError('NOT_FOUND', `קמפיין לא נמצא: ${campaignId}`);
      const rec = store.selectConcept(campaignId, conceptId);
      log('creative_concept_selected', { campaignId, conceptId, before: before.status, after: rec.status });
      log('creative_campaign_saved', { campaignId, conceptId, status: rec.status });
      return rec;
    },

    /** save_campaign — idempotent finalize (the selection already persisted). */
    saveCampaign(campaignId) {
      ensurePermission('save_campaign');
      const rec = store.get(campaignId);
      if (!rec) throw new CreativeOrchestratorError('NOT_FOUND', `קמפיין לא נמצא: ${campaignId}`);
      log('creative_campaign_saved', { campaignId, status: rec.status, idempotent: true });
      return rec;
    },
  };
}
