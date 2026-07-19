// M2 Slice 1 — Pure Provider Contracts. Focused unit tests for
// supabase/functions/_shared/aiProviderCore.js: normalized adapter results,
// adapter-shape validation, capability declarations, safe error mapping,
// plus purity / zero-runtime-wiring guards.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AI_PROVIDERS } from '../aiGateway.js';
import { AI_GATEWAY_ERROR_CODES } from '../aiGatewayContract.js';
import {
  PROVIDER_RESULT_KINDS,
  PROVIDER_CAPABILITIES,
  PROVIDER_ADAPTER_ERROR_CODES,
  mapProviderError,
  buildProviderTextResult,
  buildProviderJsonResult,
  buildProviderErrorResult,
  validateProviderResult,
  isProviderResult,
  declareProviderCapabilities,
  providerDeclaresCapability,
  validateProviderAdapterShape,
  isProviderAdapterShape,
} from '../aiProviderCore.js';

const moduleUrl = new URL('../aiProviderCore.js', import.meta.url);
const moduleSource = readFileSync(fileURLToPath(moduleUrl), 'utf8');

// ---------------------------------------------------------------
// Purity + isolation guards (source-level, same convention as the
// aiGatewayContract test suite)
// ---------------------------------------------------------------
describe('purity and isolation', () => {
  it('module source contains no impure or runtime-only tokens', () => {
    const forbidden = [
      'fetch(', 'Deno', 'process.env', 'import.meta.env',
      'supabase-js', 'createClient', 'XMLHttpRequest', 'WebSocket',
      'Date.now', 'new Date', 'Math.random', 'crypto.',
      'window.', 'document.', 'localStorage', 'sessionStorage',
      'setTimeout', 'setInterval',
    ];
    for (const token of forbidden) {
      expect(moduleSource.includes(token), `forbidden token: ${token}`).toBe(false);
    }
  });

  it('module imports ONLY the pure shared siblings', () => {
    const imports = [...moduleSource.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['./aiGateway.js', './aiGatewayContract.js']);
  });

  it('no existing runtime file imports aiProviderCore (zero wiring)', () => {
    const runtimeFiles = [
      '../../ai-gateway/index.ts',
      '../../ai-gateway/geminiProvider.ts',
      '../../ai-gateway/actionProfiles.ts',
      '../../ai-gateway/budgetGuard.ts',
      '../../ai-gateway/budgetPolicy.ts',
      '../../ai-gateway/usageLog.ts',
      '../aiGateway.js',
      '../aiGatewayContract.js',
      '../aiGatewayInput.js',
    ];
    for (const rel of runtimeFiles) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      expect(src.includes('aiProviderCore'), `${rel} must not import aiProviderCore`).toBe(false);
    }
  });

  it('importing the module has no side effects (frozen exported tables only)', () => {
    expect(Object.isFrozen(PROVIDER_RESULT_KINDS)).toBe(true);
    expect(Object.isFrozen(PROVIDER_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(PROVIDER_ADAPTER_ERROR_CODES)).toBe(true);
  });
});

// ---------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------
describe('vocabularies', () => {
  it('result kinds are exactly text and json', () => {
    expect(PROVIDER_RESULT_KINDS).toEqual(['text', 'json']);
  });

  it('capabilities are limited to what the gateway does today', () => {
    expect(PROVIDER_CAPABILITIES).toEqual(['text', 'json', 'multi_turn']);
  });

  it('adapter error codes are a strict subset of AI_GATEWAY_ERROR_CODES values', () => {
    const gatewayCodes = Object.values(AI_GATEWAY_ERROR_CODES);
    expect(PROVIDER_ADAPTER_ERROR_CODES).toEqual([
      'provider_not_configured', 'provider_error', 'invalid_provider_response', 'invalid_payload',
    ]);
    for (const code of PROVIDER_ADAPTER_ERROR_CODES) {
      expect(gatewayCodes).toContain(code);
    }
    // Strictly smaller: budget/auth codes are NOT adapter codes.
    expect(PROVIDER_ADAPTER_ERROR_CODES).not.toContain('budget_exceeded');
    expect(PROVIDER_ADAPTER_ERROR_CODES).not.toContain('unauthenticated');
    expect(PROVIDER_ADAPTER_ERROR_CODES).not.toContain('rate_limited');
  });
});

