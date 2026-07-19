// ===================================================================
// AI Provider Core — M2 Slice 1: pure, provider-neutral adapter contracts.
//
// This module defines the CONTRACTS a future provider-adapter layer will
// satisfy: the normalized result shape an adapter returns, the shape an
// adapter object must have, the capability vocabulary an adapter declares,
// and the safe mapping from adapter error codes to the gateway's frozen
// AI_GATEWAY_ERROR_CODES + HTTP statuses. It is a VOCABULARY + VALIDATOR
// layer only — it never registers an adapter, never selects one, never
// invokes one, and changes no existing request/response behavior.
//
// Purity (same house pattern as aiGateway.js / aiGatewayContract.js):
// imports ONLY the pure shared modules; no runtime/edge globals, no
// network, no env, no DB client, no timestamps/ids/randomness; never
// throws on hostile input;
// never mutates caller input; all vocabularies frozen. It is a LEAF of the
// pure module graph — nothing existing imports it (M2 Slice 1 ships the
// contract only; wiring is a later slice).
//
// All error messages here are FIXED, provider-neutral literals — no
// provider name, upstream text, key, or caller content ever flows into
// a message produced by this module.
// ===================================================================

import { normalizeProvider } from './aiGateway.js';
import { AI_GATEWAY_ERROR_CODES } from './aiGatewayContract.js';

// ---- helpers (module-private; never throw, never invoke caller getters) ----
function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const DANGEROUS_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);
function hasDangerousOwnKey(obj) {
  for (const k of DANGEROUS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
  }
  return false;
}

// Read an own DATA property without ever invoking an accessor (getter).
// Returns { present, value } — present=false for absent OR accessor props,
// so a throwing getter can never reach validation logic.
function readData(obj, key) {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  if (!d || !('value' in d)) return { present: false, value: undefined };
  return { present: true, value: d.value };
}

// ---- frozen result-kind vocabulary ----
// The ONLY success shapes a provider adapter may produce. `text` carries a
// plain completion; `json` carries a validated structured object (validation
// against a result contract stays the gateway's job — see aiGatewayContract).
export const PROVIDER_RESULT_KINDS = Object.freeze(['text', 'json']);

// ---- frozen capability vocabulary ----
// What an adapter can DECLARE it serves. Deliberately limited to what the
// gateway actually does today (text completions, structured json output,
// multi-turn message input). New capabilities arrive with the slice that
// implements them — never speculatively.
export const PROVIDER_CAPABILITIES = Object.freeze(['text', 'json', 'multi_turn']);

// ---- frozen adapter-error vocabulary (subset of AI_GATEWAY_ERROR_CODES) ----
// The ONLY error codes an adapter may emit. Derived from the existing frozen
// gateway vocabulary so the two can never drift; anything outside this subset
// fail-closes to PROVIDER_ERROR at the mapping boundary below.
export const PROVIDER_ADAPTER_ERROR_CODES = Object.freeze([
  AI_GATEWAY_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
  AI_GATEWAY_ERROR_CODES.PROVIDER_ERROR,
  AI_GATEWAY_ERROR_CODES.INVALID_PROVIDER_RESPONSE,
  AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD,
]);

// ---- safe provider-error mapping (adapter code → gateway code + HTTP) ----
// Messages are FIXED and provider-neutral: upstream provider text is never
// forwarded, so no key or raw payload can leak through this table. Statuses
// mirror the live gateway behavior (503 not-configured, 502 upstream/invalid
// response, 400 invalid payload).
const PROVIDER_ERROR_MAP = Object.freeze({
  [AI_GATEWAY_ERROR_CODES.PROVIDER_NOT_CONFIGURED]: Object.freeze({
    code: AI_GATEWAY_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
    httpStatus: 503,
    message: 'Provider is not configured.',
  }),
  [AI_GATEWAY_ERROR_CODES.PROVIDER_ERROR]: Object.freeze({
    code: AI_GATEWAY_ERROR_CODES.PROVIDER_ERROR,
    httpStatus: 502,
    message: 'Provider request failed.',
  }),
  [AI_GATEWAY_ERROR_CODES.INVALID_PROVIDER_RESPONSE]: Object.freeze({
    code: AI_GATEWAY_ERROR_CODES.INVALID_PROVIDER_RESPONSE,
    httpStatus: 502,
    message: 'Provider returned an invalid response.',
  }),
  [AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD]: Object.freeze({
    code: AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD,
    httpStatus: 400,
    message: 'Invalid payload.',
  }),
});

