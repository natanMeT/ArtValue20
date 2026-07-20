import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AI_ACTION_TYPES,
  COST_TIER_BY_ACTION,
  DEFAULT_PROVIDER_BY_ACTION,
  selectProvider,
} from '../aiGateway.js';
import {
  isGeminiExecutableAction,
  GEMINI_EXECUTABLE_ACTION_TYPES,
  buildAiGatewayDecision,
  validateAiGatewayInput,
  hasAiGatewayInputProfile,
  countAiGatewayInputChars,
  AI_GATEWAY_INPUT_LIMITS,
  AI_GATEWAY_INPUT_PROFILE_KEYS,
  buildDiagnoseQuoteUserMessage,
  toProviderMessages,
  toProviderMessagesForAction,
  buildGeminiMessagesRequest,
  STRUCTURED_RESULT_CONTRACTS,
  validateCrmDiagnoseQuote,
  validateStructuredResult,
  parseStructuredResult,
} from '../aiGatewayContract.js';
import {
  getActionProfile,
  ACTION_PROFILE_KEYS,
  CRM_DIAGNOSE_QUOTE,
} from '../../../supabase/functions/ai-gateway/actionProfiles.ts';
import {
  requiredGatewayCapabilities,
  REQUIRED_CAPABILITY_ACTION_KEYS,
} from '../../../supabase/functions/ai-gateway/geminiAdapter.ts';

// M2 J3B — crm.diagnose_quote: the Diagnose (quote diagnosis) lane migrated
// from the direct browser Gemini API to the server-owned AI Gateway. These
// tests cover the action vocabulary, the strict { clientName, field,
// audience, offer } input contract (incl. the allowEmpty rule + the combined
// clientName/offer minimum), the server-owned profile (verbatim SYSTEM +
// RESPONSE_SCHEMA, 0.75 / 4096 / thinkingBudget 0), the pure byte-exact
// user-message builder, the strict diagnosis result contract, and the
// frontend lane migration (verbatim payload, single attempt, no fallback,
// demo-only-unconfigured behavior, source purity, frozen Diagnose.jsx).

const ACTION = 'crm.diagnose_quote';
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ---- behavioral seam: gemini.js with a mocked gateway client ----
vi.mock('../aiGatewayClient.js', () => ({ callAiGateway: vi.fn() }));
const { diagnoseQuote } = await import('../gemini.js');
const { callAiGateway } = await import('../aiGatewayClient.js');

const FULL_INPUT = { clientName: 'דני כהן', field: 'צורף', audience: 'אספנים', offer: 'אתר תדמית' };
const DIAGNOSIS = {
  psychProfile: 'לקוח זהיר שמחפש ביטחון',
  personalityType: 'מקבל החלטות זהיר',
  conversationStructure: [{ step: 'פתיחה', detail: 'שאלה על העסק' }],
  objections: [{ objection: 'יקר לי', response: 'פרק לתשלומים' }],
  valueAngles: ['אמון', 'לידים'],
  closingTip: 'סיים בשאלת בחירה',
};
const okResult = (json = DIAGNOSIS) => ({ ok: true, result: { json } });

const LEGACY_SYSTEM = `אתה יועץ מכירות בכיר ופסיכולוג עסקי שמתמחה בסטודיו דיגיטלי (Art Value) שמוכר אתרים, מערכות CRM, מיתוג וקמפיינים.
המטרה: לעזור לבעל הסטודיו לסגור עסקה. נתח את הלקוח לפי המידע, בנה אסטרטגיית שיחה, וצפה התנגדויות.
כתוב בעברית בלבד, בגוף פונה ("תגיד ללקוח...", "שווה להדגיש..."), חד, מעשי וקצר. בלי קלישאות.`;

const legacyMessage = (clientName, field, audience, offer) => `נתוני הלקוח וההצעה:
- שם / עסק הלקוח: ${clientName}
- מקצוע / תחום: ${field}
- קהל יעד מרכזי של הלקוח: ${audience}
- ההצעה שלי (מה אני רוצה למכור לו): ${offer}

החזר אבחון מלא: פרופיל פסיכולוגי של הלקוח, סוג האישיות, מבנה שיחת מכירה מומלץ (שלבים), התנגדויות צפויות עם מענה לכל אחת, זוויות ערך מרכזיות, וטיפ סגירה אחד חזק.`;

