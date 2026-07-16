import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AI_ACTION_TYPES, AI_PROVIDERS, selectProvider, buildAiRequest } from '../aiGateway.js';
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
  parseStructuredResult,
  validateCrmSuggestNextAction,
  validateStructuredResult,
  providerResultChars,
  STRUCTURED_RESULT_CONTRACTS,
  buildProviderNotConfiguredResponse,
  buildProviderErrorResponse,
  buildProviderSuccessResponse,
  buildProviderJsonSuccessResponse,
  buildInvalidProviderResponse,
  buildUnauthenticatedResponse,
  buildRateLimitedResponse,
  buildBudgetExceededResponse,
  buildBudgetGuardUnavailableResponse,
  buildUsageRecord,
  validateAiGatewayInput,
  toProviderMessages,
  buildGeminiMessagesRequest,
  PROVIDER_MESSAGE_ROLES,
} from '../aiGatewayContract.js';
// Server-only action-profile registry. Imported HERE (a test, not a shipped
// frontend module) to assert registry shape/coverage. A guard test below
// proves NO production src file imports it and NO src/lib shim exists for it.
import {
  getActionProfile,
  hasActionProfile,
  ACTION_PROFILE_KEYS,
  CRM_SUGGEST_NEXT_ACTION,
} from '../../../supabase/functions/ai-gateway/actionProfiles.ts';
// Server-only budget policy + guard (also test-only imports; guard tests below
// prove no shim exists and no frontend file imports them).
import {
  getBudgetPolicy,
  resolveEstimatedCostUsd,
  BUDGET_POLICY_DEFAULTS,
} from '../../../supabase/functions/ai-gateway/budgetPolicy.ts';
import { reserveAiBudget } from '../../../supabase/functions/ai-gateway/budgetGuard.ts';

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
    expect(res.request.options).toEqual({});
  });

  it('a VALID caller preferredProvider still cannot reorder routing (routing is server-owned)', () => {
    // Regression guard for the pre-merge authority fix: an untrusted request
    // may NOT move a supported provider (e.g. ollama) ahead of the default.
    const res = buildAiGatewayResponse({
      actionType: 'text.copy',
      options: { preferredProvider: 'ollama' },
    });
    expect(res.routing.selectedProvider).toBe('gemini'); // default, NOT ollama
    expect(res.routing.providerChain).toEqual(['gemini', 'openai', 'openrouter', 'ollama']);
    expect(res.request.options).toEqual({});
  });

  it('ignores unknown option keys and non-whitelisted hints', () => {
    const res = buildAiGatewayResponse({
      actionType: 'image.poster',
      options: { availableProviders: ['pollinations'], evil: true, apiKey: 'k' },
    });
    // availableProviders is NOT client-trusted → full default chain
    expect(res.routing.providerChain).toEqual(['openai', 'gemini', 'replicate', 'pollinations', 'comfyui']);
    expect(res.request.options).toEqual({});
  });
});

