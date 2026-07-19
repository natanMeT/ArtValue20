// ===================================================================
// AI Execution Registry — M2 Slice 2B: pure, provider-neutral registry.
//
// A FACTORY for isolated execution registries. A registry accepts
// server-owned provider adapters, validates them exclusively through the
// aiProviderCore contracts, stores an IMMUTABLE INTERNAL SNAPSHOT of each
// adapter (never the caller's object), and answers deterministic
// lookup/selection questions. It is the future seam between the gateway
// shell's server-owned routing decision and a provider adapter — but in
// this slice NOTHING imports it: zero runtime wiring, zero behavior change.
//
// The registry NEVER: invokes adapter.run / adapter.isConfigured (typeof
// capture only), reads env, fetches, retries, walks provider chains, or
// falls back to another provider; selects models or action profiles;
// authenticates, reserves budget, or logs usage; accepts provider
// authority from a frontend payload (its inputs are server-owned adapter
// objects and server-owned routing ids ONLY — the gateway sanitizer
// already strips caller provider/options authority upstream); mutates or
// freezes the caller's adapter object; creates a module-level instance.
//
// `none` is a ROUTING SENTINEL, not an executable provider: registration
// rejects it with the fixed reason `provider_not_executable`, so selection
// can never return it.
//
// Purity (house pattern of aiGateway.js / aiProviderCore.js): imports
// ONLY the pure shared siblings; no runtime/edge globals, no network, no
// env, no DB client, no timestamps/ids/randomness; every public method
// fails CLOSED (fixed frozen failure result / false / null / frozen [])
// on hostile input — including throwing getters and throwing/revoked
// Proxies whose reflection operations throw — and never throws.
// ===================================================================

import { AI_PROVIDERS } from './aiGateway.js';
import { validateProviderAdapterShape, PROVIDER_CAPABILITIES } from './aiProviderCore.js';

// ---- helpers (module-private; never invoke caller getters) ----
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
function readData(obj, key) {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  if (!d || !('value' in d)) return { present: false, value: undefined };
  return { present: true, value: d.value };
}

// ---- fixed failure vocabulary (frozen) ----
export const EXECUTION_REGISTRY_FAILURE_REASONS = Object.freeze([
  'invalid_adapter',
  'provider_not_executable',
  'duplicate_provider',
  'empty_registry',
  'unknown_provider',
  'capability_not_declared',
  'unsafe_input',
]);

// Deterministic vocabulary order for listProviders(): the frozen router
// order MINUS the `none` sentinel (which can never be registered anyway).
// Registration order is never observable.
const EXECUTABLE_PROVIDER_ORDER = Object.freeze(AI_PROVIDERS.filter((p) => p !== 'none'));

function fail(reason) {
  return Object.freeze({ ok: false, reason });
}

// Validate a selection request's capability list: a real array whose
// elements (read via descriptors — accessor elements reject) are known,
// UNIQUE capabilities, non-empty. One unknown/duplicate entry poisons the
// WHOLE request (never silently filtered). Returns the capability strings
// or null.
function readRequestCapabilities(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const seen = new Set();
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const d = Object.getOwnPropertyDescriptor(list, i);
    if (!d || !('value' in d)) return null;
    const cap = d.value;
    if (typeof cap !== 'string' || !PROVIDER_CAPABILITIES.includes(cap)) return null;
    if (seen.has(cap)) return null;
    out.push(cap);
    seen.add(cap);
  }
  return out;
}

