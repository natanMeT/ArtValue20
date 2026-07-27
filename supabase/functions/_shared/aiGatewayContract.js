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
  COST_TIER_BY_ACTION,
} from './aiGateway.js';

// Strict per-action input contract (Gateway V2 · C1). A pure sibling module: the
// Edge shell validates + normalizes the untrusted payload through this BEFORE
// budget reservation and provider execution. Re-exported here so the contract
// stays the single import surface the function shell delegates to. This module
// only re-exports the input API; it adds no impure dependency (the input module
// imports only the pure router).
export {
  validateAiGatewayInput,
  normalizeAiGatewayInput,
  countAiGatewayInputChars,
  hasAiGatewayInputProfile,
  AI_GATEWAY_INPUT_LIMITS,
  AI_GATEWAY_INPUT_PROFILE_KEYS,
  AI_GATEWAY_IMAGE_ASPECT_RATIOS,
} from './aiGatewayInput.js';
import { AI_GATEWAY_IMAGE_ASPECT_RATIOS as IMAGE_ASPECT_RATIOS } from './aiGatewayInput.js';

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
  // Budget-guard codes (the guard runs BEFORE any provider call).
  UNAUTHENTICATED: 'unauthenticated',
  RATE_LIMITED: 'rate_limited',
  BUDGET_EXCEEDED: 'budget_exceeded',
  BUDGET_GUARD_UNAVAILABLE: 'budget_guard_unavailable',
});

// ---- Gemini text execution policy (pure; the shell enforces it) ----
// Text-tier actions Gemini is allowed to serve. This is a POLICY whitelist;
// the executable subset below is what actually runs in this slice.
export const GEMINI_TEXT_ACTION_TYPES = Object.freeze([
  'text.copy',
  'text.strategy',
  'text.crm_message',
  'text.campaign',
  // Infrastructure-only multi-turn action (C2) — gemini-first, executable,
  // NOT wired to any product surface.
  'text.multi_turn',
  // Jake drafting lane (Slice B) — gemini-first, executable, wired to the
  // frontend draftWithJake seam. Same multi-turn input contract as C2.
  'jake.draft_message',
  // Jake conversational + force-actions lanes (M2 J1) — gemini-first,
  // executable, server-only for now (NO frontend caller is routed in J1;
  // chatJake/forceActionsJake migrate together in J2).
  'jake.chat',
  'jake.force_actions',
  'studio.prompt_enhance',
  'crm.suggest_next_action',
  // Outreach lead-ideas lane (M2 J3A) — gemini-first, executable, wired to the
  // frontend generateLeadIdeas seam. Strict { niche, count } input contract
  // (aiGatewayInput.js) + structured leads result contract (below).
  'crm.lead_ideas',
  // Quote-diagnosis lane (M2 J3B) — gemini-first, executable, wired to the
  // frontend diagnoseQuote seam. Strict { clientName, field, audience, offer }
  // input contract (aiGatewayInput.js) + structured diagnosis result contract
  // (below).
  'crm.diagnose_quote',
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

// ---- Gemini IMAGE execution policy (M2 J3C S4.1; the shell enforces it) ----
// A deliberately separate vocabulary from the text policy above: image
// actions never enter GEMINI_TEXT_ACTION_TYPES / GEMINI_EXECUTABLE_ACTION_TYPES,
// so every existing text pin, profile-coverage rule, and capability map stays
// byte-identical. The executable subset is derived from the router exactly
// like the text one, so it can never drift from the routing table.
export const GEMINI_IMAGE_ACTION_TYPES = Object.freeze([
  'studio.generate_image',
]);

export const GEMINI_IMAGE_EXECUTABLE_ACTION_TYPES = Object.freeze(
  GEMINI_IMAGE_ACTION_TYPES.filter((a) => selectProvider(a)[0] === 'gemini'),
);

export function isGeminiImageExecutableAction(actionType) {
  const a = normalizeActionType(actionType);
  return a !== null && GEMINI_IMAGE_EXECUTABLE_ACTION_TYPES.includes(a);
}

// Hard output cap: the DECODED image may never exceed 8 MiB (fail closed as
// invalid_provider_response before any byte reaches the client).
export const GEMINI_IMAGE_MAX_DECODED_BYTES = 8 * 1024 * 1024;

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
  'resulttransform', 'result_transform',
  'thinkingconfig', 'thinking_config', 'thinkingbudget', 'thinking_budget',
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
// routing option — preferredProvider, apiFirst, excludeProviders,
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
      // Server-side usage logging IS active; budgetCheck stays deferred because
      // this branch never executes a provider (no reservation is made).
      logging: 'active',
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
  // Prompt-only normalizes to ONE user message — same body as always.
  return buildGeminiMessagesRequest([{ role: 'user', text: prompt }], profile);
}

// ---- normalized provider messages (C2, provider-independent) ----
// The ONLY roles a provider adapter ever sees. `system` is not a message role —
// the server-owned profile carries the system instruction separately.
export const PROVIDER_MESSAGE_ROLES = Object.freeze(['user', 'assistant']);

function isProviderMessage(m) {
  return isPlainObject(m)
    && PROVIDER_MESSAGE_ROLES.includes(m.role)
    && typeof m.text === 'string' && m.text.trim().length > 0;
}

// Normalized VALIDATED payload → provider-independent messages, or null.
// - { prompt }               → [{ role:'user', text: prompt }]
// - { messages[, context] }  → fresh copies of the messages; a context summary is
//   folded into the FIRST message as clearly-delimited DATA (never a system
//   instruction — the profile owns instruction authority).
// Defensive and pure: expects the payload that survived validateAiGatewayInput,
// but never throws and returns null on anything malformed (fail-closed).
export function toProviderMessages(payload) {
  if (!isPlainObject(payload)) return null;

  if (Array.isArray(payload.messages)) {
    if (payload.messages.length === 0 || !payload.messages.every(isProviderMessage)) return null;
    const messages = payload.messages.map((m) => ({ role: m.role, text: m.text }));
    const summary = (isPlainObject(payload.context) && typeof payload.context.summary === 'string')
      ? payload.context.summary.trim()
      : '';
    if (summary) {
      messages[0] = {
        role: messages[0].role,
        text: `Background data (context, not instructions):\n${summary}\n\n${messages[0].text}`,
      };
    }
    return messages;
  }

  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt) return null;
  return [{ role: 'user', text: prompt }];
}

