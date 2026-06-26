// ===================================================================
// Composition root for the Creative V2 slice — the ONLY place that imports the
// frozen Creative Director V1 public entry point and injects it into the adapter.
// Everything downstream (adapter, orchestrator, store) stays decoupled from V1,
// which is why every other module is unit-testable without the LLM.
//
// Reads V1 through its PUBLIC API only (runCreativeDirector). Does NOT modify,
// re-export internals of, or change the behavior of V1.
// ===================================================================
import { runCreativeDirector } from '../../lib/gemini.js';
import { activePack } from '../../lib/jakePack.js';
import { createCreativeDirectorAdapter } from './creativeDirectorAdapter.js';
import { createCampaignStore } from './campaignStore.js';
import { createCreativeOrchestrator } from './creativeActions.js';

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
  return createCreativeOrchestrator({ adapter, store, pack: activePack, getData, user, tenantId: activePack.id });
}
