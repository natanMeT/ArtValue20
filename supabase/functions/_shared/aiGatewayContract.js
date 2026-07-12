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
  // Fail-closed code for malformed / schema-invalid STRUCTURED provider output
  // (distinct from provider_error, which is transport/HTTP failure).
  INVALID_PROVIDER_RESPONSE: 'invalid_provider_response',
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
  // Server-owned EXECUTION authority — the frozen action profile owns the
  // system instruction, generation config, output mode, and the structured
  // output contract. A caller may never set these; stripped here at the
  // untrusted boundary (case-insensitive) so they can never reach the
  // provider request, be logged, or be echoed back.
  'system', 'systeminstruction', 'system_instruction',
  'temperature', 'maxoutputtokens', 'max_output_tokens',
  'outputmode', 'output_mode',
  'responsemimetype', 'response_mime_type',
  'responseschema', 'response_schema',
  'responsejsonschema', 'response_json_schema',
  'responseformat', 'response_format',
  'schema', 'parsepolicy', 'parse_policy',
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

// ---- discard ALL caller-supplied routing options (server-owned routing) ----
// Provider routing is server-owned: callers name action types, never
// providers. An untrusted request may NOT carry routing authority, so every
// routing option — preferredProvider, localFirst, apiFirst, excludeProviders,
// availableProviders, and any unknown key — is dropped here at the untrusted
// boundary. The result is always {}, so buildAiRequest/selectProvider fall
// back to the default server-owned chain and decision.request.options is empty.
//
// NOTE: the router itself (selectProvider / buildAiRequest in aiGateway.js)
// still ACCEPTS trusted options — that is intentional, for future trusted
// server-side orchestration. Only THIS untrusted boundary refuses them.
function normalizeGatewayOptions(_options) {
  return {};
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
// Takes the sanitized user PAYLOAD and a SERVER-OWNED execution PROFILE (from
// the server-only action-profile registry) and returns the Generative Language
// request body, or a stable invalid_payload error.
//
// The caller supplies ordinary user input only (payload.prompt). ALL execution
// authority — system instruction, temperature, maxOutputTokens, output mode,
// responseMimeType, responseSchema — comes from the profile; none of it can be
// supplied through the untrusted payload (those keys are stripped at the
// boundary). The provider module owns the endpoint, the model, the API key,
// and the fetch — never this function.
export function buildGeminiTextRequest(payload, profile) {
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

  const prof = isPlainObject(profile) ? profile : {};
  const temperature = clampNumber(prof.temperature, 0, 2, GEMINI_TEXT_DEFAULTS.temperature);
  const maxOutputTokens = Math.round(clampNumber(prof.maxOutputTokens, 1, 8192, GEMINI_TEXT_DEFAULTS.maxOutputTokens));
  const systemInstruction = (typeof prof.systemInstruction === 'string' && prof.systemInstruction.trim())
    ? prof.systemInstruction.trim()
    : null;

  // Minimal, broadly-compatible body. NOTE: no `thinkingConfig` — kept off for
  // cross-model compatibility. Only universally-accepted generationConfig
  // fields, plus (for json profiles) responseMimeType + the server-owned schema.
  const generationConfig = { temperature, maxOutputTokens };
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

  if (prof.outputMode === 'json') {
    generationConfig.responseMimeType = (typeof prof.responseMimeType === 'string' && prof.responseMimeType)
      ? prof.responseMimeType
      : 'application/json';
    // Only the SERVER-OWNED schema from the profile is ever attached — a caller
    // can never supply or mutate it (payload schema keys are stripped above).
    if (isPlainObject(prof.responseSchema)) {
      generationConfig.responseSchema = prof.responseSchema;
    }
  }

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

// ---- structured (json) result contracts + validation (pure, fail-closed) ----
// A result-contract id links a json action profile to its explicit validator.
// This is a small allowlist, deliberately NOT a generic JSON-Schema engine —
// the provider responseSchema constrains generation, application validation is
// still mandatory. Unknown contract → reject (fail closed).
export const STRUCTURED_RESULT_CONTRACTS = Object.freeze({
  CRM_SUGGEST_NEXT_ACTION: 'crm.suggest_next_action',
});

const CRM_PRIORITIES = Object.freeze(['low', 'medium', 'high']);
const UNSAFE_OBJECT_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

// Validate + NORMALIZE a crm.suggest_next_action object into a fresh, safe
// { suggestion, reason, priority } literal (no extra/unsafe keys), or null if
// it violates the contract. Rejects arrays/null/primitives and any object
// carrying a prototype-polluting own key. Never throws.
export function validateCrmSuggestNextAction(value) {
  if (!isPlainObject(value)) return null;
  for (const k of UNSAFE_OBJECT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, k)) return null;
  }
  const suggestion = value.suggestion;
  const reason = value.reason;
  const priority = value.priority;
  if (typeof suggestion !== 'string' || !suggestion.trim()) return null;
  if (typeof reason !== 'string' || !reason.trim()) return null;
  if (typeof priority !== 'string' || !CRM_PRIORITIES.includes(priority)) return null;
  return { suggestion, reason, priority };
}

