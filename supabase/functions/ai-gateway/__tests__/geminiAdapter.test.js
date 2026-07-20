// M2 Slice 2C — Gemini adapter + execution-registry runtime wiring. Focused
// tests: reference-equality (byte-compat by construction), adapter contract,
// server-owned capability map + runtime profile drift guard, real registry
// registration/selection, and index.ts source pins for the wired flow
// (ordering, single registration, single run call, no fallback, no
// caller-controlled provider authority).
//
// NOTE: index.ts imports npm:@supabase/server and cannot be imported by
// Vitest — its behavior is pinned at SOURCE level (house convention).
// geminiProvider.ts / geminiAdapter.ts ARE imported: their edge globals are
// referenced only inside functions this suite never calls, so any accidental
// invocation of run/isConfigured in node would throw and fail the test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  geminiAdapter,
  requiredGatewayCapabilities,
  REQUIRED_CAPABILITY_ACTION_KEYS,
} from '../geminiAdapter.ts';
import { isGeminiConfigured, runGeminiText } from '../geminiProvider.ts';
import { getActionProfile, ACTION_PROFILE_KEYS } from '../actionProfiles.ts';
import { GEMINI_EXECUTABLE_ACTION_TYPES } from '../../_shared/aiGatewayContract.js';
import { validateProviderAdapterShape } from '../../_shared/aiProviderCore.js';
import { createExecutionRegistry } from '../../_shared/aiExecutionRegistry.js';

const readSrc = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const indexSrc = readSrc('../index.ts');
const adapterSrc = readSrc('../geminiAdapter.ts');

// The exact server-owned capability requirements audited for Slice 2C.
const EXPECTED_CAPABILITIES = {
  'text.copy': ['text'],
  'text.crm_message': ['text'],
  'studio.prompt_enhance': ['text'],
  'crm.suggest_next_action': ['json'],
  'text.multi_turn': ['text', 'multi_turn'],
  'jake.draft_message': ['text', 'multi_turn'],
  // M2 J1 — server-only Jake chat + force-actions lanes.
  'jake.chat': ['text', 'multi_turn'],
  'jake.force_actions': ['text', 'multi_turn'],
  // M2 J3A — Outreach lead-ideas lane (second structured json action).
  'crm.lead_ideas': ['json'],
  // M2 J3B — Quote-diagnosis lane (third structured json action).
  'crm.diagnose_quote': ['json'],
};

