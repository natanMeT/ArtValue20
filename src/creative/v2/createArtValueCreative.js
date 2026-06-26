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
    draftCopy: async (prompt) => {
      try { const { text } = await draftWithJake([{ role: 'user', text: prompt }], ''); return text || ''; }
      catch { return ''; } // graceful → engine falls back to concept-derived copy
    },
    // he→en seam for the image prompt (same brain, no new provider). On any
    // failure the engine keeps promptEn English-only via deterministic fallback.
    translateToEn: async (heText) => {
      if (!heText) return '';
      const prompt = `Translate this Hebrew visual description into ONE concise English image-generation phrase. Output English only — no Hebrew characters, no quotes, no preamble:\n${heText}`;
      try { const { text } = await draftWithJake([{ role: 'user', text: prompt }], ''); return text || ''; }
      catch { return ''; }
    },
  });
  const production = createProductionOrchestrator({ engine, store: productionStore, getCampaign: (id) => store.get(id) });

  // One orchestrator surface for the UI: creative methods + the two production methods.
  return { ...creative, ...production };
}
