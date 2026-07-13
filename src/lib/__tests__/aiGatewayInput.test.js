import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  validateAiGatewayInput,
  normalizeAiGatewayInput,
  countAiGatewayInputChars,
  hasAiGatewayInputProfile,
  AI_GATEWAY_INPUT_LIMITS,
  AI_GATEWAY_INPUT_PROFILE_KEYS,
} from '../aiGatewayInput.js';
// GEMINI_EXECUTABLE_ACTION_TYPES comes through the contract shim; used to prove
// the input registry never drifts from the executable action set.
import { GEMINI_EXECUTABLE_ACTION_TYPES } from '../aiGatewayContract.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ACTIONS = ['text.copy', 'text.crm_message', 'studio.prompt_enhance', 'crm.suggest_next_action'];
const isReject = (r) => Boolean(r) && r.ok === false
  && r.error && r.error.code === 'invalid_payload' && typeof r.error.reason === 'string';

describe('input contract · profile registry', () => {
  it('all 4 current executable actions have an input profile', () => {
    for (const a of ACTIONS) expect(hasAiGatewayInputProfile(a), a).toBe(true);
  });

  it('the profile-key set equals the gemini-executable action set (never drifts)', () => {
    expect([...AI_GATEWAY_INPUT_PROFILE_KEYS].sort())
      .toEqual([...GEMINI_EXECUTABLE_ACTION_TYPES].sort());
  });

  it('the profile-key list and the limits are frozen', () => {
    expect(Object.isFrozen(AI_GATEWAY_INPUT_PROFILE_KEYS)).toBe(true);
    expect(Object.isFrozen(AI_GATEWAY_INPUT_LIMITS)).toBe(true);
    expect(AI_GATEWAY_INPUT_LIMITS.MAX_PROMPT_CHARS).toBe(20000);
  });

  it('normalizes action casing/whitespace before lookup', () => {
    expect(hasAiGatewayInputProfile('  TEXT.COPY ')).toBe(true);
  });

  it('unknown or non-executable actions have no profile and fail safely', () => {
    expect(hasAiGatewayInputProfile('text.hack')).toBe(false);
    expect(hasAiGatewayInputProfile('image.poster')).toBe(false); // valid vocab, not executable
    expect(isReject(validateAiGatewayInput('text.hack', { prompt: 'x' }))).toBe(true);
    expect(isReject(validateAiGatewayInput('image.poster', { prompt: 'x' }))).toBe(true);
    expect(validateAiGatewayInput('image.poster', { prompt: 'x' }).error.reason).toBe('unsupported_action');
    expect(normalizeAiGatewayInput('text.hack', { prompt: 'x' })).toBe(null);
  });
});

describe('input contract · valid prompt payloads', () => {
  it('normalizes to a FRESH trimmed { prompt } with matching inputChars', () => {
    for (const a of ACTIONS) {
      const r = validateAiGatewayInput(a, { prompt: '  hello world  ' });
      expect(r.ok, a).toBe(true);
      expect(r.actionType).toBe(a);
      expect(r.payload).toEqual({ prompt: 'hello world' });
      expect(r.inputChars).toBe('hello world'.length);
    }
  });

  it('preserves inner content — only OUTER whitespace is trimmed', () => {
    const r = validateAiGatewayInput('text.copy', { prompt: '  a\n  b  ' });
    expect(r.payload.prompt).toBe('a\n  b');
    expect(r.inputChars).toBe('a\n  b'.length);
  });

  it('accepts a prompt exactly at the limit and rejects one over (no truncation)', () => {
    const atLimit = 'x'.repeat(AI_GATEWAY_INPUT_LIMITS.MAX_PROMPT_CHARS);
    const ok = validateAiGatewayInput('text.copy', { prompt: atLimit });
    expect(ok.ok).toBe(true);
    expect(ok.inputChars).toBe(AI_GATEWAY_INPUT_LIMITS.MAX_PROMPT_CHARS);

    const over = 'x'.repeat(AI_GATEWAY_INPUT_LIMITS.MAX_PROMPT_CHARS + 1);
    const r = validateAiGatewayInput('text.copy', { prompt: over });
    expect(isReject(r)).toBe(true);
    expect(r.error.reason).toBe('field_too_long');
  });

  it('countAiGatewayInputChars matches the normalized prompt length', () => {
    const norm = normalizeAiGatewayInput('text.copy', { prompt: '  hi  ' });
    expect(norm).toEqual({ prompt: 'hi' });
    expect(countAiGatewayInputChars('text.copy', norm)).toBe(2);
    expect(countAiGatewayInputChars('text.hack', norm)).toBe(0); // unknown action
    expect(countAiGatewayInputChars('text.copy', null)).toBe(0); // non-object
  });
});

