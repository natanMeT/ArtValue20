// M2 Slice 2B — Pure Execution Registry. Focused unit tests for
// supabase/functions/_shared/aiExecutionRegistry.js: registration through
// aiProviderCore validation, the `none` non-executable rule, immutable
// internal snapshots, deterministic lookup/selection, no-invocation and
// no-fallback guarantees, hostile-input safety, purity, and zero wiring.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AI_PROVIDERS } from '../aiGateway.js';
import {
  EXECUTION_REGISTRY_FAILURE_REASONS,
  createExecutionRegistry,
} from '../aiExecutionRegistry.js';

const moduleUrl = new URL('../aiExecutionRegistry.js', import.meta.url);
const moduleSource = readFileSync(fileURLToPath(moduleUrl), 'utf8');

// A valid adapter whose functions THROW and count invocations — the registry
// must never call them, so the counters must stay 0 across every scenario.
function makeAdapter(provider = 'gemini', capabilities = ['text', 'json', 'multi_turn']) {
  const calls = { run: 0, isConfigured: 0 };
  const adapter = {
    provider,
    capabilities,
    isConfigured: () => { calls.isConfigured += 1; throw new Error('must never be called'); },
    run: () => { calls.run += 1; throw new Error('must never be called'); },
  };
  return { adapter, calls };
}

// ---------------------------------------------------------------
// Purity + isolation guards (source-level, house convention)
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
    expect(imports.sort()).toEqual(['./aiGateway.js', './aiProviderCore.js']);
  });

  it('no existing runtime or shared file imports aiExecutionRegistry (zero wiring)', () => {
    const files = [
      '../../ai-gateway/index.ts',
      '../../ai-gateway/geminiProvider.ts',
      '../../ai-gateway/actionProfiles.ts',
      '../../ai-gateway/budgetGuard.ts',
      '../../ai-gateway/budgetPolicy.ts',
      '../../ai-gateway/usageLog.ts',
      '../aiGateway.js',
      '../aiGatewayContract.js',
      '../aiGatewayInput.js',
      '../aiProviderCore.js',
    ];
    for (const rel of files) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      expect(src.includes('aiExecutionRegistry'), `${rel} must not import aiExecutionRegistry`).toBe(false);
    }
  });

  it('no module-level registry instance exists', () => {
    // The literal `createExecutionRegistry()` must appear exactly once in the
    // source — its `export function createExecutionRegistry() {` definition.
    // A top-level (or any other) CALL would add a second occurrence.
    const occurrences = moduleSource.match(/createExecutionRegistry\(\)/g) || [];
    expect(occurrences).toHaveLength(1);
    expect(moduleSource.includes('export function createExecutionRegistry()')).toBe(true);
  });

  it('failure vocabulary is frozen and exact', () => {
    expect(Object.isFrozen(EXECUTION_REGISTRY_FAILURE_REASONS)).toBe(true);
    expect(EXECUTION_REGISTRY_FAILURE_REASONS).toEqual([
      'invalid_adapter',
      'provider_not_executable',
      'duplicate_provider',
      'empty_registry',
      'unknown_provider',
      'capability_not_declared',
      'unsafe_input',
    ]);
  });

  it('registries are isolated and the registry object is frozen', () => {
    const a = createExecutionRegistry();
    const b = createExecutionRegistry();
    expect(Object.isFrozen(a)).toBe(true);
    expect(a).not.toBe(b);
    a.register(makeAdapter().adapter);
    expect(a.hasProvider('gemini')).toBe(true);
    expect(b.hasProvider('gemini')).toBe(false);
    expect(b.size()).toBe(0);
  });
});

