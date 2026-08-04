// Chat-persistence filter — transient progress cards must never be persisted or
// restored, while all other chat history is untouched. Pure, deterministic.
import { describe, it, expect } from 'vitest';
import { persistableChatMessages, isTransientChatMessage, sanitizeChatMessage } from '../chatPersistence.js';

const normal = { role: 'assistant', text: 'שלום, אני ג׳יק' };
const userMsg = { role: 'user', text: 'תכין קמפיין' };
const system = { role: 'assistant', system: true, text: '✓ נשמרה חבילת הפקה' };
const campaign = { role: 'assistant', campaign: { campaignId: 'c1', strategy: {}, concepts: [] } };
const offer = { role: 'assistant', productionOffer: { campaignId: 'c1', conceptName: 'x' } };
const review = { role: 'assistant', productionReview: { campaignId: 'c1', conceptName: 'x', package: {} } };
const progress = {
  role: 'assistant',
  productionProgress: { campaignId: 'c1', conceptName: 'x', statuses: { copy: 'active' }, startedAt: 0, nowTs: 1000, error: null, done: false },
};
const handoff = {
  role: 'assistant',
  handoff: { id: 'jake-studio_marketing_asset', source: 'jake', target: 'studio', planType: 'studio_marketing_asset', workflow: 'fast-image', prompt: 'a long business prompt with ArtValue positioning…', requiresConfirmation: true },
};

describe('chatPersistence — transient progress cards excluded from history', () => {
  it('excludes a productionProgress message from persisted history', () => {
    const out = persistableChatMessages([normal, progress, system]);
    expect(out).toEqual([normal, system]);
    expect(out.some((m) => m.productionProgress)).toBe(false);
  });

  it('keeps normal assistant, user, and system messages', () => {
    expect(persistableChatMessages([userMsg, normal, system])).toEqual([userMsg, normal, system]);
  });

  it('keeps productionReview (review/saved cards persist as before)', () => {
    expect(persistableChatMessages([review])).toEqual([review]);
  });

  it('keeps campaign and offer cards (existing behavior unchanged)', () => {
    expect(persistableChatMessages([campaign, offer])).toEqual([campaign, offer]);
  });

  it('hydration of a (legacy) stored progress card restores NO active card', () => {
    // simulates reading storage that a buggy build left a progress card in
    expect(persistableChatMessages([progress])).toEqual([]);
    expect(persistableChatMessages([normal, progress])).toEqual([normal]);
  });

  it('excludes a Studio handoff card from persisted history (privacy: prompt payload)', () => {
    const out = persistableChatMessages([normal, handoff, system]);
    expect(out).toEqual([normal, system]);
    expect(out.some((m) => m.handoff)).toBe(false);
    expect(isTransientChatMessage(handoff)).toBe(true);
  });

  it('hydration of a (legacy) stored handoff card restores NOTHING', () => {
    expect(persistableChatMessages([handoff])).toEqual([]);
    expect(persistableChatMessages([userMsg, handoff, normal])).toEqual([userMsg, normal]);
  });

  it('isTransientChatMessage flags only progress messages', () => {
    expect(isTransientChatMessage(progress)).toBe(true);
    expect(isTransientChatMessage(normal)).toBe(false);
    expect(isTransientChatMessage(review)).toBe(false);
    expect(isTransientChatMessage(null)).toBe(false);
    expect(isTransientChatMessage(undefined)).toBe(false);
  });

  it('does not mutate input and preserves order of the remaining messages', () => {
    const input = [normal, progress, review, system];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = persistableChatMessages(input);
    expect(input).toEqual(snapshot); // input untouched
    expect(out).toEqual([normal, review, system]); // order preserved, only progress removed
  });

  it('tolerates non-array input', () => {
    expect(persistableChatMessages(undefined)).toEqual([]);
    expect(persistableChatMessages(null)).toEqual([]);
  });
});

