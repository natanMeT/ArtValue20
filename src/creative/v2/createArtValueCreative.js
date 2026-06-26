// ===================================================================
// Composition root for the Creative V2 slice — the ONLY place that imports the
// frozen Creative Director V1 public entry point and injects it into the adapter.
// Everything downstream (adapter, orchestrator, store) stays decoupled from V1,
// which is why every other module is unit-testable without the LLM.
//
// Reads V1 through its PUBLIC API only (runCreativeDirector). Does NOT modify,
// re-export internals of, or change the behavior of V1.
// ===================================================================
import { runCreativeDirector, draftWithJake } from '../../lib/gemini.js';
import { activePack } from '../../lib/jakePack.js';
import { createCreativeDirectorAdapter } from './creativeDirectorAdapter.js';
import { createCampaignStore } from './campaignStore.js';
import { createCreativeOrchestrator } from './creativeActions.js';
import { createProductionStore } from './productionStore.js';
import { createProductionBriefEngine } from './productionBriefEngine.js';
import { createProductionOrchestrator } from './productionActions.js';
import { critiqueConcepts } from './conceptCritic.js';
import { logCreativeEvent } from './logging.js';

// The creative model label (for result metadata only — never sent anywhere).
const CREATIVE_MODEL = (import.meta && import.meta.env
  && (import.meta.env.VITE_CREATIVE_LLM_MODEL || import.meta.env.VITE_LOCAL_LLM_MODEL)) || undefined;

/**
 * Build the Art Value creative orchestrator wired to the REAL frozen V1.
 * @param {{ getData: ()=>object, user?: string }} opts
 */
export function createArtValueCreative({ getData, user } = {}) {
  const adapter = createCreativeDirectorAdapter({ runV1: runCreativeDirector, model: CREATIVE_MODEL });
  const store = createCampaignStore(); // localStorage-backed (additive; no CRM-store change)
  const creative = createCreativeOrchestrator({ adapter, store, pack: activePack, getData, user, tenantId: activePack.id });

  // Additive Concept Critic + rerank (deterministic; model seam OFF this slice — D2-A).
  // Decorates ONLY the RETURN VALUE of the frozen run_creative_director: after V1 +
  // adapter + store have produced and PERSISTED the concepts, the critic READS them
  // (never mutates, never reorders the stored array) and returns a SEPARATE
  // evaluation/ranking view in `critique`. The original `result` — including
  // result.recommendedConceptId and the original order — passes through untouched.
  // Failure-safe: any critic problem degrades to { critique.ok:false }, and the UI
  // falls back to the exact V1 order + V1 recommendation.
  const baseRunCreativeDirector = creative.runCreativeDirector;
  async function runCreativeDirectorWithCritique(args = {}) {
    const inner = await baseRunCreativeDirector.call(creative, args); // { result, diversity, campaignId }
    let critique;
    try {
      critique = await critiqueConcepts(
        { concepts: inner.result.concepts, strategy: inner.result.strategy, request: args.request },
        { fallbackRecommendedId: inner.result.recommendedConceptId }, // no scoreSeam → deterministic
      );
    } catch (e) {
      critique = { ok: false, degraded: true, reason: (e && e.message) || 'critic_failed' };
    }
    logCreativeEvent('creative_concepts_critiqued', {
      campaignId: inner.campaignId,
      ok: !!(critique && critique.ok),
      degraded: !!(critique && critique.degraded),
      survivors: critique && Array.isArray(critique.survivors) ? critique.survivors.length : 0,
      rejected: critique && Array.isArray(critique.rejected) ? critique.rejected.length : 0,
      recommendedConceptId: critique && critique.recommendedConceptId,
    });
    return { ...inner, critique };
  }

  // Production package layer (additive) — turns a SELECTED concept into a draft
  // package (creativeCore + copy + visual brief + image prompt). Hebrew copy reuses
  // the existing draftWithJake brain seam (no new provider); everything else is
  // deterministic. Separate localStorage store — the campaign store is untouched.
  const productionStore = createProductionStore();
  const engine = createProductionBriefEngine({
    // A provider/model ERROR PROPAGATES (the engine turns it into copy:error /
    // rewrite:error and rejects — a real failure is never shown as a completed
    // stage). An EMPTY model response ('') is NOT an error: the engine uses its
    // deterministic concept-derived fallback. (No new provider — same brain seam.)
    draftCopy: async (prompt) => {
      const { text } = await draftWithJake([{ role: 'user', text: prompt }], '');
      return text || '';
    },
    // he→en seam for the image prompt (same brain). A throw PROPAGATES so the
    // engine reports translate:fallback honestly (non-fatal — it continues with
    // the English skeleton). An empty/unusable return also degrades to skeleton.
    translateToEn: async (heText) => {
      if (!heText) return '';
      const prompt = `Translate this Hebrew visual description into ONE concise English image-generation phrase. Output English only — no Hebrew characters, no quotes, no preamble:\n${heText}`;
      const { text } = await draftWithJake([{ role: 'user', text: prompt }], '');
      return text || '';
    },
  });
  const production = createProductionOrchestrator({ engine, store: productionStore, getCampaign: (id) => store.get(id) });

  // One orchestrator surface for the UI: creative methods + the two production
  // methods. run_creative_director is overridden LAST so the critic-decorated
  // version wins over the spread-in original.
  return { ...creative, ...production, runCreativeDirector: runCreativeDirectorWithCritique };
}
