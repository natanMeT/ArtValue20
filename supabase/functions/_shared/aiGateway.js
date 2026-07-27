// ===================================================================
// AI Gateway — Slice 1: pure provider registry / router.
//
// Single choke point vocabulary for "which AI provider should serve
// which action type". Callers request ACTION TYPES, never providers.
// This module is a TABLE, not a client: it selects and describes,
// it never calls. No network, no secrets, no env access, no SDKs,
// no imports from Studio/Jake/Gemini/ComfyUI code — node-testable
// and deterministic (no timestamps, no ids, no randomness).
//
// PRODUCT BOUNDARY (2026-07-27, owner decision): ArtValue is a CLOUD-ONLY
// product. The local providers (comfyui / ollama / fooocus / a1111) that this
// table used to register as fallback/dev routes are REMOVED from the
// vocabulary, from every model entry and from every routing chain. There is no
// LOCAL_PROVIDERS partition and no localFirst ordering left: a local provider
// is not selectable, orderable or nameable through this contract at all.
// The cloud ACTION vocabulary is unchanged.
// Cost figures are internal planning placeholders, never billing
// truth (every estimate is marked isExact: false).
// ===================================================================

// ---- frozen action type vocabulary (stable ids, not UI labels) ----
export const AI_ACTION_TYPES = Object.freeze([
  'text.copy',
  'text.strategy',
  'text.crm_message',
  'text.campaign',
  // Infrastructure-only multi-turn text action (Gateway V2 · C2). Proves the
  // normalized-messages provider path end-to-end. NOT wired to any product
  // surface; a future Jake action (jake.draft_message) replaces/joins it.
  'text.multi_turn',
  // Jake drafting lane (Slice B): multi-turn Hebrew message drafting served by
  // the Gateway with a server-owned drafting profile. Wired to the frontend
  // draftWithJake seam; instruction authority stays server-side.
  'jake.draft_message',
  // Jake conversational lane (M2 J1): multi-turn Jake CHAT with the full
  // server-owned production authority (persona + rules + action protocol +
  // confirm mode). Server-only in J1 — NO frontend caller is routed yet.
  'jake.chat',
  // Jake force-actions lane (M2 J1): the second-pass actions-only engine —
  // exactly ONE user message in, a fenced ```actions block (or []) out.
  // Server-only in J1 — NO frontend caller is routed yet.
  'jake.force_actions',
  'studio.prompt_enhance',
  // ImageStudio server-side image generation (M2 J3C S4.1): ONE 1K PNG per
  // request through the server-owned Gemini image lane. Server-only in S4.1 —
  // NO frontend caller is wired (ImageStudio behavior is unchanged until a
  // separately approved wiring slice).
  'studio.generate_image',
  'crm.suggest_next_action',
  // Outreach lead-ideas lane (M2 J3A): structured lead-idea generation served
  // by the Gateway with a server-owned system instruction + JSON schema.
  // Wired to the frontend generateLeadIdeas seam (Outreach.jsx).
  'crm.lead_ideas',
  // Quote-diagnosis lane (M2 J3B): structured sales diagnosis served by the
  // Gateway with a server-owned system instruction + JSON schema + user-message
  // template. Wired to the frontend diagnoseQuote seam (Diagnose.jsx).
  'crm.diagnose_quote',
  'image.poster',
  'image.variation',
  'image.product_presenter',
  'image.product_lock',
  'vision.analyze_reference',
  'video.short_ad',
  'video.product_demo',
]);

// ---- frozen provider vocabulary ----
export const AI_PROVIDERS = Object.freeze([
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'replicate',
  'runway',
  'kling',
  'pika',
  'luma',
  'pollinations',
  'none',
]);

// Providers reached over an API. Every provider in the vocabulary except the
// explicit 'none' sentinel is now an API provider — there is no other kind.
export const API_PROVIDERS = Object.freeze([
  'openai', 'anthropic', 'gemini', 'openrouter', 'replicate',
  'runway', 'kling', 'pika', 'luma', 'pollinations',
]);

// API providers whose calls need real secrets — these must go through a
// server proxy (future Supabase Edge Function), never a VITE_* key.
// pollinations is keyless, so it does not require a server.
const SERVER_REQUIRED_PROVIDERS = Object.freeze([
  'openai', 'anthropic', 'gemini', 'openrouter', 'replicate',
  'runway', 'kling', 'pika', 'luma',
]);

