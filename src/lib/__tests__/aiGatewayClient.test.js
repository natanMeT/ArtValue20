import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Mock the Supabase helper so the client's feature-detect + invoke path is
// controllable per test. The action-vocab / sanitizer shims stay REAL.
const gwState = vi.hoisted(() => ({ configured: true, invoke: vi.fn() }));
vi.mock('../supabase.js', () => ({
  get isSupabaseConfigured() { return gwState.configured; },
  get supabase() { return gwState.configured ? { functions: { invoke: gwState.invoke } } : null; },
}));

import {
  callAiGateway,
  buildGatewayInvokeArgs,
  normalizeGatewayResult,
  AI_GATEWAY_CLIENT_CODES,
} from '../aiGatewayClient.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const HOSTILE = [null, undefined, 42, NaN, {}, [], 'x'.repeat(5000), 'DROP', true, false];

const successBody = {
  ok: true,
  actionType: 'text.copy',
  routing: { selectedProvider: 'gemini' },
  provider: 'gemini',
  execution: { status: 'completed' },
  result: { text: 'AI Gateway operational.' },
  usage: { logging: 'deferred', budgetCheck: 'deferred' },
};

beforeEach(() => {
  gwState.configured = true;
  gwState.invoke = vi.fn();
});

describe('public API', () => {
  it('callAiGateway exists with no provider/model parameter', () => {
    expect(typeof callAiGateway).toBe('function');
    expect(callAiGateway.length).toBe(1); // (actionType) required; payload defaulted — no provider/model params
  });
});

describe('buildGatewayInvokeArgs (pure)', () => {
  it('builds ai-gateway args for a valid action', () => {
    const a = buildGatewayInvokeArgs('text.copy', { prompt: 'hi' });
    expect(a).toEqual({ ok: true, name: 'ai-gateway', body: { actionType: 'text.copy', payload: { prompt: 'hi' } } });
  });

  it('strips provider/model/apiKey/secret/token payload fields', () => {
    const a = buildGatewayInvokeArgs('text.copy', {
      prompt: 'keep', provider: 'evil', model: 'm', apiKey: 'k', secret: 's', token: 't',
    });
    expect(a.body.payload).toEqual({ prompt: 'keep' });
    const flat = JSON.stringify(a.body);
    for (const leak of ['evil', 'apiKey', 'secret', '"token"', '"model"', '"provider"']) {
      expect(flat.includes(leak), leak).toBe(false);
    }
  });

  it('deterministically rejects an invalid action (no network shape)', () => {
    const a = buildGatewayInvokeArgs('text.hack', { prompt: 'x' });
    expect(a.ok).toBe(false);
    expect(a.error.code).toBe('invalid_action');
    expect(a.name).toBeUndefined();
  });

  it('normalizes action casing/whitespace and never throws', () => {
    expect(buildGatewayInvokeArgs('  TEXT.COPY ').body.actionType).toBe('text.copy');
    for (const h of HOSTILE) expect(() => buildGatewayInvokeArgs(h, h)).not.toThrow();
  });
});

describe('normalizeGatewayResult (pure)', () => {
  it('normalizes a successful server body', () => {
    const r = normalizeGatewayResult(successBody, null);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('gemini');
    expect(r.execution).toEqual({ status: 'completed' });
    expect(r.result).toEqual({ text: 'AI Gateway operational.' });
  });

  it('normalizes server ok:false bodies (invalid_action / provider_not_configured / provider_error)', () => {
    for (const code of ['invalid_action', 'provider_not_configured', 'provider_error', 'invalid_payload', 'not_implemented']) {
      const r = normalizeGatewayResult({ ok: false, actionType: 'text.copy', error: { code, message: 'm' }, execution: { status: 'rejected' } }, null);
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe(code);
    }
  });

  it('normalizes a client/network/config error signal', () => {
    const r = normalizeGatewayResult(null, { code: 'network_error', message: 'boom' });
    expect(r).toEqual({ ok: false, error: { code: 'network_error', message: 'boom' }, execution: { status: 'rejected' } });
  });

  it('unrecognized/hostile shapes → safe gateway_error, never throws', () => {
    for (const h of HOSTILE) {
      expect(() => normalizeGatewayResult(h, null)).not.toThrow();
      const r = normalizeGatewayResult(h, null);
      if (h && typeof h === 'object' && !Array.isArray(h) && h.ok === true) continue;
      expect(r.ok).toBe(false);
    }
  });
});

