// Production Package slice — engine / store / orchestrator / schema tests.
// No real model calls: the copy-drafting seam is injected/mocked everywhere.
import { describe, it, expect } from 'vitest';
import { createProductionBriefEngine } from '../productionBriefEngine.js';
import { createProductionStore, PRODUCTION_STORAGE_KEY } from '../productionStore.js';
import { createProductionOrchestrator } from '../productionActions.js';
import { validateProductionPackage } from '../productionSchema.js';

// ---- fixtures ----
const concept = {
  id: 'concept-1',
  name: 'מהפתק לרובוט',
  strategicAngle: 'ניגוד בין ניהול ידני לאוטומציה חכמה',
  emotionalTone: 'ביטחון שקט',
  coreIdea: 'הפתק שהפך לרובוט',
  headlineDirection: 'מהפתק לרובוט',
  visualDirection: 'ערימת פתקים צהובים שמתמזגת ליד רובוטית מבריקה',
  heroObject: 'פתק דביק',
  compositionDirection: 'אובייקט יחיד במרכז · ניגודיות גבוהה',
  colorDirection: ['#d4ff3f', '#0e0e0e'],
  whyItWorks: 'הופך כאב מוכר לפתרון בלתי נשכח',
  risks: [],
  originalityScore: 8.2,
  brandFitScore: 7.5,
};

const genericConcept = {
  ...concept,
  id: 'concept-2',
  heroObject: 'אובייקט מרכזי בקומפוזיציה', // the adapter's generic fallback
  headlineDirection: 'הפתרון האיכותי הטוב ביותר',
  coreIdea: 'שירות מקצועי מוביל',
  visualDirection: 'רקע',
  originalityScore: 4,
};

// Pinned reproduction of the real saved concept that wrongly scored low: generic
// success/power language, a mixed-language slogan ("One Stop Shop"), and an
// overloaded multi-object metaphor (mirror + moon + business card + draft book).
const realStyleConcept = {
  id: 'concept-real',
  name: 'One Stop Shop',
  strategicAngle: 'One Stop Shop — המראה היא סמל לנוכחות דיגיטלית אחת שמאחדת את כל הפונקציות (אתר, CRM, מיתוג).',
  emotionalTone: 'ביטחון ושליטה',
  coreIdea: 'ספר הטיוטות עם הצעות המיתוג משקף את עצמו אל ירח ענק שמרחף ברקע ואליו מודפס כרטיס ביקור של הלקוח.',
  headlineDirection: 'נוכחות שמבטיחה הצלחה',
  visualDirection: 'כרטיס הביקור המודפס על הירח (במציאות השתקפות) מזכיר את ההבטחה העסקית: כפי שאנו מצליחים להפוך כל דבר לפרסומת עצמית, כך גם הירח הוא חלק מההשתקפויות היומיומיות, וכך אנחנו הופכים את נוכחות הלקוח לדבר המגיע למרחקים.',
  heroObject: 'Mirror',
  whyItWorks: 'ביטחון — ה-Mirror משמש כעוגן.',
  originalityScore: 7,
};

// A specific, single-metaphor, single-hero concept that must STAY low.
const specificConcept = {
  id: 'concept-specific',
  name: 'מהפתק לרובוט',
  strategicAngle: 'ניגוד בין ניהול ידני לאוטומציה',
  emotionalTone: 'ביטחון שקט',
  coreIdea: 'הפתק שהפך לרובוט',
  headlineDirection: 'מהפתק לרובוט',
  visualDirection: 'פתק דביק צהוב יחיד שמתקפל לזרוע רובוטית',
  heroObject: 'פתק דביק',
  whyItWorks: 'הופך כאב מוכר לדימוי בלתי נשכח',
  originalityScore: 8,
};

const HEBREW_RE = /[֐-׿]/;

const fakeDraft = async () => 'כותרת: מהפתק לרובוט\nתת-כותרת: הניהול שלך, אוטומטי\nקריאה לפעולה: דברו איתנו\nגוף: תנו לעסק לרוץ לבד.';
const emptyDraft = async () => '';

function memStorage() {
  let v = null;
  return { getItem: () => v, setItem: (_k, val) => { v = String(val); } };
}
function campaign(over = {}) {
  return {
    id: 'cmp_1', tenantId: 'artvalue', status: 'concept_selected',
    selectedConceptId: 'concept-1', concepts: [concept], format: '4:5', ...over,
  };
}
const buildOrchestrator = (over = {}) => createProductionOrchestrator({
  engine: createProductionBriefEngine({ draftCopy: fakeDraft }),
  store: createProductionStore({ storage: memStorage() }),
  getCampaign: (id) => (id === 'cmp_1' ? campaign(over.rec) : null),
  ...over.deps,
});

