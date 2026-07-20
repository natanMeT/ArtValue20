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
  buildLeadIdeasUserMessage,
  toProviderMessages,
  toProviderMessagesForAction,
  buildGeminiMessagesRequest,
  STRUCTURED_RESULT_CONTRACTS,
  CRM_LEAD_CATEGORIES,
  validateCrmLeadIdeas,
  validateStructuredResult,
  parseStructuredResult,
} from '../aiGatewayContract.js';
import {
  getActionProfile,
  ACTION_PROFILE_KEYS,
  CRM_LEAD_IDEAS,
} from '../../../supabase/functions/ai-gateway/actionProfiles.ts';
import {
  requiredGatewayCapabilities,
  REQUIRED_CAPABILITY_ACTION_KEYS,
} from '../../../supabase/functions/ai-gateway/geminiAdapter.ts';

// M2 J3A — crm.lead_ideas: the Outreach lead-ideas lane migrated from the
// direct browser Gemini API to the server-owned AI Gateway. These tests cover
// the action vocabulary, the strict { niche, count } input contract (incl. the
// new generic integer field type), the server-owned profile, the pure
// user-message mapping, the structured leads result contract, and the frontend
// lane migration (payload mapping, single attempt, no fallback, demo behavior,
// source purity).

const ACTION = 'crm.lead_ideas';
const DEFAULT_NICHE = 'עסקי בוטיק בישראל';
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ---- behavioral seam: gemini.js with a mocked gateway client ----
vi.mock('../aiGatewayClient.js', () => ({ callAiGateway: vi.fn() }));
const { generateLeadIdeas } = await import('../gemini.js');
const { callAiGateway } = await import('../aiGatewayClient.js');

const LEADS = [
  { name: 'יקב בוטיק ברמת הגולן', category: 'winery', need: 'אתר מותג + הזמנת טעימות' },
  { name: 'גלריה בצפת', category: 'art', need: 'תיק עבודות + חנות' },
];
const okResult = (leads = LEADS) => ({ ok: true, result: { json: { leads } } });

// ---------------------------------------------------------------
// 1) canonical vocabulary + routing + registry completeness
// ---------------------------------------------------------------
describe('crm.lead_ideas · canonical vocabulary + routing', () => {
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
    expect(CRM_LEAD_IDEAS).toBe(ACTION);
  });

  it('capability map is EXACTLY [json] and drift-guards against the profile', () => {
    expect(requiredGatewayCapabilities(ACTION, getActionProfile(ACTION))).toEqual(['json']);
    // outputMode drift or a missing profile fails closed
    expect(requiredGatewayCapabilities(ACTION, { outputMode: 'text' })).toBe(null);
    expect(requiredGatewayCapabilities(ACTION, null)).toBe(null);
  });
});

