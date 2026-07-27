import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AI_ACTION_TYPES,
  AI_PROVIDERS,
  AI_MODELS,
  COST_TIERS,
  COST_TIER_BY_ACTION,
  DEFAULT_PROVIDER_BY_ACTION,
  API_PROVIDERS,
  buildAiRequest,
  selectProvider,
  estimateCost,
  normalizeActionType,
  normalizeProvider,
  providerSupportsAction,
  getProviderChain,
} from '../aiGateway.js';

const HOSTILE_INPUTS = [
  null, undefined, 42, NaN, {}, [], ['gemini'], { a: 1 },
  '', '   ', 'x'.repeat(10000), 'DROP TABLE', 'text.copy.extra',
];

describe('exports', () => {
  it('all public exports exist', () => {
    expect(Array.isArray(AI_ACTION_TYPES)).toBe(true);
    expect(Array.isArray(AI_PROVIDERS)).toBe(true);
    expect(typeof AI_MODELS).toBe('object');
    expect(Array.isArray(COST_TIERS)).toBe(true);
    expect(typeof DEFAULT_PROVIDER_BY_ACTION).toBe('object');
    expect(typeof buildAiRequest).toBe('function');
    expect(typeof selectProvider).toBe('function');
    expect(typeof estimateCost).toBe('function');
    expect(typeof normalizeActionType).toBe('function');
    expect(typeof normalizeProvider).toBe('function');
    expect(typeof providerSupportsAction).toBe('function');
    expect(typeof getProviderChain).toBe('function');
  });

  it('vocabularies are frozen (deep for tables)', () => {
    for (const vocab of [AI_ACTION_TYPES, AI_PROVIDERS, AI_MODELS, COST_TIERS,
      COST_TIER_BY_ACTION, DEFAULT_PROVIDER_BY_ACTION, API_PROVIDERS]) {
      expect(Object.isFrozen(vocab)).toBe(true);
    }
    for (const models of Object.values(AI_MODELS)) expect(Object.isFrozen(models)).toBe(true);
    for (const chain of Object.values(DEFAULT_PROVIDER_BY_ACTION)) expect(Object.isFrozen(chain)).toBe(true);
  });
});

describe('table completeness', () => {
  it('every action type has a provider chain', () => {
    for (const action of AI_ACTION_TYPES) {
      const chain = DEFAULT_PROVIDER_BY_ACTION[action];
      expect(Array.isArray(chain), action).toBe(true);
      expect(chain.length, action).toBeGreaterThan(0);
    }
    // and no extra routing keys outside the vocabulary
    for (const key of Object.keys(DEFAULT_PROVIDER_BY_ACTION)) {
      expect(AI_ACTION_TYPES.includes(key), key).toBe(true);
    }
  });

  it('every action type has a valid cost tier', () => {
    for (const action of AI_ACTION_TYPES) {
      expect(COST_TIERS.includes(COST_TIER_BY_ACTION[action]), action).toBe(true);
    }
  });

  it('every provider in every chain exists in AI_PROVIDERS', () => {
    for (const [action, chain] of Object.entries(DEFAULT_PROVIDER_BY_ACTION)) {
      for (const provider of chain) {
        expect(AI_PROVIDERS.includes(provider), `${action} → ${provider}`).toBe(true);
      }
      expect(new Set(chain).size, action).toBe(chain.length); // no duplicates in tables
    }
  });

  // CLOUD-ONLY (2026-07-27): there is no local partition. Every provider in the
  // vocabulary except the 'none' sentinel is an API provider, and no local
  // provider name may reappear anywhere in the contract.
  it('API_PROVIDERS is exactly AI_PROVIDERS minus the none sentinel', () => {
    expect([...API_PROVIDERS].sort()).toEqual(AI_PROVIDERS.filter((p) => p !== 'none').sort());
  });

  it('no local provider name exists in the vocabulary, the models or any chain', () => {
    const LOCAL = ['comfyui', 'ollama', 'fooocus', 'a1111', 'automatic1111'];
    for (const p of LOCAL) {
      expect(AI_PROVIDERS.includes(p), p).toBe(false);
      expect(Object.keys(AI_MODELS).includes(p), p).toBe(false);
      for (const [action, chain] of Object.entries(DEFAULT_PROVIDER_BY_ACTION)) {
        expect(chain.includes(p), `${action} -> ${p}`).toBe(false);
      }
      expect(normalizeProvider(p), p).toBe(null);
    }
  });

  it('every AI_MODELS key is a known provider with prefixed model ids', () => {
    for (const [provider, models] of Object.entries(AI_MODELS)) {
      expect(AI_PROVIDERS.includes(provider), provider).toBe(true);
      for (const id of Object.values(models)) {
        expect(id.startsWith(`${provider}:`), id).toBe(true);
      }
    }
  });
});

