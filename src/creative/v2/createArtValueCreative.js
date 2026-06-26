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

  // One orchestrator surface for the UI: creative methods + the two production methods.
  return { ...creative, ...production };
}
