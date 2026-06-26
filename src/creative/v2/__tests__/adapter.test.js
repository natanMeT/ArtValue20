import { describe, it, expect } from 'vitest';
import { createCreativeDirectorAdapter, normalizeV1ToResult, CreativeAdapterError } from '../creativeDirectorAdapter.js';
import { validateCreativeCampaignResult } from '../schema.js';
import { validRequest, v1OutputFixture, fakeRunV1, captureRunV1 } from './fixtures.js';

const makeAdapter = (over = {}) => createCreativeDirectorAdapter({
  runV1: fakeRunV1, model: 'test-model', now: () => 1000, clock: () => '2026-01-01T00:00:00.000Z', ...over,
});

describe('C. adapter — behavior', () => {
  it('maps a canonical request to the EXACT expected V1 input', async () => {
    const run = captureRunV1();
    const adapter = makeAdapter({ runV1: run });
    await adapter.run(validRequest);
    expect(run.calls).toHaveLength(1);
    expect(run.calls[0].brand).toEqual({
      business: 'Art Value — סטודיו דיגיטלי',
      positioning: 'אתרים, CRM, מיתוג וקמפיינים · הגדלת מכירות · הצעה: דמו חינם · מוצרים/שירותים: מערכות CRM',
      audience: 'בעלי עסקים; בעלי עסקים שמנהלים ידנית',
      industry: 'סטודיו דיגיטלי',
      differentiators: ['הכנסות החודש: ₪40,000', 'מוקד יחיד'],
      emotional_triggers: ['הכנסות החודש: ₪40,000'],
      tone: ['פרימיום', 'חד'],
      trust_signals: [],
      luxury_level: 'premium',
      weaknesses: [],
      do_not: ['סטוק גנרי'],
      palette: ['#d4ff3f', '#c7bfff'],
      cards: [],
    });
    expect(run.calls[0].opts).toEqual({ target: 3, brainstormSize: 30, maxRounds: 2, withCritique: false });
  });

  it('returns a result that passes canonical validation', async () => {
    const result = await makeAdapter().run(validRequest);
    expect(validateCreativeCampaignResult(result).ok).toBe(true);
    expect(result.concepts).toHaveLength(3);
  });

  it('rejects an invalid request with REQUEST_INVALID', async () => {
    const adapter = makeAdapter();
    await expect(adapter.run({ ...validRequest, requestedConceptCount: 5 })).rejects.toMatchObject({ code: 'REQUEST_INVALID' });
  });

  it('turns a V1 execution error into V1_EXECUTION_FAILED', async () => {
    const adapter = makeAdapter({ runV1: async () => { throw new Error('LLM down'); } });
    await expect(adapter.run(validRequest)).rejects.toMatchObject({ code: 'V1_EXECUTION_FAILED' });
  });

  it('fails on malformed V1 output (no concepts) with V1_OUTPUT_INVALID', async () => {
    const adapter = makeAdapter({ runV1: async () => ({ strategy: {} }) });
    await expect(adapter.run(validRequest)).rejects.toMatchObject({ code: 'V1_OUTPUT_INVALID' });
  });

  it('fails on V1 output that normalizes to an invalid result (RESULT_INVALID)', async () => {
    // only 2 concepts → exactly-3 rule fails AFTER normalization
    const adapter = makeAdapter({ runV1: async () => ({ strategy: { core_message: 'x' }, concepts: v1OutputFixture.concepts.slice(0, 2) }) });
    await expect(adapter.run(validRequest)).rejects.toMatchObject({ code: 'RESULT_INVALID' });
  });

  it('does not mutate the request or the V1 output fixture', async () => {
    const reqSnap = JSON.stringify(validRequest);
    const v1Snap = JSON.stringify(v1OutputFixture);
    await makeAdapter().run(validRequest);
    normalizeV1ToResult(v1OutputFixture, validRequest, {});
    expect(JSON.stringify(validRequest)).toBe(reqSnap);
    expect(JSON.stringify(v1OutputFixture)).toBe(v1Snap);
  });

  it('CreativeAdapterError carries a machine-readable code', () => {
    const e = new CreativeAdapterError('X', 'msg', { a: 1 });
    expect(e.code).toBe('X');
    expect(e.details).toEqual({ a: 1 });
  });
});

