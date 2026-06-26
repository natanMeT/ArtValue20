import { describe, it, expect } from 'vitest';
import { critiqueConcepts, CRITIQUE_VERSION } from '../conceptCritic.js';
import { diverseConcepts, validRequest } from './fixtures.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}

// A canonical V2 strategy (the critic reads it for strategic-relevance context).
const strategy = {
  businessProblem: 'ניהול ידני מבולגן',
  campaignObjective: 'הגדלת מכירות',
  audienceInsight: 'בעלי עסקים',
  strategicDirection: 'מוקד יחיד, פשטות',
  keyMessage: 'הופכים בלגן לניהול אחד',
};
const ctx = { strategy, request: validRequest };

// Scenario concepts (valid CreativeConcept shape unless a test says otherwise).
const genericConcept = {
  id: 'concept-3', name: 'הצלחה מובטחת', strategicAngle: 'הכוח שלך', emotionalTone: 'התלהבות',
  coreIdea: 'הטוב ביותר בתחום', headlineDirection: 'גלה את הכוח', visualDirection: 'אווירה כללית',
  heroObject: 'אובייקט מרכזי בקומפוזיציה', compositionDirection: 'מרכז', colorDirection: ['#000'],
  whyItWorks: 'מקצועיות ואיכות', risks: [], originalityScore: 3, brandFitScore: 3,
};
const overloadedConcept = {
  id: 'concept-3', name: 'הכל ביחד', strategicAngle: 'שפע', emotionalTone: 'אנרגיה',
  coreIdea: 'המון דברים', headlineDirection: 'הכל', visualDirection: 'מטוס, רכבת, ספינה וטיל בשמיים',
  heroObject: 'מטוס', compositionDirection: 'פיזור', colorDirection: ['#111'],
  whyItWorks: 'עומס ויזואלי', risks: [], originalityScore: 6, brandFitScore: 6,
};
const strongUnusualConcept = {
  id: 'concept-3', name: 'דממה', strategicAngle: 'היעדר כמסר', emotionalTone: 'מסתורין',
  coreIdea: 'מה שלא נאמר', headlineDirection: 'שקט', visualDirection: 'חלל ריק עם נקודה אחת',
  heroObject: 'נקודה אחת', compositionDirection: 'מרכז ריק', colorDirection: ['#fff'],
  whyItWorks: 'הניגוד עוצר את העין', risks: [], originalityScore: 9, brandFitScore: 5,
};
const placeholderConcept = {
  id: 'concept-3', name: 'קונספט 3', strategicAngle: 'מנגנון קריאטיבי 3', emotionalTone: 'טון רגשי',
  coreIdea: 'רעיון מרכזי 3', headlineDirection: 'כיוון כותרת 3', visualDirection: 'כיוון ויזואלי 3',
  heroObject: 'אובייקט מרכזי בקומפוזיציה', compositionDirection: 'קומפוזיציה ממוקדת', colorDirection: [],
  whyItWorks: 'מנגנון פסיכולוגי שמושך תשומת לב', risks: [], originalityScore: 0, brandFitScore: 0,
};
const invalidConcept = {
  id: 'concept-3', name: '', strategicAngle: '', emotionalTone: '', coreIdea: '', headlineDirection: '',
  visualDirection: '', heroObject: '', compositionDirection: '', colorDirection: [], whyItWorks: '',
  risks: [], originalityScore: 0, brandFitScore: 0,
};
const twoClean = () => [clone(diverseConcepts[0]), clone(diverseConcepts[1])];

describe('conceptCritic — clean set', () => {
  it('keeps all three, ranks them, recommends the top survivor, preserves order + ids', async () => {
    const r = await critiqueConcepts({ concepts: clone(diverseConcepts), ...ctx });
    expect(r.ok).toBe(true);
    expect(r.degraded).toBe(false);
    expect(r.meta.deterministic).toBe(true);
    expect(r.meta.modelUsed).toBe(false);
    expect(r.meta.critiqueVersion).toBe(CRITIQUE_VERSION);
    expect(r.rejected).toHaveLength(0);
    expect(r.survivors).toHaveLength(3);
    expect(r.ranking).toHaveLength(3);
    expect(r.evaluations).toHaveLength(3);
    // evaluations are 1:1 with the input, in ORIGINAL order, with original ids
    r.evaluations.forEach((e, i) => {
      expect(e.conceptId).toBe(diverseConcepts[i].id);
      expect(e.originalIndex).toBe(i);
      expect(e.demoted).toBe(false);
    });
    // recommendation is the strongest survivor and a real concept id
    expect(r.recommendedConceptId).toBe(r.survivors[0]);
    expect(diverseConcepts.map((c) => c.id)).toContain(r.recommendedConceptId);
  });
});