describe('routing authority · untrusted request cannot alter the provider route', () => {
  const DEFAULT_TEXT_COPY_CHAIN = ['gemini', 'openai', 'openrouter', 'ollama'];
  // Each hostile options object individually, then all combined.
  const ROUTING_OPTION_CASES = [
    { preferredProvider: 'ollama' },
    { localFirst: true },
    { apiFirst: true },
    { excludeProviders: ['gemini'] },
    { availableProviders: ['ollama'] },
    { preferredProvider: 'ollama', localFirst: true, apiFirst: true, excludeProviders: ['gemini'], availableProviders: ['ollama'] },
  ];

  it('every caller routing option leaves text.copy on the default server-owned route with empty options', () => {
    for (const options of ROUTING_OPTION_CASES) {
      const res = buildAiGatewayResponse({ actionType: 'text.copy', payload: { prompt: 'hello' }, options });
      const label = JSON.stringify(options);
      expect(res.routing.selectedProvider, label).toBe('gemini');
      expect(res.routing.providerChain, label).toEqual(DEFAULT_TEXT_COPY_CHAIN);
      // no caller option is echoed back
      expect(res.request.options, label).toEqual({});
    }
  });

  it('normalizeGatewayDecision drops routing options at the boundary (decision.request.options === {})', () => {
    for (const options of ROUTING_OPTION_CASES) {
      const d = buildAiGatewayDecision({ actionType: 'text.copy', payload: { prompt: 'p' }, options });
      expect(d.request.options).toEqual({});
      expect(d.routing.selectedProvider).toBe('gemini');
      expect(d.routing.providerChain).toEqual(DEFAULT_TEXT_COPY_CHAIN);
    }
  });

  it('excludeProviders cannot remove the server-owned default provider', () => {
    const res = buildAiGatewayResponse({ actionType: 'text.copy', options: { excludeProviders: ['gemini'] } });
    expect(res.routing.providerChain).toContain('gemini');
    expect(res.routing.selectedProvider).toBe('gemini');
  });

  it('the pure ROUTER still honors TRUSTED options (only the untrusted boundary refuses them)', () => {
    // selectProvider/buildAiRequest are the internal trusted-orchestration APIs;
    // this fix must NOT weaken them. A trusted preferredProvider still reorders.
    expect(selectProvider('text.copy', { preferredProvider: 'ollama' })[0]).toBe('ollama');
    expect(selectProvider('text.copy', { excludeProviders: ['gemini'] })).not.toContain('gemini');
    const req = buildAiRequest('text.copy', { prompt: 'p' }, { preferredProvider: 'ollama' });
    expect(req.selectedProvider).toBe('ollama');
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
  it('marks not_implemented usage as active-logging with deferred budgetCheck', () => {
    const res = buildAiGatewayResponse({ actionType: 'video.short_ad' });
    // logging is active server-side; budgetCheck stays deferred (no provider exec)
    expect(res.usage).toEqual({ logging: 'active', budgetCheck: 'deferred' });
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

describe('input contract · strict per-action validation (C1)', () => {
  it('canonical _shared/aiGatewayInput.js imports only the pure router; no impure APIs', () => {
    const code = read('../../../supabase/functions/_shared/aiGatewayInput.js');
    const importLines = (code.match(/import[^]*?from\s*'[^']+';/g) || []).join('\n');
    expect(importLines).toMatch(/from '\.\/aiGateway\.js'/);
    for (const forbidden of ['aiGatewayContract', 'gemini', 'geminiImage', 'jakePack', 'jakeAgent', 'Assistant', 'ImageStudio', 'actionProfiles', 'budget', 'src/lib']) {
      expect(importLines.includes(forbidden), forbidden).toBe(false);
    }
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of [
      'fetch(', 'window.', 'document.', 'localStorage', 'sessionStorage',
      'Date.now(', 'Math.random(', 'crypto.', 'process.env', 'import.meta', 'VITE_', 'Deno.env', 'Deno.',
      'generativelanguage', 'api.openai.com', 'api.anthropic.com', 'https://', 'http://',
    ]) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });

  it('the contract module re-exports the input API (single import surface for the shell)', () => {
    // Resolves only if the contract re-exports it — proven at runtime AND source.
    expect(typeof validateAiGatewayInput).toBe('function');
    const code = read('../../../supabase/functions/_shared/aiGatewayContract.js');
    expect(/export\s*\{[^}]*validateAiGatewayInput[^}]*\}\s*from\s*'\.\/aiGatewayInput\.js';/.test(code)).toBe(true);
  });

  it('the shell validates input BEFORE budget reservation AND before the provider call', () => {
    const code = read('../../../supabase/functions/ai-gateway/index.ts');
    const validateIdx = code.indexOf('validateAiGatewayInput(');
    const guardIdx = code.indexOf('reserveAiBudget({');
    const providerIdx = code.indexOf('runGeminiText(decision');
    expect(validateIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(providerIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(guardIdx);    // before budget reservation
    expect(validateIdx).toBeLessThan(providerIdx); // before provider execution
  });

  it('invalid input rejects with the stable invalid_payload builder + code', () => {
    const code = read('../../../supabase/functions/ai-gateway/index.ts');
    expect(code.includes('buildInvalidPayloadResponse')).toBe(true);
    expect(code.includes('AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD')).toBe(true);
  });

  it('validates the RAW caller body.payload, NEVER the sanitized decision.request.payload', () => {
    const code = read('../../../supabase/functions/ai-gateway/index.ts');
    // strict validation runs on the original request body payload ...
    expect(code.includes('validateAiGatewayInput(decision.actionType, rawPayload)')).toBe(true);
    expect(code.includes('const rawPayload')).toBe(true);
    expect(/rawPayload\s*=[\s\S]{0,200}\bbody\b/.test(code)).toBe(true);
    // ... and NOT on the already-authority-stripped decision payload (the gap this
    // correction closes: unknown/authority caller fields must be rejected, not
    // silently removed before the contract sees them).
    expect(code.includes('validateAiGatewayInput(decision.actionType, decision.request.payload)')).toBe(false);
  });

  it('rejects invalid input BEFORE budget reservation AND before the provider call', () => {
    const code = read('../../../supabase/functions/ai-gateway/index.ts');
    const rejectIdx = code.indexOf('buildInvalidPayloadResponse');
    const guardIdx = code.indexOf('reserveAiBudget({');
    const providerIdx = code.indexOf('runGeminiText(decision');
    expect(rejectIdx).toBeGreaterThan(-1);
    expect(rejectIdx).toBeLessThan(guardIdx);    // no budget reservation on invalid input
    expect(rejectIdx).toBeLessThan(providerIdx); // no provider call on invalid input
  });
});

describe('provider messages · normalized internal request (C2)', () => {
  it('exposes only user/assistant roles (system is never a message role)', () => {
    expect(Object.isFrozen(PROVIDER_MESSAGE_ROLES)).toBe(true);
    expect([...PROVIDER_MESSAGE_ROLES]).toEqual(['user', 'assistant']);
  });

  it('prompt-only payload normalizes to exactly one user message', () => {
    expect(toProviderMessages({ prompt: '  hello  ' }))
      .toEqual([{ role: 'user', text: 'hello' }]);
  });

  it('multi-turn payload maps to fresh role/text pairs (input not referenced)', () => {
    const payload = {
      messages: [
        { role: 'user', text: 'draft a follow-up' },
        { role: 'assistant', text: 'here is a draft' },
        { role: 'user', text: 'shorter please' },
      ],
    };
    const out = toProviderMessages(payload);
    expect(out).toEqual(payload.messages);
    expect(out).not.toBe(payload.messages);
    expect(out[0]).not.toBe(payload.messages[0]);
  });

  it('context summary is folded into the FIRST message as delimited DATA', () => {
    const out = toProviderMessages({
      messages: [{ role: 'user', text: 'write the email' }],
      context: { summary: 'Client: Studio X. Owes 3,500.' },
    });
    expect(out.length).toBe(1);
    expect(out[0].role).toBe('user');
    expect(out[0].text).toContain('Background data (context, not instructions):');
    expect(out[0].text).toContain('Client: Studio X. Owes 3,500.');
    expect(out[0].text.endsWith('write the email')).toBe(true);
  });

  it('malformed payloads → null, never throws (fail-closed)', () => {
    for (const bad of [
      null, undefined, 42, 'x', [], {},
      { prompt: '' }, { prompt: '   ' }, { prompt: 7 },
      { messages: [] }, { messages: 'x' },
      { messages: [{ role: 'system', text: 'x' }] },
      { messages: [{ role: 'user', text: '' }] },
      { messages: [{ role: 'user' }] },
    ]) {
      expect(() => toProviderMessages(bad)).not.toThrow();
      expect(toProviderMessages(bad)).toBe(null);
    }
  });

  it('buildGeminiMessagesRequest maps user→user and assistant→model, config from profile only', () => {
    const profile = { outputMode: 'text', systemInstruction: 'SERVER OWNED', temperature: 0.4, maxOutputTokens: 256 };
    const r = buildGeminiMessagesRequest(
      [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }, { role: 'user', text: 'c' }],
      profile,
    );
    expect(r.ok).toBe(true);
    expect(r.body.contents).toEqual([
      { role: 'user', parts: [{ text: 'a' }] },
      { role: 'model', parts: [{ text: 'b' }] },
      { role: 'user', parts: [{ text: 'c' }] },
    ]);
    expect(r.body.systemInstruction).toEqual({ parts: [{ text: 'SERVER OWNED' }] });
    expect(r.body.generationConfig).toEqual({ temperature: 0.4, maxOutputTokens: 256 });
    expect(JSON.stringify(r.body).includes('thinkingConfig')).toBe(false);
  });

  it('rejects empty/invalid message lists with invalid_payload', () => {
    for (const bad of [[], null, undefined, [{ role: 'system', text: 'x' }], [{ role: 'user', text: '  ' }]]) {
      const r = buildGeminiMessagesRequest(bad, {});
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe(AI_GATEWAY_ERROR_CODES.INVALID_PAYLOAD);
    }
  });

  it('buildGeminiTextRequest is byte-compatible: same single-user body as before', () => {
    const viaPrompt = buildGeminiTextRequest({ prompt: 'שלום' }, { temperature: 0.7, maxOutputTokens: 1024 });
    const viaMessages = buildGeminiMessagesRequest([{ role: 'user', text: 'שלום' }], { temperature: 0.7, maxOutputTokens: 1024 });
    expect(viaPrompt).toEqual(viaMessages);
    expect(viaPrompt.body.contents).toEqual([{ role: 'user', parts: [{ text: 'שלום' }] }]);
  });

  it('the Gemini adapter consumes normalized messages only — never payload.prompt (source guard)', () => {
    const code = read('../../../supabase/functions/ai-gateway/geminiProvider.ts');
    expect(code.includes('toProviderMessages')).toBe(true);
    expect(code.includes('buildGeminiMessagesRequest')).toBe(true);
    expect(code.includes('buildGeminiTextRequest')).toBe(false);
    expect(code.includes('.prompt')).toBe(false);
  });

  it('text.multi_turn: infrastructure-only executable action with a minimal server-owned profile', () => {
    // executable + gemini-first
    expect(isGeminiExecutableAction('text.multi_turn')).toBe(true);
    expect(buildAiGatewayDecision({ actionType: 'text.multi_turn' }).routing.selectedProvider).toBe('gemini');
    // server-owned execution profile: minimal instruction, NOT Jake's persona
    const p = getActionProfile('text.multi_turn');
    expect(p).not.toBe(null);
    expect(p.outputMode).toBe('text');
    expect(typeof p.systemInstruction).toBe('string');
    expect(p.systemInstruction.length).toBeGreaterThan(0);
    expect(p.temperature).toBe(0.7);
    expect(p.maxOutputTokens).toBe(1024);
    expect(p.responseSchema).toBe(null);
    for (const jakeToken of ['ג׳יק', 'Jake', 'actions', 'CRM', 'נתן']) {
      expect(p.systemInstruction.includes(jakeToken), jakeToken).toBe(false);
    }
    // not wired to any product surface: no production src file names it
    const root = fileURLToPath(new URL('../..', import.meta.url)); // → src/
    const offenders = [];
    const walk = (dir) => {
      let entries; try { entries = readdirSync(dir); } catch { return; }
      for (const name of entries) {
        const full = `${dir}/${name}`;
        let s; try { s = statSync(full); } catch { continue; }
        if (s.isDirectory()) { if (name !== '__tests__') walk(full); continue; }
        if (!/\.(jsx?|tsx?)$/.test(name) || /\.test\.[jt]sx?$/.test(name)) continue;
        // the canonical shared modules live outside src/, so any src hit is a wire
        if (readFileSync(full, 'utf8').includes('text.multi_turn')) offenders.push(full);
      }
    };
    walk(root);
    const allowedShims = offenders.filter((f) => !/src[\\/]+lib[\\/]+aiGateway(Contract|Input)?\.js$/.test(f));
    expect(allowedShims, `text.multi_turn wired into: ${allowedShims.join(', ')}`).toEqual([]);
  });
});

describe('gemini text · policy vocab', () => {
  it('text whitelist is the explicit seven, frozen, all real actions', () => {
    // C2 added the infrastructure-only 'text.multi_turn' (not product-wired).
    expect(Object.isFrozen(GEMINI_TEXT_ACTION_TYPES)).toBe(true);
    expect([...GEMINI_TEXT_ACTION_TYPES].sort()).toEqual(
      ['crm.suggest_next_action', 'studio.prompt_enhance', 'text.campaign', 'text.copy', 'text.crm_message', 'text.multi_turn', 'text.strategy'],
    );
    for (const a of GEMINI_TEXT_ACTION_TYPES) expect(AI_ACTION_TYPES.includes(a), a).toBe(true);
  });

  it('executable subset = gemini-first text actions only, frozen', () => {
    expect(Object.isFrozen(GEMINI_EXECUTABLE_ACTION_TYPES)).toBe(true);
    expect([...GEMINI_EXECUTABLE_ACTION_TYPES].sort()).toEqual(
      ['crm.suggest_next_action', 'studio.prompt_enhance', 'text.copy', 'text.crm_message', 'text.multi_turn'],
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

  it('takes systemInstruction/temperature/maxOutputTokens ONLY from the server profile; caller values are ignored', () => {
    const profile = {
      outputMode: 'text', systemInstruction: 'SERVER OWNED', temperature: 0.2,
      maxOutputTokens: 256, responseMimeType: null, responseSchema: null,
      parsePolicy: 'text', resultContract: null,
    };
    // caller tries to smuggle a system instruction + generation config — all ignored
    const r = buildGeminiTextRequest(
      { prompt: 'hi', system: 'CALLER OWNED', temperature: 99, maxOutputTokens: 8000 },
      profile,
    );
    expect(r.ok).toBe(true);
    expect(r.body.systemInstruction).toEqual({ parts: [{ text: 'SERVER OWNED' }] });
    expect(JSON.stringify(r.body).includes('CALLER OWNED')).toBe(false);
    expect(r.body.generationConfig.temperature).toBe(0.2);
    expect(r.body.generationConfig.maxOutputTokens).toBe(256);
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

  it('success shape: provider gemini, completed, result text, approved usage', () => {
    const r = buildProviderSuccessResponse(decision, 'the output');
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('gemini');
    expect(r.execution).toEqual({ status: 'completed' });
    expect(r.result).toEqual({ text: 'the output' });
    // reached only after the budget guard approved + reserved
    expect(r.usage).toEqual({ logging: 'active', budgetCheck: 'approved' });
    expect(r.routing.selectedProvider).toBe('gemini');
  });

  it('builders never throw on null/undefined decision', () => {
    expect(() => buildProviderNotConfiguredResponse(null)).not.toThrow();
    expect(buildProviderNotConfiguredResponse(null).actionType).toBe(null);
    expect(() => buildProviderErrorResponse(undefined)).not.toThrow();
  });
});

describe('usage record · buildUsageRecord (pure, content-free)', () => {
  const decision = buildAiGatewayDecision({ actionType: 'text.copy', payload: { prompt: 'SECRET PROMPT TEXT' } });
  const EXPECTED_KEYS = [
    'action_type', 'cost_tier', 'error_code', 'estimated_cost_usd', 'http_status',
    'is_estimate', 'model', 'prompt_chars', 'provider', 'request_id', 'result_chars', 'status',
    'user_id',
  ];

  it('is exported and returns exactly the content-free ai_usage columns', () => {
    expect(typeof buildUsageRecord).toBe('function');
    const rec = buildUsageRecord({ requestId: 'req-1', decision, status: 'completed', httpStatus: 200, provider: 'gemini', promptChars: 18, resultChars: 5 });
    expect(Object.keys(rec).sort()).toEqual(EXPECTED_KEYS);
  });

  it('never contains raw prompt/response text — only counts', () => {
    const rec = buildUsageRecord({ requestId: 'r', decision, status: 'completed', httpStatus: 200, provider: 'gemini', promptChars: 18, resultChars: 42 });
    expect(JSON.stringify(rec).includes('SECRET PROMPT TEXT')).toBe(false);
    expect(rec.prompt_chars).toBe(18);
    expect(rec.result_chars).toBe(42);
    for (const k of ['prompt', 'payload', 'content', 'response', 'result_text', 'system', 'messages', 'text']) {
      expect(k in rec, k).toBe(false);
    }
  });

  it('includes action_type / status / request_id', () => {
    const rec = buildUsageRecord({ requestId: 'req-9', decision, status: 'completed', httpStatus: 200 });
    expect(rec.action_type).toBe('text.copy');
    expect(rec.status).toBe('completed');
    expect(rec.request_id).toBe('req-9');
  });

  it('includes provider / model / cost_tier when available', () => {
    const rec = buildUsageRecord({ requestId: 'r', decision, status: 'completed', provider: 'gemini', model: 'gemini-2.5-flash' });
    expect(rec.provider).toBe('gemini');
    expect(rec.model).toBe('gemini-2.5-flash');
    expect(rec.cost_tier).toBe('low');
  });

  it('includes estimated_cost_usd with is_estimate=true', () => {
    const rec = buildUsageRecord({ requestId: 'r', decision, status: 'completed', provider: 'gemini' });
    expect(typeof rec.estimated_cost_usd).toBe('number');
    expect(rec.is_estimate).toBe(true);
  });

  it('invalid_action → non-null "unknown" sentinel, content-free, no cost', () => {
    const bad = buildAiGatewayDecision({ actionType: 'text.hack' });
    const rec = buildUsageRecord({ requestId: 'r', decision: bad, status: 'invalid_action', httpStatus: 400, errorCode: 'invalid_action' });
    expect(rec.action_type).toBe('unknown');
    expect(rec.status).toBe('invalid_action');
    expect(rec.estimated_cost_usd).toBe(null);
    expect(Object.keys(rec).sort()).toEqual(EXPECTED_KEYS);
  });

  it('provider_not_configured / provider_error / not_implemented records stay content-free', () => {
    for (const status of ['provider_not_configured', 'provider_error', 'not_implemented']) {
      const rec = buildUsageRecord({ requestId: 'r', decision, status, httpStatus: 502, provider: 'gemini' });
      expect(rec.status).toBe(status);
      expect(JSON.stringify(rec).includes('SECRET PROMPT TEXT')).toBe(false);
      expect(Object.keys(rec).sort()).toEqual(EXPECTED_KEYS);
    }
  });

  it('never throws on hostile input; non-numeric/negative counts coerce to null', () => {
    for (const h of HOSTILE_INPUTS) expect(() => buildUsageRecord(h)).not.toThrow();
    const rec = buildUsageRecord({ decision, promptChars: 'evil', resultChars: -3 });
    expect(rec.prompt_chars).toBe(null);
    expect(rec.result_chars).toBe(null);
    expect(rec.request_id).toBe('unknown');
  });
});

describe('guardrail · ai_usage schema (privacy-safe, server-writes-only)', () => {
  const schema = read('../../../supabase/schema.sql');

  it('creates ai_usage with RLS and NO content columns', () => {
    expect(schema.includes('create table if not exists public.ai_usage')).toBe(true);
    expect(schema).toMatch(/alter table public\.ai_usage\s+enable row level security/);
    const start = schema.indexOf('create table if not exists public.ai_usage');
    const block = schema.slice(start, schema.indexOf(');', start) + 2).toLowerCase();
    for (const f of ['prompt ', 'payload', 'content', 'response', 'result_text', 'system', 'messages', 'raw_request', 'raw_response', 'api_key', 'secret', 'token', 'authorization']) {
      expect(block.includes(f), f).toBe(false);
    }
    expect(block.includes('prompt_chars')).toBe(true);
    expect(block.includes('result_chars')).toBe(true);
  });

  it('has NO anon/authenticated INSERT/ALL policy on ai_usage (only self SELECT)', () => {
    expect(/create policy[^;]*on public\.ai_usage[^;]*for insert/i.test(schema)).toBe(false);
    expect(/create policy[^;]*on public\.ai_usage[^;]*for all/i.test(schema)).toBe(false);
    expect(schema.includes('ai_usage_self_read')).toBe(true);
  });
});

describe('guardrail · usage log module (server-only, service role)', () => {
  it('writes via service role, never logs keys/prompts/responses, never throws', () => {
    const code = read('../../../supabase/functions/ai-gateway/usageLog.ts');
    expect(code).toMatch(/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
    expect(code).toMatch(/Deno\.env\.get\('SUPABASE_URL'\)/);
    expect(code.includes('/rest/v1/ai_usage')).toBe(true);
    expect(code.includes('try')).toBe(true);
    expect(code.includes('catch')).toBe(true);
    const codeOnly = code.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of ['VITE_', 'import.meta', 'createClient', 'anon', 'localStorage', 'sessionStorage']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
    for (const line of code.split('\n').filter((l) => /console\./.test(l))) {
      for (const banned of ['serviceKey', 'SUPABASE_SERVICE_ROLE_KEY', 'record', 'prompt', 'result', 'apikey', 'Authorization']) {
        expect(line.includes(banned), `usage console leaks ${banned}`).toBe(false);
      }
    }
  });

  it('no frontend src file references usageLog or the service-role key', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url)); // → src/
    const offenders = [];
    const walk = (dir) => {
      let entries;
      try { entries = readdirSync(dir); } catch { return; }
      for (const name of entries) {
        const full = `${dir}/${name}`;
        let s;
        try { s = statSync(full); } catch { continue; }
        if (s.isDirectory()) { if (name !== '__tests__') walk(full); continue; }
        if (!/\.(jsx?|tsx?)$/.test(name) || /\.test\.[jt]sx?$/.test(name)) continue; // production files only
        const c = readFileSync(full, 'utf8');
        if (c.includes('usageLog') || c.includes('SUPABASE_SERVICE_ROLE_KEY')) offenders.push(full);
      }
    };
    walk(root);
    expect(offenders, `leaked into frontend: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('guardrail · usage logging wired best-effort (index.ts)', () => {
  it('generates request_id, calls the logger guarded, holds no secret/env/fetch', () => {
    const code = read('../../../supabase/functions/ai-gateway/index.ts');
    expect(code).toMatch(/from '\.\/usageLog\.ts'/);
    expect(code.includes('buildUsageRecord')).toBe(true);
    expect(code.includes('logUsage')).toBe(true);
    expect(code.includes('crypto.randomUUID')).toBe(true);
    // logging is guarded so it can never fail the response
    expect(/try\s*\{[\s\S]*?logUsage[\s\S]*?catch/.test(code)).toBe(true);
    const codeOnly = code.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').toLowerCase();
    for (const banned of ['deno.env', 'service_role', 'vite_', 'generativelanguage', 'x-goog', 'fetch(']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});

describe('guardrail · usage.budgetCheck reflects real enforcement state', () => {
  it('stub (not_implemented) stays deferred; an approved provider success is approved', () => {
    // buildAiGatewayResponse is the routing stub — no provider execution → deferred
    expect(buildAiGatewayResponse({ actionType: 'text.copy' }).usage.budgetCheck).toBe('deferred');
    // provider success builder is reached only post-approval → approved
    expect(buildProviderSuccessResponse(buildAiGatewayDecision({ actionType: 'text.copy', payload: { prompt: 'x' } }), 'y').usage.budgetCheck).toBe('approved');
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
    // CORS allow-headers must cover exactly what the browser Supabase client
    // sends, or functions.invoke fails preflight (surfaces as network_error).
    const allowMatch = code.match(/Access-Control-Allow-Headers'\s*:\s*'([^']+)'/);
    expect(allowMatch, 'Access-Control-Allow-Headers present').not.toBe(null);
    const allowHeaders = (allowMatch[1] || '').toLowerCase();
    for (const h of ['authorization', 'x-client-info', 'apikey', 'content-type']) {
      expect(allowHeaders.includes(h), h).toBe(true);
    }
    // the provider KEY, fetch, and env live ONLY in geminiProvider.ts.
    // NOTE: 'apikey' is intentionally NOT banned here — it is the browser
    // Supabase apikey HEADER NAME allowed via CORS, not a provider secret.
    const lower = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
      .toLowerCase();
    for (const banned of ['vite_', 'gemini_api_key', 'x-goog-api-key', '.googleapis.com', 'generativelanguage', 'api_key', 'deno.env', 'fetch(', 'import.meta']) {
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
      '../jakePack.js',
      '../jakeAgent.js',
    ];
    for (const rel of frozen) {
      const code = read(rel);
      expect(code.includes('aiGateway'), rel).toBe(false);
    }
  });
});

// ===================================================================
// Slice · AI Gateway Structured Text Contract
// Server-owned action profiles + first structured (json) action.
// ===================================================================

describe('action profiles · server-only registry (source guardrails)', () => {
  it('actionProfiles.ts is server-only: no impure/frontend surface, no secrets, no provider/model', () => {
    const code = read('../../../supabase/functions/ai-gateway/actionProfiles.ts');
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of [
      'VITE_', 'import.meta', 'window.', 'document.', 'localStorage', 'sessionStorage',
      'fetch(', 'GEMINI_API_KEY', 'X-goog', 'generativelanguage', 'AIza', 'process.env', 'Deno.env',
    ]) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
    const importLines = (code.match(/import[^]*?from\s*'[^']+';/g) || []).join('\n');
    for (const forbidden of ['src/lib', 'gemini.js', 'jakePack', 'jakeAgent', 'Assistant', 'ImageStudio', 'geminiImage']) {
      expect(importLines.includes(forbidden), forbidden).toBe(false);
    }
    // provider/model selection is NOT owned here (no model ids)
    expect(codeOnly.includes('gemini-2.')).toBe(false);
  });

  it('has NO src/lib compatibility shim (server-only, never re-exported to frontend)', () => {
    for (const rel of ['../actionProfiles.js', '../actionProfiles.ts']) {
      let existed = true;
      try { read(rel); } catch { existed = false; }
      expect(existed, `unexpected shim ${rel}`).toBe(false);
    }
  });

  it('no production src file imports actionProfiles', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url)); // → src/
    const offenders = [];
    const walk = (dir) => {
      let entries;
      try { entries = readdirSync(dir); } catch { return; }
      for (const name of entries) {
        const full = `${dir}/${name}`;
        let s;
        try { s = statSync(full); } catch { continue; }
        if (s.isDirectory()) { if (name !== '__tests__') walk(full); continue; }
        if (!/\.(jsx?|tsx?)$/.test(name) || /\.test\.[jt]sx?$/.test(name)) continue; // production files only
        if (readFileSync(full, 'utf8').includes('actionProfiles')) offenders.push(full);
      }
    };
    walk(root);
    expect(offenders, `leaked into frontend: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('action profiles · frozen registry + exhaustive executable coverage', () => {
  it('registry keys are EXACTLY the gemini-executable set (no non-executable enabled)', () => {
    expect([...ACTION_PROFILE_KEYS].sort()).toEqual([...GEMINI_EXECUTABLE_ACTION_TYPES].sort());
    for (const a of ['text.strategy', 'text.campaign', 'image.poster', 'vision.analyze_reference', 'video.short_ad']) {
      expect(getActionProfile(a), a).toBe(null);
      expect(hasActionProfile(a), a).toBe(false);
    }
  });

  it('every gemini-executable action has a deeply-frozen profile', () => {
    for (const a of GEMINI_EXECUTABLE_ACTION_TYPES) {
      const p = getActionProfile(a);
      expect(p, a).not.toBe(null);
      expect(hasActionProfile(a), a).toBe(true);
      expect(Object.isFrozen(p), a).toBe(true);
    }
    const crm = getActionProfile(CRM_SUGGEST_NEXT_ACTION);
    expect(Object.isFrozen(crm.responseSchema)).toBe(true);
    expect(Object.isFrozen(crm.responseSchema.properties)).toBe(true);
  });

  it('plain-text actions preserve backward-compatible defaults (text / 0.7 / 1024 / null system)', () => {
    for (const a of ['text.copy', 'text.crm_message', 'studio.prompt_enhance']) {
      const p = getActionProfile(a);
      expect(p.outputMode, a).toBe('text');
      expect(p.temperature, a).toBe(0.7);
      expect(p.maxOutputTokens, a).toBe(1024);
      expect(p.systemInstruction, a).toBe(null);
      expect(p.responseMimeType, a).toBe(null);
      expect(p.responseSchema, a).toBe(null);
    }
  });

  it('crm.suggest_next_action is the one structured (json) profile', () => {
    expect(CRM_SUGGEST_NEXT_ACTION).toBe('crm.suggest_next_action');
    const p = getActionProfile(CRM_SUGGEST_NEXT_ACTION);
    expect(p.outputMode).toBe('json');
    expect(p.responseMimeType).toBe('application/json');
    expect(typeof p.systemInstruction).toBe('string');
    expect(p.systemInstruction.length).toBeGreaterThan(0);
    expect(p.temperature).toBe(0.3);
    expect(p.maxOutputTokens).toBe(512);
    expect(p.resultContract).toBe(STRUCTURED_RESULT_CONTRACTS.CRM_SUGGEST_NEXT_ACTION);
    expect(p.responseSchema.required).toEqual(['suggestion', 'reason', 'priority']);
    expect(p.responseSchema.properties.priority.enum).toEqual(['low', 'medium', 'high']);
  });

  it('getActionProfile / hasActionProfile never throw on hostile input', () => {
    for (const input of HOSTILE_INPUTS) {
      expect(() => getActionProfile(input)).not.toThrow();
      expect(() => hasActionProfile(input)).not.toThrow();
      expect(getActionProfile(input)).toBe(null);
      expect(hasActionProfile(input)).toBe(false);
    }
  });
});

describe('authority hardening · caller cannot control server-owned execution fields', () => {
  const SERVER_OWNED_KEYS = [
    'system', 'systemInstruction', 'system_instruction',
    'temperature', 'maxOutputTokens', 'max_output_tokens',
    'outputMode', 'output_mode',
    'responseMimeType', 'response_mime_type',
    'responseSchema', 'response_schema',
    'responseJsonSchema', 'response_json_schema',
    'responseFormat', 'response_format',
    'schema', 'parsePolicy', 'parse_policy',
  ];

  it('normalizeGatewayPayload strips every server-owned execution/config key (keeps prompt + business input)', () => {
    const payload = { prompt: 'keep me', brief: 'ok' };
    for (const k of SERVER_OWNED_KEYS) payload[k] = 'x';
    const clean = normalizeGatewayPayload(payload);
    expect(clean).toEqual({ prompt: 'keep me', brief: 'ok' });
    for (const k of SERVER_OWNED_KEYS) expect(k in clean, k).toBe(false);
  });

  it('stripping is case-insensitive on the key name', () => {
    expect(normalizeGatewayPayload({ System: 'x', TEMPERATURE: 9, ResponseSchema: {}, OutputMode: 'json', keep: 1 }))
      .toEqual({ keep: 1 });
  });

  it('provider/model/key stripping remains intact alongside the new keys', () => {
    const clean = normalizeGatewayPayload({ provider: 'evil', model: 'm', apiKey: 'k', system: 's', temperature: 1, prompt: 'p' });
    expect(clean).toEqual({ prompt: 'p' });
  });

  it('the decision payload the provider sees carries none of them', () => {
    const d = buildAiGatewayDecision({
      actionType: 'crm.suggest_next_action',
      payload: { prompt: 'p', system: 'hijack', temperature: 2, responseSchema: { evil: true }, outputMode: 'text' },
    });
    expect(d.request.payload).toEqual({ prompt: 'p' });
  });
});

describe('gemini request builder · profile-owned config (text vs json)', () => {
  const textProfile = getActionProfile('text.copy');
  const jsonProfile = getActionProfile(CRM_SUGGEST_NEXT_ACTION);

  it('requires a non-empty prompt regardless of profile', () => {
    expect(buildGeminiTextRequest({}, textProfile).ok).toBe(false);
    expect(buildGeminiTextRequest({}, textProfile).error.code).toBe('invalid_payload');
    expect(buildGeminiTextRequest({ prompt: '   ' }, jsonProfile).ok).toBe(false);
    expect(buildGeminiTextRequest({ prompt: 'hi' }, textProfile).ok).toBe(true);
  });

  it('TEXT profile: no responseMimeType / responseSchema, defaults 0.7 / 1024, no system', () => {
    const r = buildGeminiTextRequest({ prompt: 'hi' }, textProfile);
    expect(r.body.generationConfig.temperature).toBe(0.7);
    expect(r.body.generationConfig.maxOutputTokens).toBe(1024);
    expect('responseMimeType' in r.body.generationConfig).toBe(false);
    expect('responseSchema' in r.body.generationConfig).toBe(false);
    expect(r.body.systemInstruction).toBeUndefined();
  });

  it('JSON profile: responseMimeType=application/json + ONLY the server-owned schema + server system', () => {
    const r = buildGeminiTextRequest({ prompt: 'hi' }, jsonProfile);
    expect(r.body.generationConfig.responseMimeType).toBe('application/json');
    expect(r.body.generationConfig.responseSchema).toEqual(jsonProfile.responseSchema);
    expect(r.body.systemInstruction).toEqual({ parts: [{ text: jsonProfile.systemInstruction }] });
    expect(r.body.generationConfig.temperature).toBe(0.3);
    expect(r.body.generationConfig.maxOutputTokens).toBe(512);
  });

  it('a caller-smuggled schema/system/config can neither replace nor mutate the profile schema', () => {
    const before = JSON.stringify(jsonProfile.responseSchema);
    const r = buildGeminiTextRequest(
      { prompt: 'hi', responseSchema: { type: 'string', evil: true }, schema: { x: 1 }, system: 'CALLER', temperature: 99 },
      jsonProfile,
    );
    expect(r.body.generationConfig.responseSchema).toEqual(jsonProfile.responseSchema);
    expect(JSON.stringify(r.body).includes('evil')).toBe(false);
    expect(JSON.stringify(r.body).includes('CALLER')).toBe(false);
    expect(JSON.stringify(jsonProfile.responseSchema)).toBe(before); // frozen, unmutated
  });

  it('no thinkingConfig in either mode', () => {
    for (const prof of [textProfile, jsonProfile]) {
      const r = buildGeminiTextRequest({ prompt: 'x' }, prof);
      expect(JSON.stringify(r.body).includes('thinking')).toBe(false);
    }
  });
});

describe('structured response · parse + validate + fail-closed (pure)', () => {
  const VALID = { suggestion: 'Call the lead', reason: 'No reply for 2 days', priority: 'medium' };
  const decision = buildAiGatewayDecision({ actionType: 'crm.suggest_next_action', payload: { prompt: 'p' } });
  const CRM = STRUCTURED_RESULT_CONTRACTS.CRM_SUGGEST_NEXT_ACTION;

  it('valid text response → result.text (unchanged text contract)', () => {
    const json = { candidates: [{ content: { parts: [{ text: 'plain copy' }] } }] };
    expect(buildProviderSuccessResponse(decision, parseGeminiTextResponse(json)).result).toEqual({ text: 'plain copy' });
  });

  it('valid structured response → { ok:true, value } → result.json (no text)', () => {
    const parsed = parseStructuredResult(JSON.stringify(VALID), CRM);
    expect(parsed).toEqual({ ok: true, value: VALID });
    const res = buildProviderJsonSuccessResponse(decision, parsed.value);
    expect(res.result).toEqual({ json: VALID });
    expect('text' in res.result).toBe(false);
    expect(res.execution.status).toBe('completed');
    expect(res.provider).toBe('gemini');
    expect(res.usage).toEqual({ logging: 'active', budgetCheck: 'approved' });
  });

  it('validateCrmSuggestNextAction accepts the exact contract and normalizes to a safe literal', () => {
    const v = validateCrmSuggestNextAction({ ...VALID, extra: 'DROP' });
    expect(v).toEqual(VALID); // extras dropped; only the three contract fields survive
  });

  it('malformed / non-object JSON → { ok:false } → invalid_provider_response', () => {
    for (const raw of ['{not json', '', 'null', '[1,2,3]', '"just a string"', '42']) {
      expect(parseStructuredResult(raw, CRM).ok, raw).toBe(false);
    }
    const err = buildInvalidProviderResponse(decision);
    expect(err.ok).toBe(false);
    expect(err.error.code).toBe(AI_GATEWAY_ERROR_CODES.INVALID_PROVIDER_RESPONSE);
    expect(err.error.code).toBe('invalid_provider_response');
    expect(err.execution.status).toBe('provider_error'); // reuse; no vocab expansion
  });

  it('missing / wrong-type / invalid-priority fields → reject', () => {
    const bad = [
      { reason: 'r', priority: 'low' },                    // missing suggestion
      { suggestion: 's', priority: 'low' },                 // missing reason
      { suggestion: 's', reason: 'r' },                     // missing priority
      { suggestion: '', reason: 'r', priority: 'low' },     // empty suggestion
      { suggestion: 's', reason: 'r', priority: 'urgent' }, // invalid priority
      { suggestion: 1, reason: 'r', priority: 'low' },      // wrong type
      { suggestion: 's', reason: 'r', priority: 'LOW' },    // wrong case
    ];
    for (const v of bad) {
      expect(validateStructuredResult(CRM, v), JSON.stringify(v)).toBe(null);
    }
  });

  it('arrays / null / primitives / prototype-bearing objects → reject', () => {
    for (const v of [null, undefined, [], [VALID], 'x', 42, true, JSON.parse('{"__proto__":{"x":1}}')]) {
      expect(validateCrmSuggestNextAction(v)).toBe(null);
    }
  });

  it('unknown result contract → reject (fail closed)', () => {
    expect(validateStructuredResult('nope.unknown', VALID)).toBe(null);
    expect(parseStructuredResult(JSON.stringify(VALID), 'nope.unknown').ok).toBe(false);
  });

  it('parse/validate/count helpers never throw on hostile input', () => {
    for (const input of HOSTILE_INPUTS) {
      expect(() => parseStructuredResult(input, CRM)).not.toThrow();
      expect(() => validateCrmSuggestNextAction(input)).not.toThrow();
      expect(() => validateStructuredResult(CRM, input)).not.toThrow();
      expect(() => providerResultChars(input)).not.toThrow();
    }
  });

  it('providerResultChars uses RAW provider text length, never a re-serialized object length', () => {
    const raw = '{ "suggestion": "a", "reason": "b", "priority": "low" }';
    expect(providerResultChars(raw)).toBe(raw.length);
    expect(providerResultChars(raw)).not.toBe(JSON.stringify(JSON.parse(raw)).length);
    expect(providerResultChars(null)).toBe(null);
    expect(providerResultChars(123)).toBe(null);
  });
});

describe('structured response · never leaks internals to the frontend', () => {
  const decision = buildAiGatewayDecision({ actionType: 'crm.suggest_next_action', payload: { prompt: 'p' } });
  const crm = getActionProfile(CRM_SUGGEST_NEXT_ACTION);
  const CRM = STRUCTURED_RESULT_CONTRACTS.CRM_SUGGEST_NEXT_ACTION;

  it('success/error responses carry no system instruction, schema, or raw provider text', () => {
    const ok = buildProviderJsonSuccessResponse(decision, { suggestion: 's', reason: 'r', priority: 'low' });
    const err = buildInvalidProviderResponse(decision);
    for (const res of [ok, err]) {
      const flat = JSON.stringify(res);
      expect(flat.includes(crm.systemInstruction)).toBe(false);
      expect(flat.includes('responseSchema')).toBe(false);
      expect(flat.includes('systemInstruction')).toBe(false);
    }
    expect(err.error.message).toBe('Gemini provider returned an invalid response.'); // fixed/generic
  });

  it('json result contains ONLY the validated fields (extras never echoed)', () => {
    const parsed = parseStructuredResult(
      JSON.stringify({ suggestion: 's', reason: 'r', priority: 'high', secretEcho: 'LEAK' }),
      CRM,
    );
    const res = buildProviderJsonSuccessResponse(decision, parsed.value);
    expect(res.result.json).toEqual({ suggestion: 's', reason: 'r', priority: 'high' });
    expect(JSON.stringify(res).includes('LEAK')).toBe(false);
  });
});

describe('backward compatibility + provider/index integration surface', () => {
  it('text.copy success contract is compatible: ok/gemini/completed/result.text (usage now approved)', () => {
    const d = buildAiGatewayDecision({ actionType: 'text.copy', payload: { prompt: 'hi' } });
    const r = buildProviderSuccessResponse(d, 'the output');
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('gemini');
    expect(r.execution).toEqual({ status: 'completed' });
    expect(r.result).toEqual({ text: 'the output' });
    expect('json' in r.result).toBe(false);
    expect(r.usage).toEqual({ logging: 'active', budgetCheck: 'approved' });
  });

  it('the provider consumes the profile, branches text/json, and returns resultChars (source guard)', () => {
    const code = read('../../../supabase/functions/ai-gateway/geminiProvider.ts');
    expect(code.includes('profile: ActionProfile')).toBe(true);
    expect(code.includes('buildProviderJsonSuccessResponse')).toBe(true);
    expect(code.includes('buildInvalidProviderResponse')).toBe(true);
    expect(code.includes('parseStructuredResult')).toBe(true);
    expect(code.includes('providerResultChars')).toBe(true);
    expect(code.includes('resultChars')).toBe(true);
    const codeOnly = code.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect((codeOnly.match(/fetch\(/g) || []).length).toBe(1); // still single-shot
  });

  it('index selects the profile by validated actionType and fails closed when absent', () => {
    const code = read('../../../supabase/functions/ai-gateway/index.ts');
    expect(code.includes("from './actionProfiles.ts'")).toBe(true);
    expect(code.includes('getActionProfile(decision.actionType)')).toBe(true);
    expect(/if\s*\(!profile\)/.test(code)).toBe(true);
    const codeOnly = code.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').toLowerCase();
    for (const banned of ['deno.env', 'fetch(', 'generativelanguage', 'x-goog', 'vite_']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});

describe('guardrail · DEV smoke + product wiring untouched by this slice', () => {
  it('the DEV smoke CTA is unchanged: still text.copy via callAiGateway, not wired to structured/profiles', () => {
    const code = read('../../components/dev/AiGatewaySmoke.jsx');
    expect(code.includes('callAiGateway')).toBe(true);
    expect(code.includes('text.copy')).toBe(true);
    expect(code.includes('actionProfiles')).toBe(false);
    expect(code.includes('crm.suggest_next_action')).toBe(false);
  });

  it('no Jake/Assistant/legacy-Gemini file references the gateway or profiles', () => {
    for (const rel of ['../../components/ai/Assistant.jsx', '../jakePack.js', '../jakeAgent.js', '../gemini.js']) {
      const code = read(rel);
      expect(code.includes('aiGateway'), rel).toBe(false);
      expect(code.includes('actionProfiles'), rel).toBe(false);
    }
  });
});

// ===================================================================
// Slice · AI Gateway Budget Guard
// Authenticated-user enforcement + atomic budget/rate guard before Gemini.
// ===================================================================

const readServer = (rel) => read(`../../../supabase/functions/${rel}`);

describe('budget · error-contract response builders (pure, generic, leak-free)', () => {
  const decision = buildAiGatewayDecision({ actionType: 'text.copy', payload: { prompt: 'SECRET PROMPT' } });

  it('unauthenticated: 401-shape, no actionType, budgetCheck rejected, logging active', () => {
    const r = buildUnauthenticatedResponse();
    expect(r).toEqual({
      ok: false,
      error: { code: 'unauthenticated', message: 'Authentication is required.' },
      execution: { status: 'rejected' },
      usage: { logging: 'active', budgetCheck: 'rejected' },
    });
    expect('actionType' in r).toBe(false); // no action echoed
  });

  it('rate_limited: code + rejected + budgetCheck rejected, generic message', () => {
    const r = buildRateLimitedResponse(decision);
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('rate_limited');
    expect(r.execution.status).toBe('rejected');
    expect(r.usage).toEqual({ logging: 'active', budgetCheck: 'rejected' });
    expect(r.actionType).toBe('text.copy');
  });

  it('budget_exceeded: code + rejected, exposes no limit/usage/remaining', () => {
    const r = buildBudgetExceededResponse(decision);
    expect(r.error.code).toBe('budget_exceeded');
    expect(r.execution.status).toBe('rejected');
    expect(r.usage).toEqual({ logging: 'active', budgetCheck: 'rejected' });
    const flat = JSON.stringify(r).toLowerCase();
    for (const leak of ['daily', 'monthly', 'global', 'remaining', 'usd', 'count']) {
      expect(flat.includes(leak), leak).toBe(false);
    }
  });

  it('budget_guard_unavailable: 503 code + rejected + budgetCheck unavailable', () => {
    const r = buildBudgetGuardUnavailableResponse(decision);
    expect(r.error.code).toBe('budget_guard_unavailable');
    expect(r.execution.status).toBe('rejected');
    expect(r.usage).toEqual({ logging: 'active', budgetCheck: 'unavailable' });
  });

  it('every builder uses a fixed generic message with no DB/provider/internal detail', () => {
    const builders = [
      buildUnauthenticatedResponse(),
      buildRateLimitedResponse(decision),
      buildBudgetExceededResponse(decision),
      buildBudgetGuardUnavailableResponse(decision),
    ];
    for (const r of builders) {
      const msg = r.error.message;
      expect(typeof msg).toBe('string');
      for (const bad of ['postgre', 'pgrst', 'rpc', 'sql', 'reserve_ai_budget', 'token', 'jwt', 'SECRET PROMPT']) {
        expect(msg.toLowerCase().includes(bad.toLowerCase()), `${bad} in "${msg}"`).toBe(false);
      }
    }
    expect(AI_GATEWAY_ERROR_CODES.UNAUTHENTICATED).toBe('unauthenticated');
    expect(AI_GATEWAY_ERROR_CODES.RATE_LIMITED).toBe('rate_limited');
    expect(AI_GATEWAY_ERROR_CODES.BUDGET_EXCEEDED).toBe('budget_exceeded');
    expect(AI_GATEWAY_ERROR_CODES.BUDGET_GUARD_UNAVAILABLE).toBe('budget_guard_unavailable');
  });

  it('builders never throw on null/undefined decision', () => {
    expect(() => buildRateLimitedResponse(null)).not.toThrow();
    expect(buildRateLimitedResponse(null).actionType).toBe(null);
    expect(() => buildBudgetExceededResponse(undefined)).not.toThrow();
    expect(() => buildBudgetGuardUnavailableResponse(null)).not.toThrow();
  });
});

describe('usage · user_id linkage + COST_TIER_BY_ACTION fix', () => {
  const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
  const decision = buildAiGatewayDecision({ actionType: 'text.copy', payload: { prompt: 'SECRET PROMPT TEXT' } });

  it('buildUsageRecord includes user_id and retains a valid verified UUID', () => {
    const rec = buildUsageRecord({ requestId: 'r', decision, userId: VALID_UUID, status: 'completed' });
    expect('user_id' in rec).toBe(true);
    expect(rec.user_id).toBe(VALID_UUID);
  });

  it('a missing / non-UUID / body-shaped userId coerces to null (never trusted verbatim)', () => {
    for (const bad of [undefined, null, '', 'not-a-uuid', 42, {}, [], 'DROP TABLE', VALID_UUID.slice(0, -1)]) {
      const rec = buildUsageRecord({ requestId: 'r', decision, userId: bad, status: 'x' });
      expect(rec.user_id, JSON.stringify(bad)).toBe(null);
    }
  });

  it('record stays content-free and existing columns remain compatible', () => {
    const rec = buildUsageRecord({ requestId: 'r', decision, userId: VALID_UUID, status: 'completed', promptChars: 11, resultChars: 5 });
    expect(JSON.stringify(rec).includes('SECRET PROMPT TEXT')).toBe(false);
    for (const k of ['prompt', 'payload', 'content', 'response', 'result_text', 'system', 'messages', 'text', 'email', 'suggestion', 'reason']) {
      expect(k in rec, k).toBe(false);
    }
    for (const k of ['request_id', 'action_type', 'provider', 'model', 'cost_tier', 'estimated_cost_usd', 'is_estimate', 'status', 'http_status', 'error_code', 'prompt_chars', 'result_chars']) {
      expect(k in rec, k).toBe(true);
    }
  });

  it('COST_TIER_BY_ACTION is imported into the contract (latent ReferenceError fixed)', () => {
    const code = read('../../../supabase/functions/_shared/aiGatewayContract.js');
    const importBlock = (code.match(/import\s*\{[^}]*\}\s*from\s*'\.\/aiGateway\.js';/) || [''])[0];
    expect(importBlock.includes('COST_TIER_BY_ACTION')).toBe(true);
  });

  it('buildUsageRecord no longer throws when a valid action exists but routing is absent', () => {
    let rec;
    expect(() => { rec = buildUsageRecord({ requestId: 'r', decision: { actionType: 'text.copy' }, userId: null, status: 'x' }); }).not.toThrow();
    expect(rec.action_type).toBe('text.copy');
    expect(rec.cost_tier).toBe('low');
  });
});

describe('budget policy · server-owned, frozen, safe fallbacks', () => {
  const withDenoEnv = (vars, fn) => {
    const prev = globalThis.Deno;
    globalThis.Deno = { env: { get: (k) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : undefined) } };
    try { return fn(); } finally {
      if (prev === undefined) delete globalThis.Deno; else globalThis.Deno = prev;
    }
  };

  it('budgetPolicy.ts is server-only (no frontend/impure surface, no shim)', () => {
    const code = readServer('ai-gateway/budgetPolicy.ts');
    const codeOnly = code.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of ['VITE_', 'import.meta', 'window.', 'document.', 'localStorage', 'fetch(', 'AIza', 'process.env']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
    for (const rel of ['../budgetPolicy.js', '../budgetPolicy.ts']) {
      let existed = true; try { read(rel); } catch { existed = false; }
      expect(existed, `unexpected shim ${rel}`).toBe(false);
    }
  });

  it('defaults are conservative (10 / 1 / 15 / 50) and the policy is frozen', () => {
    const p = getBudgetPolicy();
    expect(p).toEqual({ ratePerMinute: 10, userDailyUsd: 1.0, userMonthlyUsd: 15.0, globalMonthlyUsd: 50.0 });
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(BUDGET_POLICY_DEFAULTS)).toBe(true);
  });

  it('valid env overrides are applied', () => {
    const p = withDenoEnv({
      AI_BUDGET_RATE_PER_MINUTE: '5', AI_BUDGET_USER_DAILY_USD: '2.5',
      AI_BUDGET_USER_MONTHLY_USD: '30', AI_BUDGET_GLOBAL_MONTHLY_USD: '100',
    }, getBudgetPolicy);
    expect(p).toEqual({ ratePerMinute: 5, userDailyUsd: 2.5, userMonthlyUsd: 30, globalMonthlyUsd: 100 });
  });

  it('invalid / zero / negative / non-finite env values fall back to safe defaults', () => {
    const p = withDenoEnv({
      AI_BUDGET_RATE_PER_MINUTE: 'abc', AI_BUDGET_USER_DAILY_USD: '-3',
      AI_BUDGET_USER_MONTHLY_USD: '0', AI_BUDGET_GLOBAL_MONTHLY_USD: '',
    }, getBudgetPolicy);
    expect(p).toEqual({ ratePerMinute: 10, userDailyUsd: 1.0, userMonthlyUsd: 15.0, globalMonthlyUsd: 50.0 });
  });

  it('absurd env values are clamped to reasonable upper bounds', () => {
    const p = withDenoEnv({
      AI_BUDGET_RATE_PER_MINUTE: '999999999', AI_BUDGET_USER_DAILY_USD: '9e12',
      AI_BUDGET_USER_MONTHLY_USD: '9e12', AI_BUDGET_GLOBAL_MONTHLY_USD: '9e12',
    }, getBudgetPolicy);
    expect(p.ratePerMinute).toBe(10000);
    expect(p.userDailyUsd).toBe(1000000);
    expect(p.globalMonthlyUsd).toBe(1000000);
  });

  it('caller cannot override limits: getBudgetPolicy takes no arguments', () => {
    expect(getBudgetPolicy.length).toBe(0);
  });

  it('reservation estimate comes ONLY from the server routing decision, never the request', () => {
    const d = buildAiGatewayDecision({ actionType: 'text.copy', payload: { prompt: 'p', estimatedCost: 999, estimated_cost_usd: 999 } });
    const est = resolveEstimatedCostUsd(d);
    expect(typeof est).toBe('number');
    expect(est).toBe(d.routing.costEstimate.estimatedCost);
    expect(est).not.toBe(999);
    expect(resolveEstimatedCostUsd({})).toBe(null);
    expect(resolveEstimatedCostUsd({ routing: { costEstimate: { estimatedCost: -1 } } })).toBe(null);
    expect(resolveEstimatedCostUsd({ routing: { costEstimate: { estimatedCost: 'x' } } })).toBe(null);
    for (const h of HOSTILE_INPUTS) expect(() => resolveEstimatedCostUsd(h)).not.toThrow();
  });
});

describe('budget guard · normalizes RPC output, fails closed, leaks no content', () => {
  const POLICY = BUDGET_POLICY_DEFAULTS;
  const UUID = '123e4567-e89b-12d3-a456-426614174000';
  const adminReturning = (value) => ({ rpc: () => value });
  const base = (over = {}) => ({ supabaseAdmin: adminReturning({ data: [{ allowed: true, reason: 'approved', retry_after_seconds: null }], error: null }), userId: UUID, requestId: 'req-1', actionType: 'text.copy', estimatedCostUsd: 0.002, policy: POLICY, ...over });

  it('budgetGuard.ts is server-only (no frontend surface, no shim)', () => {
    const code = readServer('ai-gateway/budgetGuard.ts');
    const codeOnly = code.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of ['VITE_', 'import.meta', 'window.', 'localStorage', 'createClient', 'fetch(', 'AIza', 'SUPABASE_SERVICE_ROLE_KEY']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
    for (const rel of ['../budgetGuard.js', '../budgetGuard.ts']) {
      let existed = true; try { read(rel); } catch { existed = false; }
      expect(existed, `unexpected shim ${rel}`).toBe(false);
    }
  });

  it('approved RPC result normalizes to { ok:true, status:"approved" }', async () => {
    const r = await reserveAiBudget(base());
    expect(r).toEqual({ ok: true, status: 'approved' });
  });

  it('rate_limited normalizes with a bounded retryAfterSeconds', async () => {
    const r = await reserveAiBudget(base({ supabaseAdmin: adminReturning({ data: [{ allowed: false, reason: 'rate_limited', retry_after_seconds: 42 }], error: null }) }));
    expect(r).toEqual({ ok: false, status: 'rate_limited', retryAfterSeconds: 42 });
    const r2 = await reserveAiBudget(base({ supabaseAdmin: adminReturning({ data: [{ allowed: false, reason: 'rate_limited', retry_after_seconds: 999999 }], error: null }) }));
    expect(r2.retryAfterSeconds).toBe(3600);
    const r3 = await reserveAiBudget(base({ supabaseAdmin: adminReturning({ data: [{ allowed: false, reason: 'rate_limited', retry_after_seconds: 'x' }], error: null }) }));
    expect(r3.retryAfterSeconds).toBe(null);
  });

  it('budget_exceeded normalizes correctly', async () => {
    const r = await reserveAiBudget(base({ supabaseAdmin: adminReturning({ data: [{ allowed: false, reason: 'budget_exceeded', retry_after_seconds: null }], error: null }) }));
    expect(r).toEqual({ ok: false, status: 'budget_exceeded' });
  });

  it('malformed RPC data fails closed → unavailable', async () => {
    for (const data of [null, undefined, [], [{}], [{ foo: 'bar' }], [{ allowed: 'yes', reason: 'approved' }], [{ allowed: true }], [{ allowed: true, reason: 42 }], [{ allowed: true, reason: 'weird' }]]) {
      const r = await reserveAiBudget(base({ supabaseAdmin: adminReturning({ data, error: null }) }));
      expect(r, JSON.stringify(data)).toEqual({ ok: false, status: 'unavailable' });
    }
  });

  it('RPC error / thrown / network failure fails closed → unavailable', async () => {
    const rErr = await reserveAiBudget(base({ supabaseAdmin: adminReturning({ data: null, error: { message: 'pg down' } }) }));
    expect(rErr).toEqual({ ok: false, status: 'unavailable' });
    const rThrow = await reserveAiBudget(base({ supabaseAdmin: { rpc: () => { throw new Error('boom'); } } }));
    expect(rThrow).toEqual({ ok: false, status: 'unavailable' });
  });

  it('bad inputs fail closed (no admin / no rpc / empty user / bad estimate)', async () => {
    expect(await reserveAiBudget(base({ supabaseAdmin: null }))).toEqual({ ok: false, status: 'unavailable' });
    expect(await reserveAiBudget(base({ supabaseAdmin: {} }))).toEqual({ ok: false, status: 'unavailable' });
    expect(await reserveAiBudget(base({ userId: '' }))).toEqual({ ok: false, status: 'unavailable' });
    expect(await reserveAiBudget(base({ estimatedCostUsd: -1 }))).toEqual({ ok: false, status: 'unavailable' });
    expect(await reserveAiBudget(base({ estimatedCostUsd: NaN }))).toEqual({ ok: false, status: 'unavailable' });
  });

  it('passes ONLY the verified id + server-owned params to the RPC — no prompt/system/result', async () => {
    let captured = null;
    const admin = { rpc: (name, args) => { captured = { name, args }; return { data: [{ allowed: true, reason: 'approved', retry_after_seconds: null }], error: null }; } };
    await reserveAiBudget(base({ supabaseAdmin: admin }));
    expect(captured.name).toBe('reserve_ai_budget');
    expect(captured.args.p_user_id).toBe(UUID);
    expect(captured.args.p_request_id).toBe('req-1');
    expect(Object.keys(captured.args).sort()).toEqual([
      'p_action_type', 'p_estimated_cost_usd', 'p_global_monthly_limit_usd', 'p_rate_per_minute',
      'p_request_id', 'p_user_daily_limit_usd', 'p_user_id', 'p_user_monthly_limit_usd',
    ]);
    const flat = JSON.stringify(captured.args).toLowerCase();
    for (const bad of ['prompt', 'system', 'result', 'suggestion', 'payload', 'content', 'message']) {
      expect(flat.includes(bad), bad).toBe(false);
    }
  });

  it('never throws on hostile params', async () => {
    for (const h of HOSTILE_INPUTS) {
      await expect(reserveAiBudget(h)).resolves.toBeDefined();
    }
  });
});

describe('budget · index.ts flow (auth-first, guard-before-provider)', () => {
  const code = read('../../../supabase/functions/ai-gateway/index.ts');

  it('uses the official @supabase/server user-auth context (pinned)', () => {
    expect(code.includes("from 'npm:@supabase/server@1.3.0'")).toBe(true);
    expect(code.includes('createSupabaseContext')).toBe(true);
    expect(/createSupabaseContext\(\s*req\s*,\s*\{\s*auth:\s*'user'\s*\}\s*\)/.test(code)).toBe(true);
  });

  it('OPTIONS is handled BEFORE authentication', () => {
    const optIdx = code.indexOf("req.method === 'OPTIONS'");
    const authCallIdx = code.indexOf('createSupabaseContext(req'); // the CALL, not the import
    expect(optIdx).toBeGreaterThan(-1);
    expect(authCallIdx).toBeGreaterThan(-1);
    expect(optIdx).toBeLessThan(authCallIdx);
  });

  it('unauthenticated → 401 with the stable builder', () => {
    expect(code.includes('buildUnauthenticatedResponse')).toBe(true);
    expect(/buildUnauthenticatedResponse\(\)\s*,\s*401/.test(code)).toBe(true);
  });

  it('derives identity via getAuthenticatedUserId (userClaims.id / jwtClaims.sub), never the body', () => {
    expect(/authMode === 'user'/.test(code)).toBe(true);
    expect(code.includes('getAuthenticatedUserId(ctx)')).toBe(true);
    // @supabase/server: userClaims.id (primary) + jwtClaims.sub (fallback)
    expect(/userClaims\.id/.test(code)).toBe(true);
    expect(/jwtClaims\.sub/.test(code)).toBe(true);
    // the exact bug this fix closes: userClaims has NO `sub` — never read it
    expect(/userClaims\??\.sub/.test(code)).toBe(false);
    // explicit authenticated-role gate
    expect(code.includes("=== 'authenticated'") || code.includes("!== 'authenticated'")).toBe(true);
    for (const bad of ['body.user', 'payload.user', 'options.user', 'body.userId', 'decision.request.payload.user']) {
      expect(code.includes(bad), bad).toBe(false);
    }
  });

  it('no manual/unsigned JWT decoding', () => {
    for (const bad of ['atob(', 'jwtDecode', 'jwt_decode', 'base64', "split('.')"]) {
      expect(code.includes(bad), bad).toBe(false);
    }
  });

  it('the budget guard runs BEFORE the Gemini provider call', () => {
    const guardCallIdx = code.indexOf('reserveAiBudget({');       // the CALL
    const providerCallIdx = code.indexOf('runGeminiText(decision'); // the CALL
    expect(guardCallIdx).toBeGreaterThan(-1);
    expect(providerCallIdx).toBeGreaterThan(-1);
    expect(guardCallIdx).toBeLessThan(providerCallIdx);
  });

  it('guard uses the trusted service-role admin client + server-owned estimate + requestId', () => {
    expect(code.includes('ctx.supabaseAdmin')).toBe(true);
    expect(code.includes('resolveEstimatedCostUsd')).toBe(true);
    expect(code.includes('getBudgetPolicy')).toBe(true);
    expect(code.includes('crypto.randomUUID')).toBe(true);
  });

  it('every guard non-approval rejects BEFORE the provider (no unguarded fallback)', () => {
    expect(code.includes('buildRateLimitedResponse')).toBe(true);
    expect(code.includes('buildBudgetExceededResponse')).toBe(true);
    expect(code.includes('buildBudgetGuardUnavailableResponse')).toBe(true);
    expect(code.includes('requiresBudgetCheck')).toBe(false);
    expect(code.includes("'Retry-After'")).toBe(true);
  });

  it('CORS headers remain exactly unchanged and the shell holds no key/env/fetch', () => {
    const allowMatch = code.match(/Access-Control-Allow-Headers'\s*:\s*'([^']+)'/);
    expect(allowMatch).not.toBe(null);
    const allow = (allowMatch[1] || '').toLowerCase();
    for (const h of ['authorization', 'x-client-info', 'apikey', 'content-type']) expect(allow.includes(h), h).toBe(true);
    expect(code.includes("'Access-Control-Allow-Methods': 'POST, OPTIONS'")).toBe(true);
    const codeOnly = code.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').toLowerCase();
    for (const banned of ['deno.env', 'fetch(', 'generativelanguage', 'x-goog', 'gemini_api_key', 'service_role']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});

describe('budget · schema.sql (atomic RPC, RLS, service-role-only)', () => {
  const schema = read('../../../supabase/schema.sql');
  const fnStart = schema.indexOf('create or replace function public.reserve_ai_budget');
  const fnBody = fnStart > -1 ? schema.slice(fnStart, schema.indexOf('$$;', fnStart) + 3) : '';

  it('ai_budget_counters table exists with the composite primary key', () => {
    expect(schema.includes('create table if not exists public.ai_budget_counters')).toBe(true);
    expect(/primary key\s*\(\s*owner_type,\s*owner_key,\s*window_kind,\s*window_start\s*\)/.test(schema)).toBe(true);
  });

  it('has non-negative + valid-enum + owner_key check constraints', () => {
    expect(schema.includes('check (request_count >= 0)')).toBe(true);
    expect(schema.includes('check (reserved_estimated_usd >= 0)')).toBe(true);
    expect(schema.includes("owner_type in ('user', 'global')")).toBe(true);
    expect(schema.includes("window_kind in ('minute', 'day', 'month')")).toBe(true);
    expect(/owner_type = 'global' and owner_key = 'global'/.test(schema)).toBe(true);
    expect(/owner_type = 'user' and length\(owner_key\) > 0/.test(schema)).toBe(true);
  });

  it('RLS is enabled with NO client policy on the counters table', () => {
    expect(/alter table public\.ai_budget_counters\s+enable row level security/.test(schema)).toBe(true);
    expect(/create policy[^;]*on public\.ai_budget_counters/i.test(schema)).toBe(false);
  });

  it('the counters table stores NO content columns', () => {
    const tStart = schema.indexOf('create table if not exists public.ai_budget_counters');
    const tBlock = schema.slice(tStart, schema.indexOf(');', tStart)).toLowerCase();
    for (const bad of ['prompt', 'payload', 'response', 'system', 'schema', 'suggestion', 'reason', 'priority', 'api_key', 'token', 'email', 'content']) {
      expect(tBlock.includes(bad), bad).toBe(false);
    }
  });

  it('reserve_ai_budget is SECURITY DEFINER with an empty search_path', () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(/language plpgsql/.test(fnBody)).toBe(true);
    expect(/security definer/.test(fnBody)).toBe(true);
    expect(fnBody.includes("set search_path = ''")).toBe(true);
  });

  it('every table reference in the function is schema-qualified (public.ai_budget_counters)', () => {
    expect(fnBody.includes('public.ai_budget_counters')).toBe(true);
    expect(/\b(from|into|update|join)\s+ai_budget_counters\b/i.test(fnBody)).toBe(false);
  });

  it('uses database time (now()/date_trunc) and guards the four required windows', () => {
    expect(fnBody.includes('now()')).toBe(true);
    expect(fnBody.includes("date_trunc('minute'")).toBe(true);
    expect(fnBody.includes("date_trunc('day'")).toBe(true);
    expect(fnBody.includes("date_trunc('month'")).toBe(true);
    expect(fnBody.includes("'global'")).toBe(true);
  });

  it('locks rows FOR UPDATE in a deterministic order and never uses dynamic SQL', () => {
    expect((fnBody.match(/for update/gi) || []).length).toBe(4);
    expect(/execute\s+format/i.test(fnBody)).toBe(false);
    expect(/execute\s+'/i.test(fnBody)).toBe(false);
  });

  it('does NOT depend on auth.uid(); trusts the passed p_user_id parameter', () => {
    expect(fnBody.includes('auth.uid')).toBe(false);
    expect(/p_user_id uuid/.test(schema)).toBe(true);
  });

  it('return contract exposes only allowed/reason/retry_after_seconds (no totals/limits)', () => {
    const ret = (schema.match(/returns table\s*\(([^)]*)\)/i) || [])[1] || '';
    expect(ret.includes('allowed boolean')).toBe(true);
    expect(ret.includes('reason text')).toBe(true);
    expect(ret.includes('retry_after_seconds integer')).toBe(true);
    for (const leak of ['limit', 'remaining', 'total', 'usage', 'count', 'usd']) {
      expect(ret.toLowerCase().includes(leak), leak).toBe(false);
    }
  });

  it('EXECUTE is revoked from public/anon/authenticated and granted to service_role only', () => {
    expect(schema.includes('revoke execute on function public.reserve_ai_budget')).toBe(true);
    expect(/revoke execute on function public\.reserve_ai_budget\([^)]*\) from public/.test(schema)).toBe(true);
    expect(/revoke execute on function public\.reserve_ai_budget\([^)]*\) from anon/.test(schema)).toBe(true);
    expect(/revoke execute on function public\.reserve_ai_budget\([^)]*\) from authenticated/.test(schema)).toBe(true);
    expect(/grant\s+execute on function public\.reserve_ai_budget\([^)]*\) to service_role/.test(schema)).toBe(true);
  });
});

describe('budget · regression guards (do-not-touch files stay clean)', () => {
  it('the Gemini provider, action profiles, usage log, router, client, and DEV smoke carry no budget wiring', () => {
    const files = {
      'ai-gateway/geminiProvider.ts': readServer('ai-gateway/geminiProvider.ts'),
      'ai-gateway/actionProfiles.ts': readServer('ai-gateway/actionProfiles.ts'),
      'ai-gateway/usageLog.ts': readServer('ai-gateway/usageLog.ts'),
      '_shared/aiGateway.js': readServer('_shared/aiGateway.js'),
    };
    for (const [name, c] of Object.entries(files)) {
      for (const bad of ['reserve_ai_budget', 'reserveAiBudget', 'ai_budget_counters', 'budgetGuard', 'budgetPolicy', 'createSupabaseContext']) {
        expect(c.includes(bad), `${name}:${bad}`).toBe(false);
      }
    }
    for (const rel of ['../aiGatewayClient.js', '../../components/dev/AiGatewaySmoke.jsx']) {
      const c = read(rel);
      for (const bad of ['reserveAiBudget', 'budgetGuard', 'createSupabaseContext', 'ai_budget_counters']) {
        expect(c.includes(bad), `${rel}:${bad}`).toBe(false);
      }
    }
  });

  it('no production src file imports the server-only budget modules', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url)); // → src/
    const offenders = [];
    const walk = (dir) => {
      let entries; try { entries = readdirSync(dir); } catch { return; }
      for (const name of entries) {
        const full = `${dir}/${name}`;
        let s; try { s = statSync(full); } catch { continue; }
        if (s.isDirectory()) { if (name !== '__tests__') walk(full); continue; }
        if (!/\.(jsx?|tsx?)$/.test(name) || /\.test\.[jt]sx?$/.test(name)) continue;
        const c = readFileSync(full, 'utf8');
        if (c.includes('budgetGuard') || c.includes('budgetPolicy')) offenders.push(full);
      }
    };
    walk(root);
    expect(offenders, `leaked into frontend: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the new server modules introduce no hardcoded secret', () => {
    for (const rel of ['ai-gateway/index.ts', 'ai-gateway/budgetPolicy.ts', 'ai-gateway/budgetGuard.ts']) {
      const c = readServer(rel);
      expect(c.includes('AIza'), rel).toBe(false);
      expect(/eyJ[A-Za-z0-9_-]{20,}/.test(c), `${rel} jwt-literal`).toBe(false);
    }
  });
});

describe('budget · authenticated user identity (getAuthenticatedUserId, real source)', () => {
  // index.ts imports `npm:@supabase/server` and cannot be imported by Vitest,
  // so we extract the PURE helper's source and run the ACTUAL shipped code
  // (stripping only its two TS type annotations).
  const src = read('../../../supabase/functions/ai-gateway/index.ts');
  const fnMatch = src.match(/function getAuthenticatedUserId[\s\S]*?\n\}/);
  const jsFn = (fnMatch ? fnMatch[0] : '')
    .replace(/:\s*any\b/g, '')
    .replace(/\)\s*:\s*string\s*\|\s*null/g, ')');
  // eslint-disable-next-line no-new-func
  const getAuthenticatedUserId = fnMatch
    ? new Function(`${jsFn}\nreturn getAuthenticatedUserId;`)()
    : () => { throw new Error('getAuthenticatedUserId not found in index.ts'); };
  const UUID = '123e4567-e89b-12d3-a456-426614174000';
  const UUID2 = '00000000-0000-4000-8000-000000000000';

  it('the helper was extracted as a callable function', () => {
    expect(fnMatch).not.toBe(null);
    expect(typeof getAuthenticatedUserId).toBe('function');
  });

  it('accepts a real logged-in user via userClaims.id (the case the bug rejected)', () => {
    // real @supabase/server user context: userClaims has id+role (NO sub); jwtClaims has sub
    const ctx = { authMode: 'user', userClaims: { id: UUID, role: 'authenticated', email: 'x@y.z' }, jwtClaims: { sub: UUID, role: 'authenticated' } };
    expect(getAuthenticatedUserId(ctx)).toBe(UUID);
  });

  it('userClaims.id is PRIMARY (wins over jwtClaims.sub)', () => {
    const ctx = { authMode: 'user', userClaims: { id: UUID, role: 'authenticated' }, jwtClaims: { sub: UUID2, role: 'authenticated' } };
    expect(getAuthenticatedUserId(ctx)).toBe(UUID);
  });

  it('jwtClaims.sub is the FALLBACK when userClaims is absent', () => {
    const ctx = { authMode: 'user', jwtClaims: { sub: UUID, role: 'authenticated' } };
    expect(getAuthenticatedUserId(ctx)).toBe(UUID);
  });

  it('never reads userClaims.sub: userClaims with only { sub } is NOT accepted', () => {
    const ctx = { authMode: 'user', userClaims: { sub: UUID, role: 'authenticated' } };
    expect(getAuthenticatedUserId(ctx)).toBe(null);
  });

  it('role must be exactly "authenticated" (missing / anon / service_role fail closed)', () => {
    expect(getAuthenticatedUserId({ authMode: 'user', userClaims: { id: UUID, role: 'anon' } })).toBe(null);
    expect(getAuthenticatedUserId({ authMode: 'user', jwtClaims: { sub: UUID, role: 'anon' } })).toBe(null);
    expect(getAuthenticatedUserId({ authMode: 'user', userClaims: { id: UUID } })).toBe(null);
    expect(getAuthenticatedUserId({ authMode: 'user', userClaims: { id: UUID, role: 'service_role' } })).toBe(null);
  });

  it('authMode must be exactly "user"', () => {
    for (const m of ['publishable', 'secret', 'none', undefined, 'anon']) {
      expect(getAuthenticatedUserId({ authMode: m, userClaims: { id: UUID, role: 'authenticated' } }), String(m)).toBe(null);
    }
  });

  it('missing id/sub fails closed', () => {
    expect(getAuthenticatedUserId({ authMode: 'user', userClaims: { role: 'authenticated' } })).toBe(null);
    expect(getAuthenticatedUserId({ authMode: 'user', jwtClaims: { role: 'authenticated' } })).toBe(null);
  });

  it('malformed / non-UUID id fails closed (userClaims.id and jwtClaims.sub)', () => {
    for (const bad of ['not-a-uuid', '123', '', UUID.slice(0, -1), `${UUID}x`, 42, {}]) {
      expect(getAuthenticatedUserId({ authMode: 'user', userClaims: { id: bad, role: 'authenticated' } }), JSON.stringify(bad)).toBe(null);
      expect(getAuthenticatedUserId({ authMode: 'user', jwtClaims: { sub: bad, role: 'authenticated' } }), JSON.stringify(bad)).toBe(null);
    }
  });

  it('valid jwtClaims-only fallback { sub, role:authenticated } is accepted', () => {
    expect(getAuthenticatedUserId({ authMode: 'user', jwtClaims: { sub: UUID2, role: 'authenticated' } })).toBe(UUID2);
  });

  it('never throws on hostile / non-object input', () => {
    for (const h of HOSTILE_INPUTS) {
      expect(() => getAuthenticatedUserId(h)).not.toThrow();
      expect(getAuthenticatedUserId(h)).toBe(null);
    }
  });
});

describe('budget · verified identity flows to guard + usage, body ignored, no leaks', () => {
  const code = read('../../../supabase/functions/ai-gateway/index.ts');

  it('the verified userId is passed to reserveAiBudget and recordUsage (401 uses null)', () => {
    expect(/reserveAiBudget\(\{[\s\S]*?userId,/.test(code)).toBe(true);
    expect(code.includes('userId,')).toBe(true);
    expect(code.includes('userId: null')).toBe(true); // unauthenticated log
  });

  it('OPTIONS remains handled before the auth call; unauthenticated remains 401', () => {
    const optIdx = code.indexOf("req.method === 'OPTIONS'");
    const authCallIdx = code.indexOf('createSupabaseContext(req');
    expect(optIdx).toBeGreaterThan(-1);
    expect(optIdx).toBeLessThan(authCallIdx);
    expect(/buildUnauthenticatedResponse\(\)\s*,\s*401/.test(code)).toBe(true);
  });

  it('no auth token / claims / email is logged or returned', () => {
    for (const line of code.split('\n').filter((l) => /console\./.test(l))) {
      for (const bad of ['claim', 'token', 'authorization', 'email', 'userId', 'sub']) {
        expect(line.toLowerCase().includes(bad.toLowerCase()), `console leaks ${bad}`).toBe(false);
      }
    }
    expect(code.includes('.email')).toBe(false);
    expect(code.includes('userClaims.email')).toBe(false);
  });
});
