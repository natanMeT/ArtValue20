// Guards the REAL-run contract: when the local model rig is unavailable, the run
// must report INCOMPLETE / LOCAL_RIG_UNAVAILABLE (NOT a degraded critic run) and
// must NOT write any candidate. Skipped automatically if a rig IS configured (so
// it never triggers a slow/networked model call on a machine that has one).
import { describe, it, expect } from 'vitest';
import { useLocalLLM, isGeminiConfigured } from '../../../../lib/gemini.js';
import { runRealEval } from '../runCriticEval.js';

const rigAvailable = isGeminiConfigured && useLocalLLM;

describe('critic evaluation — real-run guard', () => {
  it.skipIf(rigAvailable)('reports INCOMPLETE / LOCAL_RIG_UNAVAILABLE and writes no candidate when the rig is absent', async () => {
    const r = await runRealEval({ timestamp: '20260626T000000Z' });
    expect(r.status).toBe('INCOMPLETE');
    expect(r.reason).toBe('LOCAL_RIG_UNAVAILABLE');
    expect(r.candidatePath).toBe(null);
    expect(r.report).toContain('INCOMPLETE');
  });

  it('requires an explicit timestamp (deterministic artifact path)', async () => {
    await expect(runRealEval({})).rejects.toThrow(/timestamp/);
  });
});
