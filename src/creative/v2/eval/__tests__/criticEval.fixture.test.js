// Fixture-mode harness test: runs the REAL critic over the committed baseline and
// scores it. Asserts the harness is COMPLETE and the baseline ran with the seam
// OFF — it does NOT assert quality thresholds (the numbers are evidence for human
// review, not CI gates). Prints the markdown report for inspection.
import { describe, it, expect } from 'vitest';
import { runFixtureEval } from '../runCriticEval.js';
import { critiqueConcepts } from '../../conceptCritic.js';
import SNAPSHOT from '../v1Snapshots.json';

describe('critic evaluation — fixture (baseline) run', () => {
  it('produces a complete, deterministic evaluation with the model seam OFF', async () => {
    const res = await runFixtureEval();

    // completeness
    expect(res.rows).toHaveLength(10);
    expect(res.agg.datasetSize).toBe(10);
    expect(['PASS', 'FAIL']).toContain(res.vrd.status);
    res.rows.forEach((r) => {
      expect(r.v1Order).toHaveLength(3);
      expect(r.criticRanking.length).toBeGreaterThanOrEqual(2);
      expect(typeof r.criticRec).toBe('string');
    });

    // baseline policy: seam OFF → deterministic critic, no degraded runs
    expect(res.agg.coverage).toBe(1);
    expect(res.agg.degradedRunRate === 0 || res.agg.degradedRunRate === null).toBe(true);

    // assert the seam really was OFF on the merged critic
    const { request, result } = SNAPSHOT.snapshots.b01.samples[0];
    const c = await critiqueConcepts({ concepts: result.concepts, strategy: result.strategy, request });
    expect(c.meta.modelUsed).toBe(false);
    expect(c.meta.deterministic).toBe(true);

    // surface the report for human review (evidence, not an assertion)
    // eslint-disable-next-line no-console
    console.log(`\n${res.report}\n`);
  });

  it('is deterministic — identical report across runs', async () => {
    const a = await runFixtureEval();
    const b = await runFixtureEval();
    expect(b.report).toBe(a.report);
  });
});
