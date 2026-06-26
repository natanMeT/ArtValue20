// Production Progress Visibility slice — progress-seam tests.
// Strictly additive: the existing production.test.js is untouched. No real model
// calls — the copy/translate seams are injected mocks everywhere.
import { describe, it, expect, vi } from 'vitest';
import { createProductionBriefEngine } from '../productionBriefEngine.js';
import { createProductionStore, PRODUCTION_STORAGE_KEY } from '../productionStore.js';
import { createProductionOrchestrator } from '../productionActions.js';
import { PRODUCTION_STAGES } from '../productionProgress.js';

// ---- fixtures ----
// A specific, single-metaphor concept with a HEBREW hero/visual → the translate
// stage does real work. Clean copy below means NO rewrite.
const concept = {
  id: 'concept-1',
  name: 'מהפתק לרובוט',
  strategicAngle: 'ניגוד בין ניהול ידני לאוטומציה',
  emotionalTone: 'ביטחון שקט',
  coreIdea: 'הפתק שהפך לרובוט',
  headlineDirection: 'מהפתק לרובוט',
  visualDirection: 'פתק דביק צהוב יחיד שמתקפל לזרוע רובוטית',
  heroObject: 'פתק דביק',
  compositionDirection: 'אובייקט יחיד במרכז · ניגודיות גבוהה',
  colorDirection: ['#d4ff3f', '#0e0e0e'],
  whyItWorks: 'הופך כאב מוכר לדימוי בלתי נשכח',
  originalityScore: 8,
};

// Clean drafted copy → contains NO generic phrases → no retry.
const cleanDraft = async () => 'כותרת: מהפתק לרובוט\nתת-כותרת: הניהול שלך, אוטומטי\nקריאה לפעולה: דברו איתנו\nגוף: תנו לעסק לרוץ לבד.';
// Generic drafted copy → contains banned phrases (פתרון/מוביל/הצלחה) → triggers a retry.
const genericDraft = 'כותרת: הפתרון המוביל\nתת-כותרת: הצלחה מובטחת\nקריאה לפעולה: דברו איתנו\nגוף: שירות לעסק.';
const fakeTranslate = async () => 'a single sticky note folding into a robotic arm';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _map: m };
}
function campaign(over = {}) {
  return {
    id: 'cmp_1', tenantId: 'artvalue', status: 'concept_selected',
    selectedConceptId: 'concept-1', concepts: [concept], format: '4:5', ...over,
  };
}

// Build a real-engine orchestrator. `draftCopy`/`translateToEn` are injected.
function buildOrchestrator(over = {}) {
  const storage = over.storage || memStorage();
  const orch = createProductionOrchestrator({
    engine: over.engine || createProductionBriefEngine({
      draftCopy: over.draftCopy || cleanDraft,
      translateToEn: over.translateToEn || fakeTranslate,
    }),
    store: over.store || createProductionStore({ storage }),
    getCampaign: over.getCampaign || ((id) => (id === 'cmp_1' ? campaign(over.rec) : null)),
  });
  return { orch, storage };
}

// ---- progress-event helpers ----
const recorder = () => { const events = []; return { events, onProgress: (e) => events.push(e) }; };
// Stage ids in order of FIRST appearance (robust to active/done pairing).
const stageOrder = (events) => {
  const seen = [];
  for (const e of events) if (!seen.includes(e.stage)) seen.push(e.stage);
  return seen;
};
const withStatus = (events, status) => events.filter((e) => e.status === status).map((e) => e.stage);

// ===================================================================
describe('production progress — ordered stages (clean copy, no retry)', () => {
  it('emits the real stages in canonical order with no rewrite', async () => {
    const { orch } = buildOrchestrator();
    const { events, onProgress } = recorder();

    const pkg = await orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress });

    expect(pkg.status).toBe('draft');
    expect(stageOrder(events)).toEqual([
      'context', 'analyze', 'copy', 'lint', 'translate', 'visual', 'validate', 'ready',
    ]);
    // every event carries the real contract shape + polished Hebrew label
    for (const e of events) {
      expect(['active', 'done', 'error']).toContain(e.status);
      expect(e.message).toBe(PRODUCTION_STAGES[e.stage]);
      expect(typeof e.timestamp).toBe('number');
    }
    // each work stage opened (active) and closed (done)
    for (const s of ['context', 'analyze', 'copy', 'lint', 'translate', 'visual', 'validate']) {
      expect(withStatus(events, 'active')).toContain(s);
      expect(withStatus(events, 'done')).toContain(s);
    }
    expect(events.some((e) => e.stage === 'rewrite')).toBe(false);
  });
});