// ===================================================================
describe('productionSchema — validation', () => {
  it('accepts a well-formed package and rejects a malformed one', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const pkg = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue', format: '4:5' });
    expect(validateProductionPackage(pkg).ok).toBe(true);

    const bad = { ...pkg, copyPackage: undefined };
    const res = validateProductionPackage(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/copyPackage/);
  });

  it('rejects an image prompt that does not forbid text', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const pkg = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    pkg.imagePrompt.negativeEn = 'blurry, low quality';
    expect(validateProductionPackage(pkg).ok).toBe(false);
  });

  it('rejects a package whose promptEn contains Hebrew (English-only contract)', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const pkg = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    pkg.imagePrompt.promptEn = `${pkg.imagePrompt.promptEn} מראה דיגיטלית`; // inject Hebrew
    const res = validateProductionPackage(pkg);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/English only/);
  });
});

describe('productionBriefEngine — creativeCore preservation', () => {
  it('preserves mechanism / visual metaphor / hero object verbatim from the concept', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const { creativeCore: cc } = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(cc.creativeMechanism).toBe(concept.strategicAngle);
    expect(cc.visualMetaphor).toBe(concept.visualDirection);
    expect(cc.heroObject).toBe(concept.heroObject);
  });
});

describe('productionBriefEngine — deterministic derived fields', () => {
  it('derives wordplay / surprise / memory hook deterministically and stably', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const a = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    const b = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(a.creativeCore).toEqual(b.creativeCore); // same input → same output
    expect(a.creativeCore.wordplayDirection).toBe(concept.headlineDirection);
    expect(a.creativeCore.surpriseMechanism).toBe(concept.coreIdea);
    expect(a.creativeCore.memoryHook).toBe(concept.whyItWorks);
  });
});

describe('productionBriefEngine — deterministic genericityRisk', () => {
  it('flags a generic concept high and a strong concept low, stably', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const strong = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    const weak = await engine.build(genericConcept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    const weak2 = await engine.build(genericConcept, { campaignId: 'cmp_1', tenantId: 'artvalue' });

    expect(strong.creativeCore.genericityRisk.level).toBe('low');
    expect(weak.creativeCore.genericityRisk.level).toBe('high');
    expect(weak.creativeCore.genericityRisk.reasons.length).toBeGreaterThan(0);
    expect(weak.creativeCore.genericityRisk).toEqual(weak2.creativeCore.genericityRisk); // deterministic
  });
});

describe('productionBriefEngine — copy fallback never empty', () => {
  it('falls back to concept-derived copy when the draft seam returns nothing', async () => {
    const engine = createProductionBriefEngine({ draftCopy: emptyDraft });
    const { copyPackage } = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(copyPackage.headline).toBe(concept.headlineDirection);
    expect(copyPackage.headline.length).toBeGreaterThan(0);
    expect(copyPackage.bodyVariants.length).toBeGreaterThan(0);
    expect(copyPackage.cta.length).toBeGreaterThan(0);
  });

  it('a THROWN draft seam is fatal — rejects + emits copy:error, no silent fallback', async () => {
    // A real provider/model error must NOT be shown as a completed stage. (An
    // empty/invalid NON-throwing response still uses the deterministic fallback —
    // covered by the test above.)
    const events = [];
    const engine = createProductionBriefEngine({ draftCopy: async () => { throw new Error('brain down'); } });
    await expect(engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue', onProgress: (e) => events.push(e) }))
      .rejects.toThrow('brain down');
    expect(events).toContainEqual(expect.objectContaining({ stage: 'copy', status: 'error' }));
    expect(events.some((e) => ['translate', 'visual'].includes(e.stage))).toBe(false); // stopped at copy
  });
});

describe('productionBriefEngine — visual brief & image prompt', () => {
  it('visual brief reuses the SAME hero object as creativeCore', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const pkg = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(pkg.visualBrief.heroObject).toBe(pkg.creativeCore.heroObject);
    expect(pkg.visualBrief.heroObject).toBe(concept.heroObject);
  });

  it('image prompt carries a no-text constraint', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const { imagePrompt } = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue', format: '9:16' });
    expect(imagePrompt.negativeEn).toMatch(/text/i);
    expect(imagePrompt.promptEn).toMatch(/no text/i);
    expect(imagePrompt.aspect).toBe('9:16');
  });

  it('promptEn is ENGLISH ONLY even from a fully-Hebrew concept with NO translator', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft }); // no translateToEn
    const { imagePrompt } = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(HEBREW_RE.test(imagePrompt.promptEn)).toBe(false); // no Hebrew leaked in
    expect(imagePrompt.promptEn).toMatch(/no text/i);          // still a usable prompt
    expect(imagePrompt.promptEn.length).toBeGreaterThan(20);
  });

  it('promptEn stays English-only even when the translator returns Hebrew (failed translation)', async () => {
    const badTranslator = async () => 'תרגום שנכשל בעברית'; // translator misbehaves
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft, translateToEn: badTranslator });
    const { imagePrompt } = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(HEBREW_RE.test(imagePrompt.promptEn)).toBe(false);
  });

  it('promptEn incorporates the English translation when the translator succeeds', async () => {
    const enTranslator = async () => 'a single sticky note folding into a robotic arm';
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft, translateToEn: enTranslator });
    const { imagePrompt } = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(HEBREW_RE.test(imagePrompt.promptEn)).toBe(false);
    expect(imagePrompt.promptEn).toMatch(/sticky note folding into a robotic arm/);
  });
});