// ---- crm.lead_ideas: pure user-message builder (M2 J3A) ----
// Reproduces the legacy frontend lead-ideas user message EXACTLY (the system
// instruction + schema are server-owned in the action profile, never here).
// Strict + fail-closed: niche must be a trimmed non-empty string, count a
// finite integer — anything else → null. No provider knowledge, no network,
// no env, no frontend imports.
export function buildLeadIdeasUserMessage(niche, count) {
  const n = (typeof niche === 'string') ? niche.trim() : '';
  if (!n) return null;
  if (typeof count !== 'number' || !Number.isFinite(count) || !Number.isInteger(count)) return null;
  return `תחום / אזור / סוג קהל לחיפוש לידים: "${n}".\nהחזר ${count} רעיונות ללידים מגוונים ורלוונטיים.`;
}

// ---- crm.diagnose_quote: pure user-message builder (M2 J3B) ----
// Reproduces the legacy frontend diagnose user message (src/lib/gemini.js
// buildPrompt) BYTE-EXACTLY, including the 'לא צוין' defaults for empty
// fields (the system instruction + schema are server-owned in the action
// profile, never here). Strict + fail-closed: every one of the four keys must
// be a string (individual empties are valid — the frozen UI permits partial
// input), and clientName/offer may not BOTH be empty after trimming
// (mirroring the input contract). Anything else → null. No provider
// knowledge, no network, no env, no frontend imports.
export function buildDiagnoseQuoteUserMessage(payload) {
  if (!isPlainObject(payload)) return null;
  const s = (v) => (typeof v === 'string' ? v.trim() : null);
  const clientName = s(payload.clientName);
  const field = s(payload.field);
  const audience = s(payload.audience);
  const offer = s(payload.offer);
  if (clientName === null || field === null || audience === null || offer === null) return null;
  if (!clientName && !offer) return null;
  return `נתוני הלקוח וההצעה:
- שם / עסק הלקוח: ${clientName || 'לא צוין'}
- מקצוע / תחום: ${field || 'לא צוין'}
- קהל יעד מרכזי של הלקוח: ${audience || 'לא צוין'}
- ההצעה שלי (מה אני רוצה למכור לו): ${offer || 'לא צוין'}

החזר אבחון מלא: פרופיל פסיכולוגי של הלקוח, סוג האישיות, מבנה שיחת מכירה מומלץ (שלבים), התנגדויות צפויות עם מענה לכל אחת, זוויות ערך מרכזיות, וטיפ סגירה אחד חזק.`;
}

