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
import { GEMINI_EXECUTABLE_ACTION_TYPES, GEMINI_IMAGE_EXECUTABLE_ACTION_TYPES } from '../aiGatewayContract.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ACTIONS = ['text.copy', 'text.crm_message', 'studio.prompt_enhance', 'crm.suggest_next_action'];
const isReject = (r) => Boolean(r) && r.ok === false
  && r.error && r.error.code === 'invalid_payload' && typeof r.error.reason === 'string';
const isRejectReason = (r, reason) => isReject(r) && r.error.reason === reason;

describe('input contract · profile registry', () => {
  it('all 4 current executable actions have an input profile', () => {
    for (const a of ACTIONS) expect(hasAiGatewayInputProfile(a), a).toBe(true);
  });

  it('the profile-key set equals the gemini-executable action set (never drifts)', () => {
    // M2 J3C S4.1: the input registry covers the TEXT executable set PLUS the
    // image-executable set (studio.generate_image) — nothing else.
    expect([...AI_GATEWAY_INPUT_PROFILE_KEYS].sort())
      .toEqual([...GEMINI_EXECUTABLE_ACTION_TYPES, ...GEMINI_IMAGE_EXECUTABLE_ACTION_TYPES].sort());
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
    // These are exactly the authority/unknown fields the Edge feeds RAW (see the
    // index.ts source guards in aiGatewayContract.test.js): each must be REJECTED,
    // never silently stripped.
    for (const extra of ['provider', 'model', 'apiKey', 'system', 'options', 'temperature', 'maxTokens', 'arbitraryUnknown', 'brief', 'foo']) {
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

describe('input contract · multi-turn profile (text.multi_turn, C2)', () => {
  const MT = 'text.multi_turn';
  const msgs = (...texts) => texts.map((t, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: t }));

  it('text.multi_turn has a profile and the registry still equals the executable set', () => {
    expect(hasAiGatewayInputProfile(MT)).toBe(true);
    // M2 J3C S4.1: text executable set + the image-executable set.
    expect([...AI_GATEWAY_INPUT_PROFILE_KEYS].sort())
      .toEqual([...GEMINI_EXECUTABLE_ACTION_TYPES, ...GEMINI_IMAGE_EXECUTABLE_ACTION_TYPES].sort());
  });

  it('valid multi-turn payload normalizes to fresh trimmed messages + correct inputChars', () => {
    const payload = {
      messages: [
        { role: 'user', text: '  draft a follow-up  ' },
        { role: 'assistant', text: 'here is a draft' },
        { role: 'user', text: 'shorter' },
      ],
    };
    const r = validateAiGatewayInput(MT, payload);
    expect(r.ok).toBe(true);
    expect(r.actionType).toBe(MT);
    expect(r.payload.messages).toEqual([
      { role: 'user', text: 'draft a follow-up' },
      { role: 'assistant', text: 'here is a draft' },
      { role: 'user', text: 'shorter' },
    ]);
    expect(r.payload.messages).not.toBe(payload.messages);
    expect('context' in r.payload).toBe(false);
    expect(r.inputChars).toBe('draft a follow-up'.length + 'here is a draft'.length + 'shorter'.length);
    // caller input untouched
    expect(payload.messages[0].text).toBe('  draft a follow-up  ');
  });

  it('valid context { summary } is trimmed, normalized, and counted', () => {
    const r = validateAiGatewayInput(MT, {
      messages: msgs('write it'),
      context: { summary: '  Client owes 3,500  ' },
    });
    expect(r.ok).toBe(true);
    expect(r.payload.context).toEqual({ summary: 'Client owes 3,500' });
    expect(r.inputChars).toBe('write it'.length + 'Client owes 3,500'.length);
    expect(countAiGatewayInputChars(MT, r.payload)).toBe(r.inputChars);
  });

  it('multi-turn action does NOT accept a prompt payload; prompt actions do NOT accept messages', () => {
    expect(isRejectReason(validateAiGatewayInput(MT, { prompt: 'x' }), 'unknown_field')).toBe(true);
    expect(isRejectReason(validateAiGatewayInput('text.copy', { messages: msgs('x') }), 'unknown_field')).toBe(true);
  });

  it('rejects missing/empty/non-array/oversized messages', () => {
    expect(isRejectReason(validateAiGatewayInput(MT, {}), 'missing_field')).toBe(true);
    expect(isRejectReason(validateAiGatewayInput(MT, { messages: [] }), 'messages_empty')).toBe(true);
    expect(isRejectReason(validateAiGatewayInput(MT, { messages: 'hi' }), 'messages_not_array')).toBe(true);
    expect(isRejectReason(validateAiGatewayInput(MT, { messages: { 0: 'x' } }), 'messages_not_array')).toBe(true);
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: 'x' }));
    expect(isRejectReason(validateAiGatewayInput(MT, { messages: tooMany }), 'too_many_messages')).toBe(true);
    // 20 messages is accepted
    const atLimit = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: 'x' }));
    expect(validateAiGatewayInput(MT, { messages: atLimit }).ok).toBe(true);
  });

  it('rejects malformed message objects (shape, keys, role, text)', () => {
    const cases = [
      [{ messages: ['x'] }, 'message_not_object'],
      [{ messages: [null] }, 'message_not_object'],
      [{ messages: [{ role: 'user', text: 'x', extra: 1 }] }, 'message_unknown_field'],
      [{ messages: [{ text: 'x' }] }, 'invalid_role'],           // missing role
      [{ messages: [{ role: 'user' }] }, 'field_not_string'],    // missing text
      [{ messages: [{ role: 'system', text: 'x' }] }, 'invalid_role'],
      [{ messages: [{ role: 'tool', text: 'x' }] }, 'invalid_role'],
      [{ messages: [{ role: 'developer', text: 'x' }] }, 'invalid_role'],
      [{ messages: [{ role: 'model', text: 'x' }] }, 'invalid_role'],
      [{ messages: [{ role: 'user', text: '' }] }, 'empty_field'],
      [{ messages: [{ role: 'user', text: '   ' }] }, 'empty_field'],
      [{ messages: [{ role: 'user', text: 42 }] }, 'field_not_string'],
    ];
    for (const [payload, reason] of cases) {
      expect(isRejectReason(validateAiGatewayInput(MT, payload), reason), reason).toBe(true);
    }
  });

  it('enforces per-message, combined, and first-role limits without truncation', () => {
    const over = 'x'.repeat(AI_GATEWAY_INPUT_LIMITS.MAX_MESSAGE_CHARS + 1);
    expect(isRejectReason(validateAiGatewayInput(MT, { messages: [{ role: 'user', text: over }] }), 'message_too_long')).toBe(true);
    const atMax = 'x'.repeat(AI_GATEWAY_INPUT_LIMITS.MAX_MESSAGE_CHARS);
    expect(validateAiGatewayInput(MT, { messages: [{ role: 'user', text: atMax }] }).ok).toBe(true);
    // 8 × 4000 = 32,000 > 30,000 combined → rejected (each message individually legal)
    const eight = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: atMax }));
    expect(isRejectReason(validateAiGatewayInput(MT, { messages: eight }), 'messages_too_long')).toBe(true);
    // first message must be user
    expect(isRejectReason(
      validateAiGatewayInput(MT, { messages: [{ role: 'assistant', text: 'a' }, { role: 'user', text: 'b' }] }),
      'first_message_not_user',
    )).toBe(true);
  });

  it('rejects hostile structures inside messages (getter/symbol/dangerous key/class/cycle/depth)', () => {
    let invoked = false;
    const withGetter = { role: 'user' };
    Object.defineProperty(withGetter, 'text', { enumerable: true, configurable: true, get() { invoked = true; return 'x'; } });
    expect(validateAiGatewayInput(MT, { messages: [withGetter] }).ok).toBe(false);
    expect(invoked).toBe(false);
    expect(validateAiGatewayInput(MT, { messages: [{ role: 'user', text: 'x', [Symbol('s')]: 1 }] }).ok).toBe(false);
    expect(validateAiGatewayInput(MT, { messages: [JSON.parse('{"role":"user","text":"x","__proto__":{"p":1}}')] }).ok).toBe(false);
    class Msg { constructor() { this.role = 'user'; this.text = 'x'; } }
    expect(validateAiGatewayInput(MT, { messages: [new Msg()] }).ok).toBe(false);
    const cyc = { role: 'user', text: 'x' }; cyc.self = cyc;
    expect(validateAiGatewayInput(MT, { messages: [cyc] }).ok).toBe(false);
    let deep = {}; let cur = deep;
    for (let i = 0; i < 10; i += 1) { cur.n = {}; cur = cur.n; }
    expect(validateAiGatewayInput(MT, { messages: [{ role: 'user', text: 'x' }], context: { summary: 'ok' }, extra: deep }).ok).toBe(false);
  });

  it('context: rejects unknown keys, wrong shapes, instruction-like/authority fields, over-limit', () => {
    const m = msgs('hi');
    const cases = [
      [{ messages: m, context: 'x' }, 'context_not_object'],
      [{ messages: m, context: ['x'] }, 'context_not_object'],
      [{ messages: m, context: {} }, 'missing_field'],
      [{ messages: m, context: { summary: 'ok', extra: 1 } }, 'context_unknown_field'],
      [{ messages: m, context: { summary: 'ok', system: 'evil' } }, 'context_unknown_field'],
      [{ messages: m, context: { summary: 'ok', prompt: 'evil' } }, 'context_unknown_field'],
      [{ messages: m, context: { provider: 'gemini', summary: 'ok' } }, 'context_unknown_field'],
      [{ messages: m, context: { model: 'x', summary: 'ok' } }, 'context_unknown_field'],
      [{ messages: m, context: { options: {}, summary: 'ok' } }, 'context_unknown_field'],
      [{ messages: m, context: { role: 'system', summary: 'ok' } }, 'context_unknown_field'],
      [{ messages: m, context: { records: [], summary: 'ok' } }, 'context_unknown_field'],
      [{ messages: m, context: { summary: 42 } }, 'field_not_string'],
      [{ messages: m, context: { summary: '  ' } }, 'empty_field'],
      [{ messages: m, context: { summary: { nested: 1 } } }, 'field_not_string'],
      [{ messages: m, context: { summary: 'x'.repeat(AI_GATEWAY_INPUT_LIMITS.MAX_CONTEXT_CHARS + 1) } }, 'context_too_long'],
    ];
    for (const [payload, reason] of cases) {
      expect(isRejectReason(validateAiGatewayInput(MT, payload), reason), reason).toBe(true);
    }
    // context at limit accepted (no truncation)
    const atMax = 'x'.repeat(AI_GATEWAY_INPUT_LIMITS.MAX_CONTEXT_CHARS);
    const ok = validateAiGatewayInput(MT, { messages: m, context: { summary: atMax } });
    expect(ok.ok).toBe(true);
    expect(ok.payload.context.summary.length).toBe(AI_GATEWAY_INPUT_LIMITS.MAX_CONTEXT_CHARS);
    // context getter (non-data descriptor) rejected without invocation
    let invoked = false;
    const p = { messages: m };
    Object.defineProperty(p, 'context', { enumerable: true, configurable: true, get() { invoked = true; return {}; } });
    expect(validateAiGatewayInput(MT, p).ok).toBe(false);
    expect(invoked).toBe(false);
  });

  it('multi-turn errors are content-free and never throw on hostile shapes', () => {
    const secret = 'MT_SECRET_CONTENT';
    const r = validateAiGatewayInput(MT, { messages: [{ role: 'wizard', text: secret }] });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(secret);
    for (const p of [null, [], 'x', 42, { messages: [Symbol('s')] }]) {
      expect(() => validateAiGatewayInput(MT, p)).not.toThrow();
    }
  });
});