describe('normalizers', () => {
  it('accept canonical values, trim/lowercase, reject unknowns', () => {
    expect(normalizeActionType('text.copy')).toBe('text.copy');
    expect(normalizeActionType('  IMAGE.POSTER ')).toBe('image.poster');
    expect(normalizeActionType('not.an.action')).toBe(null);
    expect(normalizeProvider('gemini')).toBe('gemini');
    expect(normalizeProvider(' OpenAI ')).toBe('openai');
    expect(normalizeProvider('midjourney')).toBe(null);
  });

  it('never throw on hostile inputs', () => {
    for (const input of HOSTILE_INPUTS) {
      expect(() => normalizeActionType(input)).not.toThrow();
      expect(() => normalizeProvider(input)).not.toThrow();
      expect(normalizeActionType(input) === null || typeof normalizeActionType(input) === 'string').toBe(true);
    }
  });
});

describe('selectProvider', () => {
  it('returns the ordered default chain per action', () => {
    expect(selectProvider('text.copy')).toEqual(['gemini', 'openai', 'openrouter']);
    expect(selectProvider('image.poster')).toEqual(['openai', 'gemini', 'replicate', 'pollinations']);
    expect(selectProvider('video.short_ad')).toEqual(['runway', 'kling', 'luma', 'pika']);
  });

  it('filters to availableProviders', () => {
    expect(selectProvider('text.copy', { availableProviders: ['openrouter', 'openai'] }))
      .toEqual(['openai', 'openrouter']);
    expect(selectProvider('text.copy', { availableProviders: [] })).toEqual([]);
  });

  it('respects a valid preferredProvider (moved to front)', () => {
    expect(selectProvider('text.copy', { preferredProvider: 'openrouter' })[0]).toBe('openrouter');
    expect(selectProvider('text.copy', { preferredProvider: 'openrouter' }))
      .toEqual(['openrouter', 'gemini', 'openai']);
  });

  it('ignores an invalid or unsupported preferredProvider', () => {
    // runway does not support text.copy
    expect(selectProvider('text.copy', { preferredProvider: 'runway' }))
      .toEqual(['gemini', 'openai', 'openrouter']);
    // unavailable preferred provider is not resurrected
    expect(selectProvider('text.copy', { preferredProvider: 'gemini', availableProviders: ['openrouter'] }))
      .toEqual(['openrouter']);
    expect(selectProvider('text.copy', { preferredProvider: 'not-a-provider' }))
      .toEqual(['gemini', 'openai', 'openrouter']);
    // a RETIRED local provider is not a provider at all — it cannot be preferred
    expect(selectProvider('text.copy', { preferredProvider: 'ollama' }))
      .toEqual(['gemini', 'openai', 'openrouter']);
  });

  it('respects excludeProviders (even when preferred)', () => {
    expect(selectProvider('image.poster', { excludeProviders: ['openai'] }))
      .toEqual(['gemini', 'replicate', 'pollinations']);
    expect(selectProvider('image.poster', { excludeProviders: ['openai'], preferredProvider: 'openai' })[0])
      .toBe('gemini');
  });

  // The localFirst option is GONE with the providers it promoted. Passing it is
  // now an unknown key: it must be ignored, never resurrect a retired provider,
  // and never change the server-owned default order.
  it('a stale localFirst option is inert (order unchanged, nothing resurrected)', () => {
    for (const action of AI_ACTION_TYPES) {
      expect(selectProvider(action, { localFirst: true })).toEqual(selectProvider(action));
    }
  });

  it('apiFirst is order-preserving now that every provider is an API provider', () => {
    for (const action of AI_ACTION_TYPES) {
      expect(selectProvider(action, { apiFirst: true })).toEqual(selectProvider(action));
    }
    expect(selectProvider('video.short_ad', { apiFirst: true }))
      .toEqual(['runway', 'kling', 'luma', 'pika']);
  });

  it('never returns duplicates or providers outside AI_PROVIDERS', () => {
    for (const action of AI_ACTION_TYPES) {
      for (const opts of [{}, { apiFirst: true }, { preferredProvider: 'gemini' }]) {
        const chain = selectProvider(action, opts);
        expect(new Set(chain).size).toBe(chain.length);
        for (const p of chain) expect(AI_PROVIDERS.includes(p)).toBe(true);
      }
    }
  });

  it('unknown action returns [] and hostile inputs never throw', () => {
    expect(selectProvider('nope.nothing')).toEqual([]);
    for (const input of HOSTILE_INPUTS) {
      expect(() => selectProvider(input)).not.toThrow();
      expect(() => selectProvider('text.copy', input)).not.toThrow();
      expect(Array.isArray(selectProvider(input))).toBe(true);
    }
  });
});

