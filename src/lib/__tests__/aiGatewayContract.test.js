import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AI_ACTION_TYPES, AI_PROVIDERS } from '../aiGateway.js';
import {
  AI_GATEWAY_EXECUTION_STATUS,
  AI_GATEWAY_ERROR_CODES,
  normalizeGatewayPayload,
  buildAiGatewayDecision,
  buildAiGatewayResponse,
} from '../aiGatewayContract.js';

const HOSTILE_INPUTS = [
  null, undefined, 42, NaN, {}, [], ['text.copy'], { a: 1 },
  '', '   ', 'x'.repeat(10000), 'DROP TABLE', 'text.copy.extra', true, false,
];

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('exports', () => {
  it('exposes the small explicit API', () => {
    expect(Object.isFrozen(AI_GATEWAY_EXECUTION_STATUS)).toBe(true);
    expect(Object.isFrozen(AI_GATEWAY_ERROR_CODES)).toBe(true);
    expect(AI_GATEWAY_EXECUTION_STATUS.NOT_IMPLEMENTED).toBe('not_implemented');
    expect(AI_GATEWAY_EXECUTION_STATUS.REJECTED).toBe('rejected');
    expect(typeof normalizeGatewayPayload).toBe('function');
    expect(typeof buildAiGatewayDecision).toBe('function');
    expect(typeof buildAiGatewayResponse).toBe('function');
  });
});

describe('valid actionType', () => {
  it('returns ok:true with routing + deferred execution', () => {
    const res = buildAiGatewayResponse({ actionType: 'text.copy', payload: { prompt: 'שלום' } });
    expect(res.ok).toBe(true);
    expect(res.actionType).toBe('text.copy');
    expect(res.execution.status).toBe(AI_GATEWAY_EXECUTION_STATUS.NOT_IMPLEMENTED);
    expect(res.routing.providerChain).toEqual(['gemini', 'openai', 'openrouter', 'ollama']);
    expect(res.routing.selectedProvider).toBe('gemini');
    expect(res.routing.costTier).toBe('low');
    expect(res.routing.requiresServer).toBe(true);
    expect(res.routing.requiresBudgetCheck).toBe(false);
    expect(res.routing.costEstimate.isExact).toBe(false);
    expect(res.request.payload).toEqual({ prompt: 'שלום' });
  });

  it('normalizes casing/whitespace on the action', () => {
    const res = buildAiGatewayResponse({ actionType: '  IMAGE.POSTER ' });
    expect(res.ok).toBe(true);
    expect(res.actionType).toBe('image.poster');
    expect(res.routing.requiresBudgetCheck).toBe(true); // medium tier
  });
});

describe('invalid / missing actionType', () => {
  it('missing actionType → rejected with invalid_action', () => {
    const res = buildAiGatewayResponse({ payload: { prompt: 'hi' } });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe(AI_GATEWAY_ERROR_CODES.INVALID_ACTION);
    expect(res.execution.status).toBe(AI_GATEWAY_EXECUTION_STATUS.REJECTED);
    expect(res.routing).toBeUndefined();
  });

  it('unknown actionType → rejected', () => {
    const res = buildAiGatewayResponse({ actionType: 'text.hack' });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe(AI_GATEWAY_ERROR_CODES.INVALID_ACTION);
  });

  it('non-object request → rejected, never throws', () => {
    for (const input of HOSTILE_INPUTS) {
      expect(() => buildAiGatewayResponse(input)).not.toThrow();
      const res = buildAiGatewayResponse(input);
      expect(res.ok).toBe(false);
      expect(res.execution.status).toBe(AI_GATEWAY_EXECUTION_STATUS.REJECTED);
    }
  });
});

