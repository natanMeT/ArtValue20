import { describe, it, expect } from 'vitest';
import { buildPosterProductionBrief, POSTER_NO_TEXT_CONSTRAINT } from '../posterBridge.js';
import { validatePosterProductionBrief } from '../posterSchema.js';

// A realistic ProductionPackage fixture (shape per productionTypes.ts). Built fresh
// per call so mutation tests start from a pristine object.
function makePackage(over = {}) {
  return {
    campaignId: 'camp-1',
    conceptId: 'concept-1',
    tenantId: 'tenant-1',
    status: 'draft',
    creativeCore: {
      creativeMechanism: 'בידול דרך פשטות',
      visualMetaphor: 'מגדל בקרה זוהר מעל עיר',
      wordplayDirection: 'הכול במקום אחד',
      surpriseMechanism: 'מרכז שליטה אחד לעסק',
      heroObject: 'glowing control tower',
      memoryHook: 'תחושת שליטה',
      genericityRisk: { level: 'medium', score: 2, reasons: ['שפה גנרית'] },
    },
    copyPackage: {
      headline: 'הכול במקום אחד',
      subline: 'מרכז שליטה אחד לכל העסק',
      cta: 'דברו איתנו',
      bodyVariants: ['נהל את כל העסק ממקום אחד'],
      copyWarning: null,
    },
    visualBrief: {
      heroObject: 'glowing control tower',
      vibe: 'שליטה רגועה',
      palette: ['כחול עמוק', 'זהב'],
      compositionNote: 'מוקד יחיד במרכז',
      do: ['נקודת מיקוד אחת ודומיננטית', 'ניגודיות גבוהה'],
      dont: ['סטוק גנרי', 'text, letters'],
    },
    imagePrompt: {
      promptEn: 'Premium advertising key visual. Single dominant hero object: glowing control tower.',
      negativeEn: 'text, letters, words, typography, captions, watermark, logo, signature, label, lettering, numbers',
      aspect: '4:5',
    },
    ...over,
  };
}

