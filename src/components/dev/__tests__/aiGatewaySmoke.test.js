import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  runSmoke,
  describeSmokeResult,
  SMOKE_ACTION_TYPE,
  SMOKE_PROMPT,
} from '../AiGatewaySmoke.jsx';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const SRC = read('../AiGatewaySmoke.jsx');
// executable code only — the header comment legitimately documents the bans
const CODE = SRC.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

describe('smoke call logic (pure)', () => {
  it('uses the fixed, safe action + prompt', () => {
    expect(SMOKE_ACTION_TYPE).toBe('text.copy');
    expect(SMOKE_PROMPT).toBe('Write one short sentence saying ArtValue AI Gateway is connected.');
  });

  it('calls the injected client with exactly (text.copy, {prompt}) — no provider/model', () => {
    const call = vi.fn().mockResolvedValue({ ok: true });
    runSmoke(call);
    expect(call).toHaveBeenCalledTimes(1);
    const [actionType, payload] = call.mock.calls[0];
    expect(actionType).toBe('text.copy');
    expect(payload).toEqual({ prompt: SMOKE_PROMPT });
    expect('provider' in payload).toBe(false);
    expect('model' in payload).toBe(false);
  });

  it('is a function that does not fire on import (no auto-run)', () => {
    // importing the module above did not invoke any gateway call; runSmoke is inert until called
    expect(typeof runSmoke).toBe('function');
  });
});

describe('result mapping (pure)', () => {
  it('maps a successful gateway result to compact display fields', () => {
    const v = describeSmokeResult({
      ok: true, provider: 'gemini',
      execution: { status: 'completed' },
      result: { text: 'ArtValue AI Gateway is connected.' },
      usage: { logging: 'deferred', budgetCheck: 'deferred' },
    });
    expect(v).toEqual({
      ok: true, provider: 'gemini', status: 'completed',
      text: 'ArtValue AI Gateway is connected.', logging: 'deferred', budgetCheck: 'deferred',
    });
  });

  it('maps a normalized error result to code/message/status', () => {
    const v = describeSmokeResult({ ok: false, error: { code: 'provider_error', message: 'x' }, execution: { status: 'provider_error' } });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('provider_error');
    expect(v.message).toBe('x');
    expect(v.status).toBe('provider_error');
  });

  it('never throws on garbage input', () => {
    for (const g of [null, undefined, 42, [], 'x', {}]) {
      expect(() => describeSmokeResult(g)).not.toThrow();
      expect(describeSmokeResult(g).ok).not.toBe(true);
    }
  });
});

describe('source guardrails · dev smoke component', () => {
  it('has exactly one button, idle + loading labels, and no editable input', () => {
    expect((SRC.match(/<button/g) || []).length).toBe(1);
    expect(SRC.includes('בדיקת AI Gateway')).toBe(true); // idle label
    expect(SRC.includes('שולח…')).toBe(true); // loading label
    expect(SRC.includes('<input')).toBe(false);
    expect(SRC.includes('<textarea')).toBe(false);
  });

  it('calls only the client (no direct invoke), on click, never auto-runs', () => {
    expect(SRC).toMatch(/from '\.\.\/\.\.\/lib\/aiGatewayClient\.js'/);
    expect(CODE.includes('runSmoke(callAiGateway)')).toBe(true);
    expect(CODE.includes('onClick={onClick}')).toBe(true);
    // no direct edge-function call, no effect-driven auto-run (executable lines only)
    expect(CODE.includes('functions.invoke')).toBe(false);
    expect(CODE.includes('useEffect')).toBe(false);
  });

  it('no persistence, navigation, keys, or provider secrets (executable lines only)', () => {
    for (const banned of [
      'localStorage', 'sessionStorage', 'window.location', 'useNavigate', 'navigate(',
      'VITE_GEMINI_API_KEY', 'GEMINI_API_KEY', 'X-goog-api-key', 'AIza', 'import.meta.env.VITE',
    ]) {
      expect(CODE.includes(banned), banned).toBe(false);
    }
  });
});