describe('chatPersistence — ephemeral Concept Critic view excluded from history', () => {
  // a realistic campaign message carrying a live critique view
  const v1Concepts = [
    { id: 'concept-1', name: 'א', originalityScore: 9 },
    { id: 'concept-2', name: 'ב', originalityScore: 7 },
    { id: 'concept-3', name: 'ג', originalityScore: 5 },
  ];
  const makeCampaignWithCritique = () => ({
    role: 'assistant',
    campaign: {
      campaignId: 'c1',
      strategy: { keyMessage: 'מסר', strategicDirection: 'כיוון' },
      concepts: v1Concepts.map((c) => ({ ...c })),
      recommendedConceptId: 'concept-1', // V1 recommendation
      critique: { ok: true, ranking: ['concept-3', 'concept-1', 'concept-2'], recommendedConceptId: 'concept-3', survivors: ['concept-3', 'concept-1'], rejected: [{ conceptId: 'concept-2', reasons: ['x'] }], evaluations: [], meta: {} },
    },
  });

  it('1) a campaign message with critique persists WITHOUT the critique field', () => {
    const [out] = persistableChatMessages([makeCampaignWithCritique()]);
    expect(out.campaign).toBeDefined();
    expect('critique' in out.campaign).toBe(false);
  });

  it('2) the original campaign data remains intact (id, strategy)', () => {
    const [out] = persistableChatMessages([makeCampaignWithCritique()]);
    expect(out.campaign.campaignId).toBe('c1');
    expect(out.campaign.strategy).toEqual({ keyMessage: 'מסר', strategicDirection: 'כיוון' });
  });

  it('3) V1 concepts, ORDER, and recommendation are unchanged', () => {
    const [out] = persistableChatMessages([makeCampaignWithCritique()]);
    expect(out.campaign.concepts.map((c) => c.id)).toEqual(['concept-1', 'concept-2', 'concept-3']);
    expect(out.campaign.concepts).toEqual(v1Concepts); // full V1 payload preserved
    expect(out.campaign.recommendedConceptId).toBe('concept-1'); // V1 rec, NOT critique's
  });

  it('4) hydration of LEGACY stored chat with critique strips the stale critique', () => {
    // simulates reading storage that an earlier session left a critique in
    const legacy = [makeCampaignWithCritique()];
    const hydrated = persistableChatMessages(legacy);
    expect('critique' in hydrated[0].campaign).toBe(false);
    // and the card still has its V1 order + recommendation to fall back to
    expect(hydrated[0].campaign.concepts.map((c) => c.id)).toEqual(['concept-1', 'concept-2', 'concept-3']);
    expect(hydrated[0].campaign.recommendedConceptId).toBe('concept-1');
  });

  it('5) normal / campaign-without-critique / review / system messages persist as before', () => {
    const normal = { role: 'assistant', text: 'שלום' };
    const plainCampaign = { role: 'assistant', campaign: { campaignId: 'c2', strategy: {}, concepts: [], recommendedConceptId: 'concept-1' } };
    const review = { role: 'assistant', productionReview: { campaignId: 'c2', conceptName: 'x', package: {} } };
    const system = { role: 'assistant', system: true, text: '✓ נשמר' };
    const out = persistableChatMessages([normal, plainCampaign, review, system]);
    expect(out).toEqual([normal, plainCampaign, review, system]);
  });

  it('6) does NOT mutate the input message objects', () => {
    const input = [makeCampaignWithCritique()];
    const snapshot = JSON.parse(JSON.stringify(input));
    persistableChatMessages(input);
    expect(input).toEqual(snapshot); // original still carries its critique
    expect('critique' in input[0].campaign).toBe(true);
  });

  it('sanitizeChatMessage returns the SAME ref when there is no critique', () => {
    const plain = { role: 'assistant', campaign: { campaignId: 'c3', concepts: [] } };
    expect(sanitizeChatMessage(plain)).toBe(plain);
    expect(sanitizeChatMessage(null)).toBe(null);
  });
});

describe('chatPersistence — Offer Campaign cards are transient (no offer brief persisted)', () => {
  const normal = { role: 'assistant', text: 'שלום' };
  const system = { role: 'assistant', system: true, text: '✓ נשמר' };
  const offerForm = { role: 'assistant', offerForm: true };
  const offerBrief = {
    role: 'assistant',
    offerBrief: { prospect: { businessType: 'תיווך' }, status: 'draft', offer: { service: 'מערכת CRM חכמה' } },
  };

  it('excludes an offerForm message from persisted history', () => {
    expect(persistableChatMessages([normal, offerForm, system])).toEqual([normal, system]);
  });

  it('excludes an offerBrief result card from persisted history', () => {
    expect(persistableChatMessages([normal, offerBrief, system])).toEqual([normal, system]);
  });

  it('hydration of a (legacy) stored offer card restores nothing', () => {
    expect(persistableChatMessages([offerForm, offerBrief])).toEqual([]);
  });

  it('isTransientChatMessage flags offerForm and offerBrief', () => {
    expect(isTransientChatMessage(offerForm)).toBe(true);
    expect(isTransientChatMessage(offerBrief)).toBe(true);
    expect(isTransientChatMessage(normal)).toBe(false);
  });

  it('does not mutate input and preserves order of the remaining messages', () => {
    const input = [normal, offerForm, offerBrief, system];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = persistableChatMessages(input);
    expect(input).toEqual(snapshot);
    expect(out).toEqual([normal, system]);
  });
});

