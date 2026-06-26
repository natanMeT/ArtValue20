import { describe, it, expect, beforeEach } from 'vitest';
import { createCampaignStore, CampaignStateError } from '../campaignStore.js';
import { diverseConcepts } from './fixtures.js';

const strategy = { businessProblem: 'p', campaignObjective: 'o', audienceInsight: 'a', strategicDirection: 'd', keyMessage: 'k' };

function freshStore() {
  let n = 0;
  const map = new Map();
  const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
  return createCampaignStore({ storage, id: () => `cmp_${++n}`, clock: () => '2026-01-01T00:00:00.000Z' });
}

describe('F. campaign state machine', () => {
  let store;
  beforeEach(() => { store = freshStore(); });

  it('draft → concepts_ready', () => {
    const d = store.createDraft({ tenantId: 't', requestId: 'r1', objective: 'increase_sales', targetAudience: 'x', channel: 'instagram_post', format: '4:5' });
    expect(d.status).toBe('draft');
    const ready = store.attachConcepts(d.id, { strategy, concepts: diverseConcepts });
    expect(ready.status).toBe('concepts_ready');
    expect(ready.concepts).toHaveLength(3);
  });

  it('concepts_ready → concept_selected (persists the chosen concept)', () => {
    const d = store.createDraft({ tenantId: 't', requestId: 'r1' });
    store.attachConcepts(d.id, { strategy, concepts: diverseConcepts });
    const sel = store.selectConcept(d.id, 'concept-2');
    expect(sel.status).toBe('concept_selected');
    expect(sel.selectedConceptId).toBe('concept-2');
    expect(store.get(d.id).selectedConceptId).toBe('concept-2'); // persisted
  });

  it('invalid transition draft → concept_selected throws', () => {
    const d = store.createDraft({ tenantId: 't', requestId: 'r1' });
    expect(() => store.selectConcept(d.id, 'concept-1')).toThrowError(CampaignStateError);
  });

  it('attachConcepts twice (concepts_ready → concepts_ready) throws', () => {
    const d = store.createDraft({ tenantId: 't', requestId: 'r1' });
    store.attachConcepts(d.id, { strategy, concepts: diverseConcepts });
    expect(() => store.attachConcepts(d.id, { strategy, concepts: diverseConcepts })).toThrowError(CampaignStateError);
  });

  it('cancelled selection (no call) produces NO mutation', () => {
    const d = store.createDraft({ tenantId: 't', requestId: 'r1' });
    store.attachConcepts(d.id, { strategy, concepts: diverseConcepts });
    const before = JSON.stringify(store.get(d.id));
    // user cancels → selectConcept is simply never called
    expect(store.get(d.id).status).toBe('concepts_ready');
    expect(JSON.stringify(store.get(d.id))).toBe(before);
  });

  it('selecting an unknown concept throws (no mutation)', () => {
    const d = store.createDraft({ tenantId: 't', requestId: 'r1' });
    store.attachConcepts(d.id, { strategy, concepts: diverseConcepts });
    expect(() => store.selectConcept(d.id, 'concept-99')).toThrowError(/UNKNOWN_CONCEPT|אינו שייך/);
    expect(store.get(d.id).status).toBe('concepts_ready'); // unchanged
  });

  it('re-selecting the SAME concept is idempotent', () => {
    const d = store.createDraft({ tenantId: 't', requestId: 'r1' });
    store.attachConcepts(d.id, { strategy, concepts: diverseConcepts });
    const a = store.selectConcept(d.id, 'concept-1');
    const b = store.selectConcept(d.id, 'concept-1'); // no throw, same result
    expect(b.selectedConceptId).toBe('concept-1');
    expect(a.updatedAt).toBe(b.updatedAt);
  });

  it('list filters by tenant', () => {
    store.createDraft({ tenantId: 'A', requestId: 'r1' });
    store.createDraft({ tenantId: 'B', requestId: 'r2' });
    expect(store.list('A')).toHaveLength(1);
    expect(store.list()).toHaveLength(2);
  });
});
