// Verifies the labeling packet is BLIND (no V1/critic leakage), the A/B/C→conceptId
// mapping is reversible and lives only in the hidden key, and generation is
// deterministic. Does not author any labels.
import { describe, it, expect } from 'vitest';
import { buildPacketsAndKey, renderPacketMarkdown } from '../labelingPacket.js';

const cpt = (id, n) => ({
  id, name: `name-${n}`, strategicAngle: `angle-${n}`, emotionalTone: 't', coreIdea: `idea-${n}`,
  headlineDirection: `head-${n}`, visualDirection: `vis-${n}`, heroObject: `hero-${n}`,
  compositionDirection: 'comp', colorDirection: [], whyItWorks: `why-${n}`, risks: [], originalityScore: 7, brandFitScore: 7,
});
const sample = (bid, k) => ({
  sampleId: `${bid}#sample${k}`,
  request: { requestId: bid },
  result: { requestId: bid, strategy: {}, concepts: [cpt('concept-1', 1), cpt('concept-2', 2), cpt('concept-3', 3)], recommendedConceptId: 'concept-1' },
});
const candidate = {
  meta: { sampleCount: 1, model: 'dicta-test' },
  snapshots: { b01: { samples: [sample('b01', 0)] }, b02: { samples: [sample('b02', 0)] } },
};
const critiques = {
  'b01#sample0': { recommendedConceptId: 'concept-2', ranking: ['concept-2', 'concept-1', 'concept-3'], rejected: [{ conceptId: 'concept-3', reasons: ['x'] }], evaluations: [{ conceptId: 'concept-1', demoted: false, protectedAsStrongUnusual: false, composite: 0.8 }, { conceptId: 'concept-2', demoted: false, protectedAsStrongUnusual: true, composite: 0.9 }, { conceptId: 'concept-3', demoted: false, protectedAsStrongUnusual: false, composite: 0.2 }] },
  'b02#sample0': { recommendedConceptId: 'concept-1', ranking: ['concept-1', 'concept-2', 'concept-3'], rejected: [], evaluations: [{ conceptId: 'concept-1', demoted: false, protectedAsStrongUnusual: false, composite: 0.7 }, { conceptId: 'concept-2', demoted: true, protectedAsStrongUnusual: false, composite: 0.3 }, { conceptId: 'concept-3', demoted: false, protectedAsStrongUnusual: false, composite: 0.6 }] },
};

describe('labeling packet — blindness, reversibility, determinism', () => {
  const { packets, key, totals } = buildPacketsAndKey(candidate, critiques);

  it('one packet per sample index; full brief coverage', () => {
    expect(totals).toEqual({ briefs: 2, sampleCount: 1, cases: 2 });
    expect(packets).toHaveLength(1);
    expect(packets[0].cases.map((c) => c.briefId).sort()).toEqual(['b01', 'b02']);
  });

  it('blind packet leaks NO V1/critic information', () => {
    const blob = JSON.stringify(packets);
    // no recommendation, ranking, scores, reject/demote, or original concept ids
    expect(blob).not.toContain('recommendedConceptId');
    expect(blob).not.toContain('ranking');
    expect(blob).not.toContain('composite');
    expect(blob).not.toContain('rejected');
    expect(blob).not.toContain('concept-1');
    expect(blob).not.toContain('concept-2');
    // concepts are presented under neutral A/B/C labels with blank judgments
    const c0 = packets[0].cases[0];
    expect(c0.concepts.map((x) => x.label)).toEqual(['A', 'B', 'C']);
    expect(Object.values(c0.judgment.labels)).toEqual(['', '', '']);
  });

  it('hidden key holds a reversible A/B/C→conceptId bijection + V1/critic', () => {
    const k0 = key.find((k) => k.caseId === 'b01#sample0');
    const ids = Object.values(k0.displayToConceptId).sort();
    expect(ids).toEqual(['concept-1', 'concept-2', 'concept-3']); // covers every concept exactly once
    expect(new Set(Object.values(k0.displayToConceptId)).size).toBe(3); // bijection
    expect(k0.v1RecommendedConceptId).toBe('concept-1');
    expect(k0.critic.recommendedConceptId).toBe('concept-2');
  });

  it('is deterministic — identical packets across runs', () => {
    const again = buildPacketsAndKey(candidate, critiques);
    expect(again.packets).toEqual(packets);
    expect(renderPacketMarkdown(again.packets[0])).toBe(renderPacketMarkdown(packets[0]));
  });
});