// ---------------------------------------------------------------
// 1) canonical vocabulary + routing + registry completeness
// ---------------------------------------------------------------
describe('crm.diagnose_quote · canonical vocabulary + routing', () => {
  it('exists in AI_ACTION_TYPES with a low cost tier', () => {
    expect(AI_ACTION_TYPES.includes(ACTION)).toBe(true);
    expect(COST_TIER_BY_ACTION[ACTION]).toBe('low');
  });

  it('is gemini-first, gemini-executable, and decides to gemini', () => {
    expect(DEFAULT_PROVIDER_BY_ACTION[ACTION]).toEqual(['gemini', 'openai', 'openrouter', 'ollama']);
    expect(selectProvider(ACTION)[0]).toBe('gemini');
    expect(isGeminiExecutableAction(ACTION)).toBe(true);
    expect(GEMINI_EXECUTABLE_ACTION_TYPES.includes(ACTION)).toBe(true);
    expect(buildAiGatewayDecision({ actionType: ACTION }).routing.selectedProvider).toBe('gemini');
  });

  it('is fully registered: input profile, action profile, capability map', () => {
    expect(hasAiGatewayInputProfile(ACTION)).toBe(true);
    expect(AI_GATEWAY_INPUT_PROFILE_KEYS.includes(ACTION)).toBe(true);
    expect(ACTION_PROFILE_KEYS.includes(ACTION)).toBe(true);
    expect(REQUIRED_CAPABILITY_ACTION_KEYS.includes(ACTION)).toBe(true);
    expect(CRM_DIAGNOSE_QUOTE).toBe(ACTION);
  });

  it('capability map is EXACTLY [json] and drift-guards against the profile', () => {
    expect(requiredGatewayCapabilities(ACTION, getActionProfile(ACTION))).toEqual(['json']);
    expect(requiredGatewayCapabilities(ACTION, { outputMode: 'text' })).toBe(null);
    expect(requiredGatewayCapabilities(ACTION, null)).toBe(null);
  });
});