// ---------------------------------------------------------------
// 2) strict input contract — { niche, count }
// ---------------------------------------------------------------
describe('crm.lead_ideas · strict input contract', () => {
  const isRejectReason = (r, reason) => r.ok === false
    && r.error.code === 'invalid_payload' && r.error.reason === reason;

  it('accepts the exact valid shape and normalizes a FRESH trimmed payload', () => {
    const r = validateAiGatewayInput(ACTION, { niche: '  יקבים בגליל  ', count: 6 });
    expect(r.ok).toBe(true);
    expect(r.actionType).toBe(ACTION);
    expect(r.payload).toEqual({ niche: 'יקבים בגליל', count: 6 });
    // content-free accounting is TEXT-ONLY: the integer contributes nothing
    expect(r.inputChars).toBe('יקבים בגליל'.length);
    expect(countAiGatewayInputChars(ACTION, r.payload)).toBe('יקבים בגליל'.length);
  });

  it('accepts the count boundaries 1 and 10', () => {
    expect(validateAiGatewayInput(ACTION, { niche: 'x', count: 1 }).ok).toBe(true);
    expect(validateAiGatewayInput(ACTION, { niche: 'x', count: 10 }).ok).toBe(true);
  });

  it('rejects a blank / missing / non-string niche (the Gateway itself never defaults)', () => {
    expect(isRejectReason(validateAiGatewayInput(ACTION, { count: 6 }), 'missing_field')).toBe(true);
    expect(isRejectReason(validateAiGatewayInput(ACTION, { niche: '', count: 6 }), 'empty_field')).toBe(true);
    expect(isRejectReason(validateAiGatewayInput(ACTION, { niche: '   ', count: 6 }), 'empty_field')).toBe(true);
    expect(isRejectReason(validateAiGatewayInput(ACTION, { niche: 42, count: 6 }), 'field_not_string')).toBe(true);
  });

  it('accepts a niche exactly at 500 chars and rejects 501 (no truncation)', () => {
    expect(AI_GATEWAY_INPUT_LIMITS.MAX_LEAD_IDEAS_NICHE_CHARS).toBe(500);
    const atLimit = 'x'.repeat(500);
    expect(validateAiGatewayInput(ACTION, { niche: atLimit, count: 6 }).ok).toBe(true);
    expect(isRejectReason(
      validateAiGatewayInput(ACTION, { niche: 'x'.repeat(501), count: 6 }), 'field_too_long',
    )).toBe(true);
  });

  it('rejects non-number / non-finite / non-integer count — no coercion, no rounding', () => {
    for (const [v, reason] of [
      ['6', 'field_not_number'], [true, 'field_not_number'], [null, 'field_not_number'],
      [NaN, 'field_not_number'], [Infinity, 'field_not_number'], [-Infinity, 'field_not_number'],
      [{}, 'field_not_number'], [[6], 'field_not_number'],
      [6.5, 'field_not_integer'], [0.999, 'field_not_integer'],
    ]) {
      expect(isRejectReason(validateAiGatewayInput(ACTION, { niche: 'x', count: v }), reason), String(v)).toBe(true);
    }
    expect(isRejectReason(validateAiGatewayInput(ACTION, { niche: 'x' }), 'missing_field')).toBe(true);
  });

  it('rejects zero / negative / greater-than-10 count', () => {
    for (const v of [0, -1, -10, 11, 100]) {
      expect(isRejectReason(
        validateAiGatewayInput(ACTION, { niche: 'x', count: v }), 'field_out_of_range',
      ), String(v)).toBe(true);
    }
  });

  it('rejects unknown fields and authority-injection fields (never silently stripped)', () => {
    for (const extra of ['prompt', 'messages', 'provider', 'model', 'system', 'schema', 'responseSchema', 'apiKey', 'temperature', 'maxOutputTokens', 'options', 'foo']) {
      const r = validateAiGatewayInput(ACTION, { niche: 'x', count: 6, [extra]: 'y' });
      expect(isRejectReason(r, 'unknown_field'), extra).toBe(true);
    }
  });

  it('rejects prototype-pollution keys and hostile shapes without throwing', () => {
    expect(validateAiGatewayInput(ACTION, JSON.parse('{"niche":"x","count":6,"__proto__":{"p":1}}')).ok).toBe(false);
    for (const p of [null, [], 'x', 42, { niche: { a: 1 }, count: 6 }]) {
      expect(() => validateAiGatewayInput(ACTION, p)).not.toThrow();
      expect(validateAiGatewayInput(ACTION, p).ok).toBe(false);
    }
  });

  it('invalid input is rejected by the PURE validator — before any budget/provider stage can run', () => {
    // The Edge shell order is validate → budget-reserve → provider (source guard):
    const indexTs = read('../../../supabase/functions/ai-gateway/index.ts');
    const vAt = indexTs.indexOf('validateAiGatewayInput(');
    const bAt = indexTs.indexOf('reserveAiBudget({');
    const pAt = indexTs.indexOf('selection.adapter.run(');
    expect(vAt).toBeGreaterThan(-1);
    expect(bAt).toBeGreaterThan(vAt);
    expect(pAt).toBeGreaterThan(bAt);
  });

  it('the integer engine leaves every pre-existing profile byte-compatible', () => {
    // prompt-only actions: same accept/reject behavior and reasons as before
    for (const a of ['text.copy', 'text.crm_message', 'studio.prompt_enhance', 'crm.suggest_next_action']) {
      const ok = validateAiGatewayInput(a, { prompt: '  hi  ' });
      expect(ok.ok, a).toBe(true);
      expect(ok.payload, a).toEqual({ prompt: 'hi' });
      expect(validateAiGatewayInput(a, { prompt: 42 }).error.reason, a).toBe('field_not_string');
      expect(validateAiGatewayInput(a, {}).error.reason, a).toBe('missing_field');
    }
    // multi-turn actions: unchanged
    const mt = validateAiGatewayInput('jake.chat', {
      messages: [{ role: 'user', text: 'כמה לקוחות?' }],
      context: { summary: 'לקוחות: 12' },
    });
    expect(mt.ok).toBe(true);
    expect(mt.payload.messages).toEqual([{ role: 'user', text: 'כמה לקוחות?' }]);
    // lead-ideas fields never leak into other profiles
    expect(validateAiGatewayInput('text.copy', { niche: 'x', count: 6 }).error.reason).toBe('unknown_field');
  });
});