// ---------------------------------------------------------------
// Registration
// ---------------------------------------------------------------
describe('register', () => {
  it('registers a valid adapter and returns a frozen canonical declaration', () => {
    const reg = createExecutionRegistry();
    const { adapter } = makeAdapter('gemini', ['multi_turn', 'text', 'json']); // any order in
    const r = reg.register(adapter);
    expect(r).toEqual({ ok: true, provider: 'gemini', capabilities: ['text', 'json', 'multi_turn'] }); // canonical out
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.capabilities)).toBe(true);
    expect(reg.hasProvider('gemini')).toBe(true);
    expect(reg.size()).toBe(1);
    expect(reg.getDeclaration('gemini')).toEqual({ provider: 'gemini', capabilities: ['text', 'json', 'multi_turn'] });
    expect(reg.listProviders()).toEqual(['gemini']);
  });

  it('accepts every canonical provider EXCEPT none', () => {
    const reg = createExecutionRegistry();
    for (const p of AI_PROVIDERS) {
      const r = reg.register(makeAdapter(p, ['text']).adapter);
      if (p === 'none') {
        expect(r).toEqual({ ok: false, reason: 'provider_not_executable' });
      } else {
        expect(r.ok, p).toBe(true);
      }
    }
    expect(reg.size()).toBe(AI_PROVIDERS.length - 1);
  });

  it('rejects the none routing sentinel and stores NOTHING for it', () => {
    const reg = createExecutionRegistry();
    const r = reg.register(makeAdapter('none', ['text']).adapter);
    expect(r).toEqual({ ok: false, reason: 'provider_not_executable' });
    expect(Object.isFrozen(r)).toBe(true);
    expect(reg.size()).toBe(0);
    expect(reg.hasProvider('none')).toBe(false);
    expect(reg.getDeclaration('none')).toBe(null);
    expect(reg.listProviders()).toEqual([]);
    // Selection can never return it either.
    expect(reg.selectAdapter({ provider: 'none', capabilities: ['text'] }))
      .toEqual({ ok: false, reason: 'empty_registry' });
    reg.register(makeAdapter('gemini', ['text']).adapter);
    expect(reg.selectAdapter({ provider: 'none', capabilities: ['text'] }))
      .toEqual({ ok: false, reason: 'unknown_provider' });
  });

  it('rejects malformed adapters with invalid_adapter + the core shape reason', () => {
    const reg = createExecutionRegistry();
    expect(reg.register(null)).toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'adapter_not_object' });
    expect(reg.register([])).toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'adapter_not_object' });
    expect(reg.register({ ...makeAdapter().adapter, extra: 1 }))
      .toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'unknown_field' });
    expect(reg.register(makeAdapter('grok', ['text']).adapter))
      .toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'unknown_provider' });
    // Exact canonical spelling: normalizable variants are NOT accepted.
    expect(reg.register(makeAdapter(' Gemini ', ['text']).adapter))
      .toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'unknown_provider' });
    expect(reg.register(makeAdapter('gemini', ['text', 'evil']).adapter))
      .toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'invalid_capabilities' });
    expect(reg.register(makeAdapter('gemini', []).adapter))
      .toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'invalid_capabilities' });
    const noRun = makeAdapter().adapter;
    noRun.run = 'runGeminiText';
    expect(reg.register(noRun)).toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'missing_run' });
    expect(reg.size()).toBe(0);
  });

  it('rejects duplicate registration and keeps the ORIGINAL entry unchanged', () => {
    const reg = createExecutionRegistry();
    expect(reg.register(makeAdapter('gemini', ['text']).adapter).ok).toBe(true);
    const dup = reg.register(makeAdapter('gemini', ['text', 'json']).adapter);
    expect(dup).toEqual({ ok: false, reason: 'duplicate_provider' });
    expect(reg.size()).toBe(1);
    expect(reg.getDeclaration('gemini')).toEqual({ provider: 'gemini', capabilities: ['text'] });
    // The first snapshot still serves selection; json stays undeclared.
    expect(reg.selectAdapter({ provider: 'gemini', capabilities: ['json'] }))
      .toEqual({ ok: false, reason: 'capability_not_declared' });
  });
});

