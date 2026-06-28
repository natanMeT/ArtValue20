// ===================================================================
// offerActions — the smallest safe ACTION layer over the deterministic Offer
// Campaign Bridge. It turns an input prospect/business request into a VALIDATED
// OfferCampaignBrief and returns a structured, failure-safe result.
//
//   generateOfferCampaignBrief(request, opts?) -> { ok, brief, errors, degraded }
//
// It is a SIBLING inside offer/, so the layer stays runtime-inert for this slice:
// nothing outside offer/ imports it yet (the live UI surface is a later slice).
// It calls NO model, imports ONLY its sibling bridge + schema, performs NO I/O,
// persists NOTHING, uses NO Date.now and NO randomness, and NEVER mutates input.
// On any bridge failure it returns a safe failed result — it never crashes the
// caller.
//
// FUTURE (not here): a composition root will expose generateOfferCampaignBrief to
// the UI, and an AI Provider Router may later polish the (deterministic) brief.
// No provider/persistence/UI code exists in this slice.
// ===================================================================
import { buildOfferCampaignBrief } from './offerCampaignBridge.js';
import { validateOfferCampaignBrief, validateOfferCampaignRequest } from './offerSchema.js';

/** Action catalogue (metadata for a future audit/UI surface — not wired here). */
export const OFFER_ACTIONS = Object.freeze([
  { name: 'generate_offer_campaign_brief', description: 'בונה בריף קמפיין הצעה (אבחון, הצעה, זווית, מסר, אאוטריץ׳, פוסטר, דף נחיתה, פולואפ, התנגדויות) — דטרמיניסטי, ללא שמירה', confirm: false },
]);

function fail(errors) {
  const list = Array.isArray(errors) ? errors.filter(Boolean).map(String) : [String(errors)];
  return { ok: false, brief: null, errors: list.length ? list : ['offer_brief_failed'], degraded: true };
}

/**
 * Build a validated OfferCampaignBrief from an input request. Failure-safe:
 * returns { ok:false, brief:null, errors, degraded:true } instead of throwing.
 *
 * @param {{ prospect:object, signals?:object, goal?:object, preset?:string, offerOverride?:object }} request
 * @param {{ preset?:object, presets?:object, presetId?:string }} [opts] - preset injection passthrough
 * @returns {{ ok:boolean, brief:(object|null), errors:string[], degraded:boolean }}
 */
export function generateOfferCampaignBrief(request, opts = {}) {
  // 1) light input guard — a clearly invalid request is a safe failure, not a crash.
  const reqCheck = validateOfferCampaignRequest(request);
  if (!reqCheck.ok) return fail(reqCheck.errors);

  // 2) deterministic build — catch the typed invalid-request error (and anything
  //    else) so the caller never sees a throw.
  let brief;
  try {
    brief = buildOfferCampaignBrief(request, opts);
  } catch (e) {
    return fail([(e && e.message) || 'offer_bridge_failed']);
  }

  // 3) validate the generated brief — an invalid brief must not be reported as ok.
  const v = validateOfferCampaignBrief(brief);
  if (!v.ok) return fail(v.errors);

  // 4) success — a draft brief; nothing is persisted.
  return { ok: true, brief, errors: [], degraded: false };
}

/**
 * Optional factory for parity with the production orchestrator and to allow a
 * later composition root to inject a non-built-in preset. Pure passthrough.
 * @param {{ preset?:object, presets?:object, presetId?:string }} [opts]
 */
export function createOfferOrchestrator(opts = {}) {
  return {
    offerActions: OFFER_ACTIONS,
    generateOfferCampaignBrief: (request) => generateOfferCampaignBrief(request, opts),
  };
}
