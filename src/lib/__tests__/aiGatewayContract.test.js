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
  GEMINI_TEXT_ACTION_TYPES,
  GEMINI_EXECUTABLE_ACTION_TYPES,
  isGeminiTextAction,
  isGeminiExecutableAction,
  buildGeminiTextRequest,
  parseGeminiTextResponse,
  buildProviderNotConfiguredResponse,
  buildProviderErrorResponse,
  buildProviderSuccessResponse,
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

describe('gemini text · policy vocab', () => {
  it('text whitelist is the explicit six, frozen, all real actions', () => {
    expect(Object.isFrozen(GEMINI_TEXT_ACTION_TYPES)).toBe(true);
    expect([...GEMINI_TEXT_ACTION_TYPES].sort()).toEqual(
      ['crm.suggest_next_action', 'studio.prompt_enhance', 'text.campaign', 'text.copy', 'text.crm_message', 'text.strategy'],
    );
    for (const a of GEMINI_TEXT_ACTION_TYPES) expect(AI_ACTION_TYPES.includes(a), a).toBe(true);
  });

  it('executable subset = gemini-first text actions only, frozen', () => {
    expect(Object.isFrozen(GEMINI_EXECUTABLE_ACTION_TYPES)).toBe(true);
    expect([...GEMINI_EXECUTABLE_ACTION_TYPES].sort()).toEqual(
      ['crm.suggest_next_action', 'studio.prompt_enhance', 'text.copy', 'text.crm_message'],
    );
    for (const a of GEMINI_EXECUTABLE_ACTION_TYPES) expect(GEMINI_TEXT_ACTION_TYPES.includes(a), a).toBe(true);
    // anthropic-first text actions stay whitelisted-but-deferred
    expect(GEMINI_EXECUTABLE_ACTION_TYPES.includes('text.strategy')).toBe(false);
    expect(GEMINI_EXECUTABLE_ACTION_TYPES.includes('text.campaign')).toBe(false);
  });

  it('predicates classify text / executable / deferred and never throw', () => {
    expect(isGeminiTextAction('text.strategy')).toBe(true);
    expect(isGeminiExecutableAction('text.strategy')).toBe(false); // anthropic-first → deferred
    expect(isGeminiExecutableAction('text.copy')).toBe(true);
    expect(isGeminiTextAction('image.poster')).toBe(false);
    expect(isGeminiExecutableAction('image.poster')).toBe(false);
    for (const input of HOSTILE_INPUTS) {
      expect(() => isGeminiTextAction(input)).not.toThrow();
      expect(() => isGeminiExecutableAction(input)).not.toThrow();
      expect(isGeminiTextAction(input)).toBe(false);
      expect(isGeminiExecutableAction(input)).toBe(false);
    }
  });
});

describe('gemini text · execution eligibility (pure pieces of the shell rule)', () => {
  it('text.copy is executable and its decision routes to gemini', () => {
    const d = buildAiGatewayDecision({ actionType: 'text.copy' });
    expect(d.routing.selectedProvider).toBe('gemini');
    expect(isGeminiExecutableAction(d.actionType)).toBe(true);
  });

  it('text.strategy is whitelisted but not executable (routes to anthropic)', () => {
    const d = buildAiGatewayDecision({ actionType: 'text.strategy' });
    expect(d.routing.selectedProvider).toBe('anthropic');
    expect(isGeminiTextAction(d.actionType)).toBe(true);
    expect(isGeminiExecutableAction(d.actionType)).toBe(false);
  });

  it('image/vision/video actions are never gemini-executable', () => {
    for (const a of ['image.poster', 'image.product_lock', 'vision.analyze_reference', 'video.short_ad', 'video.product_demo']) {
      expect(isGeminiExecutableAction(a), a).toBe(false);
    }
  });
});