describe('provider/model hints are never trusted execution authority', () => {
  it('strips provider/model/secret keys from payload', () => {
    expect(normalizeGatewayPayload({ provider: 'evil', model: 'x', apiKey: 'k', prompt: 'hi', brief: 'b' }))
      .toEqual({ prompt: 'hi', brief: 'b' });
    // stripping is case-insensitive on the key name
    expect(normalizeGatewayPayload({ Provider: 'evil', API_KEY: 'k', keep: 1 })).toEqual({ keep: 1 });
  });

  it('a payload-injected provider never appears in the routing chain', () => {
    const res = buildAiGatewayResponse({ actionType: 'text.copy', payload: { provider: 'evil-corp' } });
    expect(res.routing.selectedProvider).toBe('gemini');
    expect(res.routing.providerChain).not.toContain('evil-corp');
    expect(res.request.payload.provider).toBeUndefined();
  });

  it('an unsupported preferredProvider hint is ignored (chain unchanged)', () => {
    const res = buildAiGatewayResponse({
      actionType: 'text.copy',
      options: { preferredProvider: 'runway' }, // runway does not serve text.copy
    });
    expect(res.routing.selectedProvider).toBe('gemini');
    expect(res.routing.providerChain).not.toContain('runway');
  });

  it('a valid whitelisted preferredProvider reorders within the validated chain only', () => {
    const res = buildAiGatewayResponse({
      actionType: 'text.copy',
      options: { preferredProvider: 'ollama' },
    });
    expect(res.routing.selectedProvider).toBe('ollama');
    for (const p of res.routing.providerChain) expect(AI_PROVIDERS.includes(p)).toBe(true);
  });

  it('ignores unknown option keys and non-whitelisted hints', () => {
    const res = buildAiGatewayResponse({
      actionType: 'image.poster',
      options: { availableProviders: ['pollinations'], evil: true, apiKey: 'k' },
    });
    // availableProviders is NOT client-trusted in the stub → full default chain
    expect(res.routing.providerChain).toEqual(['openai', 'gemini', 'replicate', 'pollinations', 'comfyui']);
    expect(res.request.options.availableProviders).toBeUndefined();
    expect(res.request.options.apiKey).toBeUndefined();
  });
});

describe('all action types produce a safe decision', () => {
  it('every action type routes with a non-empty chain and deferred execution', () => {
    for (const action of AI_ACTION_TYPES) {
      const res = buildAiGatewayResponse({ actionType: action });
      expect(res.ok, action).toBe(true);
      expect(res.execution.status, action).toBe(AI_GATEWAY_EXECUTION_STATUS.NOT_IMPLEMENTED);
      expect(res.routing.providerChain.length, action).toBeGreaterThan(0);
      for (const p of res.routing.providerChain) expect(AI_PROVIDERS.includes(p), `${action}:${p}`).toBe(true);
    }
  });
});

describe('no provider execution, no billing, deferred seams', () => {
  it('marks usage logging and budget enforcement as deferred', () => {
    const res = buildAiGatewayResponse({ actionType: 'video.short_ad' });
    expect(res.usage).toEqual({ logging: 'deferred', budgetCheck: 'deferred' });
    expect(res.execution.status).toBe('not_implemented');
    // a routing DECISION only — never an executed result
    expect(res).not.toHaveProperty('result');
    expect(res.routing).not.toHaveProperty('output');
  });

  it('costEstimate is a non-exact planning figure only', () => {
    const res = buildAiGatewayResponse({ actionType: 'image.poster' });
    expect(res.routing.costEstimate.currency).toBe('USD');
    expect(res.routing.costEstimate.isExact).toBe(false);
  });
});

describe('determinism · no timestamps / ids / randomness', () => {
  it('repeated calls deep-equal for the same input', () => {
    const input = { actionType: 'image.product_lock', payload: { brief: 'x' }, options: { apiFirst: true } };
    for (let i = 0; i < 3; i += 1) {
      expect(buildAiGatewayResponse(input)).toEqual(buildAiGatewayResponse(input));
      expect(buildAiGatewayDecision(input)).toEqual(buildAiGatewayDecision(input));
    }
  });

  it('response carries no id/timestamp-shaped fields', () => {
    const res = buildAiGatewayResponse({ actionType: 'text.copy' });
    const flat = JSON.stringify(res);
    for (const banned of ['"id"', '"createdAt"', '"created_at"', '"timestamp"', '"ts"', '"uuid"', '"requestId"']) {
      expect(flat.includes(banned), banned).toBe(false);
    }
    expect(Object.keys(res).sort()).toEqual(['actionType', 'execution', 'ok', 'request', 'routing', 'usage']);
  });
});

