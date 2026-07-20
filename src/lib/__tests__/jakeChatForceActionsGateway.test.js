import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateAiGatewayInput } from '../aiGatewayContract.js';
import { extractActions } from '../jakeAgent.js';

// M2 J2 — chatJake → jake.chat and forceActionsJake → jake.force_actions,
// migrated TOGETHER to the server-owned Gateway. These tests prove: exact
// preserved signatures and caller-visible shapes, exact payload mapping
// against the REAL deployed J1 input contracts, canonical actions-text
// passthrough into extractActions, zero frontend authority, zero direct
// provider/local reachability, zero fallback/retry, calm demo behavior, and
// an untouched Assistant propose → confirm → execute integration.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ---- behavioral seam: gemini.js with a mocked gateway client ----
vi.mock('../aiGatewayClient.js', () => ({ callAiGateway: vi.fn() }));
const { chatJake, forceActionsJake, draftWithJake } = await import('../gemini.js');
const { callAiGateway } = await import('../aiGatewayClient.js');

beforeEach(() => {
  callAiGateway.mockReset();
});

// ---------------------------------------------------------------
// 1) chatJake → jake.chat (behavior, mocked gateway)
// ---------------------------------------------------------------
describe('chatJake · gateway migration (behavior)', () => {
  it('keeps the exact signature: (history, contextText)', () => {
    expect(typeof chatJake).toBe('function');
    expect(chatJake.length).toBe(2);
  });

  it('success: ONE call to jake.chat with the BYTE-EXACT mapped payload; returns the legacy { text, brain } shape', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: '  יש לך 12 לקוחות פעילים.  ' } });
    const out = await chatJake(
      [
        { role: 'user', text: ' כמה לקוחות יש לי? ' },
        { role: 'assistant', text: 'יש לך 12.' },
        { role: 'user', text: 'ומה עם לידים?' },
      ],
      '  לקוחות: 12. לידים: 3.  ',
    );
    expect(out).toEqual({ text: 'יש לך 12 לקוחות פעילים.', brain: 'gateway' });
    expect(callAiGateway).toHaveBeenCalledTimes(1);
    // message text + context bytes travel EXACTLY as supplied — whitespace
    // included (the server contract owns normalization, never the client)
    expect(callAiGateway).toHaveBeenCalledWith('jake.chat', {
      messages: [
        { role: 'user', text: ' כמה לקוחות יש לי? ' },
        { role: 'assistant', text: 'יש לך 12.' },
        { role: 'user', text: 'ומה עם לידים?' },
      ],
      context: { summary: '  לקוחות: 12. לידים: 3.  ' },
    });
  });

  it('EXACT history mapping: same count, same order, same role values, same text bytes — nothing dropped, coerced, or skipped', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: 'x' } });
    const history = [
      { role: 'assistant', text: 'ברוך הבא' }, // assistant-first → NOT skipped
      { role: 'user', text: '' },               // empty → NOT dropped
      { role: 'weird', text: 'שאלה' },          // unknown role → NOT coerced
      { role: 'user', text: '  מרווח  ' },      // whitespace → NOT trimmed
      { role: 'assistant', text: 'ב' },
    ];
    await chatJake(history, '');
    const [, payload] = callAiGateway.mock.calls[0];
    expect(payload.messages).toEqual([
      { role: 'assistant', text: 'ברוך הבא' },
      { role: 'user', text: '' },
      { role: 'weird', text: 'שאלה' },
      { role: 'user', text: '  מרווח  ' },
      { role: 'assistant', text: 'ב' },
    ]);
    expect(payload.messages.length).toBe(history.length);
    expect('context' in payload).toBe(false);
  });

  it('invalid history REMAINS invalid: the real deployed jake.chat validator rejects the mapped payloads (client never repairs)', async () => {
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'invalid_payload', message: 'x' } });
    const INVALID_HISTORIES = [
      [{ role: 'assistant', text: 'שלום' }, { role: 'user', text: 'היי' }], // assistant-first
      [{ role: 'user', text: '' }],                                          // empty text
      [{ role: 'weird', text: 'שאלה' }],                                     // unknown role
      [],                                                                     // empty history
      [{ role: 'user', text: 'א'.repeat(4001) }],                            // over-limit (never truncated)
    ];
    for (const history of INVALID_HISTORIES) {
      callAiGateway.mockClear();
      await expect(chatJake(history, ''), JSON.stringify(history).slice(0, 60)).rejects.toThrow('invalid_payload');
      const [action, payload] = callAiGateway.mock.calls[0];
      // round-trip proof: the REAL J1 validator rejects exactly what we sent
      expect(validateAiGatewayInput(action, payload).ok).toBe(false);
    }
  });

  it('never mutates the caller history/messages/context — proven with frozen inputs', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: 'x' } });
    const history = Object.freeze([
      Object.freeze({ role: 'user', text: ' שלום ' }),
      Object.freeze({ role: 'assistant', text: 'היי' }),
      Object.freeze({ role: 'user', text: '' }),
    ]);
    const before = JSON.stringify(history);
    await chatJake(history, 'קונטקסט'); // frozen input: any mutation would throw in strict mode
    expect(JSON.stringify(history)).toBe(before);
    const [, payload] = callAiGateway.mock.calls[0];
    expect(payload.messages[0]).not.toBe(history[0]); // fresh wire objects, caller objects untouched
  });

  it('the mapped payload VALIDATES against the deployed jake.chat input contract (round-trip proof)', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: 'x' } });
    await chatJake(
      [{ role: 'user', text: 'כמה לקוחות?' }, { role: 'assistant', text: '12' }, { role: 'user', text: 'תודה' }],
      'לקוחות: 12',
    );
    const [action, payload] = callAiGateway.mock.calls[0];
    const r = validateAiGatewayInput(action, payload);
    expect(r.ok).toBe(true);
    expect(r.actionType).toBe('jake.chat');
  });

  it('gateway failure THROWS the error code — no retry, no second provider, no fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'provider_error', message: 'x' } });
    await expect(chatJake([{ role: 'user', text: 'hi' }], '')).rejects.toThrow('provider_error');
    expect(callAiGateway).toHaveBeenCalledTimes(1); // exactly one attempt — no fallback loop
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('configured failures are NEVER disguised as demo success (budget/rate/auth codes all throw)', async () => {
    for (const code of ['provider_error', 'budget_exceeded', 'rate_limited', 'unauthorized', 'invalid_payload', 'network_error']) {
      callAiGateway.mockReset();
      callAiGateway.mockResolvedValue({ ok: false, error: { code, message: 'x' } });
      await expect(chatJake([{ role: 'user', text: 'hi' }], ''), code).rejects.toThrow(code);
    }
  });

  it('empty gateway text is a failure (EMPTY_RESPONSE), never a silent empty bubble', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: '   ' } });
    await expect(chatJake([{ role: 'user', text: 'hi' }], '')).rejects.toThrow('EMPTY_RESPONSE');
  });

  it('unconfigured environment (supabase_not_configured) keeps the calm PUBLIC-SAFE demo behavior', async () => {
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'supabase_not_configured', message: 'x' } });
    const out = await chatJake([{ role: 'user', text: 'שאלה' }], '');
    expect(out.brain).toBe('demo');
    expect(typeof out.text).toBe('string');
    expect(out.text.length).toBeGreaterThan(0);
    // demo copy must never mention keys/env/internal configuration
    for (const banned of ['API', 'api', 'מפתח', '.env', 'VITE', 'Gemini', 'Supabase', 'gateway']) {
      expect(out.text.includes(banned), banned).toBe(false);
    }
  });
});