describe('buildAiRequest', () => {
  it('returns the stable shape with first provider selected', () => {
    const req = buildAiRequest('text.copy', { prompt: 'שלום' });
    expect(req).toEqual({
      actionType: 'text.copy',
      payload: { prompt: 'שלום' },
      providerChain: ['gemini', 'openai', 'openrouter'],
      selectedProvider: 'gemini',
      costTier: 'low',
      requiresServer: true,
      requiresBudgetCheck: false,
      metadata: { source: 'ai-gateway', preference: null, apiFirst: false },
    });
  });

  it('unknown action returns a safe fallback', () => {
    const req = buildAiRequest('nope');
    expect(req.actionType).toBe(null);
    expect(req.providerChain).toEqual([]);
    expect(req.selectedProvider).toBe(null);
    expect(req.costTier).toBe('unknown');
    expect(req.requiresServer).toBe(false);
    expect(req.requiresBudgetCheck).toBe(false);
  });

  it('medium/medium_high/high actions require budget check; low does not', () => {
    expect(buildAiRequest('text.strategy').requiresBudgetCheck).toBe(true);
    expect(buildAiRequest('image.product_lock').requiresBudgetCheck).toBe(true);
    expect(buildAiRequest('video.short_ad').requiresBudgetCheck).toBe(true);
    expect(buildAiRequest('text.copy').requiresBudgetCheck).toBe(false);
    expect(buildAiRequest('studio.prompt_enhance').requiresBudgetCheck).toBe(false);
  });

  it('API providers with secrets require server; the keyless one does not', () => {
    expect(buildAiRequest('text.copy').requiresServer).toBe(true); // gemini
    // a retired local provider cannot be made available — it is not a provider
    const retired = buildAiRequest('text.copy', {}, { availableProviders: ['ollama'] });
    expect(retired.providerChain).toEqual([]);
    expect(retired.selectedProvider).toBe(null);
    // pollinations is a keyless API provider — no server needed
    const keyless = buildAiRequest('image.poster', {}, { availableProviders: ['pollinations'] });
    expect(keyless.selectedProvider).toBe('pollinations');
    expect(keyless.requiresServer).toBe(false);
  });

  it('metadata echoes preference flags; payload is copied, hostile inputs safe', () => {
    const payload = { p: 1 };
    const req = buildAiRequest('text.copy', payload, { preferredProvider: 'OpenAI ', apiFirst: true });
    expect(req.metadata).toEqual({ source: 'ai-gateway', preference: 'openai', apiFirst: true });
    expect(req.payload).toEqual(payload);
    expect(req.payload).not.toBe(payload);
    for (const input of HOSTILE_INPUTS) {
      expect(() => buildAiRequest(input, input, input)).not.toThrow();
    }
  });
});