// ---------------------------------------------------------------
// 2) strict input contract — { clientName, field, audience, offer }
// ---------------------------------------------------------------
describe('crm.diagnose_quote · strict input contract', () => {
  const isRejectReason = (r, reason) => r.ok === false
    && r.error.code === 'invalid_payload' && r.error.reason === reason;

  it('accepts the exact valid shape and normalizes a FRESH trimmed payload', () => {
    const r = validateAiGatewayInput(ACTION, {
      clientName: '  דני כהן  ', field: ' צורף ', audience: '  אספנים ', offer: '  אתר תדמית  ',
    });
    expect(r.ok).toBe(true);
    expect(r.actionType).toBe(ACTION);
    expect(r.payload).toEqual(FULL_INPUT);
    const chars = 'דני כהן'.length + 'צורף'.length + 'אספנים'.length + 'אתר תדמית'.length;
    expect(r.inputChars).toBe(chars);
    expect(countAiGatewayInputChars(ACTION, r.payload)).toBe(chars);
  });

  it('individual empty strings are VALID (the frozen UI permits partial input)', () => {
    // clientName filled, everything else empty
    const a = validateAiGatewayInput(ACTION, { clientName: 'דני', field: '', audience: '', offer: '' });
    expect(a.ok).toBe(true);
    expect(a.payload).toEqual({ clientName: 'דני', field: '', audience: '', offer: '' });
    // offer filled, everything else empty (incl. whitespace-only → trimmed to '')
    const b = validateAiGatewayInput(ACTION, { clientName: '   ', field: '', audience: '', offer: 'אתר' });
    expect(b.ok).toBe(true);
    expect(b.payload).toEqual({ clientName: '', field: '', audience: '', offer: 'אתר' });
  });

  it('rejects when BOTH clientName and offer are empty after trimming (combined minimum)', () => {
    for (const p of [
      { clientName: '', field: '', audience: '', offer: '' },
      { clientName: '   ', field: '', audience: '', offer: '  ' },
      // field/audience filled do NOT satisfy the minimum
      { clientName: '', field: 'צורף', audience: 'אספנים', offer: '' },
    ]) {
      expect(isRejectReason(validateAiGatewayInput(ACTION, p), 'all_fields_empty'), JSON.stringify(p)).toBe(true);
    }
  });

  it('every key is REQUIRED — a missing key fails (never defaulted client- or server-side)', () => {
    for (const missing of ['clientName', 'field', 'audience', 'offer']) {
      const p = { ...FULL_INPUT };
      delete p[missing];
      expect(isRejectReason(validateAiGatewayInput(ACTION, p), 'missing_field'), missing).toBe(true);
    }
    expect(isRejectReason(validateAiGatewayInput(ACTION, {}), 'missing_field')).toBe(true);
  });

  it('rejects non-string values on every field — no coercion', () => {
    for (const key of ['clientName', 'field', 'audience', 'offer']) {
      for (const bad of [42, null, true, {}, ['x']]) {
        const p = { ...FULL_INPUT, [key]: bad };
        expect(isRejectReason(validateAiGatewayInput(ACTION, p), 'field_not_string'), `${key}=${String(bad)}`).toBe(true);
      }
    }
  });

  it('accepts a field exactly at 2000 chars and rejects 2001 (no truncation)', () => {
    expect(AI_GATEWAY_INPUT_LIMITS.MAX_DIAGNOSE_QUOTE_FIELD_CHARS).toBe(2000);
    const atLimit = 'x'.repeat(2000);
    expect(validateAiGatewayInput(ACTION, { ...FULL_INPUT, offer: atLimit }).ok).toBe(true);
    for (const key of ['clientName', 'field', 'audience', 'offer']) {
      expect(isRejectReason(
        validateAiGatewayInput(ACTION, { ...FULL_INPUT, [key]: 'x'.repeat(2001) }), 'field_too_long',
      ), key).toBe(true);
    }
  });

  it('rejects unknown fields and authority-injection fields (never silently stripped)', () => {
    for (const extra of ['prompt', 'messages', 'niche', 'count', 'provider', 'model', 'system', 'schema', 'responseSchema', 'apiKey', 'temperature', 'maxOutputTokens', 'options', 'foo']) {
      const r = validateAiGatewayInput(ACTION, { ...FULL_INPUT, [extra]: 'y' });
      expect(isRejectReason(r, 'unknown_field'), extra).toBe(true);
    }
  });

  it('rejects prototype-pollution keys and hostile shapes without throwing', () => {
    expect(validateAiGatewayInput(ACTION, JSON.parse(
      '{"clientName":"x","field":"","audience":"","offer":"y","__proto__":{"p":1}}',
    )).ok).toBe(false);
    for (const p of [null, [], 'x', 42, { ...FULL_INPUT, offer: { a: 1 } }]) {
      expect(() => validateAiGatewayInput(ACTION, p)).not.toThrow();
      expect(validateAiGatewayInput(ACTION, p).ok).toBe(false);
    }
  });

  it('the allowEmpty rule leaks into NO pre-existing profile (empty prompt/niche still reject)', () => {
    for (const a of ['text.copy', 'text.crm_message', 'studio.prompt_enhance', 'crm.suggest_next_action']) {
      expect(validateAiGatewayInput(a, { prompt: '' }).error.reason, a).toBe('empty_field');
      expect(validateAiGatewayInput(a, { prompt: '   ' }).error.reason, a).toBe('empty_field');
    }
    expect(validateAiGatewayInput('crm.lead_ideas', { niche: '', count: 6 }).error.reason).toBe('empty_field');
    // and the diagnose fields never leak into other profiles
    expect(validateAiGatewayInput('text.copy', FULL_INPUT).error.reason).toBe('unknown_field');
  });

  it('invalid input is rejected by the PURE validator — before any budget/provider stage can run', () => {
    const indexTs = read('../../../supabase/functions/ai-gateway/index.ts');
    const vAt = indexTs.indexOf('validateAiGatewayInput(');
    const bAt = indexTs.indexOf('reserveAiBudget({');
    const pAt = indexTs.indexOf('selection.adapter.run(');
    expect(vAt).toBeGreaterThan(-1);
    expect(bAt).toBeGreaterThan(vAt);
    expect(pAt).toBeGreaterThan(bAt);
  });
});