// ---- frozen model registry (internal ids, not real API model names) ----
export const AI_MODELS = Object.freeze({
  openai: Object.freeze({
    text_fast: 'openai:text-fast',
    text_strong: 'openai:text-strong',
    image: 'openai:image',
    vision: 'openai:vision',
  }),
  gemini: Object.freeze({
    text_fast: 'gemini:text-fast',
    text_strong: 'gemini:text-strong',
    image: 'gemini:image',
    vision: 'gemini:vision',
  }),
  anthropic: Object.freeze({
    text_strong: 'anthropic:text-strong',
    vision: 'anthropic:vision',
  }),
  openrouter: Object.freeze({
    text_fast: 'openrouter:text-fast',
    text_strong: 'openrouter:text-strong',
  }),
  replicate: Object.freeze({
    image: 'replicate:image',
  }),
  runway: Object.freeze({
    video: 'runway:video',
  }),
  kling: Object.freeze({
    video: 'kling:video',
  }),
  luma: Object.freeze({
    video: 'luma:video',
  }),
  pika: Object.freeze({
    video: 'pika:video',
  }),
  pollinations: Object.freeze({
    image: 'pollinations:image',
  }),
});

// ---- frozen cost tiers (planning granularity, not prices) ----
export const COST_TIERS = Object.freeze([
  'free', 'low', 'medium', 'medium_high', 'high', 'unknown',
]);

export const COST_TIER_BY_ACTION = Object.freeze({
  'text.copy': 'low',
  'text.crm_message': 'low',
  'text.multi_turn': 'low',
  'jake.draft_message': 'low',
  'jake.chat': 'low',
  'jake.force_actions': 'low',
  'studio.prompt_enhance': 'low',
  'crm.suggest_next_action': 'low',
  'crm.lead_ideas': 'low',
  'crm.diagnose_quote': 'low',
  'text.strategy': 'medium',
  'text.campaign': 'medium',
  // Image-cost classification (M2 J3C S4.1) — the per-invocation reservation
  // itself is pinned in ACTION_UNIT_COST_USD below, not the tier placeholder.
  'studio.generate_image': 'medium_high',
  'image.poster': 'medium',
  'image.variation': 'medium',
  'vision.analyze_reference': 'medium',
  'image.product_presenter': 'medium_high',
  'image.product_lock': 'medium_high',
  'video.short_ad': 'high',
  'video.product_demo': 'high',
});

// Internal placeholder unit prices per tier (USD, planning only).
const TIER_UNIT_COST_USD = Object.freeze({
  free: 0,
  low: 0.002,
  medium: 0.03,
  medium_high: 0.1,
  high: 0.4,
  unknown: null,
});

const BUDGET_CHECK_TIERS = Object.freeze(['medium', 'medium_high', 'high']);

// Server-owned PER-ACTION unit reservations (USD). Consulted before the tier
// placeholder in estimateCost — for actions whose provider list price is
// pinned by a slice. studio.generate_image: official gemini-3.1-flash-image
// 1K image output price is $0.067 (ai.google.dev/gemini-api/docs/pricing);
// $0.07 is the approved conservative reservation. Still isExact: false —
// this is a reservation estimate, never billing truth.
const ACTION_UNIT_COST_USD = Object.freeze({
  'studio.generate_image': 0.07,
});

// ---- table-driven default routing (recommendation map only) ----
export const DEFAULT_PROVIDER_BY_ACTION = Object.freeze({
  'text.copy': Object.freeze(['gemini', 'openai', 'openrouter']),
  'text.crm_message': Object.freeze(['gemini', 'openai', 'openrouter']),
  'text.multi_turn': Object.freeze(['gemini', 'openai', 'openrouter']),
  'jake.draft_message': Object.freeze(['gemini', 'openai', 'openrouter']),
  'jake.chat': Object.freeze(['gemini', 'openai', 'openrouter']),
  'jake.force_actions': Object.freeze(['gemini', 'openai', 'openrouter']),
  'studio.prompt_enhance': Object.freeze(['gemini', 'openai', 'openrouter']),
  // Single-provider chain by design (M2 J3C S4.1): the image lane makes exactly
  // one Gemini attempt — no second provider, no fallback, no retry.
  'studio.generate_image': Object.freeze(['gemini']),
  'crm.suggest_next_action': Object.freeze(['gemini', 'openai', 'openrouter']),
  'crm.lead_ideas': Object.freeze(['gemini', 'openai', 'openrouter']),
  'crm.diagnose_quote': Object.freeze(['gemini', 'openai', 'openrouter']),
  'text.strategy': Object.freeze(['anthropic', 'gemini', 'openai', 'openrouter']),
  'text.campaign': Object.freeze(['anthropic', 'gemini', 'openai', 'openrouter']),
  'image.poster': Object.freeze(['openai', 'gemini', 'replicate', 'pollinations']),
  'image.variation': Object.freeze(['openai', 'gemini', 'replicate', 'pollinations']),
  'image.product_presenter': Object.freeze(['gemini', 'replicate']),
  'image.product_lock': Object.freeze(['openai', 'gemini', 'replicate']),
  'vision.analyze_reference': Object.freeze(['gemini', 'openai', 'anthropic']),
  'video.short_ad': Object.freeze(['runway', 'kling', 'luma', 'pika']),
  'video.product_demo': Object.freeze(['runway', 'kling', 'luma', 'pika']),
});

