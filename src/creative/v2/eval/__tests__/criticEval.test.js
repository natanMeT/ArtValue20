// Unit tests for the PURE evaluation math (criticEval.js). These assert the
// metric formulas on hand-computed inputs — they never claim the critic is good.
import { describe, it, expect } from 'vitest';
import { evaluateBrief, aggregate, verdict, runEvaluation } from '../criticEval.js';

const concept = (id) => ({ id });
const result = (rec) => ({ concepts: [concept('c1'), concept('c2'), concept('c3')], recommendedConceptId: rec });
const critique = ({ ranking, rec, rejected = [], demoted = [], ok = true, degraded = false }) => ({
  ok, degraded, ranking, recommendedConceptId: rec,
  rejected: rejected.map((id) => ({ conceptId: id, reasons: ['r'] })),
  evaluations: ['c1', 'c2', 'c3'].map((id) => ({ conceptId: id, demoted: demoted.includes(id), protectedAsStrongUnusual: false })),
});

describe('evaluateBrief — clean case where critic beats V1', () => {
  const golden = { briefId: 'x', labels: { c1: 'acceptable', c2: 'best', c3: 'weak' }, preferredOrder: ['c2', 'c1', 'c3'] };
  const row = evaluateBrief({
    result: result('c1'),
    critique: critique({ ranking: ['c2', 'c1', 'c3'], rec: 'c2' }),
    golden,
  });
  it('top-1: V1 misses, critic hits', () => { expect(row.v1Top1Hit).toBe(0); expect(row.criticTop1Hit).toBe(1); });
  it('pairwise: 3 comparable, V1 concordant=2, critic=3', () => {
    expect(row.comparablePairs).toBe(3); expect(row.v1Concordant).toBe(2); expect(row.criticConcordant).toBe(3);
  });
  it('no false-reject; protected set = best ∪ acceptable', () => {
    expect(row.protectedCount).toBe(2); expect(row.falseRejectViolations).toBe(0); expect(row.falseRejectOfBest).toBe(0);
  });
  it('no false-promote; recommendation changed', () => { expect(row.falsePromote).toBe(0); expect(row.changed).toBe(1); });
});

describe('evaluateBrief — safety violations are detected', () => {
  it('rejecting the best concept → falseRejectOfBest', () => {
    const golden = { briefId: 'x', labels: { c1: 'acceptable', c2: 'best', c3: 'weak' }, preferredOrder: ['c2', 'c1', 'c3'] };
    const row = evaluateBrief({ result: result('c1'), critique: critique({ ranking: ['c1', 'c3', 'c2'], rec: 'c1', rejected: ['c2'] }), golden });
    expect(row.falseRejectOfBest).toBe(1);
    expect(row.falseRejectViolations).toBe(1);
  });
  it('rejecting a strong-unusual concept → preservation miss', () => {
    const golden = { briefId: 'x', labels: { c1: 'best', c2: 'acceptable', c3: 'acceptable' }, preferredOrder: ['c1', 'c2', 'c3'], strongUnusual: ['c3'] };
    const row = evaluateBrief({ result: result('c1'), critique: critique({ ranking: ['c1', 'c2', 'c3'], rec: 'c1', rejected: ['c3'] }), golden });
    expect(row.suTotal).toBe(1); expect(row.suPreserved).toBe(0);
  });
  it('recommending a weak concept → false-promote', () => {
    const golden = { briefId: 'x', labels: { c1: 'best', c2: 'weak', c3: 'acceptable' }, preferredOrder: ['c1', 'c3', 'c2'] };
    const row = evaluateBrief({ result: result('c1'), critique: critique({ ranking: ['c2', 'c1', 'c3'], rec: 'c2' }), golden });
    expect(row.falsePromote).toBe(1);
  });
});