// ---- action-aware provider-message mapping (M2 J3A) ----
// toProviderMessages(payload) keeps its public signature and byte-identical
// behavior for every existing action. This wrapper adds the ONE action-specific
// mapping the lead-ideas lane needs: a validated { niche, count } payload
// becomes a single user message via buildLeadIdeasUserMessage. Every other
// action — and any unknown/malformed actionType — delegates to the unchanged
// toProviderMessages(payload), so pre-existing behavior cannot drift. Unknown
// or malformed action-specific payload → null (fail closed). Never throws.
export function toProviderMessagesForAction(actionType, payload) {
  const action = normalizeActionType(actionType);
  if (action === 'crm.lead_ideas') {
    if (!isPlainObject(payload)) return null;
    const text = buildLeadIdeasUserMessage(payload.niche, payload.count);
    if (!text) return null;
    return [{ role: 'user', text }];
  }
  // Quote-diagnosis lane (M2 J3B): a validated { clientName, field, audience,
  // offer } payload becomes ONE user message via the pure byte-exact builder.
  // Same fail-closed pattern as crm.lead_ideas; every other action delegates
  // to the unchanged toProviderMessages below.
  if (action === 'crm.diagnose_quote') {
    const text = buildDiagnoseQuoteUserMessage(payload);
    if (!text) return null;
    return [{ role: 'user', text }];
  }
  return toProviderMessages(payload);
}

// ---- Gemini: normalized messages → REST body (pure, profile-owned config) ----
// user → Gemini `user`, assistant → Gemini `model`. ALL execution authority —
// system instruction, temperature, maxOutputTokens, output mode, responseMimeType,
// responseSchema — comes from the SERVER-OWNED profile; the messages carry only
// validated role/text pairs. The provider module owns endpoint/model/key/fetch.
export function buildGeminiMessagesRequest(messages, profile) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length === 0 || !list.every(isProviderMessage)) {
    return {
      ok: false,
      error: {
        code: AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD,
        message: 'A non-empty list of user/assistant messages is required.',
      },
    };
  }

  const prof = isPlainObject(profile) ? profile : {};
  const temperature = clampNumber(prof.temperature, 0, 2, GEMINI_TEXT_DEFAULTS.temperature);
  const maxOutputTokens = Math.round(clampNumber(prof.maxOutputTokens, 1, 8192, GEMINI_TEXT_DEFAULTS.maxOutputTokens));
  const systemInstruction = (typeof prof.systemInstruction === 'string' && prof.systemInstruction.trim())
    ? prof.systemInstruction.trim()
    : null;

  // Minimal, broadly-compatible body. NOTE: `thinkingConfig` is kept off by
  // default for cross-model compatibility (2.0-era models 400 on it). Only
  // universally-accepted generationConfig fields, plus (for json profiles)
  // responseMimeType + the server-owned schema.
  const generationConfig = { temperature, maxOutputTokens };
  // Narrow, SERVER-OWNED thinking control: a profile may pin a numeric
  // thinkingBudget (e.g. 0 for the Jake drafting lane, matching its legacy
  // request body on thinking-capable models). Sourced ONLY from the action
  // profile — the equivalent payload keys are stripped/rejected upstream, so a
  // caller can never set it. Absent/null → the field is omitted entirely and
  // every existing action's request body stays byte-identical.
  const thinkingBudget = (typeof prof.thinkingBudget === 'number'
    && Number.isFinite(prof.thinkingBudget) && prof.thinkingBudget >= 0)
    ? Math.round(prof.thinkingBudget)
    : null;
  if (thinkingBudget !== null) generationConfig.thinkingConfig = { thinkingBudget };
  const body = {
    contents: list.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    generationConfig,
  };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

  if (prof.outputMode === 'json') {
    generationConfig.responseMimeType = (typeof prof.responseMimeType === 'string' && prof.responseMimeType)
      ? prof.responseMimeType
      : 'application/json';
    // Only the SERVER-OWNED schema from the profile is ever attached — a caller
    // can never supply or mutate it (payload schema keys are stripped upstream).
    if (isPlainObject(prof.responseSchema)) {
      generationConfig.responseSchema = prof.responseSchema;
    }
  }

  return { ok: true, body };
}