// ---------------------------------------------------------------
// Safe error mapping
// ---------------------------------------------------------------
describe('mapProviderError', () => {
  it('maps each adapter code to the live gateway HTTP status', () => {
    expect(mapProviderError('provider_not_configured')).toEqual({
      code: 'provider_not_configured', httpStatus: 503, message: 'Provider is not configured.',
    });
    expect(mapProviderError('provider_error')).toEqual({
      code: 'provider_error', httpStatus: 502, message: 'Provider request failed.',
    });
    expect(mapProviderError('invalid_provider_response')).toEqual({
      code: 'invalid_provider_response', httpStatus: 502, message: 'Provider returned an invalid response.',
    });
    expect(mapProviderError('invalid_payload')).toEqual({
      code: 'invalid_payload', httpStatus: 400, message: 'Invalid payload.',
    });
  });

  it('fails closed to provider_error on unknown or hostile codes', () => {
    const fallback = { code: 'provider_error', httpStatus: 502, message: 'Provider request failed.' };
    expect(mapProviderError('budget_exceeded')).toEqual(fallback); // gateway code, NOT adapter code
    expect(mapProviderError('nonsense')).toEqual(fallback);
    expect(mapProviderError('')).toEqual(fallback);
    expect(mapProviderError(null)).toEqual(fallback);
    expect(mapProviderError(undefined)).toEqual(fallback);
    expect(mapProviderError(42)).toEqual(fallback);
    expect(mapProviderError({ toString: () => 'provider_not_configured' })).toEqual(fallback);
    // Prototype-chain smuggling never resolves a map entry.
    expect(mapProviderError('toString')).toEqual(fallback);
    expect(mapProviderError('__proto__')).toEqual(fallback);
    expect(mapProviderError('constructor')).toEqual(fallback);
  });

  it('returns a fresh object every call (no shared mutable state)', () => {
    const a = mapProviderError('provider_error');
    const b = mapProviderError('provider_error');
    expect(a).not.toBe(b);
    a.message = 'mutated';
    expect(mapProviderError('provider_error').message).toBe('Provider request failed.');
  });
});

// ---------------------------------------------------------------
// Result builders
// ---------------------------------------------------------------
describe('result builders', () => {
  it('buildProviderTextResult wraps a non-empty string with its char count', () => {
    expect(buildProviderTextResult('hello')).toEqual({
      ok: true, kind: 'text', text: 'hello', resultChars: 5,
    });
  });

  it('buildProviderTextResult fails closed on non-string / empty input', () => {
    const invalid = buildProviderErrorResult('invalid_provider_response');
    expect(buildProviderTextResult('')).toEqual(invalid);
    expect(buildProviderTextResult(null)).toEqual(invalid);
    expect(buildProviderTextResult(undefined)).toEqual(invalid);
    expect(buildProviderTextResult(42)).toEqual(invalid);
    expect(buildProviderTextResult({ text: 'x' })).toEqual(invalid);
  });

  it('buildProviderJsonResult wraps a plain object with raw-text char count', () => {
    const json = { suggestion: 'call', reason: 'overdue', priority: 'high' };
    const raw = JSON.stringify(json);
    const result = buildProviderJsonResult(json, raw);
    expect(result).toEqual({ ok: true, kind: 'json', json, resultChars: raw.length });
    // resultChars counts the RAW string, never a re-serialization.
    expect(buildProviderJsonResult(json, undefined).resultChars).toBe(null);
    expect(buildProviderJsonResult(json).resultChars).toBe(null);
  });

  it('buildProviderJsonResult fails closed on non-plain-object / dangerous json', () => {
    const invalid = buildProviderErrorResult('invalid_provider_response');
    expect(buildProviderJsonResult(null, '{}')).toEqual(invalid);
    expect(buildProviderJsonResult([], '[]')).toEqual(invalid);
    expect(buildProviderJsonResult('x', '"x"')).toEqual(invalid);
    expect(buildProviderJsonResult(new Date(), '{}')).toEqual(invalid);
    const polluted = JSON.parse('{"__proto__": {"x": 1}, "a": 1}');
    expect(buildProviderJsonResult(polluted, '{}')).toEqual(invalid);
  });

  it('buildProviderErrorResult wraps the safe mapping and fails closed', () => {
    expect(buildProviderErrorResult('provider_not_configured')).toEqual({
      ok: false,
      error: { code: 'provider_not_configured', httpStatus: 503, message: 'Provider is not configured.' },
    });
    expect(buildProviderErrorResult('anything-else')).toEqual({
      ok: false,
      error: { code: 'provider_error', httpStatus: 502, message: 'Provider request failed.' },
    });
  });
});