// Map any (possibly hostile) adapter error code to a safe gateway error
// descriptor { code, httpStatus, message }. Unknown / non-string / smuggled
// codes fail CLOSED to the generic PROVIDER_ERROR entry — a caller can never
// mint a new public error code or message through this function. Always
// returns a fresh object; never throws.
export function mapProviderError(code) {
  const entry = (typeof code === 'string'
    && Object.prototype.hasOwnProperty.call(PROVIDER_ERROR_MAP, code))
    ? PROVIDER_ERROR_MAP[code]
    : PROVIDER_ERROR_MAP[AI_GATEWAY_ERROR_CODES.PROVIDER_ERROR];
  return { code: entry.code, httpStatus: entry.httpStatus, message: entry.message };
}

// ---- normalized adapter-result builders (pure, fail-closed, fresh objects) ----
// A normalized provider-adapter result is EXACTLY one of:
//   { ok: true,  kind: 'text', text: string,       resultChars: number }
//   { ok: true,  kind: 'json', json: plain object, resultChars: number|null }
//   { ok: false, error: { code, httpStatus, message } }   (code ∈ adapter subset)
// resultChars counts the RAW provider text (the completion, or the raw JSON
// string BEFORE parsing) — content-free, mirroring providerResultChars in the
// contract layer. Builders never throw; malformed input fail-closes to an
// invalid_provider_response ERROR result, never a half-valid success.

export function buildProviderTextResult(rawText) {
  if (typeof rawText !== 'string' || rawText.length === 0) {
    return buildProviderErrorResult(AI_GATEWAY_ERROR_CODES.INVALID_PROVIDER_RESPONSE);
  }
  return { ok: true, kind: 'text', text: rawText, resultChars: rawText.length };
}

// `json` must already be a validated, safe plain object (the gateway's
// structured-result validator produces it); rawText is the raw provider
// string it was parsed from, used ONLY for the content-free char count.
export function buildProviderJsonResult(json, rawText) {
  if (!isPlainObject(json) || hasDangerousOwnKey(json)) {
    return buildProviderErrorResult(AI_GATEWAY_ERROR_CODES.INVALID_PROVIDER_RESPONSE);
  }
  const resultChars = (typeof rawText === 'string') ? rawText.length : null;
  return { ok: true, kind: 'json', json, resultChars };
}

export function buildProviderErrorResult(code) {
  return { ok: false, error: mapProviderError(code) };
}

// ---- adapter-result shape validation (strict, never throws) ----
// Validates an UNTRUSTED value against the normalized result contract above
// and returns a FRESH normalized copy, or null on any violation (extra keys,
// wrong types, unknown kind/code, accessor properties, dangerous keys).
// Exact-key discipline: a result carries nothing but its contract fields.
export function validateProviderResult(value) {
  if (!isPlainObject(value) || hasDangerousOwnKey(value)) return null;

  const ok = readData(value, 'ok');
  if (!ok.present || typeof ok.value !== 'boolean') return null;
  const names = Object.getOwnPropertyNames(value);

  if (ok.value === false) {
    for (const k of names) {
      if (k !== 'ok' && k !== 'error') return null;
    }
    const err = readData(value, 'error');
    if (!err.present || !isPlainObject(err.value) || hasDangerousOwnKey(err.value)) return null;
    for (const k of Object.getOwnPropertyNames(err.value)) {
      if (k !== 'code' && k !== 'httpStatus' && k !== 'message') return null;
    }
    const code = readData(err.value, 'code');
    if (!code.present || !PROVIDER_ADAPTER_ERROR_CODES.includes(code.value)) return null;
    // Re-derive httpStatus/message from the safe table: a caller-supplied
    // message can NEVER survive validation, so nothing can leak through it.
    return { ok: false, error: mapProviderError(code.value) };
  }

  const kind = readData(value, 'kind');
  if (!kind.present || !PROVIDER_RESULT_KINDS.includes(kind.value)) return null;

  if (kind.value === 'text') {
    for (const k of names) {
      if (k !== 'ok' && k !== 'kind' && k !== 'text' && k !== 'resultChars') return null;
    }
    const text = readData(value, 'text');
    if (!text.present || typeof text.value !== 'string' || text.value.length === 0) return null;
    const chars = readData(value, 'resultChars');
    if (!chars.present || chars.value !== text.value.length) return null;
    return { ok: true, kind: 'text', text: text.value, resultChars: text.value.length };
  }

  // kind === 'json'
  for (const k of names) {
    if (k !== 'ok' && k !== 'kind' && k !== 'json' && k !== 'resultChars') return null;
  }
  const json = readData(value, 'json');
  if (!json.present || !isPlainObject(json.value) || hasDangerousOwnKey(json.value)) return null;
  const chars = readData(value, 'resultChars');
  const charsOk = chars.present && (chars.value === null
    || (typeof chars.value === 'number' && Number.isInteger(chars.value) && chars.value >= 0));
  if (!charsOk) return null;
  return { ok: true, kind: 'json', json: json.value, resultChars: chars.value };
}