describe('chatPersistence — ComfyUI Poster cards are transient (no poster image/prompt persisted)', () => {
  const normal = { role: 'assistant', text: 'שלום' };
  const system = { role: 'assistant', system: true, text: '✓ נשמר' };
  const posterProgress = { role: 'assistant', posterProgress: { service: 'מערכת CRM חכמה', pid: 'poster_1' } };
  const posterResult = { role: 'assistant', posterResult: { src: 'http://localhost:8188/view?filename=x.png', service: 'אוטומציות', engine: 'local', overlay: { headline: 'כותרת', subheadline: 'תת', cta: 'קבעו שיחה קצרה', label: 'אוטומציות' } } };
  const posterError = { role: 'assistant', posterError: { reason: 'comfy_offline', service: 'אוטומציות' } };

  it('excludes posterProgress / posterResult / posterError from persisted history', () => {
    expect(persistableChatMessages([normal, posterProgress, posterResult, posterError, system])).toEqual([normal, system]);
  });

  it('hydration of (legacy) stored poster cards restores nothing', () => {
    expect(persistableChatMessages([posterProgress, posterResult, posterError])).toEqual([]);
  });

  it('isTransientChatMessage flags all three poster card types', () => {
    expect(isTransientChatMessage(posterProgress)).toBe(true);
    expect(isTransientChatMessage(posterResult)).toBe(true);
    expect(isTransientChatMessage(posterError)).toBe(true);
    expect(isTransientChatMessage(normal)).toBe(false);
  });

  it('does not mutate input and preserves order of the remaining messages', () => {
    const input = [normal, posterProgress, posterResult, system];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = persistableChatMessages(input);
    expect(input).toEqual(snapshot);
    expect(out).toEqual([normal, system]);
  });
});

