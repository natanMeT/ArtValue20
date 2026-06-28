import { describe, it, expect } from 'vitest';
import { summarizeReliability, parseRunLog } from '../reliability.js';

describe('summarizeReliability', () => {
  it('COMPLETED only at full coverage; distinguishes first-attempt vs recovered vs unrecovered', () => {
    const records = [
      { sampleId: 'b01#sample0', attempts: 1, firstAttemptOk: true, ok: true },
      { sampleId: 'b01#sample1', attempts: 2, firstAttemptOk: false, ok: true, errorCode: 'RESULT_INVALID' }, // recovered
      { sampleId: 'b01#sample2', attempts: 3, firstAttemptOk: false, ok: false, errorCode: 'RESULT_INVALID' }, // unrecovered
    ];
    const s = summarizeReliability(records, 3);
    expect(s.successfulCases).toBe(2);
    expect(s.permanentlyFailedCases).toBe(1);
    expect(s.recoveredByRetryCases).toBe(1);
    expect(s.firstAttemptFailures).toBe(2);
    expect(s.totalGenerationAttempts).toBe(6);
    expect(s.firstAttemptSuccessRate).toBeCloseTo(1 / 3);
    expect(s.finalSuccessRate).toBeCloseTo(2 / 3);
    expect(s.errorClasses).toEqual({ RESULT_INVALID: 2 });
    expect(s.status).toBe('PARTIAL'); // 2/3 ≠ full coverage
    expect(s.reason).toBe('MISSING_CASES');
  });

  it('full coverage → COMPLETED; zero → INCOMPLETE', () => {
    const ok3 = [0, 1, 2].map((k) => ({ sampleId: `b#sample${k}`, attempts: 1, firstAttemptOk: true, ok: true }));
    expect(summarizeReliability(ok3, 3).status).toBe('COMPLETED');
    expect(summarizeReliability([], 3).status).toBe('INCOMPLETE');
  });
});

describe('parseRunLog — reconstruct telemetry from a runner stdout log', () => {
  const log = [
    '[1/3] b01#sample0 ✓',
    '  ↻ retry 1/3 b01#sample1: RESULT_INVALID Normalized canonical result failed validation',
    '[2/3] b01#sample1 ✓',
    '  ↻ retry 1/3 b01#sample2: RESULT_INVALID x',
    '  ↻ retry 2/3 b01#sample2: RESULT_INVALID x',
    '[3/3] b01#sample2 ✗ recorded failure: RESULT_INVALID: Normalized canonical result failed validation',
  ].join('\n');

  it('recovers first-attempt, retry, and permanent-failure facts', () => {
    const recs = parseRunLog(log);
    const s = summarizeReliability(recs, 3);
    expect(s.attemptedCases).toBe(3);
    expect(s.successfulCases).toBe(2);
    expect(s.permanentlyFailedCases).toBe(1);
    expect(s.recoveredByRetryCases).toBe(1); // sample1 recovered after 1 retry
    expect(s.firstAttemptFailures).toBe(2); // sample1 + sample2
    expect(s.failedSampleIds).toEqual(['b01#sample2']);
    expect(s.errorClasses.RESULT_INVALID).toBeGreaterThanOrEqual(1);
  });
});
