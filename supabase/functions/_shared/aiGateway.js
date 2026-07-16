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
// Local providers (comfyui/ollama/fooocus/a1111) stay registered as
// fallback/dev routes — nothing local is removed by this module.
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
  'studio.prompt_enhance',
  'crm.suggest_next_action',
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
  'comfyui',
  'ollama',
  'fooocus',
  'a1111',
  'none',
]);

// Providers that run on the user's machine (dev/fallback routes).
export const LOCAL_PROVIDERS = Object.freeze(['comfyui', 'ollama', 'fooocus', 'a1111']);

// Providers reached over an API.
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
  comfyui: Object.freeze({
    image: 'comfyui:image',
    video: 'comfyui:video',
    inpaint: 'comfyui:inpaint',
  }),
  ollama: Object.freeze({
    text: 'ollama:text',
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
  'studio.prompt_enhance': 'low',
  'crm.suggest_next_action': 'low',
  'text.strategy': 'medium',
  'text.campaign': 'medium',
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

// ---- table-driven default routing (recommendation map only) ----
export const DEFAULT_PROVIDER_BY_ACTION = Object.freeze({
  'text.copy': Object.freeze(['gemini', 'openai', 'openrouter', 'ollama']),
  'text.crm_message': Object.freeze(['gemini', 'openai', 'openrouter', 'ollama']),
  'text.multi_turn': Object.freeze(['gemini', 'openai', 'openrouter', 'ollama']),
  'jake.draft_message': Object.freeze(['gemini', 'openai', 'openrouter', 'ollama']),
  'studio.prompt_enhance': Object.freeze(['gemini', 'openai', 'openrouter', 'ollama']),
  'crm.suggest_next_action': Object.freeze(['gemini', 'openai', 'openrouter', 'ollama']),
  'text.strategy': Object.freeze(['anthropic', 'gemini', 'openai', 'openrouter', 'ollama']),
  'text.campaign': Object.freeze(['anthropic', 'gemini', 'openai', 'openrouter', 'ollama']),
  'image.poster': Object.freeze(['openai', 'gemini', 'replicate', 'pollinations', 'comfyui']),
  'image.variation': Object.freeze(['openai', 'gemini', 'replicate', 'pollinations', 'comfyui']),
  'image.product_presenter': Object.freeze(['gemini', 'replicate', 'comfyui']),
  'image.product_lock': Object.freeze(['openai', 'gemini', 'replicate', 'comfyui']),
  'vision.analyze_reference': Object.freeze(['gemini', 'openai', 'anthropic']),
  'video.short_ad': Object.freeze(['runway', 'kling', 'luma', 'pika', 'comfyui']),
  'video.product_demo': Object.freeze(['runway', 'kling', 'luma', 'pika', 'comfyui']),
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

function isLocalProvider(provider) {
  return LOCAL_PROVIDERS.includes(provider);
}

function isApiProvider(provider) {
  return API_PROVIDERS.includes(provider);
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

  // Ordering preference: apiFirst wins over localFirst (API-first
  // architecture); both are stable partitions of the default order.
  if (opts.apiFirst === true) {
    chain = [...chain.filter(isApiProvider), ...chain.filter((p) => !isApiProvider(p))];
  } else if (opts.localFirst === true) {
    chain = [...chain.filter(isLocalProvider), ...chain.filter((p) => !isLocalProvider(p))];
  }

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
      localFirst: opts.localFirst === true,
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
    // Local providers cost no API money (electricity is out of scope).
    const unitCost = (prov && (isLocalProvider(prov) || prov === 'none'))
      ? 0
      : TIER_UNIT_COST_USD[costTier];
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
