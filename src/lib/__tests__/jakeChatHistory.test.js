import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateAiGatewayInput } from '../aiGatewayContract.js';
import { selectJakeChatHistory, JAKE_CHAT_HISTORY_WINDOW } from '../jakeChatHistory.js';

// M2 J2 preview hotfix — the live smoke failed with 400 invalid_payload
// because the proactive morning briefing ({role:'assistant', text}) made the
// last-14 window assistant-first, the byte-exact chatJake mapper faithfully
// delivered it, and the deployed jake.chat contract (correctly) rejected it.
// The fix is CALLER-side conversation selection: selectJakeChatHistory picks
// a valid user-first window; chatJake stays a byte-exact carrier.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ---- behavioral seam: gemini.js with a mocked gateway client ----
vi.mock('../aiGatewayClient.js', () => ({ callAiGateway: vi.fn() }));
const { chatJake } = await import('../gemini.js');
const { callAiGateway } = await import('../aiGatewayClient.js');

beforeEach(() => callAiGateway.mockReset());

const BRIEFING = { role: 'assistant', text: 'בוקר טוב, נתן! 👋\n\n3 משימות באיחור, דני חייב 2,500 ₪.' };
const USER_MSG = { role: 'user', text: 'כמה לקוחות יש לי?' };

// ---------------------------------------------------------------
// 1) selector unit contract — every required scenario
// ---------------------------------------------------------------
describe('selectJakeChatHistory · pure selection contract', () => {
  it('proactive briefing + first user message → window opens on the user message; briefing excluded', () => {
    const out = selectJakeChatHistory([BRIEFING, USER_MSG]);
    expect(out).toEqual([USER_MSG]);
    expect(out[0]).toBe(USER_MSG); // same object — nothing rewritten
  });

  it('several leading assistant/UI records → advances to the first user turn only', () => {
    const greet = { role: 'assistant', text: 'שלום!' };
    const out = selectJakeChatHistory([greet, BRIEFING, USER_MSG, { role: 'assistant', text: '12' }]);
    expect(out).toEqual([USER_MSG, { role: 'assistant', text: '12' }]);
  });

  it('persisted assistant-first conversation is safely bounded (assistant prefix never sent)', () => {
    const persisted = [
      { role: 'assistant', text: 'ברוך השב!' },
      { role: 'user', text: 'מה המצב?' },
      { role: 'assistant', text: 'הכל טוב' },
      { role: 'user', text: 'יופי' },
    ];
    expect(selectJakeChatHistory(persisted)).toEqual(persisted.slice(1));
  });

  it('a last-N window that HAPPENS to open on assistant advances to the next user without touching retained messages', () => {
    // 15 textual messages; slice(-14) cuts the first USER turn, leaving the
    // window assistant-first → selection advances one more, to the next user.
    const msgs = [{ role: 'user', text: 'הודעה ראשונה' }];
    for (let i = 0; i < 7; i += 1) {
      msgs.push({ role: 'assistant', text: `תשובה ${i}` }, { role: 'user', text: `שאלה ${i}` });
    }
    expect(msgs.length).toBe(15);
    const out = selectJakeChatHistory(msgs);
    expect(out.length).toBe(13); // window 14 → opens at its first user turn
    expect(out[0]).toEqual({ role: 'user', text: 'שאלה 0' });
    expect(out[out.length - 1]).toBe(msgs[msgs.length - 1]);
    // retained messages are the ORIGINAL objects, order preserved
    expect(out.every((m, i) => m === msgs[msgs.length - out.length + i])).toBe(true);
  });

  it('normal multi-turn history: same order, same roles, same text bytes (whitespace included), same objects', () => {
    const history = [
      { role: 'user', text: ' שלום ' },
      { role: 'assistant', text: 'היי!' },
      { role: 'user', text: 'מה נשמע?' },
    ];
    const frozen = Object.freeze(history.map((m) => Object.freeze(m)));
    const out = selectJakeChatHistory(frozen);
    expect(out).toEqual(history);
    expect(out.every((m, i) => m === frozen[i])).toBe(true); // no rewriting, no copies
  });

  it('the current user message (last element) is ALWAYS retained', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', text: `m${i}` }));
    const current = { role: 'user', text: 'ההודעה הנוכחית' };
    const out = selectJakeChatHistory([...many, current]);
    expect(out[out.length - 1]).toBe(current);
    expect(out.length).toBeLessThanOrEqual(JAKE_CHAT_HISTORY_WINDOW);
  });

  it('system/preview/gate/handoff/campaign and other non-text UI records stay excluded exactly as before', () => {
    const ui = [
      { role: 'assistant', system: true, text: '⚙️ הערת מערכת' },
      { role: 'assistant', preview: { actions: [], items: [] } },
      { role: 'assistant', gate: { code: '1234' } },
      { role: 'assistant', handoff: { target: 'studio' } },
      { role: 'assistant', campaign: { campaignId: 'c1' } },
      USER_MSG,
      { role: 'assistant', system: true, text: 'עוד מערכת' },
    ];
    expect(selectJakeChatHistory(ui)).toEqual([USER_MSG]);
  });

  it('no user message anywhere → NO valid history ([]) — a user turn is never manufactured', () => {
    expect(selectJakeChatHistory([BRIEFING])).toEqual([]);
    expect(selectJakeChatHistory([{ role: 'assistant', text: 'א' }, { role: 'assistant', text: 'ב' }])).toEqual([]);
    expect(selectJakeChatHistory([])).toEqual([]);
    expect(selectJakeChatHistory(undefined)).toEqual([]);
  });

  it('window size honors the shared 14-message default and never reorders', () => {
    expect(JAKE_CHAT_HISTORY_WINDOW).toBe(14);
    const msgs = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` }));
    const out = selectJakeChatHistory(msgs);
    expect(out.length).toBe(14);
    expect(out.map((m) => m.text)).toEqual(msgs.slice(-14).map((m) => m.text));
  });
});

// ---------------------------------------------------------------
// 2) the previously failing preview scenario — end to end
// ---------------------------------------------------------------
describe('preview-failure regression · briefing-first day now validates BEFORE any provider call', () => {
  it('selector output → chatJake → payload validates against the REAL deployed jake.chat contract', async () => {
    callAiGateway.mockResolvedValue({ ok: true, result: { text: 'יש לך 12 לקוחות.' } });
    // exact UI state of the failure: proactive briefing, then the first user message
    const uiMessages = [BRIEFING, USER_MSG];
    const convo = selectJakeChatHistory(uiMessages);
    const out = await chatJake(convo, 'לקוחות: 12');
    expect(out).toEqual({ text: 'יש לך 12 לקוחות.', brain: 'gateway' });
    const [action, payload] = callAiGateway.mock.calls[0];
    expect(action).toBe('jake.chat');
    expect(payload.messages[0]).toEqual(USER_MSG); // opens on the user turn
    expect(payload.messages.some((m) => m.text === BRIEFING.text)).toBe(false); // briefing never sent
    const r = validateAiGatewayInput(action, payload); // the real J1 validator
    expect(r.ok).toBe(true);
    expect(r.actionType).toBe('jake.chat');
  });

  it('counter-proof: the UNSELECTED assistant-first history still fails the real validator (mapper stayed byte-exact)', async () => {
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'invalid_payload', message: 'x' } });
    await expect(chatJake([BRIEFING, USER_MSG], '')).rejects.toThrow('invalid_payload');
    const [action, payload] = callAiGateway.mock.calls[0];
    expect(payload.messages[0]).toEqual(BRIEFING); // byte-exact carrier: briefing passed through untouched
    expect(validateAiGatewayInput(action, payload).ok).toBe(false);
  });
});

// ---------------------------------------------------------------
// 3) caller integration + boundary source pins
// ---------------------------------------------------------------
describe('Assistant caller integration (source pins)', () => {
  const assistant = read('../../components/ai/Assistant.jsx');

  it('the chat lane builds convo via selectJakeChatHistory and the chatJake call shape is unchanged', () => {
    expect(assistant.includes('const convo = selectJakeChatHistory(next);')).toBe(true);
    expect(assistant.includes('chatJake(convo, withBusinessBrain(activePack.buildContext(data), text))')).toBe(true);
    // the old inline window for the CHAT lane is gone (the -12 drafting window remains untouched)
    expect(assistant.includes('.filter((mm) => mm.text && !mm.system).slice(-14)')).toBe(false);
    expect(assistant.includes('.filter((mm) => mm.text && !mm.system).slice(-12)')).toBe(true);
  });

  it('the proactive morning briefing stays in UI state exactly as before (visible, assistant-role, textual)', () => {
    // S0C: the greeting is personalized from the signed-in session (displayName)
    // instead of a hardcoded person — same shape, role and delivery otherwise.
    expect(assistant.includes("setMessages((m) => [...m, { role: 'assistant', text: `${greet}, ${displayName}! 👋\\n\\n${activePack.briefing(data)}` }]);")).toBe(true);
  });

  it('Assistant still has no gateway wiring; forceActionsJake/draftWithJake call shapes untouched', () => {
    expect(assistant.includes('aiGateway')).toBe(false);
    expect(assistant.includes('forceActionsJake(text, activePack.buildContext(data))')).toBe(true);
    expect(assistant.includes('draftWithJake(convo, withBusinessBrain(activePack.buildContext(data), text))')).toBe(true);
  });

  it('the selector module is pure: no imports at all, no browser/storage/gateway surface', () => {
    const selector = read('../jakeChatHistory.js');
    for (const banned of ['import', 'fetch', 'localStorage', 'window.', 'supabase', 'aiGateway', 'require(']) {
      expect(selector.includes(banned), banned).toBe(false);
    }
  });
});
