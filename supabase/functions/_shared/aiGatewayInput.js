// ===================================================================
// AI Gateway — strict per-action INPUT contract (pure, shared).
//
// Slice C1 of Gateway V2: the untrusted-payload validation + normalization
// layer that runs at the boundary BEFORE budget reservation and provider
// execution. It answers one question per actionType: "is this payload a
// valid, safe input for this action, and what is its content-free size?"
//
// This slice covers the CURRENT prompt-only executable actions only
// (text.copy, text.crm_message, studio.prompt_enhance, crm.suggest_next_action),
// each of which accepts EXACTLY { prompt: string }. Multi-turn / context
// payloads (jake.*) are a FUTURE extension (C2): this module deliberately ships
// the strict scalar foundation plus the structural-safety scanner those fields
// will reuse, but adds NO multi-turn field here.
//
// Purity (same house pattern as aiGateway.js / aiGatewayContract.js): imports
// ONLY the pure router; no browser/network/storage/time/random/crypto/env/
// provider access; never throws on hostile input; deterministic; no timestamps
// or ids; NEVER mutates caller input. It is a LEAF of the pure module graph —
// the contract layer imports THIS module, so it must never import back.
// ===================================================================

import { normalizeActionType } from './aiGateway.js';

// Error code mirrors AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD in the contract
// layer. Kept as a local literal (not imported) to avoid an import cycle: the
// contract re-exports this module, so importing the contract here would loop.
const INVALID_PAYLOAD = 'invalid_payload';

// ---- strict limits (frozen) ----
export const AI_GATEWAY_INPUT_LIMITS = Object.freeze({
  // Maximum accepted prompt length, measured on the TRIMMED content. There is no
  // prior hard cap anywhere in the gateway; 20_000 is the explicit new bound.
  // Over-limit input FAILS deterministically — it is never silently truncated.
  MAX_PROMPT_CHARS: 20000,
  // Multi-turn (C2) bounds — all measured on TRIMMED content; over-limit input
  // FAILS deterministically, never truncated.
  MAX_MESSAGES: 20,
  MAX_MESSAGE_CHARS: 4000,
  MAX_COMBINED_MESSAGE_CHARS: 30000,
  MAX_CONTEXT_CHARS: 12000,
  // Defensive structural bounds applied to the WHOLE payload by the safe scanner.
  MAX_OBJECT_KEYS: 32,
  MAX_ARRAY_ITEMS: 64,
  MAX_DEPTH: 6,
});

// ---- helpers (module-private; never throw, never invoke caller getters) ----
function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// Own keys that could pollute a prototype if ever assigned/merged. Rejected at
// every object level, whether enumerable or not.
const DANGEROUS_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);
function hasDangerousOwnKey(obj) {
  for (const k of DANGEROUS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
  }
  return false;
}

function fail(reason) {
  return { ok: false, error: { code: INVALID_PAYLOAD, reason } };
}

// Structural safety scan: walks own DATA properties of plain objects/arrays with
// a depth bound + cycle guard, NEVER invoking accessors (getters). Returns null
// when the value graph is safe to inspect, or a fixed, content-free reason slug.
// This is the guard that lets the field checks below read values without risk of
// a throwing getter, a cycle, or unbounded recursion.
function scanStructure(value, depth, seen) {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return null;
  if (t !== 'object') return 'unsupported_value'; // bigint / function / symbol
  if (depth > AI_GATEWAY_INPUT_LIMITS.MAX_DEPTH) return 'too_deep';
  if (seen.has(value)) return 'cyclic';
  seen.add(value);

  if (Array.isArray(value)) {
    if (value.length > AI_GATEWAY_INPUT_LIMITS.MAX_ARRAY_ITEMS) return 'array_too_large';
    for (let i = 0; i < value.length; i += 1) {
      const d = Object.getOwnPropertyDescriptor(value, i);
      if (d && !('value' in d)) return 'accessor_property';
      const r = scanStructure(d ? d.value : undefined, depth + 1, seen);
      if (r) return r;
    }
    return null;
  }

  if (!isPlainObject(value)) return 'non_plain_value'; // Date/Map/Set/class instance
  if (Object.getOwnPropertySymbols(value).length > 0) return 'symbol_key';
  if (hasDangerousOwnKey(value)) return 'dangerous_key';
  // ALL own string keys — enumerable AND non-enumerable — so a hidden field,
  // dangerous key, or accessor can never slip past by being non-enumerable.
  const names = Object.getOwnPropertyNames(value);
  if (names.length > AI_GATEWAY_INPUT_LIMITS.MAX_OBJECT_KEYS) return 'too_many_keys';
  for (const k of names) {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d || !('value' in d)) return 'accessor_property'; // getter/setter — never invoked
    const r = scanStructure(d.value, depth + 1, seen);
    if (r) return r;
  }
  return null;
}

