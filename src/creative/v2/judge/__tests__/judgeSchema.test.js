import { describe, it, expect } from 'vitest';
import { validateJudgeOutput, JUDGE_VERSION, MAX_RATIONALE, DIMENSION_KEYS, FLAG_KEYS } from '../judgeSchema.js';

const fullDims = (v = 0.5) => Object.fromEntries(DIMENSION_KEYS.map((k) => [k, v]));
const fullFlags = (v = false) => Object.fromEntries(FLAG_KEYS.map((k) => [k, v]));
const validRaw = (over = {}) => ({
  conceptId: 'concept-1',
  dimensions: fullDims(0.5),
  flags: fullFlags(false),
  nearDuplicateOf: [],
  rationale: 'ok',
  confidence: 0.4,
  ...over,
});

describe('judgeSchema.validateJudgeOutput — strict contract', () => {
  it('accepts a valid output and normalizes it', () => {
    const r = validateJudgeOutput(validRaw(), { conceptId: 'concept-1' });
    expect(r.ok).toBe(true);
    expect(r.conceptId).toBe('concept-1');
    expect(r.judgeVersion).toBe(JUDGE_VERSION);
    expect(r.deterministic).toBe(false);
    expect(Object.keys(r.dimensions).sort()).toEqual([...DIMENSION_KEYS].sort());
    expect(Object.keys(r.flags).sort()).toEqual([...FLAG_KEYS].sort());
  });

  it('accepts a JSON STRING (and tolerates a code-fence wrapper)', () => {
    const s = '```json\n' + JSON.stringify(validRaw()) + '\n```';
    expect(validateJudgeOutput(s, { conceptId: 'concept-1' }).ok).toBe(true);
  });

  it('degrades on invalid JSON / non-object — never throws', () => {
    expect(validateJudgeOutput('not json', { conceptId: 'c' })).toMatchObject({ ok: false, degraded: true });
    expect(validateJudgeOutput(null)).toMatchObject({ ok: false, degraded: true });
    expect(validateJudgeOutput(42)).toMatchObject({ ok: false, degraded: true });
    expect(validateJudgeOutput([])).toMatchObject({ ok: false, degraded: true });
  });

  it('degrades on missing dimension or flag keys', () => {
    const d = validRaw(); delete d.dimensions.originality;
    expect(validateJudgeOutput(d, { conceptId: 'c' })).toMatchObject({ ok: false, reason: 'missing_dimension:originality' });
    const f = validRaw(); delete f.flags.strangeButStrong;
    expect(validateJudgeOutput(f, { conceptId: 'c' })).toMatchObject({ ok: false, reason: 'missing_flag:strangeButStrong' });
  });

  it('degrades on UNKNOWN dimension / flag keys (strict shape)', () => {
    expect(validateJudgeOutput(validRaw({ dimensions: { ...fullDims(), foo: 0.1 } }), { conceptId: 'c' })).toMatchObject({ ok: false, reason: 'unknown_dimension:foo' });
    expect(validateJudgeOutput(validRaw({ flags: { ...fullFlags(), bar: true } }), { conceptId: 'c' })).toMatchObject({ ok: false, reason: 'unknown_flag:bar' });
  });

  it('clamps numeric dimensions and confidence into 0..1', () => {
    const r = validateJudgeOutput(validRaw({ dimensions: { ...fullDims(), originality: 1.9, briefRelevance: -3 }, confidence: 5 }), { conceptId: 'c' });
    expect(r.ok).toBe(true);
    expect(r.dimensions.originality).toBe(1);
    expect(r.dimensions.briefRelevance).toBe(0);
    expect(r.confidence).toBe(1);
  });

  it('bounds rationale length to MAX_RATIONALE', () => {
    const r = validateJudgeOutput(validRaw({ rationale: 'x'.repeat(MAX_RATIONALE + 50) }), { conceptId: 'c' });
    expect(r.rationale.length).toBe(MAX_RATIONALE);
  });

  it('REJECTS selection-leakage keys (no ranking / recommendedConceptId / bestConceptId)', () => {
    for (const k of ['recommendedConceptId', 'bestConceptId', 'ranking', 'composite', 'score']) {
      expect(validateJudgeOutput(validRaw({ [k]: 'x' }), { conceptId: 'c' })).toMatchObject({ ok: false, reason: `forbidden_key:${k}` });
    }
  });

  it('a valid output carries NO ranking/recommendedConceptId/bestConceptId fields', () => {
    const r = validateJudgeOutput(validRaw(), { conceptId: 'concept-1' });
    for (const k of ['ranking', 'recommendedConceptId', 'bestConceptId', 'composite', 'rank', 'survivors']) {
      expect(r).not.toHaveProperty(k);
    }
  });

  it('degrades when conceptId is absent everywhere; opts.conceptId overrides raw', () => {
    const noId = validRaw(); delete noId.conceptId;
    expect(validateJudgeOutput(noId)).toMatchObject({ ok: false, reason: 'missing_conceptId' });
    expect(validateJudgeOutput(validRaw({ conceptId: 'raw-id' }), { conceptId: 'opts-id' }).conceptId).toBe('opts-id');
  });
});