// ---------------------------------------------------------------
// 3) server-owned action profile
// ---------------------------------------------------------------
describe('crm.lead_ideas · server-owned structured profile', () => {
  const p = getActionProfile(ACTION);

  it('is a frozen json profile with the legacy generation config (0.9 / 2048 / thinkingBudget 0)', () => {
    expect(p).not.toBe(null);
    expect(Object.isFrozen(p)).toBe(true);
    expect(p.outputMode).toBe('json');
    expect(p.temperature).toBe(0.9);
    expect(p.maxOutputTokens).toBe(2048);
    expect(p.responseMimeType).toBe('application/json');
    expect(p.thinkingBudget).toBe(0);
    expect(p.parsePolicy).toBe('json_strict');
    expect(p.resultContract).toBe(STRUCTURED_RESULT_CONTRACTS.CRM_LEAD_IDEAS);
    expect(p.resultTransform).toBe(null);
  });

  it('carries the verbatim legacy LEAD_SCHEMA (eight-value category enum, frozen)', () => {
    expect(Object.isFrozen(p.responseSchema)).toBe(true);
    expect(p.responseSchema.required).toEqual(['leads']);
    const item = p.responseSchema.properties.leads.items;
    expect(item.required).toEqual(['name', 'category', 'need']);
    expect(item.properties.category.enum).toEqual([
      'winery', 'food', 'art', 'beauty', 'hospitality', 'judaica', 'clinic', 'other',
    ]);
    expect(item.properties.category.enum).toEqual([...CRM_LEAD_CATEGORIES]);
  });

  it('carries the verbatim legacy Hebrew system instruction', () => {
    expect(p.systemInstruction).toBe(`אתה אנליסט מכירות לסטודיו דיגיטלי (Art Value) שמוכר אתרים, מערכות CRM, מיתוג וקמפיינים.
המשימה: לייצר רעיונות ללידים — עסקים פוטנציאליים שכדאי לפנות אליהם. עברית בלבד, קונקרטי ומעשי.
לכל ליד: שם/סוג עסק ספציפי, קטגוריה מהרשימה, והצורך הדיגיטלי המרכזי שלו (מה הכי כדאי למכור לו).
קטגוריות: winery=יקבים, food=מסעדות/קפה, art=גלריות/אמנים, beauty=יופי, hospitality=אירוח, judaica=תכשיטים/יודאיקה, clinic=קליניקות, other=אחר.`);
  });

  it('builds the exact Gemini request body (config + mime + schema + thinkingConfig)', () => {
    const built = buildGeminiMessagesRequest([{ role: 'user', text: 'hi' }], p);
    expect(built.ok).toBe(true);
    expect(built.body.generationConfig.temperature).toBe(0.9);
    expect(built.body.generationConfig.maxOutputTokens).toBe(2048);
    expect(built.body.generationConfig.responseMimeType).toBe('application/json');
    expect(built.body.generationConfig.responseSchema).toEqual(p.responseSchema);
    expect(built.body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(built.body.systemInstruction).toEqual({ parts: [{ text: p.systemInstruction }] });
  });
});

// ---------------------------------------------------------------
// 4) pure user-message builder + action-aware mapping
// ---------------------------------------------------------------
describe('crm.lead_ideas · provider-message mapping (pure)', () => {
  it('buildLeadIdeasUserMessage reproduces the legacy user message exactly', () => {
    expect(buildLeadIdeasUserMessage('יקבים בגליל', 6)).toBe(
      'תחום / אזור / סוג קהל לחיפוש לידים: "יקבים בגליל".\nהחזר 6 רעיונות ללידים מגוונים ורלוונטיים.',
    );
  });

  it('buildLeadIdeasUserMessage fails closed on invalid input', () => {
    for (const [n, c] of [['', 6], ['   ', 6], [null, 6], [42, 6], ['x', '6'], ['x', 6.5], ['x', NaN], ['x', Infinity], ['x', null]]) {
      expect(buildLeadIdeasUserMessage(n, c), `${String(n)}/${String(c)}`).toBe(null);
    }
  });

  it('toProviderMessagesForAction maps a validated lead-ideas payload to ONE user message', () => {
    expect(toProviderMessagesForAction(ACTION, { niche: 'יקבים', count: 4 })).toEqual([
      { role: 'user', text: 'תחום / אזור / סוג קהל לחיפוש לידים: "יקבים".\nהחזר 4 רעיונות ללידים מגוונים ורלוונטיים.' },
    ]);
  });

  it('fails closed on unknown/malformed action-specific payloads', () => {
    for (const bad of [null, undefined, [], 'x', { prompt: 'x' }, { niche: '', count: 6 }, { niche: 'x', count: '6' }, {}]) {
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
    for (const a of ['not.an.action', null, undefined, 42]) {
      expect(toProviderMessagesForAction(a, prompt), String(a)).toEqual(toProviderMessages(prompt));
      expect(toProviderMessagesForAction(a, {}), String(a)).toBe(null);
    }
    expect(() => toProviderMessagesForAction(Symbol('s'), prompt)).not.toThrow();
  });
});

// ---------------------------------------------------------------
// 5) structured result contract — fail-closed leads validation
// ---------------------------------------------------------------
describe('crm.lead_ideas · structured result contract (fail-closed)', () => {
  const CONTRACT = STRUCTURED_RESULT_CONTRACTS.CRM_LEAD_IDEAS;

  it('accepts the exact contract, normalizes trimmed fields, drops extra item keys', () => {
    const v = validateCrmLeadIdeas({
      leads: [{ name: '  יקב  ', category: 'winery', need: '  אתר  ', extra: 'DROP' }],
    });
    expect(v).toEqual({ leads: [{ name: 'יקב', category: 'winery', need: 'אתר' }] });
  });

  it('accepts every one of the eight categories and ONLY them (no case repair)', () => {
    for (const c of CRM_LEAD_CATEGORIES) {
      expect(validateCrmLeadIdeas({ leads: [{ name: 'x', category: c, need: 'y' }] }), c).not.toBe(null);
    }
    for (const c of ['Winery', 'WINERY', 'services', 'restaurant', '', ' winery', 42, null]) {
      expect(validateCrmLeadIdeas({ leads: [{ name: 'x', category: c, need: 'y' }] }), String(c)).toBe(null);
    }
  });

  it('an empty leads array is valid (legacy zero-ideas behavior preserved)', () => {
    expect(validateCrmLeadIdeas({ leads: [] })).toEqual({ leads: [] });
  });

  it('fails closed on missing/invalid shapes', () => {
    for (const bad of [
      null, [], 'x', 42, {}, { leads: 'x' }, { leads: {} },
      { leads: [null] }, { leads: ['x'] }, { leads: [[]] },
      { leads: [{ category: 'winery', need: 'y' }] },          // missing name
      { leads: [{ name: 'x', category: 'winery' }] },          // missing need
      { leads: [{ name: '', category: 'winery', need: 'y' }] }, // empty name
      { leads: [{ name: 'x', category: 'winery', need: '  ' }] }, // blank need
      { leads: [{ name: 42, category: 'winery', need: 'y' }] },
    ]) {
      expect(validateCrmLeadIdeas(bad), JSON.stringify(bad)).toBe(null);
    }
    expect(validateCrmLeadIdeas(JSON.parse('{"leads":[],"__proto__":{"p":1}}'))).toBe(null);
    expect(validateCrmLeadIdeas({ leads: [JSON.parse('{"name":"x","category":"winery","need":"y","__proto__":{"p":1}}')] })).toBe(null);
  });

  it('parseStructuredResult + validateStructuredResult dispatch the new contract', () => {
    const raw = JSON.stringify({ leads: [{ name: 'a', category: 'food', need: 'b' }] });
    expect(parseStructuredResult(raw, CONTRACT)).toEqual({
      ok: true, value: { leads: [{ name: 'a', category: 'food', need: 'b' }] },
    });
    for (const bad of ['{not json', '', 'null', '[1]', '"s"', JSON.stringify({ leads: [{ name: 'a', category: 'nope', need: 'b' }] })]) {
      expect(parseStructuredResult(bad, CONTRACT).ok, bad).toBe(false);
    }
    expect(validateStructuredResult(CONTRACT, { leads: [] })).toEqual({ leads: [] });
    expect(validateStructuredResult('unknown.contract', { leads: [] })).toBe(null);
  });
});

// ---------------------------------------------------------------
// 6) frontend lane — generateLeadIdeas behavior (mocked gateway)
// ---------------------------------------------------------------
describe('generateLeadIdeas · gateway lane behavior', () => {
  beforeEach(() => {
    callAiGateway.mockReset();
  });

  it('sends EXACTLY { niche, count } to crm.lead_ideas — one attempt, verbatim values', async () => {
    callAiGateway.mockResolvedValue(okResult());
    const out = await generateLeadIdeas('יקבים בגליל העליון', 6);
    expect(callAiGateway).toHaveBeenCalledTimes(1);
    expect(callAiGateway).toHaveBeenCalledWith(ACTION, { niche: 'יקבים בגליל העליון', count: 6 });
    expect(out).toEqual(LEADS);
  });

  it('defaults count to 6 when omitted (unchanged public signature)', async () => {
    callAiGateway.mockResolvedValue(okResult());
    await generateLeadIdeas('קליניקות');
    expect(callAiGateway).toHaveBeenCalledWith(ACTION, { niche: 'קליניקות', count: 6 });
  });

  it('maps a blank/missing niche to the approved legacy default (Outreach compatibility)', async () => {
    callAiGateway.mockResolvedValue(okResult());
    await generateLeadIdeas('', 6);
    expect(callAiGateway).toHaveBeenLastCalledWith(ACTION, { niche: DEFAULT_NICHE, count: 6 });
    await generateLeadIdeas('   ', 6);
    expect(callAiGateway).toHaveBeenLastCalledWith(ACTION, { niche: DEFAULT_NICHE, count: 6 });
    await generateLeadIdeas(undefined, 6);
    expect(callAiGateway).toHaveBeenLastCalledWith(ACTION, { niche: DEFAULT_NICHE, count: 6 });
  });

  it('does NOT repair an invalid count client-side (the server contract decides)', async () => {
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'invalid_payload', message: 'x' } });
    await expect(generateLeadIdeas('x', 0)).rejects.toThrow('invalid_payload');
    expect(callAiGateway).toHaveBeenCalledWith(ACTION, { niche: 'x', count: 0 });
  });

  it('returns the server-validated leads array shape unchanged', async () => {
    callAiGateway.mockResolvedValue(okResult([{ name: 'א', category: 'other', need: 'ב' }]));
    const out = await generateLeadIdeas('x', 1);
    expect(out).toEqual([{ name: 'א', category: 'other', need: 'ב' }]);
  });

  it('throws visibly on gateway/provider failure — exactly one attempt, NO fallback, NO retry', async () => {
    for (const code of ['provider_error', 'invalid_provider_response', 'budget_exceeded', 'rate_limited', 'unauthenticated', 'network_error']) {
      callAiGateway.mockReset();
      callAiGateway.mockResolvedValue({ ok: false, error: { code, message: 'x' } });
      await expect(generateLeadIdeas('x', 6)).rejects.toThrow(code);
      expect(callAiGateway).toHaveBeenCalledTimes(1);
    }
    // malformed ok-result also throws (never returns garbage)
    callAiGateway.mockReset();
    callAiGateway.mockResolvedValue({ ok: true, result: { text: 'not json' } });
    await expect(generateLeadIdeas('x', 6)).rejects.toThrow('empty_response');
    expect(callAiGateway).toHaveBeenCalledTimes(1);
  });

  it('keeps the calm demo list ONLY when Supabase is genuinely unconfigured', async () => {
    callAiGateway.mockResolvedValue({ ok: false, error: { code: 'supabase_not_configured', message: 'x' } });
    const out = await generateLeadIdeas('', 6);
    expect(callAiGateway).toHaveBeenCalledTimes(1);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(6);
    for (const l of out) {
      expect(typeof l.name).toBe('string');
      expect(l.name.length).toBeGreaterThan(0);
      expect(typeof l.category).toBe('string');
      expect(typeof l.need).toBe('string');
    }
  });
});

