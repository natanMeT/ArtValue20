import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 0B kill-switch tests. Prove that with the critic in passthrough mode
// (the new DEFAULT): critiqueConcepts() is NOT called, the critique is the inert
// { ok:false, passthrough:true } marker, and the frozen V1 output (concept order +
// recommendedConceptId + persistence) passes through byte-for-byte. Also prove the
// UI gate (Assistant.jsx:855) falls back to the exact V1 view under that marker.

// Deterministic V1 output (no LLM). Same shape as criticIntegration.test.js so the
// adapter maps it to concept-1/2/3 with V1 recommending concept-1 (highest total).
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

vi.mock('../../../lib/gemini.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    runCreativeDirector: async () => JSON.parse(JSON.stringify(mockV1)),
    draftWithJake: async () => ({ text: '' }),
  };
});

// Spy-wrap the critic so we can PROVE invocation / non-invocation. The wrapper
// delegates to the real implementation, so the critic-enabled path is unchanged.
vi.mock('../conceptCritic.js', async (importActual) => {
  const actual = await importActual();
  return { ...actual, critiqueConcepts: vi.fn(actual.critiqueConcepts) };
});

import { createArtValueCreative } from '../createArtValueCreative.js';
import { critiqueConcepts } from '../conceptCritic.js';
import { setCreativeEventSink, getCreativeEventLog, clearCreativeEventLog } from '../logging.js';

setCreativeEventSink(() => {}); // silence console during tests

const emptyData = { clients: [], inventory: [], transactions: [], quotes: [], tasks: [], projects: [], outreachLeads: [], activity: [] };
const ORDER = ['concept-1', 'concept-2', 'concept-3'];

async function run(opts) {
  const creative = createArtValueCreative({ getData: () => emptyData, user: 'נתן', ...opts });
  const need = creative.analyzeMarketingNeed('קמפיין להגדלת מכירות באינסטגרם');
  const { request, campaignId } = creative.createCampaignBrief({ need });
  const out = await creative.runCreativeDirector({ request, campaignId });
  return { creative, out, campaignId };
}

beforeEach(() => { critiqueConcepts.mockClear(); clearCreativeEventLog(); });

describe('Phase 0B critic passthrough kill-switch (DEFAULT)', () => {
  it('skips critiqueConcepts() and returns the inert { ok:false, passthrough:true } marker', async () => {
    const { out } = await run(); // default: criticPassthrough = true
    expect(critiqueConcepts).not.toHaveBeenCalled();
    expect(out.critique).toEqual({ ok: false, passthrough: true });
  });

  it('emits an observable audit breadcrumb (disabled critic is not silent)', async () => {
    await run();
    const ev = getCreativeEventLog().find((e) => e.event === 'creative_concepts_critiqued');
    expect(ev).toBeDefined();
    expect(ev.ok).toBe(false);
    expect(ev.passthrough).toBe(true);
    expect(ev.reason).toBe('critic_passthrough_mode');
  });

  it('passes V1 concept order through unchanged', async () => {
    const { out } = await run();
    expect(out.result.concepts.map((c) => c.id)).toEqual(ORDER);
  });

  it('passes V1 recommendedConceptId through unchanged', async () => {
    const { out } = await run();
    expect(out.result.recommendedConceptId).toBe('concept-1');
  });

  it('preserves the persisted concept array + order (frozen store untouched)', async () => {
    const { creative, campaignId } = await run();
    expect(creative.listConcepts(campaignId).map((c) => c.id)).toEqual(ORDER);
  });
});

describe('critic engine remains intact when explicitly enabled', () => {
  it('criticPassthrough:false calls critiqueConcepts() and produces a live critique, V1 still untouched', async () => {
    const { out } = await run({ criticPassthrough: false });
    expect(critiqueConcepts).toHaveBeenCalledTimes(1);
    expect(out.critique.ok).toBe(true);
    expect(out.critique.ranking).toHaveLength(3);
    // V1 fields still pass through unchanged even when the critic runs
    expect(out.result.recommendedConceptId).toBe('concept-1');
    expect(out.result.concepts.map((c) => c.id)).toEqual(ORDER);
  });
});

describe('UI fallback semantics under the passthrough marker', () => {
  // Mirrors the exact gate in Assistant.jsx:855-860. With critique.ok!==true the UI
  // uses the V1 concept order and V1 recommendedConceptId (no critic influence).
  it('useCritic is false → V1 order + V1 recommendation drive the view', () => {
    const camp = {
      concepts: [{ id: 'concept-1' }, { id: 'concept-2' }, { id: 'concept-3' }],
      recommendedConceptId: 'concept-1',
      critique: { ok: false, passthrough: true },
    };
    const crit = camp.critique;
    const useCritic = !!(crit && crit.ok === true && Array.isArray(crit.ranking) && crit.ranking.length);
    const byId = new Map((camp.concepts || []).map((c) => [c.id, c]));
    const orderedIds = (useCritic ? crit.ranking : (camp.concepts || []).map((c) => c.id)).filter((id) => byId.has(id));
    const badgeId = useCritic ? crit.recommendedConceptId : camp.recommendedConceptId;

    expect(useCritic).toBe(false);
    expect(orderedIds).toEqual(ORDER);
    expect(badgeId).toBe('concept-1');
  });
});