describe('estimateCost', () => {
  it('is deterministic and ordered: low < medium < medium_high < high', () => {
    const low = estimateCost('text.copy', 'gemini').estimatedCost;
    const medium = estimateCost('image.poster', 'openai').estimatedCost;
    const mediumHigh = estimateCost('image.product_lock', 'openai').estimatedCost;
    const high = estimateCost('video.short_ad', 'runway').estimatedCost;
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(mediumHigh);
    expect(mediumHigh).toBeLessThan(high);
  });

  it('returns the stable non-exact shape', () => {
    const est = estimateCost('image.poster', 'openai', { count: 3 });
    expect(est.costTier).toBe('medium');
    expect(est.estimatedUnits).toBe(3);
    expect(typeof est.estimatedCost).toBe('number');
    expect(est.currency).toBe('USD');
    expect(est.isExact).toBe(false); // never a billing claim
  });

  it('unknown action → null cost, unknown tier', () => {
    const est = estimateCost('nope', 'openai');
    expect(est.costTier).toBe('unknown');
    expect(est.estimatedCost).toBe(null);
    expect(est.isExact).toBe(false);
  });

  it("only the 'none' sentinel estimates 0; hostile inputs never throw", () => {
    expect(estimateCost('image.poster', 'none').estimatedCost).toBe(0);
    // a retired local provider is unknown, so it gets the ordinary tier estimate
    expect(estimateCost('image.poster', 'comfyui').estimatedCost).toBe(0.03);
    for (const input of HOSTILE_INPUTS) {
      expect(() => estimateCost(input, input, input)).not.toThrow();
    }
    // invalid units fall back to 1
    expect(estimateCost('text.copy', 'gemini', { count: -5 }).estimatedUnits).toBe(1);
    expect(estimateCost('text.copy', 'gemini', { count: NaN }).estimatedUnits).toBe(1);
  });
});

describe('providerSupportsAction / getProviderChain', () => {
  it('reflect the routing table and never throw', () => {
    expect(providerSupportsAction('gemini', 'text.copy')).toBe(true);
    expect(providerSupportsAction('runway', 'text.copy')).toBe(false);
    expect(getProviderChain('text.copy')).toEqual(['gemini', 'openai', 'openrouter']);
    expect(getProviderChain('nope')).toEqual([]);
    for (const input of HOSTILE_INPUTS) {
      expect(() => providerSupportsAction(input, input)).not.toThrow();
      expect(() => getProviderChain(input)).not.toThrow();
    }
  });

  it('getProviderChain returns a copy, not the frozen table', () => {
    const chain = getProviderChain('text.copy');
    chain.push('hacked');
    expect(DEFAULT_PROVIDER_BY_ACTION['text.copy']).toEqual(['gemini', 'openai', 'openrouter']);
  });
});

describe('determinism', () => {
  it('repeated calls deep-equal', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(selectProvider('image.poster', { apiFirst: true }))
        .toEqual(selectProvider('image.poster', { apiFirst: true }));
      expect(buildAiRequest('video.short_ad', { brief: 'x' }, { apiFirst: true }))
        .toEqual(buildAiRequest('video.short_ad', { brief: 'x' }, { apiFirst: true }));
      expect(estimateCost('image.product_lock', 'openai', { count: 2 }))
        .toEqual(estimateCost('image.product_lock', 'openai', { count: 2 }));
    }
  });
});

describe('src/lib compatibility shim', () => {
  it('src/lib/aiGateway.js is only a re-export of the canonical _shared module', () => {
    const shim = readFileSync(fileURLToPath(new URL('../aiGateway.js', import.meta.url)), 'utf8');
    const codeOnly = shim
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => l.trim() && !/^\s*\/\//.test(l)).join('\n').trim();
    expect(codeOnly).toBe("export * from '../../supabase/functions/_shared/aiGateway.js';");
    // no routing logic leaked back into the shim
    for (const token of ['Object.freeze', 'function ', 'AI_ACTION_TYPES =', 'const ']) {
      expect(codeOnly.includes(token), token).toBe(false);
    }
  });
});

describe('purity · source-level (canonical _shared module)', () => {
  it('no runtime imports; no impure APIs, secrets, env access, or SDK/provider domains', () => {
    const code = readFileSync(fileURLToPath(new URL('../../../supabase/functions/_shared/aiGateway.js', import.meta.url)), 'utf8');
    const importLines = (code.match(/import[^]*?from\s*'[^']+';/g) || []).join('\n');
    expect(importLines).toBe(''); // zero runtime imports
    // executable lines only — comments may document the bans
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of [
      'fetch(', 'window.', 'document.', 'localStorage', 'sessionStorage',
      'Date.now(', 'Math.random(', 'process.env', 'import.meta.env', 'VITE_', 'Deno.env', 'Deno.',
      'XMLHttpRequest', 'WebSocket', 'dispatchEvent', 'CustomEvent',
      '@anthropic-ai', 'openai-node', '@google/generative-ai',
      'api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com',
      'openrouter.ai', 'replicate.com', 'https://', 'http://', '127.0.0.1', 'localhost',
    ]) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});