describe('callAiGateway (integration, mocked invoke)', () => {
  it('invokes ai-gateway with actionType + sanitized payload only', async () => {
    gwState.invoke.mockResolvedValue({ data: successBody, error: null });
    const r = await callAiGateway('text.copy', { prompt: 'hi', apiKey: 'leak', provider: 'evil' });
    expect(gwState.invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = gwState.invoke.mock.calls[0];
    expect(name).toBe('ai-gateway');
    expect(opts.body).toEqual({ actionType: 'text.copy', payload: { prompt: 'hi' } });
    expect(r.ok).toBe(true);
    expect(r.result.text).toBe('AI Gateway operational.');
  });

  it('invalid action fails fast without calling invoke', async () => {
    const r = await callAiGateway('text.hack', { prompt: 'x' });
    expect(gwState.invoke).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('invalid_action');
  });

  it('recovers a server error body from error.context (provider_not_configured)', async () => {
    gwState.invoke.mockResolvedValue({
      data: null,
      error: { context: { status: 503, json: async () => ({ ok: false, actionType: 'text.copy', error: { code: 'provider_not_configured', message: 'x' }, execution: { status: 'provider_not_configured' } }) } },
    });
    const r = await callAiGateway('text.copy', { prompt: 'hi' });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('provider_not_configured');
  });

  it('maps a 401 with no readable body to unauthorized', async () => {
    gwState.invoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } });
    const r = await callAiGateway('text.copy', { prompt: 'hi' });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('unauthorized');
  });

  it('normalizes a thrown invoke (network failure) and does not throw', async () => {
    gwState.invoke.mockRejectedValue(new Error('network down'));
    const r = await callAiGateway('text.copy', { prompt: 'hi' });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('network_error');
  });

  it('returns supabase_not_configured (no invoke) when Supabase is absent', async () => {
    gwState.configured = false;
    const r = await callAiGateway('text.copy', { prompt: 'hi' });
    expect(gwState.invoke).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('supabase_not_configured');
  });
});

describe('source guardrails', () => {
  it('no provider secrets, storage, navigation, or provider domains', () => {
    const code = read('../aiGatewayClient.js');
    const importLines = (code.match(/import[^]*?from\s*'[^']+';/g) || []).join('\n');
    // imports only the supabase helper + the pure gateway shims
    expect(importLines).toMatch(/from '\.\/supabase\.js'/);
    expect(importLines).toMatch(/from '\.\/aiGateway\.js'/);
    expect(importLines).toMatch(/from '\.\/aiGatewayContract\.js'/);
    for (const forbidden of ['gemini', 'jakePack', 'jakeAgent', 'Assistant', 'ImageStudio', 'geminiImage']) {
      expect(importLines.includes(forbidden), forbidden).toBe(false);
    }
    const codeOnly = code.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of [
      'VITE_GEMINI_API_KEY', 'GEMINI_API_KEY', 'X-goog-api-key', 'AIza',
      'localStorage', 'sessionStorage', 'window.location', 'navigate(', 'useNavigate',
      'generativelanguage', 'api.openai.com', 'import.meta.env',
    ]) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});

describe('unwired proof', () => {
  it('aiGatewayClient is imported ONLY by the internal DEV smoke component', () => {
    const roots = ['../../components', '../../pages'];
    const importers = [];
    const walk = (relDir) => {
      let dir;
      try { dir = fileURLToPath(new URL(relDir, import.meta.url)); } catch { return; }
      let entries;
      try { entries = readdirSync(dir); } catch { return; }
      for (const name of entries) {
        const full = `${dir}/${name}`;
        let s;
        try { s = statSync(full); } catch { continue; }
        if (s.isDirectory()) { walk(`${relDir}/${name}`); continue; }
        if (!/\.(jsx?|tsx?)$/.test(name) || /\.test\.[jt]sx?$/.test(name)) continue;
        if (readFileSync(full, 'utf8').includes('aiGatewayClient')) importers.push(`${relDir}/${name}`);
      }
    };
    for (const r of roots) walk(r);
    // exactly one importer — the DEV-gated smoke component; nothing else
    expect(importers).toEqual(['../../components/dev/AiGatewaySmoke.jsx']);
  });

  it('client is not referenced by Assistant, ImageStudio, or Jake', () => {
    expect(read('../../components/ai/Assistant.jsx').includes('aiGatewayClient')).toBe(false);
    expect(read('../../pages/ImageStudio.jsx').includes('aiGatewayClient')).toBe(false);
    expect(read('../jakePack.js').includes('aiGatewayClient')).toBe(false);
    expect(read('../jakeAgent.js').includes('aiGatewayClient')).toBe(false);
  });
});