// ===================================================================
// EXECUTABLE ACTION CARDS — gate / confirm / preview.
//
// These are transient action confirmations: each carries a snapshot of ids taken
// when it was built, so a restored one offers a destructive action the user never
// requested this session, against a list that may have moved. They must not
// restore AT ALL (no disabled/expired variant).
//
// Two things this block must protect, in both directions:
//   1. NO OVER-CAPTURE — ordinary history must never be deleted by this filter.
//      That failure mode is silent, which is why it gets its own describe block.
//   2. A DECIDED action still leaves its record — the card is replaced in place
//      with a plain `system` text, and that text persists.
// ===================================================================
describe('chatPersistence — executable action cards are transient (gate / confirm / preview)', () => {
  const normal = { role: 'assistant', text: 'שלום' };
  const userMsg = { role: 'user', text: 'מחק את כל הלקוחות' };
  const system = { role: 'assistant', system: true, text: '✓ נשמר' };
  // Real shapes: Assistant.jsx builds `gate` from buildBulkDeleteGate (jakeAgent.js),
  // `confirm` from executeActions' pendingDeletes, `preview` from an action batch.
  const gate = {
    role: 'assistant',
    gate: {
      entity: 'clients',
      entityLabel: 'לקוחות',
      dispatchType: 'DELETE_CLIENT',
      items: [{ id: 'c1', label: 'דני כהן' }, { id: 'c2', label: 'רות לוי' }],
    },
  };
  const confirm = { role: 'assistant', confirm: { label: 'למחוק את דני כהן?', action: { op: 'delete_client', client: 'דני כהן' } } };
  const preview = { role: 'assistant', preview: { actions: [{ op: 'delete_client', client: 'דני כהן' }], items: ['מחיקת לקוח: דני כהן'] } };
  // The lead-in that precedes a gate — a truthful past-tense record; it PERSISTS.
  const gateLeadIn = { role: 'assistant', system: true, text: 'למחיקת כל לקוחות (2) נדרש קוד אישור. 🔒' };

  it('T1 · isTransientChatMessage flags gate, confirm and preview', () => {
    expect(isTransientChatMessage(gate)).toBe(true);
    expect(isTransientChatMessage(confirm)).toBe(true);
    expect(isTransientChatMessage(preview)).toBe(true);
  });

  it('T2 · each is excluded from persisted history on SAVE', () => {
    expect(persistableChatMessages([normal, gate, system])).toEqual([normal, system]);
    expect(persistableChatMessages([normal, confirm, system])).toEqual([normal, system]);
    expect(persistableChatMessages([normal, preview, system])).toEqual([normal, system]);
  });

  it('T3 · a legacy-stored card of each shape drops on HYDRATION', () => {
    expect(persistableChatMessages([gate])).toEqual([]);
    expect(persistableChatMessages([confirm])).toEqual([]);
    expect(persistableChatMessages([preview])).toEqual([]);
    expect(persistableChatMessages([gate, confirm, preview])).toEqual([]);
  });

  it('T4 · a full save → JSON → hydrate round-trip drops all three and keeps the rest in order', () => {
    const live = [userMsg, normal, preview, system, gate, confirm];
    const saved = persistableChatMessages(live);                       // save path
    const hydrated = persistableChatMessages(JSON.parse(JSON.stringify(saved))); // hydration path
    expect(hydrated).toEqual([userMsg, normal, system]);
    expect(hydrated.some((m) => m.gate || m.confirm || m.preview)).toBe(false);
  });

  it('T5 · NO OVER-CAPTURE — every ordinary shape survives both directions', () => {
    // campaignSelect and productionOffer are DELIBERATELY out of scope: they are
    // not executable destructive affordances and must keep persisting.
    const campaignSelect = { role: 'assistant', campaignSelect: { campaignId: 'c1', conceptId: 'x', conceptName: 'א' } };
    const keep = [userMsg, normal, system, campaign, campaignSelect, offer, review];
    const saved = persistableChatMessages(keep);
    expect(saved).toEqual(keep);
    expect(persistableChatMessages(JSON.parse(JSON.stringify(saved)))).toEqual(keep);
    for (const m of keep) expect(isTransientChatMessage(m)).toBe(false);
  });

  it('T5b · a message merely MENTIONING a card word is not captured (property presence only)', () => {
    const talksAboutIt = { role: 'assistant', text: 'לחץ על אשר ובצע כדי לאשר את המחיקה' };
    const falsyProps = { role: 'assistant', text: 'שלום', gate: null, confirm: undefined, preview: false };
    expect(isTransientChatMessage(talksAboutIt)).toBe(false);
    expect(isTransientChatMessage(falsyProps)).toBe(false);
    expect(persistableChatMessages([talksAboutIt, falsyProps])).toEqual([talksAboutIt, falsyProps]);
  });

  it('T6 · the seven pre-existing transient clauses are unchanged (regression pin)', () => {
    expect(isTransientChatMessage(progress)).toBe(true);
    expect(isTransientChatMessage(handoff)).toBe(true);
    expect(isTransientChatMessage({ role: 'assistant', offerForm: true })).toBe(true);
    expect(isTransientChatMessage({ role: 'assistant', offerBrief: {} })).toBe(true);
    expect(isTransientChatMessage({ role: 'assistant', posterProgress: {} })).toBe(true);
    expect(isTransientChatMessage({ role: 'assistant', posterResult: {} })).toBe(true);
    expect(isTransientChatMessage({ role: 'assistant', posterError: {} })).toBe(true);
  });

  it('T7 · a DECIDED action keeps its record — the replacement system text persists', () => {
    // Assistant.jsx replaces the card IN PLACE on confirm/cancel/approve, so what
    // reaches storage is a plain system message. Nothing about the outcome is lost.
    const done = { role: 'assistant', system: true, text: '✓ מחיקת לקוח: דני כהן — בוצע.' };
    const cancelled = { role: 'assistant', system: true, text: 'בוטל — לא נמחק כלום.' };
    const bulkOutcome = { role: 'assistant', system: true, text: '✓ נמחקו 2 הלקוחות (הכל).' };
    const out = persistableChatMessages([userMsg, done, cancelled, bulkOutcome]);
    expect(out).toEqual([userMsg, done, cancelled, bulkOutcome]);
  });

  it('T8 · does not mutate input and preserves the order of survivors', () => {
    const input = [normal, gate, review, confirm, system, preview];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = persistableChatMessages(input);
    expect(input).toEqual(snapshot);
    expect(out).toEqual([normal, review, system]);
  });

  it('T9 · degenerate inputs are handled without throwing', () => {
    expect(isTransientChatMessage(null)).toBe(false);
    expect(isTransientChatMessage(undefined)).toBe(false);
    expect(isTransientChatMessage({})).toBe(false);
    expect(isTransientChatMessage('gate')).toBe(false);
    expect(persistableChatMessages(undefined)).toEqual([]);
    expect(persistableChatMessages(null)).toEqual([]);
    expect(persistableChatMessages({})).toEqual([]);
  });

  it('T10 · a realistic transcript round-trips to exactly the expected survivors', () => {
    const transcript = [
      { role: 'assistant', text: 'שלום! אני ג׳יק' },
      userMsg,
      gateLeadIn,   // the lead-in PERSISTS — accepted residue, stated in the module header
      gate,         // the card does NOT
      { role: 'user', text: 'תוסיף לקוח דני כהן' },
      preview,
      { role: 'assistant', system: true, text: '✓ נוסף לקוח: דני כהן' },
    ];
    const out = persistableChatMessages(JSON.parse(JSON.stringify(persistableChatMessages(transcript))));
    expect(out).toEqual([
      { role: 'assistant', text: 'שלום! אני ג׳יק' },
      userMsg,
      gateLeadIn,
      { role: 'user', text: 'תוסיף לקוח דני כהן' },
      { role: 'assistant', system: true, text: '✓ נוסף לקוח: דני כהן' },
    ]);
  });
});