// ---------------------------------------------------------------
// Immutable internal snapshot
// ---------------------------------------------------------------
describe('immutable internal snapshot', () => {
  it('stores a frozen snapshot that is NOT the caller object', () => {
    const reg = createExecutionRegistry();
    const { adapter } = makeAdapter('gemini', ['text', 'json']);
    reg.register(adapter);
    const sel = reg.selectAdapter({ provider: 'gemini', capabilities: ['text'] });
    expect(sel.ok).toBe(true);
    expect(sel.adapter).not.toBe(adapter);
    expect(Object.isFrozen(sel)).toBe(true);
    expect(Object.isFrozen(sel.adapter)).toBe(true);
    expect(Object.isFrozen(sel.adapter.capabilities)).toBe(true);
    expect(Object.isFrozen(sel.capabilities)).toBe(true);
    // Snapshot carries the ORIGINAL function references, captured uninvoked.
    expect(sel.adapter.run).toBe(adapter.run);
    expect(sel.adapter.isConfigured).toBe(adapter.isConfigured);
    expect(sel.adapter.provider).toBe('gemini');
    // Snapshot capabilities are a DETACHED canonical array, not the caller's.
    expect(sel.adapter.capabilities).not.toBe(adapter.capabilities);
    expect(sel.adapter.capabilities).toEqual(['text', 'json']);
  });

  it('mutating the original adapter after registration has NO effect', () => {
    const reg = createExecutionRegistry();
    const { adapter } = makeAdapter('gemini', ['text', 'json']);
    const originalRun = adapter.run;
    reg.register(adapter);

    // Hostile post-registration mutations of the caller-owned object.
    adapter.provider = 'openai';
    adapter.capabilities.push('multi_turn');
    adapter.capabilities[0] = 'evil';
    delete adapter.run;
    adapter.isConfigured = () => { throw new Error('swapped'); };
    adapter.extra = 'garbage';

    expect(reg.getDeclaration('gemini')).toEqual({ provider: 'gemini', capabilities: ['text', 'json'] });
    expect(reg.hasProvider('openai')).toBe(false);
    const sel = reg.selectAdapter({ provider: 'gemini', capabilities: ['text', 'json'] });
    expect(sel.ok).toBe(true);
    expect(sel.adapter.capabilities).toEqual(['text', 'json']);
    expect(sel.adapter.run).toBe(originalRun); // captured reference survives delete
    expect(sel.adapter.provider).toBe('gemini');
  });

  it('never mutates, freezes, or extends the caller adapter', () => {
    const reg = createExecutionRegistry();
    const { adapter } = makeAdapter('gemini', ['text']);
    const keysBefore = Object.getOwnPropertyNames(adapter).sort();
    const capsRef = adapter.capabilities;
    reg.register(adapter);
    reg.selectAdapter({ provider: 'gemini', capabilities: ['text'] });
    expect(Object.getOwnPropertyNames(adapter).sort()).toEqual(keysBefore);
    expect(Object.isFrozen(adapter)).toBe(false);
    expect(Object.isFrozen(capsRef)).toBe(false);
    expect(adapter.provider).toBe('gemini');
    expect(adapter.capabilities).toEqual(['text']);
    expect(adapter.capabilities).toBe(capsRef); // same array, untouched
  });

  it('rejects an adapter whose descriptors change between validation and snapshot', () => {
    // A masquerading Proxy that answers the FIRST descriptor read for `run`
    // (shape validation) but denies the second (snapshot capture) must be
    // rejected, never half-trusted.
    const reg = createExecutionRegistry();
    let runReads = 0;
    const target = { provider: 'gemini', capabilities: ['text'], isConfigured() {}, run() {} };
    const evil = new Proxy(target, {
      getOwnPropertyDescriptor(t, k) {
        if (k === 'run') {
          runReads += 1;
          if (runReads > 1) return undefined;
        }
        return Reflect.getOwnPropertyDescriptor(t, k);
      },
    });
    const r = reg.register(evil);
    expect(r).toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'unstable_adapter' });
    expect(reg.size()).toBe(0);
  });
});

