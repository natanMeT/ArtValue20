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