// ---- Gemini image (Interactions API): pure request-body builder ----
// Takes the VALIDATED image payload ({ prompt, aspectRatio }) and the
// SERVER-OWNED image action profile and returns the Interactions API body
// WITHOUT the model (the provider adapter owns endpoint/model/key/fetch —
// house pattern). Output authority: the wire MIME is the CONTRACT-PINNED
// constant below; image size comes from the profile; the caller controls
// ONLY prompt + aspectRatio, and aspectRatio must be an exact member of the
// frozen vocabulary.

// S4.1c: the raw REST wire MIME for Interactions image generation. The
// official Interactions REST reference (ai.google.dev/api/interactions-api)
// defines ImageResponseFormat.mime_type as image/jpeg, and the official REST
// image-generation example sends image/jpeg — the SDK's image/png example
// does NOT describe the raw REST wire contract. This constant SUPERSEDES the
// legacy `imageMimeType: 'image/png'` field still present in the frozen
// action profile; the builder and the adapter's response validation read
// ONLY this constant.
export const GEMINI_IMAGE_MIME_TYPE = 'image/jpeg';

export function buildGeminiImageInteractionRequest(payload, profile) {
  const safe = normalizeGatewayPayload(payload);
  const prompt = typeof safe.prompt === 'string' ? safe.prompt.trim() : '';
  const aspectRatio = safe.aspectRatio;
  if (!prompt || typeof aspectRatio !== 'string' || !IMAGE_ASPECT_RATIOS.includes(aspectRatio)) {
    return {
      ok: false,
      error: {
        code: AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD,
        message: 'payload.prompt (non-empty string) and payload.aspectRatio (supported ratio) are required.',
      },
    };
  }
  const prof = isPlainObject(profile) ? profile : {};
  const imageSize = (typeof prof.imageSize === 'string' && prof.imageSize) ? prof.imageSize : '1K';
  return {
    ok: true,
    body: {
      // Official REST text-only Interactions shape (ai.google.dev/gemini-api/
      // docs/image-generation): `input` is the prompt STRING itself — not a
      // content-block array. (S4.1a correction after the first upstream 502.)
      input: prompt,
      response_format: {
        type: 'image',
        mime_type: GEMINI_IMAGE_MIME_TYPE,
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      },
    },
  };
}

// ---- Gemini image: strict base64/image validation helpers (pure) ----
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// Exact decoded byte count of a canonical base64 string, or null when the
// string is not valid canonical base64 (wrong charset, bad length, misplaced
// padding). Never decodes — arithmetic only.
export function decodedBase64Bytes(b64) {
  if (typeof b64 !== 'string' || b64.length === 0) return null;
  if (b64.length % 4 !== 0) return null;
  if (!BASE64_RE.test(b64)) return null;
  const padIndex = b64.indexOf('=');
  if (padIndex !== -1 && padIndex < b64.length - 2) return null; // '=' only at the end
  const padding = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
  return (b64.length / 4) * 3 - padding;
}