describe('conceptCritic — never mutates input; deterministic', () => {
  it('runs on a deep-frozen concept array without throwing (proves no mutation)', async () => {
    const frozen = deepFreeze(clone(diverseConcepts));
    const r = await critiqueConcepts({ concepts: frozen, ...ctx });
    expect(r.ok).toBe(true); // a write to a frozen object would throw → caught → ok:false
  });
  it('same input → identical ranking + composites', async () => {
    const r1 = await critiqueConcepts({ concepts: clone(diverseConcepts), ...ctx });
    const r2 = await critiqueConcepts({ concepts: clone(diverseConcepts), ...ctx });
    expect(r2.ranking).toEqual(r1.ranking);
    expect(r2.evaluations.map((e) => e.composite)).toEqual(r1.evaluations.map((e) => e.composite));
  });
});

describe('conceptCritic — generic concept (rule d: genericity + low originality + low brand specificity)', () => {
  it('rejects the generic concept, keeps the two clean ones', async () => {
    const r = await critiqueConcepts({ concepts: [...twoClean(), clone(genericConcept)], ...ctx });
    const ev = r.evaluations.find((e) => e.conceptId === 'concept-3');
    expect(ev.risks.genericityRisk).toBeGreaterThanOrEqual(0.66);
    expect(ev.scores.originality).toBeLessThan(0.5);
    expect(ev.scores.brandSpecificity).toBeLessThan(0.34);
    expect(ev.rejected).toBe(true);
    expect(r.rejected.map((x) => x.conceptId)).toContain('concept-3');
    expect(r.survivors).toHaveLength(2);
    expect(r.recommendedConceptId).not.toBe('concept-3');
  });
});

describe('conceptCritic — near-duplicate trio (rule c + MIN_SURVIVORS floor)', () => {
  it('keeps the strongest, rescues the second via the floor, rejects only the weakest', async () => {
    const a = { ...clone(diverseConcepts[0]), id: 'concept-1', originalityScore: 9, brandFitScore: 9 };
    const b = { ...clone(diverseConcepts[0]), id: 'concept-2', originalityScore: 7, brandFitScore: 7 };
    const c = { ...clone(diverseConcepts[0]), id: 'concept-3', originalityScore: 5, brandFitScore: 5 };
    const r = await critiqueConcepts({ concepts: [a, b, c], ...ctx });
    expect(r.ok).toBe(true);
    expect(r.survivors).toHaveLength(2);              // floor honored
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].conceptId).toBe('concept-3'); // weakest dropped
    expect(r.rejected[0].reasons.join(' ')).toMatch(/כפילות/);
    expect(r.recommendedConceptId).toBe('concept-1');  // strongest kept + recommended
    const evB = r.evaluations.find((e) => e.conceptId === 'concept-2');
    expect(evB.demoted).toBe(true);                    // rescued = demoted survivor
  });
});