// ---------------------------------------------------------------
// 2) forceActionsJake → jake.force_actions (behavior, mocked gateway)
// ---------------------------------------------------------------
describe('forceActionsJake · gateway migration (behavior)', () => {
  const CANONICAL = '```actions\n[{"op":"add_client","name":"דני כהן","status":"lead","value":3000}]\n```';

  it('keeps the exact signature: (userText, contextText)', () => {
    expect(typeof forceActionsJake).toBe('function');
    expect(forceActionsJake.length).toBe(2);
  });

  it('sends EXACTLY one user message with userText BYTE-PRESERVED and context as { summary } data', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: '[]' } });
    await forceActionsJake(' תוסיף את דני כהן כליד ', '  לקוחות: דני לוי [active]  ');
    expect(callAiGateway).toHaveBeenCalledTimes(1);
    // no trim, no normalization — the exact caller bytes travel to the server
    expect(callAiGateway).toHaveBeenCalledWith('jake.force_actions', {
      messages: [{ role: 'user', text: ' תוסיף את דני כהן כליד ' }],
      context: { summary: '  לקוחות: דני לוי [active]  ' },
    });
    const [action, payload] = callAiGateway.mock.calls[0];
    expect(payload.messages.length).toBe(1);
    expect(payload.messages[0].role).toBe('user');
    const r = validateAiGatewayInput(action, payload);
    expect(r.ok).toBe(true);
    expect(r.actionType).toBe('jake.force_actions');
  });

  it('invalid userText REMAINS invalid: empty/whitespace-only/over-limit reach the real validator unrepaired', async () => {
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'invalid_payload', message: 'x' } });
    for (const bad of ['', '   ', 'א'.repeat(4001)]) {
      callAiGateway.mockClear();
      await expect(forceActionsJake(bad, 'ctx'), JSON.stringify(bad.slice(0, 10))).rejects.toThrow('invalid_payload');
      const [action, payload] = callAiGateway.mock.calls[0];
      expect(payload.messages[0].text).toBe(bad); // byte-exact passthrough of the invalid value
      expect(validateAiGatewayInput(action, payload).ok).toBe(false);
    }
  });

  it('canonical fenced actions text passes through VERBATIM and parses in extractActions exactly as before', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: CANONICAL } });
    const out = await forceActionsJake('תוסיף את דני כהן', 'ctx');
    expect(out).toBe(CANONICAL); // string return shape preserved, byte-exact
    const { actions } = extractActions(out);
    expect(actions.length).toBe(1);
    expect(actions[0].op).toBe('add_client');
    expect(actions[0].name).toBe('דני כהן');
  });

  it('the "[]" no-action result passes through and yields zero actions (informational requests stay action-free)', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: '[]' } });
    const out = await forceActionsJake('כמה לקוחות יש לי?', 'ctx');
    expect(out).toBe('[]');
    expect(extractActions(out).actions).toEqual([]);
  });

  it('gateway failure THROWS — no retry, no fallback, no fetch (Assistant catches and stays prose)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'provider_error', message: 'x' } });
    await expect(forceActionsJake('תוסיף', 'ctx')).rejects.toThrow('provider_error');
    expect(callAiGateway).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('unconfigured environment returns the legacy calm no-op ("" → no actions, no error bubble)', async () => {
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'supabase_not_configured', message: 'x' } });
    const out = await forceActionsJake('תוסיף את דני', 'ctx');
    expect(out).toBe('');
    expect(extractActions(out).actions).toEqual([]);
  });
});