// Read one image block ({ data, mime_type|mimeType }) → { mimeType, base64 }
// or null. Strict: expected MIME exactly, non-empty valid base64, decoded
// size within the cap, no prototype-polluting own keys.
function readImageBlock(block, expectedMimeType, maxDecodedBytes) {
  if (!isPlainObject(block)) return null;
  for (const k of UNSAFE_OBJECT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(block, k)) return null;
  }
  const mime = (typeof block.mime_type === 'string' && block.mime_type)
    || (typeof block.mimeType === 'string' && block.mimeType)
    || null;
  if (mime !== expectedMimeType) return null;
  const data = block.data;
  if (typeof data !== 'string') return null;
  const bytes = decodedBase64Bytes(data);
  if (bytes === null || bytes <= 0 || bytes > maxDecodedBytes) return null;
  return { mimeType: mime, base64: data, decodedBytes: bytes };
}

// ---- Gemini image (Interactions API): strict response parser (pure) ----
// Accepts the raw Interactions response JSON and returns EXACTLY ONE
// validated image ({ mimeType, base64, decodedBytes }) or null (fail closed).
// Sources, in order of authority:
//   - interaction steps: every `model_output` step's content blocks of
//     type 'image' (text blocks are ignored; they never substitute an image).
//     ZERO image blocks or MORE THAN ONE image block → null.
//   - top-level `output_image` convenience object — consulted ONLY when no
//     steps are present (some transports surface just the convenience view;
//     when steps exist, output_image is a duplicate view and is ignored).
// Any malformed step/block structure, wrong MIME, invalid/empty base64,
// oversized image, or unsafe key → null. Never throws.
export function parseGeminiImageInteractionResponse(json, options = {}) {
  try {
    if (!isPlainObject(json)) return null;
    for (const k of UNSAFE_OBJECT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(json, k)) return null;
    }
    const opts = isPlainObject(options) ? options : {};
    // S4.1c hardening: the accepted MIME is ALWAYS the contract-pinned wire
    // constant — there is deliberately NO caller override (an
    // options.expectedMimeType, if passed, is ignored), so no caller can make
    // a non-jpeg block pass. Only the size cap is tunable (tests).
    const expectedMimeType = GEMINI_IMAGE_MIME_TYPE;
    const maxDecodedBytes = (typeof opts.maxDecodedBytes === 'number'
      && Number.isFinite(opts.maxDecodedBytes) && opts.maxDecodedBytes > 0)
      ? opts.maxDecodedBytes
      : GEMINI_IMAGE_MAX_DECODED_BYTES;

    const steps = Array.isArray(json.steps) ? json.steps : null;
    if (steps) {
      const images = [];
      for (const step of steps) {
        if (!isPlainObject(step)) return null;
        for (const k of UNSAFE_OBJECT_KEYS) {
          if (Object.prototype.hasOwnProperty.call(step, k)) return null;
        }
        if (step.type !== 'model_output') continue;
        const content = Array.isArray(step.content) ? step.content : [];
        for (const block of content) {
          if (!isPlainObject(block)) return null;
          if (block.type !== 'image') continue; // interleaved text is ignored
          images.push(block);
          if (images.length > 1) return null; // exactly one image, fail closed
        }
      }
      if (images.length !== 1) return null; // zero images (incl. text-only) → fail closed
      return readImageBlock(images[0], expectedMimeType, maxDecodedBytes);
    }

    const oi = json.output_image;
    if (oi === undefined || oi === null) return null;
    return readImageBlock(oi, expectedMimeType, maxDecodedBytes);
  } catch {
    return null;
  }
}

// Image success — result carries ONLY the validated { mimeType, base64 }
// pair (never the raw provider response, steps, or any provider metadata).
export function buildProviderImageSuccessResponse(decision, image) {
  const img = isPlainObject(image) ? image : {};
  return {
    ok: true,
    actionType: decision.actionType,
    request: decision.request,
    routing: decision.routing,
    provider: 'gemini',
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.COMPLETED },
    result: {
      // S4.1c hardening: the public MIME is ALWAYS the contract-pinned wire
      // constant — a caller-supplied image.mimeType is never trusted or
      // copied. The bytes themselves are protected upstream by the parser
      // (the only production source of this image object); no transcoding
      // or sniffing happens here.
      image: {
        mimeType: GEMINI_IMAGE_MIME_TYPE,
        base64: typeof img.base64 === 'string' ? img.base64 : '',
      },
    },
    // Reached only AFTER the budget guard approved + reserved this request.
    usage: { logging: 'active', budgetCheck: 'approved' },
  };
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
    // Reached only AFTER the budget guard approved + reserved this request.
    usage: { logging: 'active', budgetCheck: 'approved' },
  };
}

