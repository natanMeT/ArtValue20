// ===================================================================
// Growth OS — Calls / Follow-up Prep (buildCallPrep helper)
// Pure, deterministic, presentational data assembly. NO persistence,
// NO store, NO AI/provider, NO network, NO messaging, NO publishing.
//
// It only READS the existing Growth OS data modules (lead mapping +
// content library) and assembles a plain "call prep" object for one lead
// category. It never mutates the source data and never sends anything.
// This does NOT wire JaceOS or any assistant engine.
// ===================================================================

import {
  LEAD_CATEGORIES, categoryById, serviceById, actionById,
} from './growthLeads.js';
import {
  matchContentTemplates, itemsByCategory,
} from './growthContentAds.js';

// How many follow-up / content templates to surface on the prep view.
const TEMPLATE_LIMIT = 4;

// Category id of the dedicated WhatsApp/follow-up template group in the
// Content & Ads Library. These are generic, reusable follow-up messages that
// help re-open a conversation, so they are prioritized for every lead category.
const FOLLOWUP_CATEGORY_ID = 'followups_whatsapp';

// Lightweight selector options for the Calls page (id + label + icon only).
// Deterministic — mirrors LEAD_CATEGORIES order. Fresh objects (no source refs).
export const CALL_CATEGORIES = LEAD_CATEGORIES.map((c) => ({
  id: c.id, label: c.label, icon: c.icon,
}));

// Merge follow-up templates (prioritized) with offer-matched templates,
// de-duplicated by id and capped at `limit`. Returns ORIGINAL item refs in a
// fresh array — never mutates the source library. Pure & deterministic.
function mergeTemplates(offerIds, limit) {
  const followups = itemsByCategory(FOLLOWUP_CATEGORY_ID);
  const matched = matchContentTemplates(offerIds, limit);
  const seen = new Set();
  const out = [];
  for (const item of [...followups, ...matched]) {
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return limit > 0 ? out.slice(0, limit) : [];
}

// Build a deterministic call-prep object for one lead category id.
// Returns null for an unknown / missing category id. Does NOT mutate sources.
export function buildCallPrep(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return null;

  const offer = serviceById(category.offerId);
  const entryOffer = category.entryOfferId ? serviceById(category.entryOfferId) : null;
  const action = actionById(category.action);
  const upsell = (category.upsell || []).map(serviceById).filter(Boolean);
  // "entry point" is only meaningful when it differs from the main offer.
  const hasEntry = !!entryOffer && (!offer || entryOffer.id !== offer.id);

  // Offer path used to match content templates: main → entry → upsell.
  const offerIds = [category.offerId, category.entryOfferId, ...(category.upsell || [])]
    .filter(Boolean);

  const templates = mergeTemplates(offerIds, TEMPLATE_LIMIT);

  return {
    categoryId: category.id,
    label: category.label,
    icon: category.icon,
    who: category.who,
    pains: [...(category.pains || [])],
    salesPotential: category.salesPotential,
    urgency: category.urgency,
    closeProbability: category.closeProbability,
    action,
    offer,
    entryOffer,
    hasEntry,
    upsell,
    whyFit: category.whyFit || '',
    expectedValue: category.expectedValue || '',
    objection: category.objection || '',
    response: category.response || '',
    proof: [...(category.proof || [])],
    offerIds,
    templates,
  };
}