// ---------------------------------------------------------------
// No invocation — ever
// ---------------------------------------------------------------
describe('no adapter function invocation', () => {
  it('run/isConfigured are never called across the full method surface', () => {
    const reg = createExecutionRegistry();
    const gemini = makeAdapter('gemini', ['text', 'json']);
    const openai = makeAdapter('openai', ['text']);
    reg.register(gemini.adapter);
    reg.register(openai.adapter);
    reg.register(gemini.adapter); // duplicate path
    reg.hasProvider('gemini');
    reg.listProviders();
    reg.getDeclaration('gemini');
    reg.selectAdapter({ provider: 'gemini', capabilities: ['text'] });
    reg.selectAdapter({ provider: 'gemini', capabilities: ['multi_turn'] }); // failure path
    reg.selectAdapter({ provider: 'openai', capabilities: ['text'] });
    reg.size();
    expect(gemini.calls).toEqual({ run: 0, isConfigured: 0 });
    expect(openai.calls).toEqual({ run: 0, isConfigured: 0 });
  });
});

// ---------------------------------------------------------------
// Deterministic lookup and selection
// ---------------------------------------------------------------
describe('lookup and selection', () => {
  const seeded = () => {
    const reg = createExecutionRegistry();
    reg.register(makeAdapter('gemini', ['text', 'json', 'multi_turn']).adapter);
    reg.register(makeAdapter('openai', ['text', 'json']).adapter);
    return reg;
  };

  it('selects exactly one adapter with ALL requested capabilities', () => {
    const reg = seeded();
    const single = reg.selectAdapter({ provider: 'gemini', capabilities: ['text'] });
    expect(single.ok).toBe(true);
    expect(single.provider).toBe('gemini');
    const multi = reg.selectAdapter({ provider: 'gemini', capabilities: ['text', 'multi_turn'] });
    expect(multi.ok).toBe(true);
    expect(multi.capabilities).toEqual(['text', 'json', 'multi_turn']); // the DECLARED set
    expect(multi.adapter.provider).toBe('gemini');
  });

  it('ALL-required semantics: one undeclared capability fails the request', () => {
    const reg = seeded();
    expect(reg.selectAdapter({ provider: 'openai', capabilities: ['text', 'multi_turn'] }))
      .toEqual({ ok: false, reason: 'capability_not_declared' });
  });

  it('a capability failure never consults another registered provider (no fallback)', () => {
    const reg = createExecutionRegistry();
    const gemini = makeAdapter('gemini', ['text']); // no json
    const openai = makeAdapter('openai', ['text', 'json']); // json declared here
    reg.register(gemini.adapter);
    reg.register(openai.adapter);
    // gemini lacks json — the failure is final; openai (which declares json)
    // is never selected, consulted, or invoked in its place.
    const r = reg.selectAdapter({ provider: 'gemini', capabilities: ['json'] });
    expect(r).toEqual({ ok: false, reason: 'capability_not_declared' });
    expect(r.provider).toBe(undefined);
    expect(gemini.calls).toEqual({ run: 0, isConfigured: 0 });
    expect(openai.calls).toEqual({ run: 0, isConfigured: 0 });
  });

  it('empty registry and unknown provider return their exact fixed failures', () => {
    const empty = createExecutionRegistry();
    expect(empty.selectAdapter({ provider: 'gemini', capabilities: ['text'] }))
      .toEqual({ ok: false, reason: 'empty_registry' });
    const reg = seeded();
    expect(reg.selectAdapter({ provider: 'anthropic', capabilities: ['text'] }))
      .toEqual({ ok: false, reason: 'unknown_provider' });
    expect(reg.selectAdapter({ provider: 'grok', capabilities: ['text'] }))
      .toEqual({ ok: false, reason: 'unknown_provider' });
  });

  it('provider ids require exact canonical spelling (no normalization)', () => {
    const reg = seeded();
    for (const variant of ['GEMINI', ' gemini', 'gemini ', 'Gemini', 42, null, undefined, ['gemini']]) {
      expect(reg.selectAdapter({ provider: variant, capabilities: ['text'] }), String(variant))
        .toEqual({ ok: false, reason: 'unknown_provider' });
      expect(reg.hasProvider(variant), String(variant)).toBe(false);
      expect(reg.getDeclaration(variant), String(variant)).toBe(null);
    }
  });

  it('malformed requests and capability lists fail closed as unsafe_input', () => {
    const reg = seeded();
    // Request shape violations.
    for (const bad of [null, undefined, 'x', 42, [], new Date()]) {
      expect(reg.selectAdapter(bad), String(bad)).toEqual({ ok: false, reason: 'unsafe_input' });
    }
    expect(reg.selectAdapter({})).toEqual({ ok: false, reason: 'unsafe_input' }); // missing both
    expect(reg.selectAdapter({ provider: 'gemini' })).toEqual({ ok: false, reason: 'unsafe_input' });
    expect(reg.selectAdapter({ capabilities: ['text'] })).toEqual({ ok: false, reason: 'unsafe_input' });
    expect(reg.selectAdapter({ provider: 'gemini', capabilities: ['text'], extra: 1 }))
      .toEqual({ ok: false, reason: 'unsafe_input' });
    // Capability-list violations — unknown/duplicate POISON the whole request.
    expect(reg.selectAdapter({ provider: 'gemini', capabilities: ['text', 'evil'] }))
      .toEqual({ ok: false, reason: 'unsafe_input' });
    expect(reg.selectAdapter({ provider: 'gemini', capabilities: ['text', 'text'] }))
      .toEqual({ ok: false, reason: 'unsafe_input' });
    expect(reg.selectAdapter({ provider: 'gemini', capabilities: [] }))
      .toEqual({ ok: false, reason: 'unsafe_input' });
    expect(reg.selectAdapter({ provider: 'gemini', capabilities: 'text' }))
      .toEqual({ ok: false, reason: 'unsafe_input' });
    expect(reg.selectAdapter({ provider: 'gemini', capabilities: [42] }))
      .toEqual({ ok: false, reason: 'unsafe_input' });
  });

  it('listProviders uses AI_PROVIDERS vocabulary order minus none, regardless of registration order', () => {
    const a = createExecutionRegistry();
    const b = createExecutionRegistry();
    for (const p of ['replicate', 'gemini', 'openai']) a.register(makeAdapter(p, ['text']).adapter);
    for (const p of ['openai', 'replicate', 'gemini']) b.register(makeAdapter(p, ['text']).adapter);
    const expected = AI_PROVIDERS.filter((p) => ['openai', 'gemini', 'replicate'].includes(p));
    expect(a.listProviders()).toEqual(expected);
    expect(b.listProviders()).toEqual(expected);
    expect(expected).toEqual(['openai', 'gemini', 'replicate']); // vocabulary order, sanity-pinned
    // Fresh frozen array each call.
    const first = a.listProviders();
    expect(first).not.toBe(a.listProviders());
    expect(Object.isFrozen(first)).toBe(true);
    // `none` can never appear.
    expect(a.listProviders()).not.toContain('none');
  });

  it('identical call sequences on fresh registries produce deep-equal observable results', () => {
    const runSequence = () => {
      const reg = createExecutionRegistry();
      const results = [];
      results.push(reg.register(makeAdapter('gemini', ['json', 'text']).adapter));
      results.push(reg.register(makeAdapter('none', ['text']).adapter));
      results.push(reg.register(makeAdapter('gemini', ['text']).adapter));
      results.push(reg.listProviders());
      results.push(reg.getDeclaration('gemini'));
      const sel = reg.selectAdapter({ provider: 'gemini', capabilities: ['text', 'json'] });
      results.push({ ok: sel.ok, provider: sel.provider, capabilities: sel.capabilities });
      results.push(reg.selectAdapter({ provider: 'gemini', capabilities: ['multi_turn'] }));
      results.push(reg.size());
      return results;
    };
    expect(runSequence()).toEqual(runSequence());
  });
});