// ---------------------------------------------------------------
// Adapter contract — byte-compat by reference equality
// ---------------------------------------------------------------
describe('geminiAdapter contract', () => {
  it('run and isConfigured are DIRECT references to the existing provider functions', () => {
    expect(geminiAdapter.run).toBe(runGeminiText);
    expect(geminiAdapter.isConfigured).toBe(isGeminiConfigured);
  });

  it('provider and capabilities are exact and frozen', () => {
    expect(geminiAdapter.provider).toBe('gemini');
    expect(geminiAdapter.capabilities).toEqual(['text', 'json', 'multi_turn']);
    expect(Object.isFrozen(geminiAdapter)).toBe(true);
    expect(Object.isFrozen(geminiAdapter.capabilities)).toBe(true);
  });

  it('passes validateProviderAdapterShape with the exact declaration', () => {
    expect(validateProviderAdapterShape(geminiAdapter))
      .toEqual({ ok: true, provider: 'gemini', capabilities: ['text', 'json', 'multi_turn'] });
  });

  it('the adapter module duplicates NO provider logic (imports geminiProvider only)', () => {
    const imports = [...adapterSrc.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['./geminiProvider.ts']);
    for (const banned of [
      'fetch(', 'Deno', 'process.env', 'https://', 'googleapis', 'generativelanguage',
      'API_KEY', 'X-goog', 'GEMINI_MODEL', 'generationConfig', 'systemInstruction',
    ]) {
      expect(adapterSrc.includes(banned), `geminiAdapter.ts must not contain: ${banned}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------
// Real registry registration + selection
// ---------------------------------------------------------------
describe('registry registration and selection', () => {
  it('registers cleanly and NEVER invokes run/isConfigured (node would throw on edge globals)', () => {
    const reg = createExecutionRegistry();
    const r = reg.register(geminiAdapter);
    expect(r).toEqual({ ok: true, provider: 'gemini', capabilities: ['text', 'json', 'multi_turn'] });
    expect(reg.size()).toBe(1);
    expect(reg.listProviders()).toEqual(['gemini']);
  });

  it('a second registration is rejected (mirrors the single runtime registration)', () => {
    const reg = createExecutionRegistry();
    expect(reg.register(geminiAdapter).ok).toBe(true);
    expect(reg.register(geminiAdapter)).toEqual({ ok: false, reason: 'duplicate_provider' });
    expect(reg.size()).toBe(1);
  });

  it('selection returns the Gemini snapshot whose run IS runGeminiText, for every executable action', () => {
    const reg = createExecutionRegistry();
    reg.register(geminiAdapter);
    for (const action of GEMINI_EXECUTABLE_ACTION_TYPES) {
      const caps = requiredGatewayCapabilities(action, getActionProfile(action));
      expect(caps, action).not.toBe(null);
      const sel = reg.selectAdapter({ provider: 'gemini', capabilities: [...caps] });
      expect(sel.ok, action).toBe(true);
      expect(sel.provider, action).toBe('gemini');
      expect(sel.adapter.run, action).toBe(runGeminiText);
    }
  });

  it('selection can never return the none sentinel', () => {
    const reg = createExecutionRegistry();
    reg.register(geminiAdapter);
    expect(reg.selectAdapter({ provider: 'none', capabilities: ['text'] }))
      .toEqual({ ok: false, reason: 'unknown_provider' });
    const noneShaped = {
      provider: 'none',
      capabilities: ['text'],
      isConfigured() {},
      run() {},
    };
    expect(reg.register(noneShaped)).toEqual({ ok: false, reason: 'provider_not_executable' });
  });
});

// ---------------------------------------------------------------
// Server-owned capability map + runtime profile drift guard
// ---------------------------------------------------------------
describe('requiredGatewayCapabilities', () => {
  it('covers EXACTLY the executable-action vocabulary (and the profile registry)', () => {
    expect([...REQUIRED_CAPABILITY_ACTION_KEYS].sort())
      .toEqual([...GEMINI_EXECUTABLE_ACTION_TYPES].sort());
    expect([...REQUIRED_CAPABILITY_ACTION_KEYS].sort())
      .toEqual([...ACTION_PROFILE_KEYS].sort());
  });

  it('maps every executable action to its exact audited capabilities (frozen)', () => {
    for (const action of GEMINI_EXECUTABLE_ACTION_TYPES) {
      const caps = requiredGatewayCapabilities(action, getActionProfile(action));
      expect(caps, action).toEqual(EXPECTED_CAPABILITIES[action]);
      expect(Object.isFrozen(caps), action).toBe(true);
    }
  });

  it('each mapping agrees with the real action profile outputMode', () => {
    for (const action of GEMINI_EXECUTABLE_ACTION_TYPES) {
      const profile = getActionProfile(action);
      const expectJson = EXPECTED_CAPABILITIES[action].includes('json');
      expect(profile.outputMode, action).toBe(expectJson ? 'json' : 'text');
    }
  });

  it('runtime drift guard: an outputMode mismatch returns null (fail closed, no repair)', () => {
    expect(requiredGatewayCapabilities('text.copy', { outputMode: 'json' })).toBe(null);
    expect(requiredGatewayCapabilities('crm.suggest_next_action', { outputMode: 'text' })).toBe(null);
    expect(requiredGatewayCapabilities('jake.draft_message', { outputMode: 'json' })).toBe(null);
    // Missing / unsupported / malformed profile → null.
    for (const badProfile of [null, undefined, 'text', 42, {}, { outputMode: null }, { outputMode: 42 }, { outputMode: 'markdown' }]) {
      expect(requiredGatewayCapabilities('text.copy', badProfile), String(badProfile)).toBe(null);
    }
  });

  it('unknown or hostile actionType returns null and never throws', () => {
    const profile = getActionProfile('text.copy');
    for (const bad of ['image.poster', 'text.strategy', 'unknown.action', '', 'TEXT.COPY', ' text.copy ', 42, null, undefined, {}, ['text.copy'], '__proto__', 'constructor', 'toString']) {
      expect(requiredGatewayCapabilities(bad, profile), String(bad)).toBe(null);
    }
    const throwingProfile = new Proxy({}, { get() { throw new Error('trap'); } });
    expect(() => requiredGatewayCapabilities('text.copy', throwingProfile)).not.toThrow();
    expect(requiredGatewayCapabilities('text.copy', throwingProfile)).toBe(null);
  });
});

// ---------------------------------------------------------------
// index.ts wiring pins (source level)
// ---------------------------------------------------------------
describe('index.ts registry wiring (source pins)', () => {
  it('no longer imports or calls runGeminiText directly', () => {
    expect(indexSrc.includes('runGeminiText')).toBe(false);
    expect(indexSrc.includes("from './geminiProvider.ts'")).toBe(false);
  });

  it('imports the registry from the canonical shared path and the adapter module', () => {
    expect(indexSrc).toMatch(/import\s*\{\s*createExecutionRegistry\s*\}\s*from\s*'\.\.\/_shared\/aiExecutionRegistry\.js'/);
    expect(indexSrc).toMatch(/import\s*\{\s*geminiAdapter,\s*requiredGatewayCapabilities\s*\}\s*from\s*'\.\/geminiAdapter\.ts'/);
  });

  it('creates exactly ONE registry instance and performs exactly ONE registration (gemini only)', () => {
    expect(indexSrc.match(/createExecutionRegistry\(\)/g) || []).toHaveLength(1);
    expect(indexSrc.match(/\.register\(/g) || []).toHaveLength(1);
    expect(indexSrc.includes('executionRegistry.register(geminiAdapter)')).toBe(true);
    // Fail-fast, content-free initialization error on registration failure.
    expect(indexSrc.includes("throw new Error('ai-gateway: gemini adapter registration failed')")).toBe(true);
    // No other provider adapter is registered or referenced.
    for (const banned of ['openaiAdapter', 'anthropicAdapter', 'claudeAdapter', 'ollamaAdapter']) {
      expect(indexSrc.includes(banned), banned).toBe(false);
    }
  });

  it('the execution gate is unchanged', () => {
    expect(indexSrc.includes("isGeminiExecutableAction(decision.actionType) && decision.routing.selectedProvider === 'gemini'")).toBe(true);
  });

  it('selection request is built ONLY from server-owned routing + the static map', () => {
    const call = indexSrc.match(/selectAdapter\(\{[\s\S]*?\}\)/);
    expect(call).not.toBe(null);
    expect(call[0].includes('decision.routing.selectedProvider')).toBe(true);
    expect(call[0].includes('requiredCapabilities')).toBe(true);
    // No caller-controlled source can feed the request.
    for (const banned of ['body', 'payload', 'options', 'req.']) {
      expect(call[0].includes(banned), `selection request must not read: ${banned}`).toBe(false);
    }
    expect(indexSrc.match(/selectAdapter\(/g) || []).toHaveLength(1);
  });

  it('calls selection.adapter.run(decision, profile) exactly once', () => {
    expect(indexSrc.includes('selection.adapter.run(decision, profile)')).toBe(true);
    expect(indexSrc.match(/\.adapter\.run\(/g) || []).toHaveLength(1);
  });

  it('ordering: validate → reserve budget → required capabilities → select → run → recordUsage', () => {
    const v = indexSrc.indexOf('validateAiGatewayInput(decision.actionType');
    const b = indexSrc.indexOf('reserveAiBudget({');
    const c = indexSrc.indexOf('requiredGatewayCapabilities(decision.actionType');
    const s = indexSrc.indexOf('executionRegistry.selectAdapter(');
    const r = indexSrc.indexOf('.adapter.run(decision');
    expect(v).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(v);
    expect(c).toBeGreaterThan(b);
    expect(s).toBeGreaterThan(c);
    expect(r).toBeGreaterThan(s);
    // Usage recording still follows execution.
    expect(indexSrc.indexOf('recordUsage', r)).toBeGreaterThan(r);
  });

  it('capability and selection failures return 502 BEFORE execution with gemini-attributed content-free logging', () => {
    const r = indexSrc.indexOf('.adapter.run(decision');
    const capFail = indexSrc.indexOf('requiredCapabilities === null');
    const selFail = indexSrc.indexOf('!selection.ok');
    expect(capFail).toBeGreaterThan(-1);
    expect(selFail).toBeGreaterThan(-1);
    expect(capFail).toBeLessThan(r);
    expect(selFail).toBeLessThan(r);
    // Both branches use the EXISTING Gemini-branded provider-error builder +
    // 502 + provider:'gemini' usage attribution.
    expect(/requiredCapabilities === null[\s\S]{0,400}provider: 'gemini'[\s\S]{0,200}buildProviderErrorResponse\(decision\), 502/.test(indexSrc)).toBe(true);
    expect(/!selection\.ok[\s\S]{0,400}provider: 'gemini'[\s\S]{0,200}buildProviderErrorResponse\(decision\), 502/.test(indexSrc)).toBe(true);
  });

  it('no fallback: no provider-chain traversal, no retry, no second provider call', () => {
    expect(indexSrc.includes('.providerChain')).toBe(false);
    expect(indexSrc.match(/\.adapter\.run\(/g) || []).toHaveLength(1);
    expect(indexSrc.match(/selectAdapter\(/g) || []).toHaveLength(1);
  });
});