// ---- factory (NO module-level instance is ever created here) ----
// Returns a frozen, isolated registry. All state lives in the closure —
// two registries never share anything.
export function createExecutionRegistry() {
  // canonical provider id -> frozen { declaration, snapshot }
  const entries = new Map();

  // Register a server-owned adapter. On success the registry stores ONLY an
  // immutable internal snapshot (canonical id + frozen canonical capabilities
  // + the run/isConfigured function REFERENCES, captured without invoking
  // them) — never the caller's object. Later mutation of the caller's adapter
  // has NO effect on the stored entry or future selections; the caller's
  // object is never mutated, frozen, retained, or revalidated.
  function register(adapter) {
    try {
      const shape = validateProviderAdapterShape(adapter);
      if (!shape.ok) {
        return Object.freeze({ ok: false, reason: 'invalid_adapter', shapeReason: shape.reason });
      }
      // `none` is a routing sentinel — structurally valid, never executable.
      if (shape.provider === 'none') return fail('provider_not_executable');
      if (entries.has(shape.provider)) return fail('duplicate_provider');

      // IMMUTABLE SNAPSHOT. shape.provider is a canonical primitive and
      // shape.capabilities is a FRESH frozen canonical array (both produced by
      // aiProviderCore, detached from the caller's object). The function
      // references are re-read via descriptors and re-checked: a masquerading
      // Proxy whose descriptor answers change between the validation read and
      // this read is rejected instead of trusted.
      const runD = readData(adapter, 'run');
      const cfgD = readData(adapter, 'isConfigured');
      if (!runD.present || typeof runD.value !== 'function'
        || !cfgD.present || typeof cfgD.value !== 'function') {
        return Object.freeze({ ok: false, reason: 'invalid_adapter', shapeReason: 'unstable_adapter' });
      }

      const declaration = Object.freeze({
        provider: shape.provider,
        capabilities: shape.capabilities,
      });
      const snapshot = Object.freeze({
        provider: shape.provider,
        capabilities: shape.capabilities,
        isConfigured: cfgD.value,
        run: runD.value,
      });
      entries.set(shape.provider, Object.freeze({ declaration, snapshot }));
      return Object.freeze({ ok: true, provider: shape.provider, capabilities: shape.capabilities });
    } catch {
      return fail('unsafe_input');
    }
  }

  // EXACT canonical spelling only — no trim/case normalization is ever
  // accepted at lookup time (' gemini' / 'GEMINI' are unknown).
  function hasProvider(provider) {
    try {
      return typeof provider === 'string' && entries.has(provider);
    } catch {
      return false;
    }
  }

  function listProviders() {
    try {
      return Object.freeze(EXECUTABLE_PROVIDER_ORDER.filter((p) => entries.has(p)));
    } catch {
      return Object.freeze([]);
    }
  }

  function getDeclaration(provider) {
    try {
      if (typeof provider !== 'string') return null;
      const entry = entries.get(provider);
      return entry ? entry.declaration : null;
    } catch {
      return null;
    }
  }

  // Select EXACTLY ONE adapter for a server-owned routing request of the
  // exact shape { provider, capabilities } (both own data properties, no
  // extra keys). ALL requested capabilities must be declared by that ONE
  // provider; a capability failure NEVER consults another registered
  // provider (no fallback, no chain traversal, no second selection).
  // Failure order is fixed and deterministic:
  //   malformed request → unsafe_input
  //   no registrations  → empty_registry
  //   id not registered / non-canonical → unknown_provider
  //   malformed capability list (empty/unknown/duplicate/accessor) → unsafe_input
  //   known capabilities not all declared → capability_not_declared
  function selectAdapter(request) {
    try {
      if (!isPlainObject(request) || hasDangerousOwnKey(request)) return fail('unsafe_input');
      for (const k of Object.getOwnPropertyNames(request)) {
        if (k !== 'provider' && k !== 'capabilities') return fail('unsafe_input');
      }
      const prov = readData(request, 'provider');
      const caps = readData(request, 'capabilities');
      if (!prov.present || !caps.present) return fail('unsafe_input');

      if (entries.size === 0) return fail('empty_registry');
      if (typeof prov.value !== 'string' || !entries.has(prov.value)) return fail('unknown_provider');

      const requested = readRequestCapabilities(caps.value);
      if (!requested) return fail('unsafe_input');

      const entry = entries.get(prov.value);
      for (const cap of requested) {
        if (!entry.declaration.capabilities.includes(cap)) return fail('capability_not_declared');
      }
      return Object.freeze({
        ok: true,
        provider: entry.declaration.provider,
        capabilities: entry.declaration.capabilities,
        adapter: entry.snapshot,
      });
    } catch {
      return fail('unsafe_input');
    }
  }

  function size() {
    return entries.size;
  }

  return Object.freeze({ register, hasProvider, listProviders, getDeclaration, selectAdapter, size });
}
