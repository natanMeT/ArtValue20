import { describe, it, expect } from 'vitest';
import { evaluateJudge } from '../judgeEval.js';
import { DIMENSION_KEYS, FLAG_KEYS } from '../judgeSchema.js';

const dims = (o = {}) => ({ ...Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 0.5])), ...o });
const flg = (o = {}) => ({ ...Object.fromEntries(FLAG_KEYS.map((k) => [k, false])), ...o });
const J = (id, { flags = {}, dimensions = {}, nearDuplicateOf = [] } = {}) => ({
  ok: true, conceptId: id, judgeVersion: 'semantic-judge-v1', deterministic: false,
  dimensions: dims(dimensions), flags: flg(flags), nearDuplicateOf, rationale: '', confidence: 0.5,
});
const DEGRADED = { ok: false, degraded: true, reason: 'json_parse_failed' };

// caseA: has a best. caseB: NO best (b02-style) + one degraded judge + a near-dup pair.
const items = [
  {
    caseId: 'caseA', bestConceptId: 'c1',
    labelByConceptId: { c1: 'best', c2: 'acceptable', c3: 'reject' },
    sets: { mustNotReject: ['c1', 'c2'], shouldReject: ['c3'], strongUnusual: ['c1'], generic: ['c2'], nearDupPairs: [] },
    judge: {
      c1: J('c1', { flags: { strangeButStrong: true }, dimensions: { posterPotential: 0.9, clientUsability: 0.8 } }),
      c2: J('c2', { flags: { genericButUsable: true }, dimensions: { posterPotential: 0.6, clientUsability: 0.7 } }),
      c3: J('c3', { flags: { incoherentMeaning: true }, dimensions: { posterPotential: 0.2, clientUsability: 0.3 } }),
    },
  },
  {
    caseId: 'caseB', bestConceptId: null,
    labelByConceptId: { d1: 'weak', d2: 'reject', d3: 'reject' },
    sets: { mustNotReject: [], shouldReject: ['d2', 'd3'], strongUnusual: [], generic: ['d1'], nearDupPairs: [['d2', 'd3']] },
    judge: {
      d1: J('d1', { flags: { genericButUsable: true }, dimensions: { posterPotential: 0.3, clientUsability: 0.4 } }),
      d2: J('d2', { flags: { incoherentMeaning: true }, nearDuplicateOf: ['d3'], dimensions: { posterPotential: 0.2, clientUsability: 0.2 } }),
      d3: DEGRADED,
    },
  },
];

describe('judgeEval.evaluateJudge — signal alignment, NO selection', () => {
  const m = evaluateJudge(items);

  it('NEVER computes Top-1 (no selector exists)', () => {
    expect(m.top1).toBeNull();
  });

  it('counts cases / concepts / no-best / degraded correctly', () => {
    expect(m.n).toMatchObject({ cases: 2, concepts: 6, noBestCases: 1, degraded: 1 });
  });

  it('flag recall/precision vs human sets (strangeButStrong↔strongUnusual, genericButUsable↔generic)', () => {
    expect(m.flagAlignment.strangeButStrong).toMatchObject({ tp: 1, fp: 0, fn: 0, recall: 1, precision: 1 });
    expect(m.flagAlignment.genericButUsable).toMatchObject({ tp: 2, fp: 0, fn: 0, recall: 1, precision: 1 });
  });

  it('severe-negative-flag false positives vs mustNotReject (should be 0 here)', () => {
    expect(m.mustNotRejectFP).toMatchObject({ withSevereNegFlag: 0, total: 2, rate: 0 });
  });

  it('roughButRescuable precision has no false-on-reject (none flagged → null rate)', () => {
    expect(m.roughButRescuablePrecision).toMatchObject({ onReject: 0, total: 0, rate: null });
  });

  it('posterPotential / clientUsability SEPARATE best/acceptable from weak/reject', () => {
    expect(m.separation.posterPotential).toMatchObject({ meanBestAcc: 0.75, meanWeakReject: 0.233, gap: 0.517, nBestAcc: 2, nWeakReject: 3 });
    expect(m.separation.clientUsability).toMatchObject({ meanBestAcc: 0.75, meanWeakReject: 0.3, gap: 0.45 });
  });

  it('nearDuplicateOf vs human nearDupPairs (pair recall/precision), tolerant of a degraded sibling', () => {
    expect(m.nearDuplicate).toMatchObject({ tpPairs: 1, fpPairs: 0, fnPairs: 0, pairRecall: 1, pairPrecision: 1 });
  });

  it('negative-flag concentration lands on weak/reject, not best/acceptable', () => {
    expect(m.negativeFlagConcentration.incoherentMeaning).toMatchObject({ total: 2, onWeakReject: 2, onBestAcceptable: 0 });
  });

  it('is pure / deterministic and never throws on empty input', () => {
    expect(JSON.stringify(evaluateJudge(items))).toBe(JSON.stringify(evaluateJudge(items)));
    expect(evaluateJudge([]).n).toMatchObject({ cases: 0, concepts: 0, noBestCases: 0, degraded: 0 });
    expect(evaluateJudge([]).top1).toBeNull();
  });
});