describe('gemini text · request builder (pure)', () => {
  it('builds a minimal, broadly-compatible REST body (no thinkingConfig)', () => {
    const r = buildGeminiTextRequest({ prompt: 'שלום' });
    expect(r.ok).toBe(true);
    expect(r.body.contents).toEqual([{ role: 'user', parts: [{ text: 'שלום' }] }]);
    expect(typeof r.body.generationConfig.temperature).toBe('number');
    expect(typeof r.body.generationConfig.maxOutputTokens).toBe('number');
    expect(r.body.systemInstruction).toBeUndefined();
  });

  it('omits thinkingConfig/thinkingBudget entirely (the 2.0-model 502 fix)', () => {
    // regression guard: this field is Gemini 2.5-only and 400s on gemini-2.0-flash
    for (const payload of [{ prompt: 'x' }, { prompt: 'y', system: 'z' }]) {
      const r = buildGeminiTextRequest(payload);
      expect('thinkingConfig' in r.body.generationConfig).toBe(false);
      expect(JSON.stringify(r.body).includes('thinkingConfig')).toBe(false);
      expect(JSON.stringify(r.body).includes('thinkingBudget')).toBe(false);
    }
  });

  it('adds systemInstruction when system is provided and clamps temperature', () => {
    const r = buildGeminiTextRequest({ prompt: 'hi', system: 'Be brief', temperature: 99 });
    expect(r.body.systemInstruction).toEqual({ parts: [{ text: 'Be brief' }] });
    expect(r.body.generationConfig.temperature).toBe(2); // clamped to max
  });

  it('missing/empty prompt → invalid_payload; hostile input never throws', () => {
    expect(buildGeminiTextRequest({}).ok).toBe(false);
    expect(buildGeminiTextRequest({}).error.code).toBe('invalid_payload');
    expect(buildGeminiTextRequest({ prompt: '   ' }).ok).toBe(false);
    for (const input of HOSTILE_INPUTS) {
      expect(() => buildGeminiTextRequest(input)).not.toThrow();
    }
  });

  it('strips smuggled provider/model/secret keys — only prompt text reaches the body', () => {
    const r = buildGeminiTextRequest({ prompt: 'keepme', apiKey: 'k', provider: 'evil-corp', model: 'm' });
    const flat = JSON.stringify(r.body);
    expect(flat.includes('apiKey')).toBe(false);
    expect(flat.includes('evil-corp')).toBe(false);
    expect(flat.includes('keepme')).toBe(true);
  });
});

describe('gemini text · response parser (pure)', () => {
  it('joins candidate part texts', () => {
    const json = { candidates: [{ content: { parts: [{ text: 'Hello ' }, { text: 'world' }] } }] };
    expect(parseGeminiTextResponse(json)).toBe('Hello world');
  });

  it('empty / malformed / hostile → null, never throws', () => {
    expect(parseGeminiTextResponse({ candidates: [] })).toBe(null);
    expect(parseGeminiTextResponse({ candidates: [{ content: { parts: [] } }] })).toBe(null);
    for (const input of HOSTILE_INPUTS) {
      expect(() => parseGeminiTextResponse(input)).not.toThrow();
      expect(parseGeminiTextResponse(input)).toBe(null);
    }
  });
});

describe('gemini text · provider response builders (pure, secret-free)', () => {
  const decision = buildAiGatewayDecision({ actionType: 'text.copy', payload: { prompt: 'hi' } });

  it('provider_not_configured shape is stable', () => {
    expect(buildProviderNotConfiguredResponse(decision)).toEqual({
      ok: false,
      actionType: 'text.copy',
      error: { code: 'provider_not_configured', message: 'Gemini provider is not configured.' },
      execution: { status: 'provider_not_configured' },
    });
  });

  it('provider_error shape is stable and generic (no upstream/key leak)', () => {
    expect(buildProviderErrorResponse(decision)).toEqual({
      ok: false,
      actionType: 'text.copy',
      error: { code: 'provider_error', message: 'Gemini provider request failed.' },
      execution: { status: 'provider_error' },
    });
  });

  it('success shape: provider gemini, completed, result text, deferred usage', () => {
    const r = buildProviderSuccessResponse(decision, 'the output');
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('gemini');
    expect(r.execution).toEqual({ status: 'completed' });
    expect(r.result).toEqual({ text: 'the output' });
    expect(r.usage).toEqual({ logging: 'deferred', budgetCheck: 'deferred' });
    expect(r.routing.selectedProvider).toBe('gemini');
  });

  it('builders never throw on null/undefined decision', () => {
    expect(() => buildProviderNotConfiguredResponse(null)).not.toThrow();
    expect(buildProviderNotConfiguredResponse(null).actionType).toBe(null);
    expect(() => buildProviderErrorResponse(undefined)).not.toThrow();
  });
});

