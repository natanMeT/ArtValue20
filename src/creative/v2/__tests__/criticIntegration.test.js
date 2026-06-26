import { describe, it, expect, vi } from 'vitest';

// A compact, deterministic V1 output (no LLM). Hoisted so the gemini mock factory
// can reference it. Three materially-distinct concepts → pass the frozen diversity
// gate; totals 8.6 / 8.1 / 7.9 → V1 recommends concept-1.
const { mockV1 } = vi.hoisted(() => ({
  mockV1: {
    strategy: { core_message: 'הופכים בלגן לניהול אחד', promise: 'כל העסק במקום אחד', visual_direction: 'קולנועי מינימלי', dna: 'אמנות שמייצרת ערך', triggers: { psychological: 'שייכות' } },
    note: { feel: 'שליטה', one_image: 'מגדל בקרה' },
    concepts: [
      { hero_object: 'glowing control tower', core_idea: 'מרכז שליטה אחד לכל העסק', psychological_principle: 'תחושת שליטה', visual_metaphor: 'מגדל בקרה זוהר מעל ערפל של פתקים', emotional_reaction: 'רוגע', marketing_principle: 'בידול דרך פשטות', layout: { text_zone: 'עליון', overlay: 'כהה', font_weight: '800' }, copy: { headline: 'מרכז שליטה אחד' }, total: 8.6 },
      { hero_object: 'split desk', core_idea: 'לפני כאוס אחרי שקט', psychological_principle: 'ניגוד', visual_metaphor: 'שולחן מפוצל צד אחד כאוס וצד שני סדר', emotional_reaction: 'הקלה', marketing_principle: 'הוכחת טרנספורמציה', layout: { text_zone: 'מרכז', overlay: 'בהיר', font_weight: '700' }, copy: { headline: 'מהבלגן לשקט' }, total: 8.1 },
      { hero_object: 'paper storm screen', core_idea: 'פתקים מתאחדים למסך אחד', psychological_principle: 'סדר מתוך כאוס', visual_metaphor: 'סופת פתקים שמתעצבת למסך אחד', emotional_reaction: 'התפעלות', marketing_principle: 'מטאפורת איחוד', layout: { text_zone: 'תחתון', overlay: 'גראדיינט', font_weight: '900' }, copy: { headline: 'הכול מתחבר' }, total: 7.9 },
    ],
  },
}));

// Mock ONLY the V1 entry point + the copy seam. gemini.js is side-effect-free at
// import, so spreading the real module keeps every other export intact.
vi.mock('../../../lib/gemini.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    runCreativeDirector: async () => JSON.parse(JSON.stringify(mockV1)),
    draftWithJake: async () => ({ text: '' }),
  };
});

// Imports AFTER the mock declarations (vi.mock/vi.hoisted are hoisted above these).
import { createCreativeDirectorAdapter } from '../creativeDirectorAdapter.js';
import { createCampaignStore } from '../campaignStore.js';
import { createCreativeOrchestrator } from '../creativeActions.js';
import { artValuePack } from '../../../lib/jakePack.js';
import { captureRunV1 } from './fixtures.js';
import { critiqueConcepts } from '../conceptCritic.js';
import { createArtValueCreative } from '../createArtValueCreative.js';
import { setCreativeEventSink, getCreativeEventLog, clearCreativeEventLog } from '../logging.js';

setCreativeEventSink(() => {}); // silence console during tests

const emptyData = { clients: [], inventory: [], transactions: [], quotes: [], tasks: [], projects: [], outreachLeads: [], activity: [] };

function harness() {
  let n = 0;
  const map = new Map();
  const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
  const store = createCampaignStore({ storage, id: () => `cmp_${++n}`, clock: () => 'T' });
  const adapter = createCreativeDirectorAdapter({ runV1: captureRunV1(), model: 'test', now: () => 0, clock: () => 'T' });
  const orch = createCreativeOrchestrator({ adapter, store, pack: artValuePack, getData: () => emptyData, user: 'נתן' });
  return { orch, store };
}

describe('critic integration — additive over the REAL orchestrator + store', () => {
  it('the critique does NOT change the V1 result, its order, its recommendation, or persistence', async () => {
    const { orch, store } = harness();
    const need = orch.analyzeMarketingNeed('קמפיין להגדלת מכירות באינסטגרם');
    const { request, campaignId } = orch.createCampaignBrief({ need });
    const { result } = await orch.runCreativeDirector({ request, campaignId });

    const beforeResult = JSON.parse(JSON.stringify(result.concepts));
    const beforeRec = result.recommendedConceptId;
    const beforeStored = JSON.parse(JSON.stringify(store.get(campaignId).concepts));

    const critique = await critiqueConcepts({ concepts: result.concepts, strategy: result.strategy, request });

    // 1) original V1 output — byte-for-byte unchanged by the critic
    expect(result.concepts).toEqual(beforeResult);
    expect(result.recommendedConceptId).toBe(beforeRec);
    // 2) persistence — stored concepts + original ordering unchanged
    expect(store.get(campaignId).concepts).toEqual(beforeStored);
    expect(store.get(campaignId).concepts.map((c) => c.id)).toEqual(['concept-1', 'concept-2', 'concept-3']);
    // 3) critic is a SEPARATE additive view with its OWN recommendation
    expect(critique.ok).toBe(true);
    expect(critique.evaluations.map((e) => e.conceptId)).toEqual(['concept-1', 'concept-2', 'concept-3']);
    expect(critique.ranking).toHaveLength(3);
    expect(critique.survivors[0]).toBe(critique.recommendedConceptId);
  });
});

describe('critic integration — REAL composition root wiring (createArtValueCreative)', () => {
  it('runCreativeDirector returns an additive critique while preserving V1 output + persistence', async () => {
    clearCreativeEventLog();
    const creative = createArtValueCreative({ getData: () => emptyData, user: 'נתן' });
    const need = creative.analyzeMarketingNeed('קמפיין להגדלת מכירות באינסטגרם');
    const { request, campaignId } = creative.createCampaignBrief({ need });
    const out = await creative.runCreativeDirector({ request, campaignId });

    // additive critique attached by the composition-root decorator
    expect(out.critique).toBeDefined();
    expect(out.critique.ok).toBe(true);
    expect(out.critique.ranking).toHaveLength(3);
    expect(out.critique.survivors[0]).toBe(out.critique.recommendedConceptId);

    // V1 result untouched (recommendation = highest total = concept-1; original order)
    expect(out.result.recommendedConceptId).toBe('concept-1');
    expect(out.result.concepts.map((c) => c.id)).toEqual(['concept-1', 'concept-2', 'concept-3']);

    // persistence (frozen store) preserves the original concept array + order
    expect(creative.listConcepts(campaignId).map((c) => c.id)).toEqual(['concept-1', 'concept-2', 'concept-3']);

    // audit event emitted
    expect(getCreativeEventLog().map((e) => e.event)).toContain('creative_concepts_critiqued');
  });
});