export function isProviderResult(value) {
  return validateProviderResult(value) !== null;
}

// ---- provider capability declarations (pure, frozen output) ----
// A capability declaration is what a future adapter registers itself with:
//   { provider: <AI_PROVIDERS member>, capabilities: [<PROVIDER_CAPABILITIES>...] }
// Declaring is DESCRIPTIVE only — this module never routes on it, and an
// unknown provider or capability rejects the whole declaration (fail closed,
// no silent filtering). Returns a deeply frozen fresh object, or null.
export function declareProviderCapabilities(provider, capabilities) {
  const prov = normalizeProvider(provider);
  if (!prov) return null;
  if (!Array.isArray(capabilities) || capabilities.length === 0) return null;
  const seen = new Set();
  for (const cap of capabilities) {
    if (typeof cap !== 'string' || !PROVIDER_CAPABILITIES.includes(cap)) return null;
    seen.add(cap);
  }
  // Canonical order = vocabulary order, so equal declarations are deep-equal
  // regardless of the order the caller listed them in.
  const caps = PROVIDER_CAPABILITIES.filter((c) => seen.has(c));
  return Object.freeze({ provider: prov, capabilities: Object.freeze(caps) });
}

// True only for a declaration produced by (or equal in shape to) the builder
// above that includes the given capability. Never throws.
export function providerDeclaresCapability(declaration, capability) {
  if (!isPlainObject(declaration) || hasDangerousOwnKey(declaration)) return false;
  if (typeof capability !== 'string' || !PROVIDER_CAPABILITIES.includes(capability)) return false;
  const prov = readData(declaration, 'provider');
  if (!prov.present || normalizeProvider(prov.value) !== prov.value) return false;
  const caps = readData(declaration, 'capabilities');
  if (!caps.present || !Array.isArray(caps.value)) return false;
  return caps.value.includes(capability);
}

// ---- adapter-shape validation (structural only — NEVER invokes anything) ----
// The shape a future provider adapter must satisfy:
//   {
//     provider:     <AI_PROVIDERS member>,
//     capabilities: [<PROVIDER_CAPABILITIES>...],   (non-empty, all known)
//     isConfigured: function,   // checked by typeof ONLY — never called
//     run:          function,   // checked by typeof ONLY — never called
//   }
// Extra keys reject (an adapter carries nothing the contract doesn't name).
// Returns { ok: true, provider, capabilities } (frozen declaration) or
// { ok: false, reason } with a fixed content-free slug. Never throws; never
// executes or registers the adapter.
export function validateProviderAdapterShape(adapter) {
  if (!isPlainObject(adapter)) return { ok: false, reason: 'adapter_not_object' };
  if (hasDangerousOwnKey(adapter)) return { ok: false, reason: 'dangerous_key' };

  const ALLOWED = ['provider', 'capabilities', 'isConfigured', 'run'];
  for (const k of Object.getOwnPropertyNames(adapter)) {
    if (!ALLOWED.includes(k)) return { ok: false, reason: 'unknown_field' };
  }

  const prov = readData(adapter, 'provider');
  if (!prov.present) return { ok: false, reason: 'missing_provider' };
  const provider = normalizeProvider(prov.value);
  // Strict: the adapter must carry the CANONICAL provider id, not a variant
  // that merely normalizes to one.
  if (!provider || provider !== prov.value) return { ok: false, reason: 'unknown_provider' };

  const caps = readData(adapter, 'capabilities');
  if (!caps.present) return { ok: false, reason: 'missing_capabilities' };
  const declaration = declareProviderCapabilities(provider, caps.value);
  if (!declaration) return { ok: false, reason: 'invalid_capabilities' };

  const isConfigured = readData(adapter, 'isConfigured');
  if (!isConfigured.present || typeof isConfigured.value !== 'function') {
    return { ok: false, reason: 'missing_is_configured' };
  }
  const run = readData(adapter, 'run');
  if (!run.present || typeof run.value !== 'function') {
    return { ok: false, reason: 'missing_run' };
  }

  return { ok: true, provider: declaration.provider, capabilities: declaration.capabilities };
}

export function isProviderAdapterShape(adapter) {
  return validateProviderAdapterShape(adapter).ok === true;
}