// ---------------------------------------------------------------
// 3) zero frontend authority — both lanes
// ---------------------------------------------------------------
describe('J2 lanes · no caller-controlled authority is forwarded', () => {
  it('payloads carry ONLY messages + context — no provider/model/system/config/thinking/transform keys', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: 'x' } });
    await chatJake([{ role: 'user', text: 'שלום' }], 'ctx');
    await forceActionsJake('תוסיף', 'ctx');
    for (const [, payload] of callAiGateway.mock.calls) {
      expect(Object.keys(payload).sort()).toEqual(['context', 'messages']);
      expect(Object.keys(payload.context)).toEqual(['summary']);
      const flat = JSON.stringify(payload);
      for (const banned of [
        'provider', 'model', 'system', 'temperature', 'maxOutputTokens', 'thinking',
        'schema', 'resultTransform', 'tools', 'apiKey', 'options', 'instructions',
      ]) {
        expect(flat.includes(banned), banned).toBe(false);
      }
    }
  });

  it('context travels ONLY as context.summary — never inside a message, never as a role', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: 'x' } });
    await chatJake([{ role: 'user', text: 'שאלה' }], 'נתוני מערכת סודיים');
    const [, payload] = callAiGateway.mock.calls[0];
    expect(payload.context.summary).toBe('נתוני מערכת סודיים');
    expect(payload.messages.some((m) => m.text.includes('נתוני מערכת סודיים'))).toBe(false);
    expect(payload.messages.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });
});

