// ===================================================================
// AI Gateway Contract — pure request/response layer for the server proxy.
//
// This is the boundary the (future) Supabase Edge Function `ai-gateway`
// delegates to. It takes an UNTRUSTED request ({ actionType, payload,
// options }), validates the action against the frozen aiGateway router
// vocabulary, sanitizes the payload/options, and returns a normalized,
// deterministic routing DECISION — it never executes a provider.
//
// STUB CONTRACT: execution.status is always `not_implemented`; real
// provider calls, usage logging, and budget enforcement are deferred to
// later slices (their seams are marked `deferred` in the response).
//
// Purity (same house pattern as aiGateway.js): only imports the pure
// router; no window/fetch/storage/Date.now/Math.random/crypto/env/
// provider calls; never throws on bad input; deterministic; no
// timestamps or ids.
// ===================================================================

import {
  normalizeActionType,
  buildAiRequest,
  estimateCost,
} from './aiGateway.js';

// ---- frozen vocabularies ----
export const AI_GATEWAY_EXECUTION_STATUS = Object.freeze({
  NOT_IMPLEMENTED: 'not_implemented',
  REJECTED: 'rejected',
});

export const AI_GATEWAY_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'invalid_request',
  INVALID_ACTION: 'invalid_action',
});

// Top-level payload keys that must NEVER become execution authority or
// leak a secret. Untrusted callers could try to smuggle a provider,
// model, or key through the payload; the router owns provider choice,
// so we strip these defensively (shallow — the real per-action payload
// schemas arrive with the execution slice).
const UNTRUSTED_PAYLOAD_KEYS = Object.freeze(new Set([
  'provider', 'providers', 'model', 'models',
  'providerchain', 'provider_chain', 'selectedprovider', 'selected_provider',
  'apikey', 'api_key', 'key', 'secret', 'token', 'authorization', 'auth',
]));

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// ---- sanitize untrusted payload → safe shallow copy ----
export function normalizeGatewayPayload(payload) {
  if (!isPlainObject(payload)) return {};
  const clean = {};
  for (const key of Object.keys(payload)) {
    if (UNTRUSTED_PAYLOAD_KEYS.has(key.toLowerCase())) continue;
    clean[key] = payload[key];
  }
  return clean;
}

// ---- whitelist safe routing hints only (never raw provider authority) ----
// preferredProvider is passed as a raw string; the router re-validates it
// via normalizeProvider + support/availability filters, so an unsupported
// or unknown hint can never inject a provider into the chain.
function normalizeGatewayOptions(options) {
  if (!isPlainObject(options)) return {};
  const clean = {};
  if (typeof options.preferredProvider === 'string') clean.preferredProvider = options.preferredProvider;
  if (options.localFirst === true) clean.localFirst = true;
  if (options.apiFirst === true) clean.apiFirst = true;
  if (Array.isArray(options.excludeProviders)) clean.excludeProviders = [...options.excludeProviders];
  return clean;
}

// ---- core: untrusted request → deterministic routing decision ----
export function buildAiGatewayDecision(request) {
  const req = isPlainObject(request) ? request : {};
  const action = normalizeActionType(req.actionType);
  const payload = normalizeGatewayPayload(req.payload);
  const options = normalizeGatewayOptions(req.options);

  if (!action) {
    return {
      ok: false,
      error: {
        code: AI_GATEWAY_ERROR_CODES.INVALID_ACTION,
        message: 'Unknown or missing actionType. Use a value from AI_ACTION_TYPES.',
      },
    };
  }

  const aiRequest = buildAiRequest(action, payload, options);
  const costEstimate = estimateCost(action, aiRequest.selectedProvider);

  return {
    ok: true,
    actionType: action,
    request: { actionType: action, payload, options },
    routing: {
      providerChain: aiRequest.providerChain,
      selectedProvider: aiRequest.selectedProvider,
      costTier: aiRequest.costTier,
      requiresServer: aiRequest.requiresServer,
      requiresBudgetCheck: aiRequest.requiresBudgetCheck,
      costEstimate,
    },
  };
}

// ---- final HTTP-ready response (stub: never executes) ----
export function buildAiGatewayResponse(request) {
  const decision = buildAiGatewayDecision(request);

  if (!decision.ok) {
    return {
      ok: false,
      error: decision.error,
      execution: { status: AI_GATEWAY_EXECUTION_STATUS.REJECTED },
    };
  }

  return {
    ok: true,
    actionType: decision.actionType,
    request: decision.request,
    routing: decision.routing,
    execution: {
      status: AI_GATEWAY_EXECUTION_STATUS.NOT_IMPLEMENTED,
      message: 'AI Gateway proxy stub is ready; provider execution is deferred.',
    },
    usage: {
      logging: 'deferred',
      budgetCheck: 'deferred',
    },
  };
}