// ---- per-action input profiles (deeply frozen) ----
// Field spec: { type:'string', required, trim, maxChars }. One shared prompt-only
// profile backs every current executable action. New actions (jake.*) extend the
// registry in a future slice; they do NOT belong here yet.
const PROMPT_FIELD = Object.freeze({
  type: 'string', required: true, trim: true, maxChars: AI_GATEWAY_INPUT_LIMITS.MAX_PROMPT_CHARS,
});

function promptOnlyProfile() {
  return { kind: 'prompt', allowedKeys: ['prompt'], fields: { prompt: PROMPT_FIELD } };
}

// Multi-turn profile (C2): { messages: [{role,text}...], context?: { summary } }.
// The message/context rules live in validateMultiTurnPayload — a dedicated
// deterministic validator, NOT a permissive generic schema engine.
function multiTurnProfile() {
  return { kind: 'multiTurn', allowedKeys: ['messages', 'context'], fields: {} };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k]);
    Object.freeze(value);
  }
  return value;
}

const PROFILES = deepFreeze({
  'text.copy': promptOnlyProfile(),
  'text.crm_message': promptOnlyProfile(),
  // Infrastructure-only multi-turn action (C2) — proves the normalized-messages
  // provider path end-to-end. No product surface calls it.
  'text.multi_turn': multiTurnProfile(),
  'studio.prompt_enhance': promptOnlyProfile(),
  'crm.suggest_next_action': promptOnlyProfile(),
});

export const AI_GATEWAY_INPUT_PROFILE_KEYS = Object.freeze(Object.keys(PROFILES));

// Resolve { action, profile } for a (possibly hostile) actionType, or null.
function resolveProfile(actionType) {
  const a = normalizeActionType(actionType);
  if (a === null || !Object.prototype.hasOwnProperty.call(PROFILES, a)) return null;
  return { action: a, profile: PROFILES[a] };
}

export function hasAiGatewayInputProfile(actionType) {
  return resolveProfile(actionType) !== null;
}

// ---- multi-turn payload validator (C2; payload already structurally safe) ----
// Runs AFTER scanStructure + the unknown-top-key policy, so every value here is
// a plain object / array / primitive reached through data descriptors only (no
// getters, no dangerous or symbol keys, bounded depth). Rules:
//   messages: required array, 1..MAX_MESSAGES items; each item a plain object
//     with EXACTLY { role, text }; role ∈ user|assistant (system/tool/developer
//     and anything else rejected); text trimmed, non-empty, ≤ MAX_MESSAGE_CHARS;
//     combined trimmed text ≤ MAX_COMBINED_MESSAGE_CHARS; first message = user.
//   context: optional plain object with EXACTLY { summary: string }, trimmed,
//     non-empty, ≤ MAX_CONTEXT_CHARS. Context is caller DATA, never instruction
//     authority — no role/system/prompt/provider/model/options fields exist.
// Never mutates input; never truncates; returns fresh normalized objects.
function validateMultiTurnPayload(payload) {
  const md = Object.getOwnPropertyDescriptor(payload, 'messages');
  if (!md || !('value' in md)) return fail('missing_field');
  const raw = md.value;
  if (!Array.isArray(raw)) return fail('messages_not_array');
  if (raw.length < 1) return fail('messages_empty');
  if (raw.length > AI_GATEWAY_INPUT_LIMITS.MAX_MESSAGES) return fail('too_many_messages');

  const messages = [];
  let inputChars = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const m = raw[i];
    if (!isPlainObject(m)) return fail('message_not_object');
    for (const k of Object.getOwnPropertyNames(m)) {
      if (k !== 'role' && k !== 'text') return fail('message_unknown_field');
    }
    const rd = Object.getOwnPropertyDescriptor(m, 'role');
    const td = Object.getOwnPropertyDescriptor(m, 'text');
    const role = (rd && 'value' in rd) ? rd.value : undefined;
    const text = (td && 'value' in td) ? td.value : undefined;
    if (role !== 'user' && role !== 'assistant') return fail('invalid_role');
    if (typeof text !== 'string') return fail('field_not_string');
    const v = text.trim();
    if (v.length === 0) return fail('empty_field');
    if (v.length > AI_GATEWAY_INPUT_LIMITS.MAX_MESSAGE_CHARS) return fail('message_too_long');
    inputChars += v.length;
    messages.push({ role, text: v });
  }
  if (inputChars > AI_GATEWAY_INPUT_LIMITS.MAX_COMBINED_MESSAGE_CHARS) return fail('messages_too_long');
  if (messages[0].role !== 'user') return fail('first_message_not_user');

  const cd = Object.getOwnPropertyDescriptor(payload, 'context');
  let context = null;
  if (cd) {
    if (!('value' in cd)) return fail('accessor_property');
    const c = cd.value;
    if (!isPlainObject(c)) return fail('context_not_object');
    for (const k of Object.getOwnPropertyNames(c)) {
      if (k !== 'summary') return fail('context_unknown_field');
    }
    const sd = Object.getOwnPropertyDescriptor(c, 'summary');
    if (!sd || !('value' in sd)) return fail('missing_field');
    if (typeof sd.value !== 'string') return fail('field_not_string');
    const s = sd.value.trim();
    if (s.length === 0) return fail('empty_field');
    if (s.length > AI_GATEWAY_INPUT_LIMITS.MAX_CONTEXT_CHARS) return fail('context_too_long');
    inputChars += s.length;
    context = { summary: s };
  }

  return { ok: true, payload: context ? { messages, context } : { messages }, inputChars };
}