describe('production progress — callback is truly optional & failure-safe', () => {
  it('returns the SAME package whether or not onProgress is provided', async () => {
    const a = (await buildOrchestrator().orch.generateProductionPackage({ campaignId: 'cmp_1' }));
    const { orch } = buildOrchestrator();
    const { onProgress } = recorder();
    const b = await orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress });
    expect(a).toEqual(b); // progress wiring does not change the produced package
  });

  it('a throwing onProgress callback never breaks generation', async () => {
    const { orch } = buildOrchestrator();
    const pkg = await orch.generateProductionPackage({
      campaignId: 'cmp_1',
      onProgress: () => { throw new Error('sink exploded'); },
    });
    expect(pkg.status).toBe('draft');
  });
});

describe('production progress — rewrite stage reflects a REAL retry only', () => {
  it('emits rewrite (after lint, before translate) exactly when a retry runs', async () => {
    // generic first draft → retry; clean second draft → adopted (no warning)
    const draftCopy = vi.fn()
      .mockResolvedValueOnce(genericDraft)
      .mockResolvedValueOnce(await cleanDraft());
    const { orch } = buildOrchestrator({ draftCopy });
    const { events, onProgress } = recorder();

    const pkg = await orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress });

    expect(draftCopy).toHaveBeenCalledTimes(2); // initial + one retry
    const order = stageOrder(events);
    expect(order).toContain('rewrite');
    expect(order.indexOf('rewrite')).toBeGreaterThan(order.indexOf('lint'));
    expect(order.indexOf('rewrite')).toBeLessThan(order.indexOf('translate'));
    expect(withStatus(events, 'active')).toContain('rewrite');
    expect(withStatus(events, 'done')).toContain('rewrite');
    expect(pkg.copyPackage.copyWarning).toBeNull(); // clean retry adopted
  });

  it('emits NO rewrite stage for clean copy (single model call)', async () => {
    const draftCopy = vi.fn().mockResolvedValue(await cleanDraft());
    const { orch } = buildOrchestrator({ draftCopy });
    const { events, onProgress } = recorder();

    await orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress });

    expect(draftCopy).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.stage === 'rewrite')).toBe(false);
  });
});

describe('production progress — terminal success state', () => {
  it('validation success emits the final ready:done as the last event', async () => {
    const { orch } = buildOrchestrator();
    const { events, onProgress } = recorder();
    await orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress });

    expect(withStatus(events, 'done')).toContain('validate');
    const last = events[events.length - 1];
    expect(last).toMatchObject({ stage: 'ready', status: 'done' });
  });
});

describe('production progress — failures preserve the REAL failing stage', () => {
  it('context failure emits context:error and rejects, never reaching ready', async () => {
    const { orch } = buildOrchestrator({ getCampaign: () => null });
    const { events, onProgress } = recorder();

    await expect(orch.generateProductionPackage({ campaignId: 'nope', onProgress })).rejects.toThrow();
    expect(events).toContainEqual(expect.objectContaining({ stage: 'context', status: 'error' }));
    expect(events.some((e) => e.stage === 'ready')).toBe(false);
    expect(events.some((e) => e.stage === 'validate')).toBe(false);
  });

  it('an invalid generated package emits validate:error and rejects (no review)', async () => {
    // fake engine returns a structurally invalid package (missing copyPackage)
    const engine = { build: async () => ({ campaignId: 'cmp_1', conceptId: 'concept-1', tenantId: 'artvalue', status: 'draft' }) };
    const { orch } = buildOrchestrator({ engine });
    const { events, onProgress } = recorder();

    await expect(orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress }))
      .rejects.toMatchObject({ code: 'INVALID_PACKAGE' });
    expect(withStatus(events, 'done')).toContain('context'); // context succeeded
    expect(events).toContainEqual(expect.objectContaining({ stage: 'validate', status: 'error' }));
    expect(events.some((e) => e.stage === 'ready')).toBe(false);
  });

  it('an engine-stage failure is labelled with its OWN stage (analyze), not validate', async () => {
    // A concept whose first analyzed field throws → deriveCreativeCore fails in `analyze`.
    const boom = { id: 'concept-boom' };
    Object.defineProperty(boom, 'strategicAngle', { enumerable: true, get() { throw new Error('boom'); } });
    const engine = createProductionBriefEngine({ draftCopy: cleanDraft, translateToEn: fakeTranslate });
    const { events, onProgress } = recorder();

    await expect(engine.build(boom, { campaignId: 'cmp_1', tenantId: 'artvalue', onProgress })).rejects.toThrow();
    expect(events).toContainEqual(expect.objectContaining({ stage: 'analyze', status: 'error' }));
    expect(events.some((e) => e.stage === 'validate')).toBe(false); // not mislabelled
    expect(events.some((e) => e.stage === 'ready')).toBe(false);
  });
});

describe('production progress — no progress is persisted', () => {
  it('a full generate with progress writes NOTHING to the store', async () => {
    const storage = memStorage();
    const store = createProductionStore({ storage });
    const saveSpy = vi.spyOn(store, 'save');
    const { orch } = buildOrchestrator({ store, storage });
    const { onProgress } = recorder();

    await orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(0);
    expect(storage.getItem(PRODUCTION_STORAGE_KEY)).toBeNull(); // nothing written at all
  });
});

