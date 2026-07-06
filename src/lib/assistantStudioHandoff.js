// ===================================================================
// assistantStudioHandoff — pure gate: does this user text deserve a
// Studio handoff card in the Assistant?
//
// Runs the deterministic Jake OS chain (Decision → Plan → Payload) and
// returns the handoff payload ONLY for Studio-target plans with a real
// resolved prompt — i.e. create_marketing_asset / studio_prompt /
// product_visual / product_lock. Everything else → null.
//
// Pure and model-free: no navigation, no events, no storage, no model
// calls, no Studio execution. The Assistant renders the returned payload
// as a card; NAVIGATION happens only in the card's user-click handler.
// ===================================================================

import { planFromText } from './jakeExecutionPlanner.js';
import { buildHandoffPayload } from './jakeHandoffResolver.js';

// User text → Studio handoff payload, or null. Deterministic; never throws.
export function studioHandoffFor(userText) {
  const payload = buildHandoffPayload(planFromText(userText));
  if (payload.target !== 'studio') return null;
  if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) return null;
  return payload;
}