// ---------------------------------------------------------------
// 7) source purity — the lane holds no browser-Gemini execution
// ---------------------------------------------------------------
describe('generateLeadIdeas · frontend migration (source guards)', () => {
  const gemini = read('../gemini.js');
  const laneStart = gemini.indexOf('const LEAD_IDEAS_DEFAULT_NICHE');
  const laneEnd = gemini.indexOf('\n}', gemini.indexOf('export async function generateLeadIdeas('));
  const lane = gemini.slice(laneStart, laneEnd);

  it('exported signature text is unchanged', () => {
    expect(gemini.includes('export async function generateLeadIdeas(niche, count = 6)')).toBe(true);
  });

  it('routes ONLY through the gateway: no Google/Ollama/local/key/fallback tokens in the lane', () => {
    expect(laneStart).toBeGreaterThan(-1);
    expect(lane.includes("callAiGateway('crm.lead_ideas'")).toBe(true);
    expect((lane.match(/callAiGateway\(/g) || []).length).toBe(1);
    for (const banned of [
      'generativelanguage', 'API_KEY', 'X-goog', 'fetch(', 'localhost', '127.0.0.1',
      'localChat', 'useLocalLLM', 'isGeminiConfigured', 'LEAD_SCHEMA', 'responseSchema',
    ]) {
      expect(lane.includes(banned), banned).toBe(false);
    }
  });

  it('sends no provider/model/system/schema authority from the lane', () => {
    for (const banned of ['provider', 'model:', 'system', 'schema', 'temperature', 'maxOutputTokens', 'options']) {
      expect(lane.includes(banned), banned).toBe(false);
    }
  });

  it('the legacy direct-Gemini lead-ideas implementation is fully removed from gemini.js', () => {
    expect(gemini.includes('LEAD_SCHEMA')).toBe(false);
    expect(gemini.includes("const LEAD_CATEGORIES = ['winery'")).toBe(false);
  });

  it('Outreach.jsx keeps the same generateLeadIdeas call and no gateway wiring; demo wording keys on isSupabaseConfigured (M2 J3C S1)', () => {
    const outreach = read('../../pages/Outreach.jsx');
    // M2 J3C S1 (truthful UI): the lane is Gateway-served, so the demo wording now
    // keys on isSupabaseConfigured instead of the misleading isGeminiConfigured.
    expect(outreach.includes("import { generateLeadIdeas } from '../lib/gemini.js';")).toBe(true);
    expect(outreach.includes("import { isSupabaseConfigured } from '../lib/supabase.js';")).toBe(true);
    expect(outreach.includes('isGeminiConfigured')).toBe(false);
    expect(outreach.includes('generateLeadIdeas(niche, 6)')).toBe(true);
    expect(outreach.includes('aiGateway')).toBe(false);
  });
});
