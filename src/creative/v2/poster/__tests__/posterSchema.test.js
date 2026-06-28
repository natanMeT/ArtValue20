import { describe, it, expect } from 'vitest';
import { buildPosterProductionBrief, POSTER_NO_TEXT_CONSTRAINT } from '../posterBridge.js';
import { validatePosterProductionBrief } from '../posterSchema.js';

// A valid brief = the deterministic output of the bridge over a minimal package.
function makePackage() {
  return {
    campaignId: 'camp-1', conceptId: 'concept-1', tenantId: 'tenant-1', status: 'draft',
    creativeCore: {
      creativeMechanism: 'm', visualMetaphor: 'glowing tower', wordplayDirection: 'w',
      surpriseMechanism: 's', heroObject: 'glowing control tower', memoryHook: 'h',
      genericityRisk: { level: 'low', score: 0, reasons: [] },
    },
    copyPackage: { headline: 'כותרת', subline: 'תת', cta: 'פעולה', bodyVariants: ['גוף'], copyWarning: null },
    visualBrief: { heroObject: 'glowing control tower', vibe: 'calm', palette: ['blue'], compositionNote: 'center', do: ['contrast'], dont: ['stock'] },
    imagePrompt: { promptEn: 'Premium key visual. Hero: glowing control tower.', negativeEn: 'text, letters', aspect: '4:5' },
  };
}
const validBrief = () => buildPosterProductionBrief(makePackage());

describe('validatePosterProductionBrief', () => {
  it('17a. accepts a well-formed brief', () => {
    const res = validatePosterProductionBrief(validBrief());
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('never throws on bad input; returns an explicit invalid result', () => {
    for (const bad of [null, undefined, 42, 'x', [], true]) {
      const res = validatePosterProductionBrief(bad);
      expect(res.ok).toBe(false);
      expect(Array.isArray(res.errors)).toBe(true);
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects missing campaignId / conceptId', () => {
    const b1 = validBrief(); delete b1.campaignId;
    expect(validatePosterProductionBrief(b1).ok).toBe(false);
    const b2 = validBrief(); b2.conceptId = '';
    expect(validatePosterProductionBrief(b2).ok).toBe(false);
  });

  it('rejects missing required sections', () => {
    for (const key of ['format', 'layout', 'heroPlacement', 'typography', 'messaging', 'imageDirection', 'colorMoodLighting']) {
      const b = validBrief(); delete b[key];
      const res = validatePosterProductionBrief(b);
      expect(res.ok, `missing ${key} should be invalid`).toBe(false);
    }
  });

  it('10. rejects Hebrew characters in imageDirection.promptEn (English-only contract)', () => {
    const b = validBrief(); b.imageDirection.promptEn = 'מגדל בקרה';
    const res = validatePosterProductionBrief(b);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /English only/i.test(e))).toBe(true);
  });

  it('rejects missing imageDirection.promptEn', () => {
    const b = validBrief(); b.imageDirection.promptEn = '';
    expect(validatePosterProductionBrief(b).ok).toBe(false);
  });

  it('rejects an avoidList missing the no-text constraint', () => {
    const b = validBrief();
    b.avoidList = b.avoidList.filter((x) => x !== POSTER_NO_TEXT_CONSTRAINT && !/no\s+text/i.test(x));
    const res = validatePosterProductionBrief(b);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /no-text/i.test(e))).toBe(true);
  });

  it('rejects malformed layout / regions', () => {
    const b1 = validBrief(); b1.layout.regions = [];
    expect(validatePosterProductionBrief(b1).ok).toBe(false);
    const b2 = validBrief(); b2.layout.regions = [{ name: '', role: '' }];
    expect(validatePosterProductionBrief(b2).ok).toBe(false);
    const b3 = validBrief(); b3.layout.structure = '';
    expect(validatePosterProductionBrief(b3).ok).toBe(false);
  });

  it('rejects malformed typography levels', () => {
    const b1 = validBrief(); b1.typography.levels = [];
    expect(validatePosterProductionBrief(b1).ok).toBe(false);
    const b2 = validBrief(); b2.typography.levels = [{ role: 'banner', text: 'x', emphasisHint: 'y' }];
    expect(validatePosterProductionBrief(b2).ok).toBe(false);
    const b3 = validBrief(); b3.typography.levels[0].role = 'cta'; // first must be headline
    expect(validatePosterProductionBrief(b3).ok).toBe(false);
  });

  it('rejects malformed productionRisks', () => {
    const b1 = validBrief(); b1.productionRisks = [{ type: 'unknown', level: 'low', note: 'x' }];
    expect(validatePosterProductionBrief(b1).ok).toBe(false);
    const b2 = validBrief(); b2.productionRisks = [{ type: 'genericity', level: 'extreme', note: 'x' }];
    expect(validatePosterProductionBrief(b2).ok).toBe(false);
    const b3 = validBrief(); b3.productionRisks = 'not-an-array';
    expect(validatePosterProductionBrief(b3).ok).toBe(false);
  });

  it("17b. rejects a wrong status (must be 'draft')", () => {
    const b = validBrief(); b.status = 'saved';
    expect(validatePosterProductionBrief(b).ok).toBe(false);
  });
});