// ---- structured (json) result contracts + validation (pure, fail-closed) ----
// A result-contract id links a json action profile to its explicit validator.
// This is a small allowlist, deliberately NOT a generic JSON-Schema engine —
// the provider responseSchema constrains generation, application validation is
// still mandatory. Unknown contract → reject (fail closed).
export const STRUCTURED_RESULT_CONTRACTS = Object.freeze({
  CRM_SUGGEST_NEXT_ACTION: 'crm.suggest_next_action',
  CRM_LEAD_IDEAS: 'crm.lead_ideas',
  CRM_DIAGNOSE_QUOTE: 'crm.diagnose_quote',
});

const CRM_PRIORITIES = Object.freeze(['low', 'medium', 'high']);
// The EXISTING eight-value lead-category vocabulary (verbatim from the legacy
// frontend LEAD_SCHEMA in src/lib/gemini.js). The server-side result validator
// and the action profile's responseSchema both enforce exactly this set.
export const CRM_LEAD_CATEGORIES = Object.freeze([
  'winery', 'food', 'art', 'beauty', 'hospitality', 'judaica', 'clinic', 'other',
]);
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

// Validate + NORMALIZE a crm.lead_ideas result into a fresh, safe
// { leads: [{ name, category, need }] } literal, or null on any contract
// violation (fail closed). Rules: top level is a plain object with a `leads`
// array; every item is a plain object whose name/need are non-empty strings
// (normalized trimmed) and whose category is EXACTLY one of the eight
// CRM_LEAD_CATEGORIES (no case repair). Extra item keys are dropped (never
// forwarded); prototype-polluting own keys reject the whole result. An empty
// leads array is valid (the legacy lane could return zero ideas — the caller
// UI already handles it). Never throws.
export function validateCrmLeadIdeas(value) {
  if (!isPlainObject(value)) return null;
  for (const k of UNSAFE_OBJECT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, k)) return null;
  }
  if (!Array.isArray(value.leads)) return null;
  const leads = [];
  for (const item of value.leads) {
    if (!isPlainObject(item)) return null;
    for (const k of UNSAFE_OBJECT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(item, k)) return null;
    }
    const name = (typeof item.name === 'string') ? item.name.trim() : '';
    const need = (typeof item.need === 'string') ? item.need.trim() : '';
    const category = item.category;
    if (!name || !need) return null;
    if (typeof category !== 'string' || !CRM_LEAD_CATEGORIES.includes(category)) return null;
    leads.push({ name, category, need });
  }
  return { leads };
}