describe('production progress — existing lifecycle unchanged', () => {
  it('without onProgress, generate still returns a DRAFT and persists nothing', async () => {
    const storage = memStorage();
    const store = createProductionStore({ storage });
    const { orch } = buildOrchestrator({ store, storage });

    const pkg = await orch.generateProductionPackage({ campaignId: 'cmp_1' });

    expect(pkg.status).toBe('draft');
    expect(pkg.creativeCore.heroObject).toBe(concept.heroObject); // preserved
    expect(store.list()).toHaveLength(0);
  });
});

describe('production progress — model/seam THROWS are fatal & labelled (not shown as success)', () => {
  const later = ['lint', 'translate', 'visual', 'validate', 'ready'];

  it('thrown INITIAL draftCopy → copy:error, rejects, no later stages, no persistence', async () => {
    const storage = memStorage();
    const store = createProductionStore({ storage });
    const saveSpy = vi.spyOn(store, 'save');
    const { orch } = buildOrchestrator({ store, storage, draftCopy: async () => { throw new Error('provider 500'); } });
    const { events, onProgress } = recorder();

    await expect(orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress })).rejects.toThrow('provider 500');
    expect(events).toContainEqual(expect.objectContaining({ stage: 'copy', status: 'error' }));
    expect(events.some((e) => later.includes(e.stage))).toBe(false); // stopped at copy
    expect(saveSpy).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(0);
  });

  it('thrown RETRY draftCopy → rewrite:error, rejects, original copy NOT kept, no later stages, no persistence', async () => {
    let n = 0;
    const draftCopy = async () => { n += 1; if (n === 1) return genericDraft; throw new Error('provider 500 on retry'); };
    const storage = memStorage();
    const store = createProductionStore({ storage });
    const saveSpy = vi.spyOn(store, 'save');
    const { orch } = buildOrchestrator({ store, storage, draftCopy });
    const { events, onProgress } = recorder();

    await expect(orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress })).rejects.toThrow('on retry');
    expect(withStatus(events, 'done')).toEqual(expect.arrayContaining(['copy', 'lint'])); // got through copy + lint
    expect(events).toContainEqual(expect.objectContaining({ stage: 'rewrite', status: 'error' }));
    expect(events.some((e) => ['translate', 'visual', 'validate', 'ready'].includes(e.stage))).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(0);
  });

  it('thrown VISUAL assembly → visual:error, rejects, no ready, no persistence', async () => {
    // A concept whose colorDirection is read ONLY in the visual stage and throws there.
    const boomVisual = { ...concept, id: 'concept-boomvis' };
    Object.defineProperty(boomVisual, 'colorDirection', { enumerable: true, get() { throw new Error('boom-visual'); } });
    const storage = memStorage();
    const store = createProductionStore({ storage });
    const saveSpy = vi.spyOn(store, 'save');
    const { orch } = buildOrchestrator({
      store, storage,
      getCampaign: (id) => (id === 'cmp_1' ? { ...campaign(), selectedConceptId: 'concept-boomvis', concepts: [boomVisual] } : null),
    });
    const { events, onProgress } = recorder();

    await expect(orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress })).rejects.toThrow('boom-visual');
    expect(withStatus(events, 'done')).toEqual(expect.arrayContaining(['copy', 'lint', 'translate'])); // reached visual
    expect(events).toContainEqual(expect.objectContaining({ stage: 'visual', status: 'error' }));
    expect(events.some((e) => ['validate', 'ready'].includes(e.stage))).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(0);
  });
});

describe('production progress — translation throw is NON-fatal but reported honestly', () => {
  it('a thrown translate seam → translate:fallback (never an unqualified done), generation still completes', async () => {
    const { orch } = buildOrchestrator({ translateToEn: async () => { throw new Error('translate provider down'); } });
    const { events, onProgress } = recorder();

    const pkg = await orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress });

    expect(pkg.status).toBe('draft'); // non-fatal: deterministic English skeleton
    expect(pkg.imagePrompt.promptEn.length).toBeGreaterThan(0);
    expect(events).toContainEqual(expect.objectContaining({ stage: 'translate', status: 'fallback' }));
    expect(events.some((e) => e.stage === 'translate' && e.status === 'done')).toBe(false); // not shown as clean success
    expect(events[events.length - 1]).toMatchObject({ stage: 'ready', status: 'done' }); // still reaches ready
  });

  it('a clean translate seam still emits translate:done (no false fallback)', async () => {
    const { orch } = buildOrchestrator(); // default fakeTranslate returns English
    const { events, onProgress } = recorder();
    await orch.generateProductionPackage({ campaignId: 'cmp_1', onProgress });
    expect(events).toContainEqual(expect.objectContaining({ stage: 'translate', status: 'done' }));
    expect(events.some((e) => e.stage === 'translate' && e.status === 'fallback')).toBe(false);
  });
});