describe('hostile payloads never throw', () => {
  it('any combination of hostile request/payload/options is safe', () => {
    for (const a of HOSTILE_INPUTS) {
      expect(() => normalizeGatewayPayload(a)).not.toThrow();
      expect(() => buildAiGatewayDecision(a)).not.toThrow();
      expect(() => buildAiGatewayResponse(a)).not.toThrow();
      expect(() => buildAiGatewayResponse({ actionType: 'text.copy', payload: a, options: a })).not.toThrow();
    }
  });
});

describe('src/lib compatibility shim', () => {
  it('src/lib/aiGatewayContract.js is only a re-export of the canonical _shared module', () => {
    const shim = read('../aiGatewayContract.js');
    const codeOnly = shim
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => l.trim() && !/^\s*\/\//.test(l)).join('\n').trim();
    expect(codeOnly).toBe("export * from '../../supabase/functions/_shared/aiGatewayContract.js';");
    for (const token of ['buildAiGatewayResponse =', 'function ', 'Object.freeze', 'const ']) {
      expect(codeOnly.includes(token), token).toBe(false);
    }
  });
});

describe('purity · contract source (canonical _shared module)', () => {
  it('imports only the pure router; no impure APIs, secrets, or provider domains', () => {
    const code = read('../../../supabase/functions/_shared/aiGatewayContract.js');
    const importLines = (code.match(/import[^]*?from\s*'[^']+';/g) || []).join('\n');
    expect(importLines).toMatch(/from '\.\/aiGateway\.js'/);
    for (const forbidden of ['gemini', 'geminiImage', 'jakePack', 'jakeAgent', 'Assistant', 'ImageStudio', 'src/lib']) {
      expect(importLines.includes(forbidden), forbidden).toBe(false);
    }
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of [
      'fetch(', 'window.', 'document.', 'localStorage', 'sessionStorage',
      'Date.now(', 'Math.random(', 'crypto.', 'process.env', 'import.meta', 'VITE_', 'Deno.env', 'Deno.',
      'api.openai.com', 'generativelanguage', 'api.anthropic.com', 'replicate.com', 'https://', 'http://',
    ]) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});

describe('guardrail · edge function shell', () => {
  it('is a thin shell: POST/OPTIONS/CORS, delegates to the contract, no providers/keys', () => {
    const code = read('../../../supabase/functions/ai-gateway/index.ts');
    // delegates to the pure contract via the native _shared sibling path
    expect(code).toMatch(/from '\.\.\/_shared\/aiGatewayContract\.js'/);
    // the old fragile climb into the app tree is gone (deployability fix)
    expect(code.includes('src/lib')).toBe(false);
    expect(code.includes('buildAiGatewayResponse')).toBe(true);
    // HTTP shell essentials
    expect(code.includes("'POST'") || code.includes('POST')).toBe(true);
    expect(code.includes('OPTIONS')).toBe(true);
    expect(code.includes('Access-Control-Allow-Origin')).toBe(true);
    expect(code.includes('405')).toBe(true);
    // no provider execution / secrets / frontend env (executable lines only —
    // comments legitimately mention "no provider secrets" etc.)
    const lower = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
      .toLowerCase();
    for (const banned of ['openai', 'gemini', 'anthropic', 'replicate', 'api.', '.googleapis.com', 'vite_', 'apikey', 'api_key', 'secret']) {
      expect(lower.includes(banned), banned).toBe(false);
    }
  });
});

describe('guardrail · frozen files carry no gateway wiring', () => {
  it('no do-not-touch file references the AI gateway (no wiring crept in)', () => {
    const frozen = [
      '../../components/ai/Assistant.jsx',
      '../gemini.js',
      '../geminiImage.js',
      '../../pages/ImageStudio.jsx',
      '../jakePack.js',
      '../jakeAgent.js',
    ];
    for (const rel of frozen) {
      const code = read(rel);
      expect(code.includes('aiGateway'), rel).toBe(false);
    }
  });
});