// ===================================================================
// PHASE 16 — GOLDEN normalization contract. A change in either V1's output shape
// or the adapter normalizer changes this object and FAILS the test. The expected
// object is INLINE (not an auto-snapshot) → updating it is a deliberate, reviewed
// edit. Non-deterministic metadata (durationMs/createdAt) is pinned via injected
// values; engineVersion/model are stable.
// ===================================================================
const GOLDEN = {
  requestId: 'req_test_1',
  strategy: {
    businessProblem: 'כל העסק במקום אחד — בלי וואטסאפ ואקסל',
    campaignObjective: 'הגדלת מכירות',
    audienceInsight: 'שייכות',
    strategicDirection: 'קולנועי, עמוק, מינימלי-עשיר',
    keyMessage: 'הופכים בלגן לניהול אחד',
  },
  concepts: [
    { id: 'concept-1', name: 'מרכז שליטה אחד', strategicAngle: 'בידול דרך פשטות', emotionalTone: 'רוגע וביטחון', coreIdea: 'מרכז שליטה אחד לכל העסק', headlineDirection: 'מרכז שליטה אחד', visualDirection: 'מגדל בקרה זוהר מעל ערפל של פתקים', heroObject: 'glowing control tower', compositionDirection: 'עליון · overlay כהה · משקל 800', colorDirection: ['#d4ff3f', '#c7bfff'], whyItWorks: 'תחושת שליטה', risks: [], originalityScore: 8.6, brandFitScore: 8.6 },
    { id: 'concept-2', name: 'מהבלגן לשקט', strategicAngle: 'הוכחת טרנספורמציה', emotionalTone: 'הקלה', coreIdea: 'לפני: כאוס. אחרי: שקט', headlineDirection: 'מהבלגן לשקט', visualDirection: 'שולחן מפוצל — צד אחד כאוס פתקים, צד שני נקי ומסודר', heroObject: 'split desk', compositionDirection: 'מרכז · overlay בהיר · משקל 700', colorDirection: ['#d4ff3f', '#c7bfff'], whyItWorks: 'ניגוד', risks: [], originalityScore: 8.1, brandFitScore: 8.1 },
    { id: 'concept-3', name: 'הכול מתחבר', strategicAngle: 'מטאפורת איחוד', emotionalTone: 'התפעלות', coreIdea: 'הפתקים מתאחדים למסך אחד', headlineDirection: 'הכול מתחבר', visualDirection: 'סופת פתקים שמתעצבת למסך CRM אחד', heroObject: 'paper storm forming a screen', compositionDirection: 'תחתון · overlay גראדיינט · משקל 900', colorDirection: ['#d4ff3f', '#c7bfff'], whyItWorks: 'סדר מתוך כאוס', risks: [], originalityScore: 7.9, brandFitScore: 7.9 },
  ],
  recommendedConceptId: 'concept-1',
  metadata: { engineVersion: 'creative-director-v1', model: 'test-model', durationMs: 0, createdAt: '2026-01-01T00:00:00.000Z' },
};

describe('PHASE 16 — golden normalization', () => {
  it('normalizes the pinned V1 output to the EXACT canonical golden result', () => {
    const result = normalizeV1ToResult(v1OutputFixture, validRequest, { model: 'test-model', durationMs: 0, createdAt: '2026-01-01T00:00:00.000Z' });
    expect(result).toEqual(GOLDEN);
  });

  it('the adapter run produces the same golden (timing pinned via injection)', async () => {
    const result = await makeAdapter().run(validRequest);
    expect(result).toEqual(GOLDEN);
  });
});

describe('PHASE 16 — frozen V1 contract fixture', () => {
  it('the pinned V1 output still matches the expected V1 contract projection', () => {
    // If V1 changes its output shape, THIS fails first — protecting the normalizer.
    expect(Object.keys(v1OutputFixture).sort()).toEqual(['concepts', 'note', 'strategy']);
    expect(Object.keys(v1OutputFixture.strategy).sort()).toEqual(['core_message', 'dna', 'emotional_message', 'promise', 'triggers', 'visual_direction']);
    for (const c of v1OutputFixture.concepts) {
      expect(c).toHaveProperty('mechanism');
      expect(c).toHaveProperty('total');
      expect(c).toHaveProperty('marketing_principle');
      expect(c).toHaveProperty('hero_object');
      expect(c).toHaveProperty('layout');
      expect(c.copy).toHaveProperty('headline');
    }
  });
});