describe('productionBriefEngine — strengthened genericity guard', () => {
  it('flags a generic, mixed-language, overloaded concept at least MEDIUM (real-style)', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const a = await engine.build(realStyleConcept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    const b = await engine.build(realStyleConcept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    const gr = a.creativeCore.genericityRisk;
    expect(['medium', 'high']).toContain(gr.level); // was wrongly 'low' before the fix
    expect(gr.score).toBeGreaterThanOrEqual(2);
    expect(gr.reasons.length).toBeGreaterThan(0);
    expect(gr).toEqual(b.creativeCore.genericityRisk); // deterministic
  });

  it('keeps a specific, single-metaphor, single-hero concept LOW', async () => {
    const engine = createProductionBriefEngine({ draftCopy: fakeDraft });
    const { creativeCore } = await engine.build(specificConcept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(creativeCore.genericityRisk.level).toBe('low');
  });
});

describe('productionBriefEngine — deterministic copy-lint guard (≤1 retry)', () => {
  // A draftCopy mock that returns a scripted sequence and counts calls + prompts.
  const seqDraft = (responses) => {
    const calls = { count: 0, prompts: [] };
    const fn = async (prompt) => { calls.prompts.push(prompt); const r = responses[calls.count] ?? responses[responses.length - 1]; calls.count += 1; return r; };
    return { fn, calls };
  };
  const CLEAN = 'כותרת: מהפתק לרובוט\nתת-כותרת: הניהול שלך, אוטומטי\nקריאה לפעולה: דברו איתנו\nגוף: תנו לעסק לרוץ לבד.';
  const GENERIC = 'כותרת: נוכחות שמבטיחה הצלחה\nתת-כותרת: One Stop Shop שלך\nקריאה לפעולה: גלה את הכוח\nגוף: פתרון מוביל להצלחה מובטחת.';

  it('clean copy passes WITHOUT a retry (exactly one model call)', async () => {
    const { fn, calls } = seqDraft([CLEAN]);
    const engine = createProductionBriefEngine({ draftCopy: fn });
    const { copyPackage } = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(calls.count).toBe(1);              // no retry
    expect(copyPackage.copyWarning).toBe(null);
  });

  it('generic copy triggers EXACTLY ONE retry, and the retry prompt names the phrases', async () => {
    const { fn, calls } = seqDraft([GENERIC, CLEAN]);
    const engine = createProductionBriefEngine({ draftCopy: fn });
    await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(calls.count).toBe(2);              // exactly one retry
    expect(calls.prompts[1]).toMatch(/הצלחה/); // rewrite prompt passes detected phrases
  });

  it('a successful retry removes the warning and adopts the clean copy', async () => {
    const { fn } = seqDraft([GENERIC, CLEAN]);
    const engine = createProductionBriefEngine({ draftCopy: fn });
    const { copyPackage } = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(copyPackage.copyWarning).toBe(null);
    expect(copyPackage.headline).toBe('מהפתק לרובוט'); // the clean retry result
  });

  it('a failed retry preserves the copy but adds a copyWarning (no second retry)', async () => {
    const { fn, calls } = seqDraft([GENERIC, GENERIC]);
    const engine = createProductionBriefEngine({ draftCopy: fn });
    const { copyPackage } = await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(calls.count).toBe(2);              // no more than one retry
    expect(copyPackage.copyWarning).toBeTruthy();
    expect(copyPackage.headline.length).toBeGreaterThan(0); // copy preserved, not blanked
  });

  it('a failed retry raises genericityRisk by the pinned amount', async () => {
    const clean = createProductionBriefEngine({ draftCopy: seqDraft([CLEAN]).fn });
    const base = (await clean.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' })).creativeCore.genericityRisk.score;
    const dirty = createProductionBriefEngine({ draftCopy: seqDraft([GENERIC, GENERIC]).fn });
    const bumped = (await dirty.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' })).creativeCore.genericityRisk;
    expect(bumped.score).toBe(base + 2);      // pinned +2
    expect(bumped.reasons.join(' ')).toMatch(/שכתוב/);
  });

  it('never retries more than once even when every attempt is generic', async () => {
    const { fn, calls } = seqDraft([GENERIC, GENERIC, GENERIC]);
    const engine = createProductionBriefEngine({ draftCopy: fn });
    await engine.build(concept, { campaignId: 'cmp_1', tenantId: 'artvalue' });
    expect(calls.count).toBe(2);              // 1 initial + 1 retry, never 3
  });
});

describe('productionActions — generate / save lifecycle', () => {
  it('generation produces a DRAFT and causes ZERO persistence', async () => {
    const store = createProductionStore({ storage: memStorage() });
    const orch = createProductionOrchestrator({
      engine: createProductionBriefEngine({ draftCopy: fakeDraft }),
      store,
      getCampaign: (id) => (id === 'cmp_1' ? campaign() : null),
    });
    const pkg = await orch.generateProductionPackage({ campaignId: 'cmp_1' });
    expect(pkg.status).toBe('draft');
    expect(store.list().length).toBe(0); // nothing persisted on generate
  });

  it('cancel (no save call) causes zero mutation', async () => {
    const store = createProductionStore({ storage: memStorage() });
    const orch = createProductionOrchestrator({
      engine: createProductionBriefEngine({ draftCopy: fakeDraft }),
      store,
      getCampaign: () => campaign(),
    });
    await orch.generateProductionPackage({ campaignId: 'cmp_1' }); // user reviews then cancels (no save)
    expect(store.list().length).toBe(0);
  });

  it('confirmation persists exactly once with a saved status + identity', async () => {
    const store = createProductionStore({ storage: memStorage() });
    const orch = createProductionOrchestrator({
      engine: createProductionBriefEngine({ draftCopy: fakeDraft }),
      store,
      getCampaign: () => campaign(),
    });
    const pkg = await orch.generateProductionPackage({ campaignId: 'cmp_1' });
    const saved = orch.saveProductionPackage({ campaignId: 'cmp_1', pkg });
    expect(saved.status).toBe('saved');
    expect(saved.id).toBeTruthy();
    expect(store.list().length).toBe(1);
  });

  it('refuses to generate when no concept is selected', async () => {
    const orch = createProductionOrchestrator({
      engine: createProductionBriefEngine({ draftCopy: fakeDraft }),
      store: createProductionStore({ storage: memStorage() }),
      getCampaign: () => campaign({ status: 'concepts_ready', selectedConceptId: undefined }),
    });
    await expect(orch.generateProductionPackage({ campaignId: 'cmp_1' })).rejects.toMatchObject({ code: 'NO_SELECTED_CONCEPT' });
  });

  it('rejects saving an invalid package', () => {
    const orch = buildOrchestrator();
    expect(() => orch.saveProductionPackage({ campaignId: 'cmp_1', pkg: { campaignId: 'cmp_1' } })).toThrow();
  });
});

describe('productionStore — resilience & isolation', () => {
  it('tolerates corrupt localStorage (reads empty, still writes)', () => {
    const corrupt = (() => { let v = '{ not json'; return { getItem: () => v, setItem: (_k, val) => { v = String(val); } }; })();
    const store = createProductionStore({ storage: corrupt });
    expect(store.list()).toEqual([]); // corrupt → empty, no throw
    const rec = store.save({ campaignId: 'c1', conceptId: 'x', tenantId: 'artvalue' });
    expect(rec.id).toBeTruthy();
    expect(store.list().length).toBe(1);
  });

  it('isolates packages by tenant', () => {
    const store = createProductionStore({ storage: memStorage() });
    store.save({ campaignId: 'c1', conceptId: 'x', tenantId: 'artvalue' });
    store.save({ campaignId: 'c2', conceptId: 'y', tenantId: 'other' });
    expect(store.list('artvalue').length).toBe(1);
    expect(store.list('other').length).toBe(1);
    expect(store.list().length).toBe(2);
  });

  it('uses the versioned key', () => {
    expect(PRODUCTION_STORAGE_KEY).toBe('artvalue_production_packages_v1');
  });
});