// ---------------------------------------------------------------
// 3) server-owned action profile — verbatim SYSTEM + RESPONSE_SCHEMA
// ---------------------------------------------------------------
describe('crm.diagnose_quote · server-owned structured profile', () => {
  const p = getActionProfile(ACTION);

  it('is a frozen json profile with the legacy generation config (0.75 / 4096 / thinkingBudget 0)', () => {
    expect(p).not.toBe(null);
    expect(Object.isFrozen(p)).toBe(true);
    expect(p.outputMode).toBe('json');
    expect(p.temperature).toBe(0.75);
    expect(p.maxOutputTokens).toBe(4096);
    expect(p.responseMimeType).toBe('application/json');
    expect(p.thinkingBudget).toBe(0);
    expect(p.parsePolicy).toBe('json_strict');
    expect(p.resultContract).toBe(STRUCTURED_RESULT_CONTRACTS.CRM_DIAGNOSE_QUOTE);
    expect(p.resultTransform).toBe(null);
  });

  it('carries the verbatim legacy RESPONSE_SCHEMA (same required set + nested shapes, frozen)', () => {
    expect(Object.isFrozen(p.responseSchema)).toBe(true);
    expect(p.responseSchema).toEqual({
      type: 'object',
      properties: {
        psychProfile: { type: 'string' },
        personalityType: { type: 'string' },
        conversationStructure: {
          type: 'array',
          items: { type: 'object', properties: { step: { type: 'string' }, detail: { type: 'string' } }, required: ['step', 'detail'] },
        },
        objections: {
          type: 'array',
          items: { type: 'object', properties: { objection: { type: 'string' }, response: { type: 'string' } }, required: ['objection', 'response'] },
        },
        valueAngles: { type: 'array', items: { type: 'string' } },
        closingTip: { type: 'string' },
      },
      required: ['psychProfile', 'conversationStructure', 'objections', 'closingTip'],
    });
  });

  it('carries the verbatim legacy Hebrew system instruction', () => {
    expect(p.systemInstruction).toBe(LEGACY_SYSTEM);
  });

  it('builds the exact Gemini request body (config + mime + schema + thinkingConfig)', () => {
    const built = buildGeminiMessagesRequest([{ role: 'user', text: 'hi' }], p);
    expect(built.ok).toBe(true);
    expect(built.body.generationConfig.temperature).toBe(0.75);
    expect(built.body.generationConfig.maxOutputTokens).toBe(4096);
    expect(built.body.generationConfig.responseMimeType).toBe('application/json');
    expect(built.body.generationConfig.responseSchema).toEqual(p.responseSchema);
    expect(built.body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(built.body.systemInstruction).toEqual({ parts: [{ text: LEGACY_SYSTEM }] });
  });
});

// ---------------------------------------------------------------
// 4) pure user-message builder + action-aware mapping
// ---------------------------------------------------------------
describe('crm.diagnose_quote · provider-message mapping (pure)', () => {
  it('buildDiagnoseQuoteUserMessage reproduces the legacy buildPrompt text byte-exactly', () => {
    expect(buildDiagnoseQuoteUserMessage(FULL_INPUT)).toBe(
      legacyMessage('דני כהן', 'צורף', 'אספנים', 'אתר תדמית'),
    );
  });

  it("empty fields render the legacy 'לא צוין' defaults byte-exactly", () => {
    expect(buildDiagnoseQuoteUserMessage({ clientName: 'דני', field: '', audience: '', offer: '' })).toBe(
      legacyMessage('דני', 'לא צוין', 'לא צוין', 'לא צוין'),
    );
    expect(buildDiagnoseQuoteUserMessage({ clientName: '', field: 'צורף', audience: '', offer: 'אתר' })).toBe(
      legacyMessage('לא צוין', 'צורף', 'לא צוין', 'אתר'),
    );
  });

  it('fails closed on invalid input (missing keys, non-strings, both-empty, non-objects)', () => {
    for (const bad of [
      null, undefined, [], 'x', 42, {},
      { clientName: 'x', field: '', audience: '' },                       // missing offer
      { clientName: 42, field: '', audience: '', offer: 'y' },            // non-string
      { clientName: 'x', field: null, audience: '', offer: 'y' },         // non-string
      { clientName: '', field: 'a', audience: 'b', offer: '' },           // both empty
      { clientName: '  ', field: '', audience: '', offer: '   ' },        // both blank
    ]) {
      expect(buildDiagnoseQuoteUserMessage(bad), JSON.stringify(bad) || 'undefined').toBe(null);
    }
  });

  it('toProviderMessagesForAction maps a validated diagnose payload to ONE user message', () => {
    expect(toProviderMessagesForAction(ACTION, FULL_INPUT)).toEqual([
      { role: 'user', text: legacyMessage('דני כהן', 'צורף', 'אספנים', 'אתר תדמית') },
    ]);
    // end-to-end: raw payload → strict validation → provider message
    const validated = validateAiGatewayInput(ACTION, { clientName: ' דני ', field: '', audience: '', offer: ' אתר ' });
    expect(validated.ok).toBe(true);
    expect(toProviderMessagesForAction(ACTION, validated.payload)).toEqual([
      { role: 'user', text: legacyMessage('דני', 'לא צוין', 'לא צוין', 'אתר') },
    ]);
  });

  it('fails closed on unknown/malformed action-specific payloads', () => {
    for (const bad of [null, undefined, [], 'x', {}, { prompt: 'x' }, { niche: 'x', count: 6 },
      { clientName: '', field: '', audience: '', offer: '' }]) {
      expect(toProviderMessagesForAction(ACTION, bad), JSON.stringify(bad) || 'undefined').toBe(null);
    }
  });

  it('delegates EVERY other action (and unknown actions) to the unchanged toProviderMessages', () => {
    const prompt = { prompt: '  hello  ' };
    const multi = { messages: [{ role: 'user', text: 'hi' }], context: { summary: 's' } };
    for (const a of ['text.copy', 'crm.suggest_next_action', 'jake.chat', 'jake.draft_message', 'jake.force_actions', 'text.multi_turn', 'studio.prompt_enhance']) {
      expect(toProviderMessagesForAction(a, prompt), a).toEqual(toProviderMessages(prompt));
      expect(toProviderMessagesForAction(a, multi), a).toEqual(toProviderMessages(multi));
    }
    // the lead-ideas mapping is untouched by the new branch
    expect(toProviderMessagesForAction('crm.lead_ideas', { niche: 'יקבים', count: 4 })).toEqual([
      { role: 'user', text: 'תחום / אזור / סוג קהל לחיפוש לידים: "יקבים".\nהחזר 4 רעיונות ללידים מגוונים ורלוונטיים.' },
    ]);
    for (const a of ['not.an.action', null, undefined, 42]) {
      expect(toProviderMessagesForAction(a, prompt), String(a)).toEqual(toProviderMessages(prompt));
      expect(toProviderMessagesForAction(a, {}), String(a)).toBe(null);
    }
  });
});

// ---------------------------------------------------------------
// 5) structured result contract — fail-closed diagnosis validation
// ---------------------------------------------------------------
describe('crm.diagnose_quote · structured result contract (fail-closed)', () => {
  const CONTRACT = STRUCTURED_RESULT_CONTRACTS.CRM_DIAGNOSE_QUOTE;

  it('accepts the exact contract with optional fields and normalizes trimmed values', () => {
    expect(validateCrmDiagnoseQuote(DIAGNOSIS)).toEqual(DIAGNOSIS);
    const v = validateCrmDiagnoseQuote({
      psychProfile: '  פרופיל  ',
      conversationStructure: [{ step: ' פתיחה ', detail: ' פרט ', extra: 'DROP' }],
      objections: [{ objection: ' יקר ', response: ' מענה ', extra: 'DROP' }],
      closingTip: ' טיפ ',
      extraTop: 'DROP',
    });
    expect(v).toEqual({
      psychProfile: 'פרופיל',
      conversationStructure: [{ step: 'פתיחה', detail: 'פרט' }],
      objections: [{ objection: 'יקר', response: 'מענה' }],
      closingTip: 'טיפ',
    });
    // optional keys absent → omitted (never invented)
    expect('personalityType' in v).toBe(false);
    expect('valueAngles' in v).toBe(false);
  });

  it('optional fields stay COMPATIBLE: valid values kept, empties omitted/dropped, wrong types reject', () => {
    const base = {
      psychProfile: 'א', conversationStructure: [], objections: [], closingTip: 'ב',
    };
    // valid optionals kept (trimmed)
    expect(validateCrmDiagnoseQuote({ ...base, personalityType: ' סוג ', valueAngles: [' ערך ', 'עוד'] }))
      .toEqual({ ...base, personalityType: 'סוג', valueAngles: ['ערך', 'עוד'] });
    // empty personalityType → omitted (matches the UI falsy guard)
    expect(validateCrmDiagnoseQuote({ ...base, personalityType: '  ' })).toEqual(base);
    // empty valueAngles items dropped; empty array stays a valid array
    expect(validateCrmDiagnoseQuote({ ...base, valueAngles: ['  ', 'ערך'] }))
      .toEqual({ ...base, valueAngles: ['ערך'] });
    expect(validateCrmDiagnoseQuote({ ...base, valueAngles: [] })).toEqual({ ...base, valueAngles: [] });
    // wrong-typed optionals fail closed
    for (const bad of [{ personalityType: 42 }, { personalityType: ['x'] }, { valueAngles: 'x' }, { valueAngles: [42] }, { valueAngles: [null] }]) {
      expect(validateCrmDiagnoseQuote({ ...base, ...bad }), JSON.stringify(bad)).toBe(null);
    }
  });

  it('empty required arrays are valid (legacy schema set no minItems; the frozen UI renders them)', () => {
    const v = validateCrmDiagnoseQuote({
      psychProfile: 'א', conversationStructure: [], objections: [], closingTip: 'ב',
    });
    expect(v).toEqual({ psychProfile: 'א', conversationStructure: [], objections: [], closingTip: 'ב' });
  });

  it('fails closed on missing/invalid required fields and nested shapes', () => {
    const base = {
      psychProfile: 'א',
      conversationStructure: [{ step: 'ב', detail: 'ג' }],
      objections: [{ objection: 'ד', response: 'ה' }],
      closingTip: 'ו',
    };
    for (const bad of [
      null, [], 'x', 42,
      { ...base, psychProfile: undefined },
      { ...base, psychProfile: '' },
      { ...base, psychProfile: '   ' },
      { ...base, psychProfile: 42 },
      { ...base, closingTip: undefined },
      { ...base, closingTip: '' },
      { ...base, conversationStructure: undefined },
      { ...base, conversationStructure: 'x' },
      { ...base, conversationStructure: {} },
      { ...base, conversationStructure: [null] },
      { ...base, conversationStructure: ['x'] },
      { ...base, conversationStructure: [{ step: 'ב' }] },            // missing detail
      { ...base, conversationStructure: [{ step: '', detail: 'ג' }] }, // empty step
      { ...base, conversationStructure: [{ step: 'ב', detail: 42 }] },
      { ...base, objections: undefined },
      { ...base, objections: [{ objection: 'ד' }] },                   // missing response
      { ...base, objections: [{ objection: '  ', response: 'ה' }] },   // blank objection
    ]) {
      expect(validateCrmDiagnoseQuote(bad), JSON.stringify(bad)).toBe(null);
    }
  });

  it('rejects prototype-polluting keys at every level (never repaired)', () => {
    expect(validateCrmDiagnoseQuote(JSON.parse(
      '{"psychProfile":"א","conversationStructure":[],"objections":[],"closingTip":"ב","__proto__":{"p":1}}',
    ))).toBe(null);
    expect(validateCrmDiagnoseQuote({
      psychProfile: 'א',
      conversationStructure: [JSON.parse('{"step":"ב","detail":"ג","__proto__":{"p":1}}')],
      objections: [],
      closingTip: 'ד',
    })).toBe(null);
  });

  it('parseStructuredResult + validateStructuredResult dispatch the new contract', () => {
    const raw = JSON.stringify(DIAGNOSIS);
    expect(parseStructuredResult(raw, CONTRACT)).toEqual({ ok: true, value: DIAGNOSIS });
    for (const bad of ['{not json', '', 'null', '[1]', '"s"', JSON.stringify({ psychProfile: 'א' })]) {
      expect(parseStructuredResult(bad, CONTRACT).ok, bad).toBe(false);
    }
    expect(validateStructuredResult(CONTRACT, DIAGNOSIS)).toEqual(DIAGNOSIS);
    expect(validateStructuredResult('unknown.contract', DIAGNOSIS)).toBe(null);
    // pre-existing contracts still dispatch to their own validators
    expect(validateStructuredResult('crm.lead_ideas', DIAGNOSIS)).toBe(null);
  });
});

// ---------------------------------------------------------------
// 6) frontend lane — diagnoseQuote behavior (mocked gateway)
// ---------------------------------------------------------------
describe('diagnoseQuote · gateway lane behavior', () => {
  beforeEach(() => {
    callAiGateway.mockReset();
  });

  it('sends EXACTLY { clientName, field, audience, offer } — one attempt, verbatim values', async () => {
    callAiGateway.mockResolvedValue(okResult());
    const out = await diagnoseQuote(FULL_INPUT);
    expect(callAiGateway).toHaveBeenCalledTimes(1);
    expect(callAiGateway).toHaveBeenCalledWith(ACTION, FULL_INPUT);
    expect(out).toEqual(DIAGNOSIS);
  });

  it('returns result.json UNCHANGED (same reference, no reshaping)', async () => {
    const json = { ...DIAGNOSIS };
    callAiGateway.mockResolvedValue({ ok: true, result: { json } });
    const out = await diagnoseQuote(FULL_INPUT);
    expect(out).toBe(json);
  });

  it('does NOT trim, default, or repair values client-side (byte-exact boundary mapping)', async () => {
    callAiGateway.mockResolvedValue(okResult());
    const raw = { clientName: '  דני  ', field: '', audience: '   ', offer: '' };
    await diagnoseQuote(raw);
    expect(callAiGateway).toHaveBeenCalledWith(ACTION, { clientName: '  דני  ', field: '', audience: '   ', offer: '' });
    // invalid input still travels verbatim — the server contract decides
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'invalid_payload', message: 'x' } });
    await expect(diagnoseQuote({ clientName: '', field: '', audience: '', offer: '' })).rejects.toThrow('invalid_payload');
    expect(callAiGateway).toHaveBeenLastCalledWith(ACTION, { clientName: '', field: '', audience: '', offer: '' });
  });

  it('throws visibly on gateway/provider failure — exactly one attempt, NO fallback, NO retry', async () => {
    for (const code of ['invalid_payload', 'provider_error', 'invalid_provider_response', 'budget_exceeded', 'rate_limited', 'unauthenticated', 'budget_guard_unavailable', 'network_error', 'gateway_error']) {
      callAiGateway.mockReset();
      callAiGateway.mockResolvedValue({ ok: false, error: { code, message: 'x' } });
      await expect(diagnoseQuote(FULL_INPUT)).rejects.toThrow(code);
      expect(callAiGateway).toHaveBeenCalledTimes(1);
    }
    // malformed ok-results also throw (never return garbage to the UI)
    for (const malformed of [
      { ok: true, result: { text: 'not json' } },
      { ok: true, result: { json: null } },
      { ok: true, result: { json: [1] } },
      { ok: true, result: null },
      { ok: true },
    ]) {
      callAiGateway.mockReset();
      callAiGateway.mockResolvedValue(malformed);
      await expect(diagnoseQuote(FULL_INPUT)).rejects.toThrow('empty_response');
      expect(callAiGateway).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps the calm demo diagnosis ONLY when Supabase is genuinely unconfigured', async () => {
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'supabase_not_configured', message: 'x' } });
    const out = await diagnoseQuote(FULL_INPUT);
    expect(callAiGateway).toHaveBeenCalledTimes(1);
    expect(out._demo).toBe(true);
    expect(typeof out.psychProfile).toBe('string');
    expect(out.psychProfile.length).toBeGreaterThan(0);
    expect(Array.isArray(out.conversationStructure)).toBe(true);
    expect(out.conversationStructure.length).toBeGreaterThan(0);
    expect(Array.isArray(out.objections)).toBe(true);
    expect(typeof out.closingTip).toBe('string');
  });
});