describe('input contract · all-own-key structural enforcement (non-enumerable)', () => {
  it('rejects a NON-enumerable unknown own field (not silently accepted)', () => {
    const o = { prompt: 'hello' };
    Object.defineProperty(o, 'provider', { value: 'evil', enumerable: false, configurable: true });
    // the visible (enumerable) shape looks like a clean { prompt } ...
    expect(Object.keys(o)).toEqual(['prompt']);
    // ... but the contract still rejects the hidden field.
    expect(isReject(validateAiGatewayInput('text.copy', o))).toBe(true);
  });

  it('rejects a NON-enumerable dangerous own key (constructor)', () => {
    const o = { prompt: 'x' };
    Object.defineProperty(o, 'constructor', { value: 1, enumerable: false, configurable: true });
    expect(validateAiGatewayInput('text.copy', o).error.reason).toBe('dangerous_key');
  });

  it('rejects a NON-enumerable getter WITHOUT invoking it', () => {
    let invoked = false;
    const o = { prompt: 'x' };
    Object.defineProperty(o, 'sneaky', {
      enumerable: false, configurable: true, get() { invoked = true; return 1; },
    });
    expect(isReject(validateAiGatewayInput('text.copy', o))).toBe(true);
    expect(invoked).toBe(false);
  });

  it('rejects a NON-enumerable getter on prompt itself WITHOUT invoking it', () => {
    let invoked = false;
    const o = {};
    Object.defineProperty(o, 'prompt', {
      enumerable: false, configurable: true, get() { invoked = true; throw new Error('x'); },
    });
    expect(isReject(validateAiGatewayInput('text.copy', o))).toBe(true);
    expect(invoked).toBe(false);
  });

  it('applies the key-count limit across ALL own string keys (enumerable + non-enumerable)', () => {
    const o = { prompt: 'x' };
    for (let i = 0; i < 20; i += 1) o[`e${i}`] = i; // enumerable
    for (let i = 0; i < 20; i += 1) Object.defineProperty(o, `n${i}`, { value: i, enumerable: false });
    const r = validateAiGatewayInput('text.copy', o);
    expect(isReject(r)).toBe(true);
    expect(r.error.reason).toBe('too_many_keys');
  });

  it('does NOT treat a standard array `length` as a user field (arrays stay descriptor-safe)', () => {
    // A nested array under an unknown key is traversed descriptor-safely (length is
    // never counted as a field); the unknown key is what gets rejected.
    const r = validateAiGatewayInput('text.copy', { extra: [1, 2, 3] });
    expect(isReject(r)).toBe(true);
    // a valid { prompt } alongside nothing else still passes (no phantom length key)
    expect(validateAiGatewayInput('text.copy', { prompt: 'ok' }).ok).toBe(true);
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