// ---- normalizers (never throw; unknown → null) ----
export function normalizeActionType(actionType) {
  if (typeof actionType !== 'string') return null;
  const value = actionType.trim().toLowerCase();
  return AI_ACTION_TYPES.includes(value) ? value : null;
}

export function normalizeProvider(provider) {
  if (typeof provider !== 'string') return null;
  const value = provider.trim().toLowerCase();
  return AI_PROVIDERS.includes(value) ? value : null;
}

// A provider "supports" an action when it appears in that action's
// default chain (the only routing knowledge this slice has).
export function providerSupportsAction(provider, actionType) {
  const action = normalizeActionType(actionType);
  const prov = normalizeProvider(provider);
  if (!action || !prov) return false;
  return DEFAULT_PROVIDER_BY_ACTION[action].includes(prov);
}

export function getProviderChain(actionType) {
  const action = normalizeActionType(actionType);
  if (!action) return [];
  return [...DEFAULT_PROVIDER_BY_ACTION[action]];
}

// ---- helpers (module-private, defensive) ----
function toProviderSet(value) {
  if (!Array.isArray(value)) return null;
  const set = new Set();
  for (const entry of value) {
    const prov = normalizeProvider(entry);
    if (prov) set.add(prov);
  }
  return set;
}

// ---- provider selection (ordered fallback list, never throws) ----
export function selectProvider(actionType, options = {}) {
  const action = normalizeActionType(actionType);
  if (!action) return [];
  const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};

  let chain = [...DEFAULT_PROVIDER_BY_ACTION[action]];

  const excluded = toProviderSet(opts.excludeProviders);
  if (excluded) chain = chain.filter((p) => !excluded.has(p));

  const available = toProviderSet(opts.availableProviders);
  if (available) chain = chain.filter((p) => available.has(p));

  // Ordering preference: `apiFirst` is retained as an accepted no-op option so
  // existing callers keep working. Every provider in the vocabulary is an API
  // provider now, so the partition is the identity — and `localFirst` is gone
  // with the providers it used to promote.

  // Preferred provider moves to the front only if it survived the
  // support/availability/exclusion filters above.
  const preferred = normalizeProvider(opts.preferredProvider);
  if (preferred && chain.includes(preferred)) {
    chain = [preferred, ...chain.filter((p) => p !== preferred)];
  }

  return chain;
}

// ---- request descriptor (describes a call; makes none) ----
export function buildAiRequest(actionType, payload = {}, options = {}) {
  const action = normalizeActionType(actionType);
  const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
  const safePayload = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};

  const providerChain = selectProvider(actionType, opts);
  const selectedProvider = providerChain.length > 0 ? providerChain[0] : null;
  const costTier = action ? COST_TIER_BY_ACTION[action] : 'unknown';

  return {
    actionType: action,
    payload: { ...safePayload },
    providerChain,
    selectedProvider,
    costTier,
    requiresServer: selectedProvider !== null && SERVER_REQUIRED_PROVIDERS.includes(selectedProvider),
    requiresBudgetCheck: BUDGET_CHECK_TIERS.includes(costTier),
    metadata: {
      source: 'ai-gateway',
      preference: normalizeProvider(opts.preferredProvider),
      apiFirst: opts.apiFirst === true,
    },
  };
}

// ---- deterministic planning estimator (never billing truth) ----
export function estimateCost(actionType, provider, units = {}) {
  const action = normalizeActionType(actionType);
  const prov = normalizeProvider(provider);
  const costTier = action ? COST_TIER_BY_ACTION[action] : 'unknown';

  const rawCount = (units && typeof units === 'object' && !Array.isArray(units)) ? units.count : 1;
  const count = (typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0) ? rawCount : 1;

  let estimatedCost = null;
  if (costTier !== 'unknown') {
    // The 'none' sentinel costs nothing. A pinned per-action unit price
    // (ACTION_UNIT_COST_USD) wins over the tier placeholder; every action
    // without a pin keeps the exact tier arithmetic it always had.
    const unitCost = (prov === 'none')
      ? 0
      : (Object.prototype.hasOwnProperty.call(ACTION_UNIT_COST_USD, action)
        ? ACTION_UNIT_COST_USD[action]
        : TIER_UNIT_COST_USD[costTier]);
    estimatedCost = Math.round(unitCost * count * 10000) / 10000;
  }

  return {
    costTier,
    estimatedUnits: count,
    estimatedCost,
    currency: 'USD',
    isExact: false,
  };
}