// ---- core: validate + normalize an untrusted payload for an action ----
// Returns { ok:true, actionType, payload, inputChars } or
// { ok:false, error:{ code:'invalid_payload', reason } }. Never throws; never
// mutates the caller's payload; the `reason` is a fixed slug, never content.
export function validateAiGatewayInput(actionType, payload) {
  const found = resolveProfile(actionType);
  if (!found) return fail('unsupported_action');
  const { action, profile } = found;

  // Top-level shape.
  if (payload === null || typeof payload !== 'object') return fail('payload_not_object');
  if (Array.isArray(payload)) return fail('payload_array');
  if (!isPlainObject(payload)) return fail('payload_not_plain'); // Date/Map/Set/class instance

  // Structural safety (depth, cycles, accessors, dangerous/symbol keys, non-plain
  // nested values) BEFORE reading any field value — so a throwing getter, a cycle,
  // or unbounded nesting can never crash validation.
  const structReason = scanStructure(payload, 0, new WeakSet());
  if (structReason) return fail(structReason);

  // Unknown-field policy over ALL own string keys (enumerable AND non-enumerable):
  // ONLY the profile's allowed keys may appear — a non-enumerable extra field is
  // rejected, never silently accepted.
  for (const k of Object.getOwnPropertyNames(payload)) {
    if (!profile.allowedKeys.includes(k)) return fail('unknown_field');
  }

  // Multi-turn actions branch into their dedicated validator (C2).
  if (profile.kind === 'multiTurn') {
    const r = validateMultiTurnPayload(payload);
    if (!r.ok) return r;
    return { ok: true, actionType: action, payload: r.payload, inputChars: r.inputChars };
  }

  // Per-field validation → a FRESH normalized payload (caller object untouched).
  const out = {};
  let inputChars = 0;
  for (const name of Object.keys(profile.fields)) {
    const spec = profile.fields[name];
    const d = Object.getOwnPropertyDescriptor(payload, name);
    if (!d || !('value' in d)) {
      if (spec.required) return fail('missing_field');
      continue; // optional + absent
    }
    const raw = d.value;
    if (spec.type === 'string') {
      if (typeof raw !== 'string') return fail('field_not_string');
      const v = spec.trim ? raw.trim() : raw;
      if (spec.required && v.length === 0) return fail('empty_field');
      if (v.length > spec.maxChars) return fail('field_too_long');
      out[name] = v;
      inputChars += v.length;
    } else {
      // No non-string fields exist in this slice; reject rather than pass through.
      return fail('unsupported_field_type');
    }
  }

  return { ok: true, actionType: action, payload: out, inputChars };
}

// ---- normalize only → the normalized payload object, or null on failure ----
export function normalizeAiGatewayInput(actionType, payload) {
  const r = validateAiGatewayInput(actionType, payload);
  return r.ok ? r.payload : null;
}

// ---- content-free character count of an ALREADY-normalized payload ----
// Sums the lengths of the profile's string fields. Never throws; reads via
// descriptors so a hostile object cannot trigger a getter. Returns 0 for an
// unknown action or a non-object payload.
export function countAiGatewayInputChars(actionType, normalizedPayload) {
  const found = resolveProfile(actionType);
  if (!found || !isPlainObject(normalizedPayload)) return 0;
  let n = 0;
  if (found.profile.kind === 'multiTurn') {
    // Sum of normalized message texts + context summary — never roles, field
    // names, punctuation, or any server-owned text.
    const md = Object.getOwnPropertyDescriptor(normalizedPayload, 'messages');
    const arr = (md && 'value' in md && Array.isArray(md.value)) ? md.value : [];
    for (const m of arr) {
      if (!isPlainObject(m)) continue;
      const td = Object.getOwnPropertyDescriptor(m, 'text');
      if (td && 'value' in td && typeof td.value === 'string') n += td.value.length;
    }
    const cd = Object.getOwnPropertyDescriptor(normalizedPayload, 'context');
    const ctx = (cd && 'value' in cd && isPlainObject(cd.value)) ? cd.value : null;
    if (ctx) {
      const sd = Object.getOwnPropertyDescriptor(ctx, 'summary');
      if (sd && 'value' in sd && typeof sd.value === 'string') n += sd.value.length;
    }
    return n;
  }
  for (const name of Object.keys(found.profile.fields)) {
    const spec = found.profile.fields[name];
    if (spec.type !== 'string') continue;
    const d = Object.getOwnPropertyDescriptor(normalizedPayload, name);
    if (d && 'value' in d && typeof d.value === 'string') n += d.value.length;
  }
  return n;
}