describe('buildPosterProductionBrief — deterministic composer', () => {
  it('1. produces deterministic output: same input → identical output', () => {
    const pkg = makePackage();
    const a = buildPosterProductionBrief(pkg);
    const b = buildPosterProductionBrief(pkg);
    expect(a).toEqual(b);
  });

  it('2. does not mutate the input package', () => {
    const pkg = makePackage();
    const snapshot = JSON.parse(JSON.stringify(pkg));
    buildPosterProductionBrief(pkg);
    expect(pkg).toEqual(snapshot);
  });

  it('3. carries campaignId/conceptId/tenantId unchanged', () => {
    const brief = buildPosterProductionBrief(makePackage());
    expect(brief.campaignId).toBe('camp-1');
    expect(brief.conceptId).toBe('concept-1');
    expect(brief.tenantId).toBe('tenant-1');
    expect(brief.status).toBe('draft');
  });

  it('4. format.aspect mirrors imagePrompt.aspect', () => {
    expect(buildPosterProductionBrief(makePackage()).format.aspect).toBe('4:5');
    const wide = makePackage({ imagePrompt: { ...makePackage().imagePrompt, aspect: '16:9' } });
    expect(buildPosterProductionBrief(wide).format.aspect).toBe('16:9');
    expect(buildPosterProductionBrief(wide).imageDirection.aspect).toBe('16:9');
  });

  it('5. sizeHint is derived deterministically from aspect', () => {
    const sz = (aspect) => buildPosterProductionBrief(makePackage({ imagePrompt: { promptEn: 'x', negativeEn: 'no text', aspect } })).format.sizeHint;
    expect(sz('1:1')).toBe('square');
    expect(sz('4:5')).toBe('portrait');
    expect(sz('9:16')).toBe('tall-portrait');
    expect(sz('16:9')).toBe('landscape');
  });

  it('6. typography maps headline/subheadline/cta in order', () => {
    const { levels } = buildPosterProductionBrief(makePackage()).typography;
    expect(levels.map((l) => l.role)).toEqual(['headline', 'subheadline', 'cta']);
    expect(levels[0].text).toBe('הכול במקום אחד');
    expect(levels[1].text).toBe('מרכז שליטה אחד לכל העסק');
    expect(levels[2].text).toBe('דברו איתנו');
  });

  it('7. headline fallback is never empty', () => {
    const pkg = makePackage({ copyPackage: { headline: '', subline: '', cta: '', bodyVariants: [''], copyWarning: null } });
    const brief = buildPosterProductionBrief(pkg);
    expect(brief.messaging.headline.length).toBeGreaterThan(0);
    expect(brief.typography.levels[0].role).toBe('headline');
    expect(brief.typography.levels[0].text.length).toBeGreaterThan(0);
  });

  it('8. messaging derives from copyPackage', () => {
    const m = buildPosterProductionBrief(makePackage()).messaging;
    expect(m).toEqual({
      headline: 'הכול במקום אחד',
      subheadline: 'מרכז שליטה אחד לכל העסק',
      cta: 'דברו איתנו',
      bodyHint: 'נהל את כל העסק ממקום אחד',
    });
  });

  it('9. imageDirection.promptEn passes through unchanged', () => {
    const pkg = makePackage();
    const brief = buildPosterProductionBrief(pkg);
    expect(brief.imageDirection.promptEn).toBe(pkg.imagePrompt.promptEn);
  });

  it('11. avoidList always includes the no-text constraint', () => {
    const brief = buildPosterProductionBrief(makePackage());
    expect(brief.avoidList).toContain(POSTER_NO_TEXT_CONSTRAINT);
    expect(brief.avoidList.some((x) => /no\s+text/i.test(x))).toBe(true);
  });

  it('12. avoidList merges negativeEn + visualBrief.dont and dedupes', () => {
    // duplicate the no-text constraint + a repeated dont entry to prove de-dup
    const pkg = makePackage({
      visualBrief: { ...makePackage().visualBrief, dont: ['סטוק גנרי', 'סטוק גנרי', POSTER_NO_TEXT_CONSTRAINT] },
    });
    const { avoidList } = buildPosterProductionBrief(pkg);
    expect(avoidList).toContain(pkg.imagePrompt.negativeEn);
    expect(avoidList).toContain('סטוק גנרי');
    expect(avoidList).toContain(POSTER_NO_TEXT_CONSTRAINT);
    // no duplicates
    expect(new Set(avoidList).size).toBe(avoidList.length);
    expect(avoidList.filter((x) => x === 'סטוק גנרי').length).toBe(1);
    expect(avoidList.filter((x) => x === POSTER_NO_TEXT_CONSTRAINT).length).toBe(1);
  });

  it('13. colorMoodLighting maps palette and mood', () => {
    const cml = buildPosterProductionBrief(makePackage()).colorMoodLighting;
    expect(cml.palette).toEqual(['כחול עמוק', 'זהב']);
    expect(cml.mood).toBe('שליטה רגועה');
    expect(typeof cml.lightingHint).toBe('string');
  });

  it('14. compositionNotes map compositionNote + do', () => {
    const notes = buildPosterProductionBrief(makePackage()).compositionNotes;
    expect(notes).toContain('מוקד יחיד במרכז');
    expect(notes).toContain('נקודת מיקוד אחת ודומיננטית');
    expect(notes).toContain('ניגודיות גבוהה');
  });

  it('15. productionRisks include genericityRisk and copyWarning when present', () => {
    const withWarn = makePackage({
      copyPackage: { ...makePackage().copyPackage, copyWarning: 'הקופי עדיין כולל ביטויים גנריים' },
    });
    const risks = buildPosterProductionBrief(withWarn).productionRisks;
    const types = risks.map((r) => r.type);
    expect(types).toContain('genericity');
    expect(types).toContain('copy');
    const gr = risks.find((r) => r.type === 'genericity');
    expect(gr.level).toBe('medium');
    // no copyWarning → only the genericity risk
    const noWarn = buildPosterProductionBrief(makePackage()).productionRisks;
    expect(noWarn.map((r) => r.type)).toEqual(['genericity']);
  });

  it('16. validatePosterProductionBrief accepts the built output', () => {
    const res = validatePosterProductionBrief(buildPosterProductionBrief(makePackage()));
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('throws only when the package itself is missing', () => {
    expect(() => buildPosterProductionBrief(null)).toThrow();
    expect(() => buildPosterProductionBrief(makePackage())).not.toThrow();
  });
});