describe('evaluateBrief — near-duplicate & generic handling', () => {
  it('near-dup: keep stronger, drop weaker → success', () => {
    const golden = { briefId: 'x', labels: { c1: 'best', c2: 'acceptable', c3: 'weak' }, preferredOrder: ['c1', 'c2', 'c3'], nearDupPairs: [['c2', 'c3']] };
    const row = evaluateBrief({ result: result('c1'), critique: critique({ ranking: ['c1', 'c2', 'c3'], rec: 'c1', rejected: ['c3'] }), golden });
    expect(row.dupTotal).toBe(1); expect(row.dupSuccess).toBe(1);
  });
  it('generic: demoted counts as handled', () => {
    const golden = { briefId: 'x', labels: { c1: 'best', c2: 'weak', c3: 'acceptable' }, preferredOrder: ['c1', 'c3', 'c2'], generic: ['c2'] };
    const row = evaluateBrief({ result: result('c1'), critique: critique({ ranking: ['c1', 'c3', 'c2'], rec: 'c1', demoted: ['c2'] }), golden });
    expect(row.genTotal).toBe(1); expect(row.genHandled).toBe(1);
  });
});

describe('aggregate + verdict', () => {
  const golden = { briefId: 'x', labels: { c1: 'acceptable', c2: 'best', c3: 'weak' }, preferredOrder: ['c2', 'c1', 'c3'] };
  const good = evaluateBrief({ result: result('c1'), critique: critique({ ranking: ['c2', 'c1', 'c3'], rec: 'c2' }), golden });

  it('aggregate pools correctly', () => {
    const agg = aggregate([good]);
    expect(agg.datasetSize).toBe(1);
    expect(agg.top1.v1).toBe(0); expect(agg.top1.critic).toBe(1); expect(agg.top1.delta).toBe(1);
    expect(agg.pairwise.v1).toBeCloseTo(2 / 3); expect(agg.pairwise.critic).toBe(1);
    expect(agg.coverage).toBe(1); expect(agg.degradedRunRate).toBe(0);
    expect(agg.strongUnusualPreservation).toBe(1); // vacuous when none labeled
  });
  it('PASS when safety gates hold and critic ≥ V1', () => {
    expect(verdict(aggregate([good])).status).toBe('PASS');
  });
  it('FAIL when the best concept is rejected', () => {
    const bad = evaluateBrief({ result: result('c1'), critique: critique({ ranking: ['c1', 'c3', 'c2'], rec: 'c1', rejected: ['c2'] }), golden });
    const v = verdict(aggregate([bad]));
    expect(v.status).toBe('FAIL');
    expect(v.hardGates.falseRejectOfBestZero).toBe(false);
  });
  it('INCOMPLETE short-circuits regardless of rows', () => {
    const v = verdict(aggregate([good]), { incomplete: true, reason: 'LOCAL_RIG_UNAVAILABLE' });
    expect(v.status).toBe('INCOMPLETE'); expect(v.reason).toBe('LOCAL_RIG_UNAVAILABLE');
  });

  it('a goldenValidity:mismatched run is DESCRIPTIVE: INCOMPLETE + golden metrics n/a, structural shown', () => {
    const items = [{ result: result('c1'), critique: critique({ ranking: ['c1', 'c3', 'c2'], rec: 'c1', rejected: ['c2'] }), golden }];
    const res = runEvaluation(items, { mode: 'real', source: 'local-model', sampleCount: 1, createdAt: 't', goldenValidity: 'mismatched' });
    expect(res.vrd.status).toBe('INCOMPLETE');
    expect(res.vrd.reason).toBe('CANDIDATE_REQUIRES_RELABEL');
    // golden-dependent metrics must NOT surface a number (no misleading FAIL on rejecting "best")
    expect(res.report).toMatch(/Top-1 agreement \| n\/a/);
    expect(res.report).toContain('re-label required');
    // structural metrics remain valid and shown
    expect(res.report).toMatch(/coverage \| 100\.0% \| structural/);
  });
});