describe('guardrail · edge function shell', () => {
  it('delegates to contract + gemini provider; holds no key/secret/fetch/env itself', () => {
    const code = read('../../../supabase/functions/ai-gateway/index.ts');
    expect(code).toMatch(/from '\.\.\/_shared\/aiGatewayContract\.js'/);
    expect(code).toMatch(/from '\.\/geminiProvider\.ts'/);
    expect(code.includes('src/lib')).toBe(false);
    expect(code.includes('buildAiGatewayResponse')).toBe(true);
    expect(code.includes('runGeminiText')).toBe(true);
    // HTTP shell essentials
    expect(code.includes('POST')).toBe(true);
    expect(code.includes('OPTIONS')).toBe(true);
    expect(code.includes('Access-Control-Allow-Origin')).toBe(true);
    expect(code.includes('405')).toBe(true);
    // the key, fetch, and env live ONLY in geminiProvider.ts (executable lines)
    const lower = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
      .toLowerCase();
    for (const banned of ['vite_', 'gemini_api_key', 'x-goog-api-key', '.googleapis.com', 'generativelanguage', 'api_key', 'apikey', 'deno.env', 'fetch(', 'import.meta']) {
      expect(lower.includes(banned.toLowerCase()), banned).toBe(false);
    }
  });
});

describe('guardrail · gemini provider (server-only, the only impure file)', () => {
  it('reads the key via Deno.env, isolates fetch/domain, leaks no VITE_/hardcoded key', () => {
    const code = read('../../../supabase/functions/ai-gateway/geminiProvider.ts');
    // key read exclusively from server-side Deno.env
    expect(code).toMatch(/Deno\.env\.get\('GEMINI_API_KEY'\)/);
    // shaping delegated to the pure contract helpers
    expect(code).toMatch(/from '\.\.\/_shared\/aiGatewayContract\.js'/);
    // fetch + provider domain are ALLOWED to live here (and only here)
    expect(code.includes('fetch(')).toBe(true);
    expect(code.includes('generativelanguage.googleapis.com')).toBe(true);
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    // never a frontend env or a hardcoded Google key (AIza… prefix)
    for (const banned of ['VITE_', 'import.meta', 'process.env', 'AIza']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
    // the raw key is never passed into a response builder
    expect(codeOnly).not.toMatch(/build\w+Response\([^)]*apiKey/);
  });

  it('logs safe upstream diagnostics but never the key / auth / request body', () => {
    const code = read('../../../supabase/functions/ai-gateway/geminiProvider.ts');
    // diagnostics exist (so a live 502 is explainable from Supabase logs)
    expect(code.includes('console.error')).toBe(true);
    expect(code.includes('status: res.status')).toBe(true);
    // every console.* line must be secret-free: no key, auth header, or built body
    const consoleLines = code.split('\n').filter((l) => /console\./.test(l));
    expect(consoleLines.length).toBeGreaterThan(0);
    for (const line of consoleLines) {
      for (const banned of ['apiKey', 'GEMINI_API_KEY', 'Authorization', 'X-goog', 'built.body', 'parts']) {
        expect(line.includes(banned), `console leaks ${banned}`).toBe(false);
      }
    }
  });

  it('model config: current default, GEMINI_MODEL override authoritative, no silent fallback', () => {
    const code = read('../../../supabase/functions/ai-gateway/geminiProvider.ts');
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    // stale default is gone from executable code (comments may still reference it historically)
    expect(codeOnly.includes('gemini-2.0-flash')).toBe(false);
    // new safer default
    expect(codeOnly).toMatch(/DEFAULT_GEMINI_MODEL\s*=\s*'gemini-2\.5-flash'/);
    // GEMINI_MODEL env override is authoritative and server-side only
    expect(code).toMatch(/Deno\.env\.get\('GEMINI_MODEL'\)/);
    expect(codeOnly.includes('VITE_GEMINI_MODEL')).toBe(false);
    // no runtime model-substitution / retry chain (single fetch, fail-closed)
    expect((codeOnly.match(/fetch\(/g) || []).length).toBe(1);
  });
});

describe('guardrail · gitignore + deploy docs', () => {
  it('.gitignore ignores supabase/.temp/', () => {
    expect(read('../../../.gitignore').includes('supabase/.temp/')).toBe(true);
  });

  it('deploy doc documents secret/redeploy/smoke + GEMINI_MODEL without a real key', () => {
    const doc = read('../../../docs/AI_GATEWAY_DEPLOY.md');
    expect(doc.includes('supabase secrets set GEMINI_API_KEY')).toBe(true);
    expect(doc.includes('supabase functions deploy ai-gateway')).toBe(true);
    expect(doc.includes('provider_not_configured')).toBe(true);
    expect(doc.includes('GEMINI_MODEL')).toBe(true);
    expect(doc.includes('gemini-2.5-flash')).toBe(true);
    expect(doc.includes('AIza')).toBe(false); // no real Google key committed
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