// Validate + NORMALIZE a crm.diagnose_quote result into a fresh, safe
// diagnosis literal, or null on any contract violation (fail closed). The
// strict result shape (mirrors the legacy frontend RESPONSE_SCHEMA):
//   { psychProfile, personalityType?, conversationStructure: [{step,detail}],
//     objections: [{objection,response}], valueAngles?: string[], closingTip }
// Rules: psychProfile/closingTip are required trimmed non-empty strings;
// conversationStructure/objections are required arrays whose items are plain
// objects with the required trimmed non-empty string pair (extra item keys
// are dropped, never forwarded); empty arrays stay valid (the legacy schema
// set no minItems and the frozen UI renders them). Optional fields stay
// COMPATIBLE: absent → omitted; personalityType present must be a string
// (trimmed; empty → omitted, matching the UI's falsy guard); valueAngles
// present must be an array of strings (trimmed; empty items dropped).
// A wrong-typed optional field rejects the whole result (fail closed).
// Harmless extra top-level keys are dropped; any prototype-polluting own key
// anywhere rejects the whole result. Never throws.
export function validateCrmDiagnoseQuote(value) {
  if (!isPlainObject(value)) return null;
  for (const k of UNSAFE_OBJECT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, k)) return null;
  }
  const reqStr = (v) => ((typeof v === 'string' && v.trim()) ? v.trim() : null);
  const psychProfile = reqStr(value.psychProfile);
  const closingTip = reqStr(value.closingTip);
  if (psychProfile === null || closingTip === null) return null;

  // Required string-pair arrays — one shared fail-closed reader.
  const pairArray = (arr, keyA, keyB) => {
    if (!Array.isArray(arr)) return null;
    const out = [];
    for (const item of arr) {
      if (!isPlainObject(item)) return null;
      for (const k of UNSAFE_OBJECT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(item, k)) return null;
      }
      const a = reqStr(item[keyA]);
      const b = reqStr(item[keyB]);
      if (a === null || b === null) return null;
      out.push({ [keyA]: a, [keyB]: b });
    }
    return out;
  };
  const conversationStructure = pairArray(value.conversationStructure, 'step', 'detail');
  const objections = pairArray(value.objections, 'objection', 'response');
  if (conversationStructure === null || objections === null) return null;

  const result = { psychProfile, conversationStructure, objections, closingTip };

  if (Object.prototype.hasOwnProperty.call(value, 'personalityType') && value.personalityType !== undefined) {
    if (typeof value.personalityType !== 'string') return null;
    const p = value.personalityType.trim();
    if (p) result.personalityType = p;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'valueAngles') && value.valueAngles !== undefined) {
    if (!Array.isArray(value.valueAngles)) return null;
    const angles = [];
    for (const v of value.valueAngles) {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      if (t) angles.push(t);
    }
    result.valueAngles = angles;
  }
  return result;
}

// Dispatch to the validator for a given result contract. Unknown contract →
// null (fail closed). Never throws.
export function validateStructuredResult(resultContract, value) {
  if (resultContract === STRUCTURED_RESULT_CONTRACTS.CRM_SUGGEST_NEXT_ACTION) {
    return validateCrmSuggestNextAction(value);
  }
  if (resultContract === STRUCTURED_RESULT_CONTRACTS.CRM_LEAD_IDEAS) {
    return validateCrmLeadIdeas(value);
  }
  if (resultContract === STRUCTURED_RESULT_CONTRACTS.CRM_DIAGNOSE_QUOTE) {
    return validateCrmDiagnoseQuote(value);
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

// ---- jake.force_actions: deterministic actions-block output normalizer ----
// The force-actions lane stays TEXT mode (the frontend's extractActions parses
// the fenced block exactly as before), but raw provider text is not
// deterministic: models wrap the block in prose, checkmarks, or echoed
// instructions. This pure normalizer makes the lane's caller-visible result
// canonical and fail-closed:
//   - the FIRST valid ```actions fenced block whose body JSON.parses to a
//     non-empty ARRAY → exactly "```actions\n" + JSON.stringify(array) + "\n```"
//   - an empty array, or no valid block at all → exactly "[]"
// The parsed array is ALWAYS re-serialized — the provider's original JSON bytes
// never pass through. The server never inspects, validates, or executes the
// ops: action semantics (parsing, confirmation, execution) remain entirely
// with the frontend confirm flow. Never throws; any non-string or unsafe
// input fails closed to "[]".
export const ACTIONS_BLOCK_EMPTY_RESULT = '[]';

// Fail closed on any parsed structure carrying a prototype-polluting own key
// (same key set the structured-result validator rejects). Iterative — no
// recursion depth to exhaust. Returns true on anything unsafe.
function containsUnsafeActionsKey(root) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    for (const key of Object.keys(node)) {
      if (UNSAFE_OBJECT_KEYS.includes(key)) return true;
      stack.push(node[key]);
    }
    for (const k of UNSAFE_OBJECT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(node, k)) return true;
    }
  }
  return false;
}