describe('input contract · rejects invalid payloads', () => {
  it('rejects non-object / array / primitive payloads', () => {
    for (const p of [null, undefined, 42, NaN, 'str', true, false, []]) {
      expect(isReject(validateAiGatewayInput('text.copy', p)), String(p)).toBe(true);
    }
    expect(validateAiGatewayInput('text.copy', []).error.reason).toBe('payload_array');
    expect(validateAiGatewayInput('text.copy', 42).error.reason).toBe('payload_not_object');
  });

  it('rejects missing / empty / whitespace / non-string prompt', () => {
    expect(validateAiGatewayInput('text.copy', {}).error.reason).toBe('missing_field');
    expect(validateAiGatewayInput('text.copy', { prompt: '' }).error.reason).toBe('empty_field');
    expect(validateAiGatewayInput('text.copy', { prompt: '    ' }).error.reason).toBe('empty_field');
    for (const v of [1, true, null, {}, []]) {
      expect(isReject(validateAiGatewayInput('text.copy', { prompt: v })), String(v)).toBe(true);
    }
  });

  it('rejects unknown fields incl. provider/model/apiKey/system/options/temperature/maxTokens', () => {
    for (const extra of ['provider', 'model', 'apiKey', 'system', 'options', 'temperature', 'maxTokens', 'brief', 'foo']) {
      const r = validateAiGatewayInput('text.copy', { prompt: 'x', [extra]: 'y' });
      expect(isReject(r), extra).toBe(true);
      expect(r.error.reason, extra).toBe('unknown_field');
    }
  });

  it('rejects prototype-pollution keys (__proto__ / constructor / prototype) and symbol keys', () => {
    // JSON.parse creates a REAL own __proto__ / prototype data property.
    expect(isReject(validateAiGatewayInput('text.copy', JSON.parse('{"__proto__":{"x":1},"prompt":"y"}')))).toBe(true);
    expect(isReject(validateAiGatewayInput('text.copy', JSON.parse('{"prototype":1,"prompt":"y"}')))).toBe(true);
    expect(isReject(validateAiGatewayInput('text.copy', { constructor: 1, prompt: 'y' }))).toBe(true);
    expect(isReject(validateAiGatewayInput('text.copy', { [Symbol('s')]: 1, prompt: 'y' }))).toBe(true);
    // and the pollution never took effect on Object.prototype
    expect({}.x).toBe(undefined);
  });

  it('rejects nested objects/arrays, deep nesting, and cycles without crashing', () => {
    expect(isReject(validateAiGatewayInput('text.copy', { prompt: { a: 1 } }))).toBe(true);
    expect(isReject(validateAiGatewayInput('text.copy', { prompt: [1, 2] }))).toBe(true);
    let deep = {}; let cur = deep;
    for (let i = 0; i < 20; i += 1) { cur.n = {}; cur = cur.n; }
    expect(isReject(validateAiGatewayInput('text.copy', { extra: deep }))).toBe(true);
    const cyc = { prompt: 'x' }; cyc.self = cyc;
    const r = validateAiGatewayInput('text.copy', cyc);
    expect(isReject(r)).toBe(true);
  });

  it('rejects class instances / Date / Map / Set / objects with a custom prototype', () => {
    class Foo { constructor() { this.prompt = 'x'; } }
    for (const p of [new Foo(), new Date(), new Map(), new Set(), Object.create({ inherited: 1 })]) {
      expect(isReject(validateAiGatewayInput('text.copy', p))).toBe(true);
    }
  });

  it('rejects a hostile throwing getter WITHOUT invoking it', () => {
    let invoked = false;
    const p = {};
    Object.defineProperty(p, 'prompt', {
      enumerable: true, configurable: true,
      get() { invoked = true; throw new Error('boom'); },
    });
    const r = validateAiGatewayInput('text.copy', p);
    expect(isReject(r)).toBe(true);
    expect(invoked).toBe(false);
  });
});

describe('input contract · safety invariants', () => {
  const HOSTILE = [
    null, undefined, 42, NaN, {}, [], ['x'], { a: 1 }, '', '   ',
    'x'.repeat(30000), true, false, Symbol('s'),
  ];
  const ACTION_INPUTS = [...ACTIONS, 'text.hack', null, 42, {}, [], undefined];

  it('never throws for any action/payload combination', () => {
    for (const a of ACTION_INPUTS) {
      for (const p of HOSTILE) {
        expect(() => validateAiGatewayInput(a, p)).not.toThrow();
        expect(() => normalizeAiGatewayInput(a, p)).not.toThrow();
        expect(() => countAiGatewayInputChars(a, p)).not.toThrow();
      }
      expect(() => hasAiGatewayInputProfile(a)).not.toThrow();
    }
  });

  it('never mutates the caller payload (frozen input still validates)', () => {
    const p = Object.freeze({ prompt: '  hi  ' }); // any write would throw
    const r = validateAiGatewayInput('text.copy', p);
    expect(r.ok).toBe(true);
    expect(r.payload).not.toBe(p);
    expect(p).toEqual({ prompt: '  hi  ' });
  });

  it('error output is content-free (fixed reason slug, no prompt echoed)', () => {
    const secret = 'SUPER_SECRET_PROMPT_LEAK';
    const r = validateAiGatewayInput('text.copy', { prompt: secret, evilKey: secret });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(/^[a-z_]+$/.test(r.error.reason)).toBe(true);
    expect(r.error.code).toBe('invalid_payload');
  });
});

describe('input contract · src/lib shim is a pure re-export', () => {
  it('src/lib/aiGatewayInput.js re-exports the canonical _shared module only', () => {
    const shim = read('../aiGatewayInput.js');
    const codeOnly = shim
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => l.trim() && !/^\s*\/\//.test(l)).join('\n').trim();
    expect(codeOnly).toBe("export * from '../../supabase/functions/_shared/aiGatewayInput.js';");
    for (const token of ['function ', 'Object.freeze', 'const ', 'validateAiGatewayInput =']) {
      expect(codeOnly.includes(token), token).toBe(false);
    }
  });
});