// ---------------------------------------------------------------
// 7) source purity — the lane holds no browser-Gemini execution
// ---------------------------------------------------------------
describe('diagnoseQuote · frontend migration (source guards)', () => {
  const gemini = read('../gemini.js');
  const laneStart = gemini.indexOf('function buildDiagnoseQuoteGatewayPayload');
  const laneEnd = gemini.indexOf('\n}', gemini.indexOf('export async function diagnoseQuote('));
  const lane = gemini.slice(laneStart, laneEnd);

  it('exported signature text is unchanged', () => {
    expect(gemini.includes('export async function diagnoseQuote(input)')).toBe(true);
  });

  it('routes ONLY through the gateway: no Google/Ollama/local/key/fallback tokens in the lane', () => {
    expect(laneStart).toBeGreaterThan(-1);
    expect(lane.includes("callAiGateway('crm.diagnose_quote'")).toBe(true);
    expect((lane.match(/callAiGateway\(/g) || []).length).toBe(1);
    for (const banned of [
      'generativelanguage', 'API_KEY', 'X-goog', 'fetch(', 'localhost', '127.0.0.1',
      'localChat', 'useLocalLLM', 'isGeminiConfigured', 'parseJsonLoose', 'RESPONSE_SCHEMA', 'buildPrompt',
    ]) {
      expect(lane.includes(banned), banned).toBe(false);
    }
  });

  it('sends no provider/model/system/schema authority from the lane', () => {
    for (const banned of ['provider', 'model:', 'system', 'schema', 'temperature', 'maxOutputTokens', 'options']) {
      expect(lane.includes(banned), banned).toBe(false);
    }
  });

  it('the legacy direct-Gemini diagnose implementation (SYSTEM/RESPONSE_SCHEMA/buildPrompt) is fully removed from gemini.js', () => {
    expect(gemini.includes('RESPONSE_SCHEMA')).toBe(false);
    expect(gemini.includes('const SYSTEM =')).toBe(false);
    expect(gemini.includes('function buildPrompt(')).toBe(false);
    expect(gemini.includes('אתה יועץ מכירות בכיר')).toBe(false);
    expect(gemini.includes('נתוני הלקוח וההצעה:')).toBe(false);
  });

  it('demoResult is preserved for the unconfigured environment only', () => {
    expect(gemini.includes('function demoResult(')).toBe(true);
    const lane2 = gemini.slice(laneStart, gemini.indexOf('\n}', gemini.indexOf('export async function diagnoseQuote(')) + 2);
    expect(lane2.includes("code === 'supabase_not_configured'")).toBe(true);
    expect(lane2.includes('demoResult(input)')).toBe(true);
  });

  it('Diagnose.jsx keeps the same diagnoseQuote(form) call and no gateway wiring; demo badge keys on isSupabaseConfigured (M2 J3C S1)', () => {
    const diagnose = read('../../pages/Diagnose.jsx');
    // M2 J3C S1 (truthful UI): the lane is Gateway-served, so the demo badge now
    // keys on isSupabaseConfigured instead of the misleading isGeminiConfigured.
    expect(diagnose.includes("import { diagnoseQuote } from '../lib/gemini.js';")).toBe(true);
    expect(diagnose.includes("import { isSupabaseConfigured } from '../lib/supabase.js';")).toBe(true);
    expect(diagnose.includes('isGeminiConfigured')).toBe(false);
    expect(diagnose.includes('await diagnoseQuote(form)')).toBe(true);
    expect(diagnose.includes('aiGateway')).toBe(false);
    expect(diagnose.includes('callAiGateway')).toBe(false);
    // the UI's own combined-minimum guard mirrors the server rule
    expect(diagnose.includes('if (!form.clientName.trim() && !form.offer.trim())')).toBe(true);
  });
});
