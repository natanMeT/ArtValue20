import { describe, it, expect, vi } from 'vitest';
import { judgeConcept, judgeConcepts } from '../semanticJudge.js';
import { DIMENSION_KEYS, FLAG_KEYS, JUDGE_VERSION } from '../judgeSchema.js';

const dims = (v = 0.5) => Object.fromEntries(DIMENSION_KEYS.map((k) => [k, v]));
const flags = (v = false) => Object.fromEntries(FLAG_KEYS.map((k) => [k, v]));
const validJson = (id) => JSON.stringify({ conceptId: id, dimensions: dims(), flags: flags(), nearDuplicateOf: [], rationale: 'r', confidence: 0.5 });

const concepts = [
  { id: 'concept-1', name: 'A', coreIdea: 'idea A', heroObject: 'tower' },
  { id: 'concept-2', name: 'B', coreIdea: 'idea B', heroObject: 'desk' },
  { id: 'concept-3', name: 'C', coreIdea: 'idea C', heroObject: 'screen' },
];

describe('semanticJudge — injected seam, never calls a real model', () => {
  it('returns degraded (offline-inert) when NO judge is injected — no model is ever constructed', async () => {
    const r = await judgeConcept(concepts[0], {}, {});
    expect(r).toMatchObject({ ok: false, degraded: true, reason: 'no_judge_configured', conceptId: 'concept-1' });
  });

  it('validates a MOCK judge\'s output (the mock is the only call path)', async () => {
    const mock = vi.fn(async (_p, meta) => validJson(meta.conceptId));
    const r = await judgeConcept(concepts[0], {}, { judge: mock });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.conceptId).toBe('concept-1');
    expect(r.judgeVersion).toBe(JUDGE_VERSION);
  });

  it('degrades (never throws) on malformed mock output and on a throwing judge', async () => {
    const bad = await judgeConcept(concepts[0], {}, { judge: async () => 'totally not json' });
    expect(bad).toMatchObject({ ok: false, degraded: true });
    const threw = await judgeConcept(concepts[0], {}, { judge: async () => { throw new Error('boom'); } });
    expect(threw).toMatchObject({ ok: false, degraded: true, reason: 'boom', conceptId: 'concept-1' });
  });

  it('judgeConcepts runs the set through the mock, passing sibling ids in the prompt', async () => {
    const seen = [];
    const mock = vi.fn(async (prompt, meta) => { seen.push({ prompt, id: meta.conceptId }); return validJson(meta.conceptId); });
    const out = await judgeConcepts({ concepts, request: {}, strategy: {} }, { judge: mock });
    expect(out.ok).toBe(true);
    expect(out.version).toBe(JUDGE_VERSION);
    expect(out.deterministic).toBe(false);
    expect(out.results.map((r) => r.conceptId)).toEqual(['concept-1', 'concept-2', 'concept-3']);
    expect(mock).toHaveBeenCalledTimes(3);
    // concept-1's prompt names its siblings concept-2 / concept-3 (for near-dup detection)
    const p1 = seen.find((s) => s.id === 'concept-1').prompt;
    expect(p1).toContain('concept-2');
    expect(p1).toContain('concept-3');
  });

  it('produces no ranking / recommendedConceptId / bestConceptId anywhere', async () => {
    const out = await judgeConcepts({ concepts }, { judge: async (_p, m) => validJson(m.conceptId) });
    expect(out).not.toHaveProperty('ranking');
    expect(out).not.toHaveProperty('recommendedConceptId');
    for (const r of out.results) for (const k of ['ranking', 'recommendedConceptId', 'bestConceptId', 'composite']) expect(r).not.toHaveProperty(k);
  });

  it('empty input degrades gracefully', async () => {
    expect(await judgeConcepts({ concepts: [] }, { judge: async () => '{}' })).toMatchObject({ ok: false, reason: 'no_concepts' });
  });
});