describe('conceptCritic — overloaded concept (rule b: >= 3 competing objects)', () => {
  it('rejects a concept whose visual is an enumeration of objects', async () => {
    const r = await critiqueConcepts({ concepts: [...twoClean(), clone(overloadedConcept)], ...ctx });
    const ev = r.evaluations.find((e) => e.conceptId === 'concept-3');
    expect(ev.overload).toBe(true);
    expect(ev.objectCount).toBeGreaterThanOrEqual(3);
    expect(ev.rejected).toBe(true);
    expect(r.rejected[0].reasons.join(' ')).toMatch(/ריבוי אובייקטים/);
    expect(r.survivors).toHaveLength(2);
  });
  it('does NOT over-count a single hero described in flowing Hebrew (comma + vav)', async () => {
    // the fixture "split desk" concept contains a comma and a vav-conjunction
    const splitDesk = { ...clone(diverseConcepts[1]), visualDirection: 'שולחן מפוצל — צד אחד כאוס פתקים, צד שני נקי ומסודר' };
    const r = await critiqueConcepts({ concepts: [clone(diverseConcepts[0]), splitDesk, clone(diverseConcepts[2])], ...ctx });
    const ev = r.evaluations.find((e) => e.conceptId === splitDesk.id);
    expect(ev.overload).toBe(false);          // descriptive prose ≠ enumeration
    expect(ev.rejected).toBe(false);
    expect(r.survivors).toHaveLength(3);
  });
});

describe('conceptCritic — strong-unusual concept is protected', () => {
  it('preserves a high-originality single-hero concept even if unconventional', async () => {
    const r = await critiqueConcepts({ concepts: [...twoClean(), clone(strongUnusualConcept)], ...ctx });
    const ev = r.evaluations.find((e) => e.conceptId === 'concept-3');
    expect(ev.protectedAsStrongUnusual).toBe(true);
    expect(ev.rejected).toBe(false);
    expect(ev.demoted).toBe(false);
    expect(r.survivors).toContain('concept-3');
  });
});

describe('conceptCritic — invalid / placeholder concepts (rule a)', () => {
  it('rejects a placeholder-only concept (adapter fallback templates)', async () => {
    const r = await critiqueConcepts({ concepts: [...twoClean(), clone(placeholderConcept)], ...ctx });
    const ev = r.evaluations.find((e) => e.conceptId === 'concept-3');
    expect(ev.rejected).toBe(true);
    expect(r.rejected[0].reasons.join(' ')).toMatch(/תבניתי|תקין/);
    expect(r.survivors).toHaveLength(2);
  });
  it('rejects a structurally invalid concept', async () => {
    const r = await critiqueConcepts({ concepts: [...twoClean(), clone(invalidConcept)], ...ctx });
    const ev = r.evaluations.find((e) => e.conceptId === 'concept-3');
    expect(ev.shapeErrors.length).toBeGreaterThan(0);
    expect(ev.rejected).toBe(true);
  });
});

describe('conceptCritic — optional model seam (OFF by default; injected only)', () => {
  it('applies seam overrides for subjective dimensions and marks modelUsed', async () => {
    const seam = async (c) => (c.id === 'concept-1' ? { originality: 0.99 } : {});
    const r = await critiqueConcepts({ concepts: clone(diverseConcepts), ...ctx }, { scoreSeam: seam });
    expect(r.meta.modelUsed).toBe(true);
    expect(r.meta.deterministic).toBe(false);
    expect(r.degraded).toBe(false);
    expect(r.evaluations.find((e) => e.conceptId === 'concept-1').scores.originality).toBeCloseTo(0.99);
  });
  it('a throwing seam is non-fatal → degraded, deterministic floor preserved', async () => {
    const seam = async () => { throw new Error('boom'); };
    const r = await critiqueConcepts({ concepts: clone(diverseConcepts), ...ctx }, { scoreSeam: seam });
    expect(r.ok).toBe(true);
    expect(r.degraded).toBe(true);
    // originality falls back to the upstream V1 score (8.6 / 10)
    expect(r.evaluations.find((e) => e.conceptId === 'concept-1').scores.originality).toBeCloseTo(0.86);
  });
});

describe('conceptCritic — degenerate input is failure-safe (never throws)', () => {
  it('empty / null / missing concepts → ok:false with a reason', async () => {
    expect((await critiqueConcepts({ concepts: [] })).ok).toBe(false);
    expect((await critiqueConcepts({ concepts: null })).ok).toBe(false);
    expect((await critiqueConcepts({})).ok).toBe(false);
    const r = await critiqueConcepts({ concepts: [] }, { fallbackRecommendedId: 'concept-2' });
    expect(r.reason).toBeDefined();
    expect(r.recommendedConceptId).toBe('concept-2'); // falls back to the V1 recommendation
  });
});