// ---------------------------------------------------------------
// 4) source guards — no direct provider path, no dormant fallback
// ---------------------------------------------------------------
describe('J2 lanes · source guards (gemini.js)', () => {
  const gemini = read('../gemini.js');
  const fnBody = (name) => {
    const start = gemini.indexOf(`export async function ${name}(`);
    expect(start, `${name} present`).toBeGreaterThan(-1);
    return gemini.slice(start, gemini.indexOf('\n}', start));
  };

  it('exported signature text is unchanged for both lanes', () => {
    expect(gemini.includes('export async function chatJake(history, contextText)')).toBe(true);
    expect(gemini.includes('export async function forceActionsJake(userText, contextText)')).toBe(true);
  });

  it('each lane routes ONLY through its gateway action — no Google/Ollama/local/key/fallback tokens in the body', () => {
    const chat = fnBody('chatJake');
    const force = fnBody('forceActionsJake');
    expect(chat.includes("callAiGateway('jake.chat'")).toBe(true);
    expect(force.includes("callAiGateway('jake.force_actions'")).toBe(true);
    for (const body of [chat, force]) {
      for (const banned of [
        'generativelanguage', 'API_KEY', 'X-goog', 'fetch(', 'localhost', '127.0.0.1',
        'jakeCloudChat', 'jakeLocalChat', 'jakeBrainOrder', 'localChat', 'useLocalLLM',
        'isGeminiConfigured', 'buildJakeSystem', 'Ollama',
      ]) {
        expect(body.includes(banned), banned).toBe(false);
      }
    }
  });

  it('the legacy dual-brain executors are fully removed — no dormant second provider path exists', () => {
    expect(gemini.includes('jakeCloudChat')).toBe(false);
    expect(gemini.includes('jakeLocalChat')).toBe(false);
  });

  it('exactly four gateway-routed lanes: draft + chat + force_actions + lead ideas (draftWithJake unchanged)', () => {
    // M2 J3A added the authorized generateLeadIdeas → crm.lead_ideas lane;
    // the three Jake lanes stay byte-identical.
    expect((gemini.match(/callAiGateway\(/g) || []).length).toBe(4);
    expect(gemini.includes("callAiGateway('jake.draft_message'")).toBe(true);
    expect(gemini.includes("callAiGateway('crm.lead_ideas'")).toBe(true);
    const draft = fnBody('draftWithJake');
    expect(draft.includes("callAiGateway('jake.draft_message'")).toBe(true);
  });

  it('the Assistant brain-badge exports the UI still imports remain intact', () => {
    for (const kept of ['export function jakeBrainPref()', 'export function setJakeBrain(', 'export function jakeBrainLabel()']) {
      expect(gemini.includes(kept), kept).toBe(true);
    }
  });
});

// ---------------------------------------------------------------
// 5) Assistant propose → confirm → execute integration — untouched
// ---------------------------------------------------------------
describe('J2 · Assistant confirmation flow integration (source, untouched)', () => {
  const assistant = read('../../components/ai/Assistant.jsx');

  it('same lane call shapes: chat wrapped with the business brain, force-actions lean', () => {
    expect(assistant.includes('chatJake(convo, withBusinessBrain(activePack.buildContext(data), text))')).toBe(true);
    expect(assistant.includes('forceActionsJake(text, activePack.buildContext(data))')).toBe(true);
  });

  it('the propose → confirm → execute pipeline is unchanged: extractActions → preview card, no auto-execution', () => {
    expect(assistant.includes('extractActions(reply)')).toBe(true);
    expect(assistant.includes('extractActions(forced)')).toBe(true);
    expect(assistant.includes('preview: { actions, items }')).toBe(true);
  });

  it('Assistant still has NO gateway wiring of its own (the seam stays in gemini.js)', () => {
    expect(assistant.includes('aiGateway')).toBe(false);
    expect(assistant.includes('jake.chat')).toBe(false);
    expect(assistant.includes('jake.force_actions')).toBe(false);
  });
});

// ---------------------------------------------------------------
// 6) draftWithJake regression — jake.draft_message routing unchanged
// ---------------------------------------------------------------
describe('J2 · draftWithJake keeps its Slice B contract', () => {
  it('still calls jake.draft_message with the same mapped payload shape', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: 'טיוטה' } });
    const out = await draftWithJake([{ role: 'user', text: 'נסח הודעה' }], 'ctx');
    expect(out).toEqual({ text: 'טיוטה', brain: 'gateway' });
    expect(callAiGateway).toHaveBeenCalledWith('jake.draft_message', {
      messages: [{ role: 'user', text: 'נסח הודעה' }],
      context: { summary: 'ctx' },
    });
  });

  it('draft mapping is BYTE-COMPATIBLE with pre-J2 Slice B shaping (trim/drop/coerce/shift) — and the chat lane deliberately does NOT share it', async () => {
    const noisy = [
      { role: 'assistant', text: 'ברוך הבא' }, // draft: trimmed away · chat: kept
      { role: 'user', text: '' },               // draft: dropped · chat: kept
      { role: 'weird', text: ' שאלה ' },        // draft: →user+trim · chat: kept verbatim
      { role: 'assistant', text: 'תשובה' },
    ];
    callAiGateway.mockResolvedValue({ ok: true, result: { text: 'x' } });
    await draftWithJake(noisy, '  ctx  ');
    const [, draftPayload] = callAiGateway.mock.calls[0];
    // the EXACT pre-J2 Slice B result (pinned also in jakeDraftMessageGateway.test.js)
    expect(draftPayload).toEqual({
      messages: [{ role: 'user', text: 'שאלה' }, { role: 'assistant', text: 'תשובה' }],
      context: { summary: 'ctx' },
    });
    callAiGateway.mockClear();
    await chatJake(noisy, '  ctx  ').catch(() => {}); // chat may reject — mapping is what we assert
    const [, chatPayload] = callAiGateway.mock.calls[0];
    expect(chatPayload).toEqual({
      messages: [
        { role: 'assistant', text: 'ברוך הבא' },
        { role: 'user', text: '' },
        { role: 'weird', text: ' שאלה ' },
        { role: 'assistant', text: 'תשובה' },
      ],
      context: { summary: '  ctx  ' },
    });
  });
});
