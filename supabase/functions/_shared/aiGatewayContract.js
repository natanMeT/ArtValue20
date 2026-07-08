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
  selectProvider,
  buildAiRequest,
  estimateCost,
} from './aiGateway.js';

// ---- frozen vocabularies ----
export const AI_GATEWAY_EXECUTION_STATUS = Object.freeze({
  NOT_IMPLEMENTED: 'not_implemented',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  PROVIDER_NOT_CONFIGURED: 'provider_not_configured',
  PROVIDER_ERROR: 'provider_error',
});

export const AI_GATEWAY_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'invalid_request',
  INVALID_ACTION: 'invalid_action',
  INVALID_PAYLOAD: 'invalid_payload',
  PROVIDER_NOT_CONFIGURED: 'provider_not_configured',
  PROVIDER_ERROR: 'provider_error',
});

// ---- Gemini text execution policy (pure; the shell enforces it) ----
// Text-tier actions Gemini is allowed to serve. This is a POLICY whitelist;
// the executable subset below is what actually runs in this slice.
export const GEMINI_TEXT_ACTION_TYPES = Object.freeze([
  'text.copy',
  'text.strategy',
  'text.crm_message',
  'text.campaign',
  'studio.prompt_enhance',
  'crm.suggest_next_action',
]);

// The subset that actually executes now = text actions the router routes to
// gemini FIRST by default. Derived from the router so it can never drift from
// the routing table (text.strategy / text.campaign are anthropic-first, so
// they stay whitelisted-but-deferred until an anthropic slice exists).
export const GEMINI_EXECUTABLE_ACTION_TYPES = Object.freeze(
  GEMINI_TEXT_ACTION_TYPES.filter((a) => selectProvider(a)[0] === 'gemini'),
);

export function isGeminiTextAction(actionType) {
  const a = normalizeActionType(actionType);
  return a !== null && GEMINI_TEXT_ACTION_TYPES.includes(a);
}

export function isGeminiExecutableAction(actionType) {
  const a = normalizeActionType(actionType);
  return a !== null && GEMINI_EXECUTABLE_ACTION_TYPES.includes(a);
}

// Sensible fixed defaults for slice 1 (mirrors the frontend text path intent).
const GEMINI_TEXT_DEFAULTS = Object.freeze({ temperature: 0.7, maxOutputTokens: 1024 });

function clampNumber(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

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

// ---- Gemini text: pure REST-body builder (no network, no key) ----
// Takes the sanitized payload and returns the Generative Language request
// body, or a stable invalid_payload error. The provider module owns the
// endpoint, the model, the API key, and the fetch — never this function.
export function buildGeminiTextRequest(payload) {
  const safe = normalizeGatewayPayload(payload);
  const prompt = typeof safe.prompt === 'string' ? safe.prompt.trim() : '';
  if (!prompt) {
    return {
      ok: false,
      error: {
        code: AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD,
        message: 'payload.prompt (a non-empty string) is required.',
      },
    };
  }
  const system = (typeof safe.system === 'string' && safe.system.trim()) ? safe.system.trim() : null;
  const temperature = clampNumber(safe.temperature, 0, 2, GEMINI_TEXT_DEFAULTS.temperature);
  const maxOutputTokens = Math.round(clampNumber(safe.maxOutputTokens, 1, 8192, GEMINI_TEXT_DEFAULTS.maxOutputTokens));

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return { ok: true, body };
}

// ---- Gemini text: pure response parser → text | null ----
export function parseGeminiTextResponse(json) {
  if (!isPlainObject(json)) return null;
  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const first = candidates[0];
  const parts = (first && isPlainObject(first.content) && Array.isArray(first.content.parts))
    ? first.content.parts
    : [];
  const text = parts
    .map((p) => (isPlainObject(p) && typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  return text || null;
}

// ---- provider response builders (pure, deterministic, secret-free) ----
export function buildProviderNotConfiguredResponse(decision) {
  return {
    ok: false,
    actionType: (decision && decision.actionType) || null,
    error: {
      code: AI_GATEWAY_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
      message: 'Gemini provider is not configured.',
    },
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.PROVIDER_NOT_CONFIGURED },
  };
}

// Message is intentionally fixed/generic — upstream provider text is NEVER
// forwarded to the client, so no key or raw provider payload can leak.
export function buildProviderErrorResponse(decision) {
  return {
    ok: false,
    actionType: (decision && decision.actionType) || null,
    error: {
      code: AI_GATEWAY_ERROR_CODES.PROVIDER_ERROR,
      message: 'Gemini provider request failed.',
    },
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.PROVIDER_ERROR },
  };
}

export function buildInvalidPayloadResponse(decision, error) {
  return {
    ok: false,
    actionType: (decision && decision.actionType) || null,
    error: (error && typeof error === 'object')
      ? error
      : { code: AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD, message: 'Invalid payload.' },
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.REJECTED },
  };
}

export function buildProviderSuccessResponse(decision, text) {
  return {
    ok: true,
    actionType: decision.actionType,
    request: decision.request,
    routing: decision.routing,
    provider: 'gemini',
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.COMPLETED },
    result: { text: typeof text === 'string' ? text : '' },
    usage: { logging: 'deferred', budgetCheck: 'deferred' },
  };
}