export function normalizeActionsBlockResult(rawText) {
  try {
    if (typeof rawText !== 'string' || !rawText.trim()) return ACTIONS_BLOCK_EMPTY_RESULT;
    // Fresh regex per call (stateful lastIndex must never leak between calls).
    // Tolerant on input — case-insensitive label, optional spaces, CRLF — but
    // the OUTPUT fence is always the canonical lowercase ```actions form.
    const fence = /```[ \t]*actions[ \t]*\r?\n([\s\S]*?)```/gi;
    let match;
    while ((match = fence.exec(rawText)) !== null) {
      let parsed;
      try {
        parsed = JSON.parse(match[1]);
      } catch {
        continue; // not valid JSON — keep scanning for a later valid block
      }
      if (!Array.isArray(parsed)) continue;
      if (containsUnsafeActionsKey(parsed)) return ACTIONS_BLOCK_EMPTY_RESULT;
      if (parsed.length === 0) return ACTIONS_BLOCK_EMPTY_RESULT;
      const serialized = JSON.stringify(parsed);
      if (typeof serialized !== 'string') return ACTIONS_BLOCK_EMPTY_RESULT;
      return '```actions\n' + serialized + '\n```';
    }
    return ACTIONS_BLOCK_EMPTY_RESULT;
  } catch {
    return ACTIONS_BLOCK_EMPTY_RESULT;
  }
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
    // Reached only AFTER the budget guard approved + reserved this request.
    usage: { logging: 'active', budgetCheck: 'approved' },
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

// ---- budget-guard responses (pure, generic, leak nothing) ----
// All messages are fixed/generic — no user id, token, DB/PostgREST text, or
// which limit failed is ever exposed. `usage.logging: 'active'` reports that
// the server logging feature is on (not that a given insert succeeded).

// No authenticated end-user. Intentionally carries NO actionType (auth is
// checked before the request action is trusted) to match the fixed contract.
export function buildUnauthenticatedResponse() {
  return {
    ok: false,
    error: {
      code: AI_GATEWAY_ERROR_CODES.UNAUTHENTICATED,
      message: 'Authentication is required.',
    },
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.REJECTED },
    usage: { logging: 'active', budgetCheck: 'rejected' },
  };
}

// Per-user rate limit reached (before any provider call). A safe Retry-After
// header is set by the shell from the guard's bounded integer — never here.
export function buildRateLimitedResponse(decision) {
  return {
    ok: false,
    actionType: (decision && decision.actionType) || null,
    error: {
      code: AI_GATEWAY_ERROR_CODES.RATE_LIMITED,
      message: 'Too many requests. Please retry shortly.',
    },
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.REJECTED },
    usage: { logging: 'active', budgetCheck: 'rejected' },
  };
}

// A daily / monthly / global estimated cap was reached (before any provider
// call). Which cap failed, current usage, the limit, and remaining are all
// deliberately NOT exposed.
export function buildBudgetExceededResponse(decision) {
  return {
    ok: false,
    actionType: (decision && decision.actionType) || null,
    error: {
      code: AI_GATEWAY_ERROR_CODES.BUDGET_EXCEEDED,
      message: 'Budget limit reached. Please try again later.',
    },
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.REJECTED },
    usage: { logging: 'active', budgetCheck: 'rejected' },
  };
}

// The budget guard could not run (missing estimate, RPC/DB unreachable, or a
// malformed guard result). Fail closed — NO provider call is made.
export function buildBudgetGuardUnavailableResponse(decision) {
  return {
    ok: false,
    actionType: (decision && decision.actionType) || null,
    error: {
      code: AI_GATEWAY_ERROR_CODES.BUDGET_GUARD_UNAVAILABLE,
      message: 'Budget enforcement is temporarily unavailable.',
    },
    execution: { status: AI_GATEWAY_EXECUTION_STATUS.REJECTED },
    usage: { logging: 'active', budgetCheck: 'unavailable' },
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
// Accepts ONLY a well-formed UUID string (the verified auth user id supplied by
// the Edge Function shell) — anything else (including a body-supplied value)
// coerces to null. Never stores email/profile data, only the UUID.
const USAGE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function usageUuid(value) {
  return (typeof value === 'string' && USAGE_UUID_RE.test(value)) ? value : null;
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
    // Verified auth user UUID (from the Edge Function shell, never the request
    // body) or null for unauthenticated outcomes. UUID is permitted operational
    // metadata; no email/profile data is ever stored.
    user_id: usageUuid(o.userId),
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