// Dispatch to the validator for a given result contract. Unknown contract →
// null (fail closed). Never throws.
export function validateStructuredResult(resultContract, value) {
  if (resultContract === STRUCTURED_RESULT_CONTRACTS.CRM_SUGGEST_NEXT_ACTION) {
    return validateCrmSuggestNextAction(value);
  }
  return null;
}

// Parse raw provider text as JSON and validate against the contract. Returns
// { ok: true, value } with a safe normalized object, or { ok: false } on
// malformed JSON / non-object / contract violation. Never throws.
export function parseStructuredResult(rawText, resultContract) {
  if (typeof rawText !== 'string') return { ok: false };
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false };
  }
  const value = validateStructuredResult(resultContract, parsed);
  if (value === null) return { ok: false };
  return { ok: true, value };
}

// Content-free character count of the RAW provider text (a text completion, or
// the raw JSON string BEFORE parsing) — never a re-serialized object length.
export function providerResultChars(rawText) {
  return (typeof rawText === 'string') ? rawText.length : null;
}

// Structured (json) success — result carries ONLY the validated, normalized
// object under `json` (never raw text, never the schema or system instruction).
export function buildProviderJsonSuccessResponse(decision, json) {
  return {
    ok: true,
    actionType: decision.actionType,
    request: decision.request,
    routing: decision.routing,
    provider: 'gemini',
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.COMPLETED },
    result: { json: isPlainObject(json) ? json : {} },
    usage: { logging: 'deferred', budgetCheck: 'deferred' },
  };
}

// Fail-closed response for malformed / schema-invalid structured provider
// output. The message is fixed/generic — no parse detail, raw text, schema, or
// hidden instruction ever leaves this function. execution.status stays
// provider_error to avoid expanding the execution-status vocabulary; the
// distinct error.code (invalid_provider_response) identifies the cause.
export function buildInvalidProviderResponse(decision) {
  return {
    ok: false,
    actionType: (decision && decision.actionType) || null,
    error: {
      code: AI_GATEWAY_ERROR_CODES.INVALID_PROVIDER_RESPONSE,
      message: 'Gemini provider returned an invalid response.',
    },
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.PROVIDER_ERROR },
  };
}

// ---- pure, content-free usage record builder (node-testable) ----
// Produces the insertable `ai_usage` shape from a decision + outcome. It
// accepts only COUNTS (promptChars/resultChars) — never raw prompt/response
// text — so no content can ever reach the log. No Deno, no Supabase, no
// network, no ids/time (the Edge Function supplies request_id; the DB stamps
// created_at). Never throws.
function usageInt(value) {
  return (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? Math.round(value) : null;
}
function usageStr(value) {
  return (typeof value === 'string' && value) ? value : null;
}

export function buildUsageRecord(input) {
  const o = isPlainObject(input) ? input : {};
  const decision = isPlainObject(o.decision) ? o.decision : {};
  const routing = isPlainObject(decision.routing) ? decision.routing : {};

  const action = normalizeActionType(decision.actionType);
  const provider = usageStr(o.provider) || usageStr(routing.selectedProvider);
  const costTier = usageStr(routing.costTier) || (action ? COST_TIER_BY_ACTION[action] : null) || null;
  const estimatedCost = action ? estimateCost(action, provider).estimatedCost : null;

  return {
    request_id: usageStr(o.requestId) || 'unknown',
    // 'unknown' sentinel for invalid_action keeps the column non-null and the
    // vocabulary clean (never stores an arbitrary user-supplied action string).
    action_type: action || 'unknown',
    provider: provider || null,
    model: usageStr(o.model),
    cost_tier: costTier,
    estimated_cost_usd: estimatedCost,
    is_estimate: true,
    status: usageStr(o.status) || 'rejected',
    http_status: usageInt(o.httpStatus),
    error_code: usageStr(o.errorCode),
    prompt_chars: usageInt(o.promptChars),
    result_chars: usageInt(o.resultChars),
  };
}