// ---------------------------------------------------------------
// Result validation
// ---------------------------------------------------------------
describe('validateProviderResult / isProviderResult', () => {
  it('accepts every builder output round-trip (normalized fixed point)', () => {
    const samples = [
      buildProviderTextResult('שלום עולם'),
      buildProviderJsonResult({ a: 1 }, '{"a":1}'),
      buildProviderJsonResult({ a: 1 }),
      buildProviderErrorResult('provider_not_configured'),
      buildProviderErrorResult('invalid_payload'),
    ];
    for (const s of samples) {
      expect(validateProviderResult(s)).toEqual(s);
      expect(isProviderResult(s)).toBe(true);
    }
  });

  it('rejects non-objects, arrays, and non-plain objects', () => {
    for (const v of [null, undefined, 'x', 42, true, [], new Date(), new Map()]) {
      expect(validateProviderResult(v)).toBe(null);
      expect(isProviderResult(v)).toBe(false);
    }
  });

  it('rejects extra keys, wrong types, and inconsistent char counts', () => {
    expect(validateProviderResult({ ok: true, kind: 'text', text: 'x', resultChars: 1, extra: 1 })).toBe(null);
    expect(validateProviderResult({ ok: true, kind: 'text', text: 'x' })).toBe(null); // missing resultChars
    expect(validateProviderResult({ ok: true, kind: 'text', text: 'x', resultChars: 2 })).toBe(null); // wrong count
    expect(validateProviderResult({ ok: true, kind: 'text', text: '', resultChars: 0 })).toBe(null); // empty text
    expect(validateProviderResult({ ok: true, kind: 'blob', text: 'x', resultChars: 1 })).toBe(null); // unknown kind
    expect(validateProviderResult({ ok: 'true', kind: 'text', text: 'x', resultChars: 1 })).toBe(null); // ok not boolean
    expect(validateProviderResult({ ok: true, kind: 'json', json: [], resultChars: null })).toBe(null); // json not plain
    expect(validateProviderResult({ ok: true, kind: 'json', json: {}, resultChars: 1.5 })).toBe(null); // non-integer
    expect(validateProviderResult({ ok: true, kind: 'json', json: {}, resultChars: -1 })).toBe(null); // negative
  });

  it('re-derives error httpStatus/message from the safe table (no caller leak)', () => {
    const smuggled = {
      ok: false,
      error: { code: 'provider_error', httpStatus: 200, message: 'LEAKED-UPSTREAM-TEXT api_key=abc' },
    };
    expect(validateProviderResult(smuggled)).toEqual({
      ok: false,
      error: { code: 'provider_error', httpStatus: 502, message: 'Provider request failed.' },
    });
  });

  it('requires ALL THREE error fields (code, httpStatus, message) as own data properties', () => {
    // code alone is NOT a valid normalized error shape.
    expect(validateProviderResult({ ok: false, error: { code: 'provider_error' } })).toBe(null);
    // Missing httpStatus rejected.
    expect(validateProviderResult({ ok: false, error: { code: 'provider_error', message: 'x' } })).toBe(null);
    // Missing message rejected.
    expect(validateProviderResult({ ok: false, error: { code: 'provider_error', httpStatus: 502 } })).toBe(null);
  });

  it('rejects accessor properties for ANY required error field without invoking the getter', () => {
    for (const field of ['code', 'httpStatus', 'message']) {
      const err = { code: 'provider_error', httpStatus: 502, message: 'Provider request failed.' };
      delete err[field];
      let invoked = false;
      Object.defineProperty(err, field, {
        get() { invoked = true; throw new Error('boom'); },
        enumerable: true,
        configurable: true,
      });
      const value = { ok: false, error: err };
      expect(() => validateProviderResult(value), field).not.toThrow();
      expect(validateProviderResult(value), field).toBe(null);
      expect(invoked, `getter for ${field} must never be invoked`).toBe(false);
    }
  });

  it('accepts a COMPLETE error shape with hostile status/message and normalizes to safe values', () => {
    const smuggled = {
      ok: false,
      error: { code: 'invalid_payload', httpStatus: 200, message: 'LEAKED-UPSTREAM api_key=abc' },
    };
    expect(validateProviderResult(smuggled)).toEqual({
      ok: false,
      error: { code: 'invalid_payload', httpStatus: 400, message: 'Invalid payload.' },
    });
  });

  it('rejects error results with unknown codes or extra keys', () => {
    expect(validateProviderResult({ ok: false, error: { code: 'budget_exceeded', httpStatus: 502, message: 'x' } })).toBe(null);
    expect(validateProviderResult({ ok: false, error: { code: 'provider_error', httpStatus: 502, message: 'x', detail: 'y' } })).toBe(null);
    expect(validateProviderResult({ ok: false })).toBe(null);
    expect(validateProviderResult({ ok: false, error: null })).toBe(null);
    expect(validateProviderResult({ ok: false, error: { code: 'provider_error' }, extra: 1 })).toBe(null);
  });

  it('never invokes accessor properties (throwing getter cannot crash it)', () => {
    const hostile = { ok: true, kind: 'text', resultChars: 1 };
    Object.defineProperty(hostile, 'text', {
      get() { throw new Error('boom'); },
      enumerable: true,
    });
    expect(() => validateProviderResult(hostile)).not.toThrow();
    expect(validateProviderResult(hostile)).toBe(null);
  });

  it('never mutates the input value', () => {
    const input = buildProviderTextResult('stable');
    const snapshot = JSON.parse(JSON.stringify(input));
    validateProviderResult(input);
    expect(input).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------
// Capability declarations
// ---------------------------------------------------------------
describe('declareProviderCapabilities', () => {
  it('builds a frozen declaration in canonical capability order', () => {
    const d = declareProviderCapabilities('gemini', ['multi_turn', 'text', 'text']);
    expect(d).toEqual({ provider: 'gemini', capabilities: ['text', 'multi_turn'] });
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.capabilities)).toBe(true);
  });

  it('accepts every registered provider id', () => {
    for (const p of AI_PROVIDERS) {
      expect(declareProviderCapabilities(p, ['text'])).toEqual({ provider: p, capabilities: ['text'] });
    }
  });

  it('rejects unknown providers and unknown/empty capabilities (no silent filtering)', () => {
    expect(declareProviderCapabilities('grok', ['text'])).toBe(null);
    expect(declareProviderCapabilities(null, ['text'])).toBe(null);
    expect(declareProviderCapabilities('gemini', [])).toBe(null);
    expect(declareProviderCapabilities('gemini', ['text', 'video'])).toBe(null); // one bad → all rejected
    expect(declareProviderCapabilities('gemini', 'text')).toBe(null);
    expect(declareProviderCapabilities('gemini', [42])).toBe(null);
  });

  it('providerDeclaresCapability answers only for valid declarations + known capabilities', () => {
    const d = declareProviderCapabilities('gemini', ['text', 'json']);
    expect(providerDeclaresCapability(d, 'text')).toBe(true);
    expect(providerDeclaresCapability(d, 'json')).toBe(true);
    expect(providerDeclaresCapability(d, 'multi_turn')).toBe(false);
    expect(providerDeclaresCapability(d, 'video')).toBe(false); // unknown capability
    expect(providerDeclaresCapability(null, 'text')).toBe(false);
    expect(providerDeclaresCapability({ provider: 'GROK', capabilities: ['text'] }, 'text')).toBe(false);
    expect(providerDeclaresCapability({ provider: 'Gemini', capabilities: ['text'] }, 'text')).toBe(false); // non-canonical id
  });

  it('providerDeclaresCapability is STRICT: one unknown capability poisons the whole declaration', () => {
    // The headline case: a valid capability alongside an unknown one may NOT count.
    expect(providerDeclaresCapability({ provider: 'gemini', capabilities: ['text', 'evil'] }, 'text')).toBe(false);
    expect(providerDeclaresCapability({ provider: 'gemini', capabilities: [] }, 'text')).toBe(false); // empty
    expect(providerDeclaresCapability({ provider: 'gemini', capabilities: ['text', 'text'] }, 'text')).toBe(false); // duplicate
    expect(providerDeclaresCapability({ provider: 'gemini', capabilities: ['json', 'text'] }, 'text')).toBe(false); // non-canonical order
    expect(providerDeclaresCapability({ provider: 'gemini', capabilities: ['text'], extra: 1 }, 'text')).toBe(false); // extra field
    // Dangerous own key on the declaration object.
    const polluted = JSON.parse('{"__proto__": {}, "provider": "gemini", "capabilities": ["text"]}');
    expect(providerDeclaresCapability(polluted, 'text')).toBe(false);
  });

  it('providerDeclaresCapability rejects accessor properties without invoking getters', () => {
    let invoked = false;
    const hostileDecl = { provider: 'gemini' };
    Object.defineProperty(hostileDecl, 'capabilities', {
      get() { invoked = true; throw new Error('boom'); },
      enumerable: true,
    });
    expect(() => providerDeclaresCapability(hostileDecl, 'text')).not.toThrow();
    expect(providerDeclaresCapability(hostileDecl, 'text')).toBe(false);
    expect(invoked).toBe(false);

    // Accessor ELEMENT inside the capabilities array.
    const arr = ['text'];
    Object.defineProperty(arr, 1, {
      get() { invoked = true; throw new Error('boom'); },
      enumerable: true,
    });
    arr.length = 2;
    expect(() => providerDeclaresCapability({ provider: 'gemini', capabilities: arr }, 'text')).not.toThrow();
    expect(providerDeclaresCapability({ provider: 'gemini', capabilities: arr }, 'text')).toBe(false);
    expect(invoked).toBe(false);
  });

  it('every declareProviderCapabilities output passes providerDeclaresCapability', () => {
    for (const p of AI_PROVIDERS) {
      const d = declareProviderCapabilities(p, ['multi_turn', 'json', 'text']); // any order in → canonical out
      expect(providerDeclaresCapability(d, 'text'), p).toBe(true);
      expect(providerDeclaresCapability(d, 'json'), p).toBe(true);
      expect(providerDeclaresCapability(d, 'multi_turn'), p).toBe(true);
    }
  });
});

// ---------------------------------------------------------------
// Adapter-shape validation
// ---------------------------------------------------------------
describe('validateProviderAdapterShape', () => {
  const validAdapter = () => ({
    provider: 'gemini',
    capabilities: ['text', 'json', 'multi_turn'],
    isConfigured: () => { throw new Error('must never be called'); },
    run: () => { throw new Error('must never be called'); },
  });

  it('accepts a well-formed adapter and returns its frozen declaration', () => {
    const r = validateProviderAdapterShape(validAdapter());
    expect(r).toEqual({ ok: true, provider: 'gemini', capabilities: ['text', 'json', 'multi_turn'] });
    expect(Object.isFrozen(r.capabilities)).toBe(true);
    expect(isProviderAdapterShape(validAdapter())).toBe(true);
  });

  it('NEVER invokes isConfigured or run (structural check only)', () => {
    let called = false;
    const adapter = {
      provider: 'gemini',
      capabilities: ['text'],
      isConfigured: () => { called = true; },
      run: () => { called = true; },
    };
    validateProviderAdapterShape(adapter);
    isProviderAdapterShape(adapter);
    expect(called).toBe(false);
  });

  it('rejects with fixed content-free reasons', () => {
    expect(validateProviderAdapterShape(null)).toEqual({ ok: false, reason: 'adapter_not_object' });
    expect(validateProviderAdapterShape([])).toEqual({ ok: false, reason: 'adapter_not_object' });
    expect(validateProviderAdapterShape({ ...validAdapter(), extra: 1 }))
      .toEqual({ ok: false, reason: 'unknown_field' });

    const noProvider = validAdapter();
    delete noProvider.provider;
    expect(validateProviderAdapterShape(noProvider)).toEqual({ ok: false, reason: 'missing_provider' });

    expect(validateProviderAdapterShape({ ...validAdapter(), provider: 'grok' }))
      .toEqual({ ok: false, reason: 'unknown_provider' });
    // Non-canonical (normalizable) ids are rejected too — adapters carry exact ids.
    expect(validateProviderAdapterShape({ ...validAdapter(), provider: ' Gemini ' }))
      .toEqual({ ok: false, reason: 'unknown_provider' });

    const noCaps = validAdapter();
    delete noCaps.capabilities;
    expect(validateProviderAdapterShape(noCaps)).toEqual({ ok: false, reason: 'missing_capabilities' });
    expect(validateProviderAdapterShape({ ...validAdapter(), capabilities: ['video'] }))
      .toEqual({ ok: false, reason: 'invalid_capabilities' });
    expect(validateProviderAdapterShape({ ...validAdapter(), capabilities: [] }))
      .toEqual({ ok: false, reason: 'invalid_capabilities' });

    expect(validateProviderAdapterShape({ ...validAdapter(), isConfigured: true }))
      .toEqual({ ok: false, reason: 'missing_is_configured' });
    expect(validateProviderAdapterShape({ ...validAdapter(), run: 'runGeminiText' }))
      .toEqual({ ok: false, reason: 'missing_run' });
  });

  it('rejects accessor-property adapters without invoking the getter', () => {
    const hostile = validAdapter();
    Object.defineProperty(hostile, 'run', {
      get() { throw new Error('boom'); },
      enumerable: true,
      configurable: true,
    });
    expect(() => validateProviderAdapterShape(hostile)).not.toThrow();
    expect(validateProviderAdapterShape(hostile)).toEqual({ ok: false, reason: 'missing_run' });
  });

  it('never mutates the adapter object', () => {
    const adapter = validAdapter();
    const keysBefore = Object.getOwnPropertyNames(adapter).sort();
    validateProviderAdapterShape(adapter);
    expect(Object.getOwnPropertyNames(adapter).sort()).toEqual(keysBefore);
    expect(adapter.provider).toBe('gemini');
    expect(adapter.capabilities).toEqual(['text', 'json', 'multi_turn']);
  });
});

// ---------------------------------------------------------------
// Hostile Proxy inputs — the "never throws" guarantee must hold even
// when reflection itself (getPrototypeOf / ownKeys / descriptor / has)
// throws or the Proxy is revoked. Every public object-accepting
// function fails CLOSED instead of propagating.
// ---------------------------------------------------------------
describe('hostile Proxy inputs', () => {
  const throwingProxy = (target = {}) => new Proxy(target, {
    getPrototypeOf() { throw new Error('trap'); },
    ownKeys() { throw new Error('trap'); },
    getOwnPropertyDescriptor() { throw new Error('trap'); },
    has() { throw new Error('trap'); },
    get() { throw new Error('trap'); },
  });
  const revokedProxy = (target = {}) => {
    const { proxy, revoke } = Proxy.revocable(target, {});
    revoke();
    return proxy;
  };
  const hostileValues = () => [
    ['throwing proxy', throwingProxy()],
    ['revoked proxy', revokedProxy()],
    ['throwing array proxy', throwingProxy([])],
    ['revoked array proxy', revokedProxy([])],
  ];

  it('validateProviderResult / isProviderResult fail closed', () => {
    for (const [label, hostile] of hostileValues()) {
      expect(() => validateProviderResult(hostile), label).not.toThrow();
      expect(validateProviderResult(hostile), label).toBe(null);
      expect(() => isProviderResult(hostile), label).not.toThrow();
      expect(isProviderResult(hostile), label).toBe(false);
    }
  });

  it('buildProviderJsonResult fails closed to a safe error result', () => {
    const invalid = buildProviderErrorResult('invalid_provider_response');
    for (const [label, hostile] of hostileValues()) {
      expect(() => buildProviderJsonResult(hostile, '{}'), label).not.toThrow();
      expect(buildProviderJsonResult(hostile, '{}'), label).toEqual(invalid);
    }
  });

  it('declareProviderCapabilities fails closed to null', () => {
    for (const [label, hostile] of hostileValues()) {
      // hostile as the capabilities list...
      expect(() => declareProviderCapabilities('gemini', hostile), label).not.toThrow();
      expect(declareProviderCapabilities('gemini', hostile), label).toBe(null);
      // ...and as the provider (non-string → normalizes to null, no throw).
      expect(() => declareProviderCapabilities(hostile, ['text']), label).not.toThrow();
      expect(declareProviderCapabilities(hostile, ['text']), label).toBe(null);
    }
  });

  it('providerDeclaresCapability fails closed to false', () => {
    for (const [label, hostile] of hostileValues()) {
      expect(() => providerDeclaresCapability(hostile, 'text'), label).not.toThrow();
      expect(providerDeclaresCapability(hostile, 'text'), label).toBe(false);
      // Hostile capabilities array nested inside an otherwise-valid declaration.
      const decl = { provider: 'gemini', capabilities: hostile };
      expect(() => providerDeclaresCapability(decl, 'text'), label).not.toThrow();
      expect(providerDeclaresCapability(decl, 'text'), label).toBe(false);
    }
  });

  it('validateProviderAdapterShape / isProviderAdapterShape fail closed', () => {
    for (const [label, hostile] of hostileValues()) {
      expect(() => validateProviderAdapterShape(hostile), label).not.toThrow();
      const r = validateProviderAdapterShape(hostile);
      expect(r.ok, label).toBe(false);
      // Plain-object proxies throw during reflection → 'unsafe_input'; array
      // proxies are rejected even earlier (an array is not an adapter object).
      expect(['unsafe_input', 'adapter_not_object'], label).toContain(r.reason);
      expect(() => isProviderAdapterShape(hostile), label).not.toThrow();
      expect(isProviderAdapterShape(hostile), label).toBe(false);
      // Hostile capabilities nested inside an otherwise-valid adapter → the
      // nested guard fails closed and the shape check reports the field.
      const adapter = { provider: 'gemini', capabilities: hostile, isConfigured() {}, run() {} };
      expect(() => validateProviderAdapterShape(adapter), label).not.toThrow();
      expect(validateProviderAdapterShape(adapter), label).toEqual({ ok: false, reason: 'invalid_capabilities' });
    }
    // The catch path specifically: object-target proxies throw mid-reflection.
    expect(validateProviderAdapterShape(throwingProxy())).toEqual({ ok: false, reason: 'unsafe_input' });
    expect(validateProviderAdapterShape(revokedProxy())).toEqual({ ok: false, reason: 'unsafe_input' });
  });

  it('mapProviderError is unaffected by hostile non-string codes', () => {
    const fallback = { code: 'provider_error', httpStatus: 502, message: 'Provider request failed.' };
    for (const [label, hostile] of hostileValues()) {
      expect(() => mapProviderError(hostile), label).not.toThrow();
      expect(mapProviderError(hostile), label).toEqual(fallback);
    }
  });
});

// ---------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------
describe('determinism', () => {
  it('identical inputs always produce deep-equal outputs', () => {
    const inputs = [
      () => buildProviderTextResult('same text'),
      () => buildProviderJsonResult({ k: 'v' }, '{"k":"v"}'),
      () => buildProviderErrorResult('invalid_payload'),
      () => mapProviderError('provider_not_configured'),
      () => declareProviderCapabilities('anthropic', ['json', 'text']),
      () => validateProviderAdapterShape({
        provider: 'openai', capabilities: ['text'], isConfigured() {}, run() {},
      }),
    ];
    for (const make of inputs) {
      expect(make()).toEqual(make());
    }
  });
});
