import { describe, it, expect } from 'vitest';
import { buildJudgePrompt, STANDARD_V1_RULES } from '../judgePrompt.js';
import { DIMENSION_KEYS, FLAG_KEYS } from '../judgeSchema.js';

const concept = {
  id: 'concept-1', name: 'מרכז שליטה', strategicAngle: 'בידול דרך פשטות',
  coreIdea: 'מרכז שליטה אחד לעסק', headlineDirection: 'הכול במקום אחד',
  visualDirection: 'מגדל בקרה זוהר', heroObject: 'glowing control tower', whyItWorks: 'תחושת שליטה',
};
const request = { business: { name: 'Art Value', industry: 'studio' }, brand: { brandName: 'AV', audience: ['א'], tone: ['ברור'] }, campaign: { objective: 'increase_sales', targetAudience: 'בעלי עסקים', channel: 'instagram_post', format: '1:1' } };
const strategy = { businessProblem: 'בלגן', keyMessage: 'כל העסק במקום אחד' };

describe('judgePrompt.buildJudgePrompt', () => {
  it('encodes ALL ArtValue Creative Standard v1 rules', () => {
    const p = buildJudgePrompt({ request, strategy, concept });
    for (const rule of STANDARD_V1_RULES) expect(p).toContain(rule);
    expect(STANDARD_V1_RULES.length).toBe(7);
  });

  it('includes the concept fields, brief, and strategy', () => {
    const p = buildJudgePrompt({ request, strategy, concept });
    expect(p).toContain('glowing control tower');     // heroObject
    expect(p).toContain('מרכז שליטה אחד לעסק');        // coreIdea
    expect(p).toContain('Art Value');                  // brief business
    expect(p).toContain('כל העסק במקום אחד');           // strategy keyMessage
  });

  it('demands STRICT JSON in the exact schema (all dimension + flag keys)', () => {
    const p = buildJudgePrompt({ request, strategy, concept });
    expect(p).toMatch(/STRICT JSON/i);
    for (const k of DIMENSION_KEYS) expect(p).toContain(`"${k}"`);
    for (const k of FLAG_KEYS) expect(p).toContain(`"${k}"`);
    expect(p).toContain('"nearDuplicateOf"');
  });

  it('is explicitly DIAGNOSTICS-ONLY — instructs NOT to rank or pick a best', () => {
    const p = buildJudgePrompt({ request, strategy, concept });
    expect(p).toMatch(/SEMANTIC DIAGNOSTICS ONLY/);
    expect(p).toMatch(/do NOT rank/i);
    expect(p).toMatch(/do NOT pick a best/i);
    expect(p).not.toMatch(/recommendedConceptId/);
  });

  it('includes sibling summaries + near-duplicate instruction only when siblings are given', () => {
    const without = buildJudgePrompt({ request, strategy, concept });
    expect(without).not.toContain('Sibling concepts');
    const withSibs = buildJudgePrompt({ request, strategy, concept, siblings: [{ id: 'concept-2', name: 'אחר', coreIdea: 'רעיון אחר' }] });
    expect(withSibs).toContain('Sibling concepts');
    expect(withSibs).toContain('concept-2');
    expect(withSibs).toMatch(/nearDuplicateOf/);
  });
});

describe('judgePrompt — calibration v2 (stricter definitions)', () => {
  const p = buildJudgePrompt({ request, strategy, concept });

  it('includes explicit score-calibration bands and a no-default-to-high instruction', () => {
    expect(p).toMatch(/use the FULL 0\.0-1\.0 range/);
    expect(p).toContain('do NOT default to 0.8+');
    expect(p).toContain('0.0-0.2 = broken / unusable / deeply off-brief');
    expect(p).toContain('0.3-0.5 = weak / unclear / risky');
    expect(p).toContain('0.6-0.7 = acceptable but limited');
    expect(p).toContain('0.8-0.9 = strong');
    expect(p).toContain('1.0 = rare, exceptional');
    expect(p).toContain('Most concepts should NOT receive 0.8+');
  });

  it('tightens strangeButStrong (BOTH non-obvious AND poster-worthy; not mere odd wording)', () => {
    expect(p).toContain('strangeButStrong: fire ONLY when the concept is BOTH genuinely non-obvious AND poster/campaign-worthy');
    expect(p).toContain('Do NOT fire merely because the wording is unusual');
  });

  it('tightens roughButRescuable (strong core idea, flawed execution only)', () => {
    expect(p).toContain('roughButRescuable: fire ONLY when the core idea is strong/usable but execution');
    expect(p).toContain('Do NOT fire when the idea itself is incoherent, off-brief, generic, or reject-level');
  });

  it('tightens semanticHeroMismatch (clear contradiction; serious negative; explainable metaphor is fine)', () => {
    expect(p).toContain('semanticHeroMismatch: fire ONLY when the hero object clearly contradicts');
    expect(p).toContain('SERIOUS negative diagnostic');
    expect(p).toContain('a metaphor that remains explainable');
  });

  it('makes incoherentMeaning usable (a fluent sentence can still be incoherent; no total unreadability)', () => {
    expect(p).toContain('A fluent sentence can still be incoherent');
    expect(p).toContain('Do NOT require total unreadability');
  });

  it('makes offBriefContamination usable (different problem / wrong audience / wrong category)', () => {
    expect(p).toContain('offBriefContamination: fire when the concept appears to solve a DIFFERENT business problem');
    expect(p).toContain('Do NOT fire for harmless supporting details');
  });

  it('clarifies genericButUsable (expected/conventional; avoid double-flag with strangeButStrong)', () => {
    expect(p).toContain('genericButUsable: fire when the concept is clear and client-safe but expected, conventional, category-standard');
    expect(p).toContain('Do NOT mark the same concept as BOTH genericButUsable AND strangeButStrong');
  });

  it('remains diagnostics-only — no ranking, no best, no recommendation', () => {
    expect(p).toMatch(/SEMANTIC DIAGNOSTICS ONLY/);
    expect(p).toMatch(/do NOT rank/i);
    expect(p).toMatch(/do NOT pick a best/i);
    expect(p).not.toMatch(/recommendedConceptId/);
    expect(p).not.toMatch(/bestConceptId/);
  });

  it('leaves the schema dimension/flag keys unchanged (calibration must not alter the contract)', () => {
    expect(DIMENSION_KEYS).toEqual(['briefRelevance', 'heroCoherence', 'meaningCoherence', 'originality', 'posterPotential', 'clientUsability']);
    expect(FLAG_KEYS).toEqual(['semanticHeroMismatch', 'incoherentMeaning', 'offBriefContamination', 'genericButUsable', 'strangeButStrong', 'roughButRescuable']);
    for (const k of DIMENSION_KEYS) expect(p).toContain(`"${k}"`);
    for (const k of FLAG_KEYS) expect(p).toContain(`"${k}"`);
  });
});