// ---------------------------------------------------------------
// Hostile inputs — accessors, dangerous keys, Proxies
// ---------------------------------------------------------------
describe('hostile inputs', () => {
  it('accessor properties are rejected without invoking getters', () => {
    const reg = createExecutionRegistry();
    let invoked = false;

    const hostileAdapter = { provider: 'gemini', capabilities: ['text'], isConfigured() {} };
    Object.defineProperty(hostileAdapter, 'run', {
      get() { invoked = true; throw new Error('boom'); },
      enumerable: true,
    });
    expect(() => reg.register(hostileAdapter)).not.toThrow();
    expect(reg.register(hostileAdapter)).toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'missing_run' });
    expect(invoked).toBe(false);

    reg.register(makeAdapter('gemini', ['text']).adapter);
    const hostileRequest = { provider: 'gemini' };
    Object.defineProperty(hostileRequest, 'capabilities', {
      get() { invoked = true; throw new Error('boom'); },
      enumerable: true,
    });
    expect(() => reg.selectAdapter(hostileRequest)).not.toThrow();
    expect(reg.selectAdapter(hostileRequest)).toEqual({ ok: false, reason: 'unsafe_input' });
    // Accessor ELEMENT inside the capability array.
    const arr = ['text'];
    Object.defineProperty(arr, 1, { get() { invoked = true; throw new Error('boom'); }, enumerable: true });
    expect(reg.selectAdapter({ provider: 'gemini', capabilities: arr }))
      .toEqual({ ok: false, reason: 'unsafe_input' });
    expect(invoked).toBe(false);
  });

  it('dangerous own keys are rejected', () => {
    const reg = createExecutionRegistry();
    const pollutedAdapter = JSON.parse('{"__proto__": {}, "provider": "gemini", "capabilities": ["text"]}');
    pollutedAdapter.isConfigured = () => {};
    pollutedAdapter.run = () => {};
    expect(reg.register(pollutedAdapter))
      .toEqual({ ok: false, reason: 'invalid_adapter', shapeReason: 'dangerous_key' });

    reg.register(makeAdapter('gemini', ['text']).adapter);
    const pollutedRequest = JSON.parse('{"__proto__": {}, "provider": "gemini", "capabilities": ["text"]}');
    expect(reg.selectAdapter(pollutedRequest)).toEqual({ ok: false, reason: 'unsafe_input' });
  });

  it('throwing and revoked Proxies fail closed everywhere, never throwing', () => {
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
    const hostiles = [
      ['throwing proxy', throwingProxy()],
      ['revoked proxy', revokedProxy()],
      ['throwing array proxy', throwingProxy([])],
      ['revoked array proxy', revokedProxy([])],
    ];
    const reg = createExecutionRegistry();
    reg.register(makeAdapter('gemini', ['text']).adapter);
    for (const [label, hostile] of hostiles) {
      expect(() => reg.register(hostile), label).not.toThrow();
      const r = reg.register(hostile);
      expect(r.ok, label).toBe(false);
      expect(['invalid_adapter', 'unsafe_input'], label).toContain(r.reason);

      expect(() => reg.hasProvider(hostile), label).not.toThrow();
      expect(reg.hasProvider(hostile), label).toBe(false);
      expect(() => reg.getDeclaration(hostile), label).not.toThrow();
      expect(reg.getDeclaration(hostile), label).toBe(null);

      expect(() => reg.selectAdapter(hostile), label).not.toThrow();
      expect(reg.selectAdapter(hostile), label).toEqual({ ok: false, reason: 'unsafe_input' });
      // Hostile capability list nested in an otherwise-valid request.
      expect(() => reg.selectAdapter({ provider: 'gemini', capabilities: hostile }), label).not.toThrow();
      expect(reg.selectAdapter({ provider: 'gemini', capabilities: hostile }), label)
        .toEqual({ ok: false, reason: 'unsafe_input' });
    }
    expect(reg.size()).toBe(1); // nothing hostile was ever stored
  });
});
