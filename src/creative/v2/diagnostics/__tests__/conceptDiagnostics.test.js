import { describe, it, expect } from 'vitest';
import { diagnoseConcept, diagnoseConcepts, DIAGNOSTICS_VERSION } from '../conceptDiagnostics.js';
import { GENERIC_HERO_FALLBACK } from '../../criticTerms.js';
import { SYNTHETIC_V1 } from '../../eval/fixtures/syntheticV1.js';

// ===================================================================
// Phase 0A diagnostics — OFFLINE, deterministic, runtime-inert. These tests prove:
//   • the fixed output shape (10 signals, notes, warnings) and NO selection output
//   • each Standard-v1 rule is encoded
//   • the KNOWN failure regressions are covered
//   • determinism + no false positives on the real-shaped synthetic V1 set
// ===================================================================

// A clean, strong, fully-valid canonical concept (hero echoed in the visual).
const mk = (over = {}) => ({
  id: 'concept-x',
  name: 'מרכז שליטה',
  strategicAngle: 'בידול דרך פשטות',
  emotionalTone: 'רוגע',
  coreIdea: 'מרכז שליטה אחד לעסק',
  headlineDirection: 'הכול במקום אחד',
  visualDirection: 'מגדל בקרה זוהר מעל ערפל פתקים',
  heroObject: 'glowing control tower',
  compositionDirection: 'מרכז הקומפוזיציה',
  whyItWorks: 'תחושת שליטה ושקט',
  colorDirection: ['כחול', 'לבן'],
  risks: [],
  originalityScore: 8,
  brandFitScore: 8,
  ...over,
});

const SIGNAL_KEYS = [
  'heroObjectMismatch', 'incoherentLanguage', 'genericityRisk', 'strongUnusualCandidate',
  'clientUsability', 'visualExplainability', 'nearDuplicateRisk', 'rejectRisk',
  'executionRoughButRescuable', 'posterCampaignPotential',
];

const profileOf = (concept, rest = []) => diagnoseConcepts({ concepts: [concept, ...rest] }).concepts[0];

describe('output shape — fixed, descriptive, NO selection output', () => {
  it('exposes exactly the 10 named signals + notes + warnings, in input order', () => {
    const res = diagnoseConcepts({ concepts: [mk({ id: 'a' }), mk({ id: 'b' })] });
    expect(res.ok).toBe(true);
    expect(res.version).toBe(DIAGNOSTICS_VERSION);
    expect(res.deterministic).toBe(true);
    expect(res.concepts.map((p) => p.conceptId)).toEqual(['a', 'b']);
    for (const p of res.concepts) {
      expect(Object.keys(p).sort()).toEqual(['conceptId', 'notes', 'signals', 'warnings']);
      expect(Object.keys(p.signals).sort()).toEqual([...SIGNAL_KEYS].sort());
      for (const k of SIGNAL_KEYS) {
        expect(typeof p.signals[k].score).toBe('number');
        expect(p.signals[k].score).toBeGreaterThanOrEqual(0);
        expect(p.signals[k].score).toBeLessThanOrEqual(1);
        expect(typeof p.signals[k].flag).toBe('boolean');
        expect(Array.isArray(p.signals[k].reasons)).toBe(true);
      }
      expect(Array.isArray(p.notes)).toBe(true);
      expect(Array.isArray(p.warnings)).toBe(true);
    }
  });

  // no-best / Top-1 NON-CORRUPTION: diagnostics structurally cannot drive a Top-1
  // metric because it emits no recommendation, ranking, "best", or composite score.
  it('emits no recommendation / ranking / composite — cannot corrupt selection metrics', () => {
    const res = diagnoseConcepts({ concepts: [mk({ id: 'a' }), mk({ id: 'b' }), mk({ id: 'c' })] });
    expect(Object.keys(res).sort()).toEqual(['concepts', 'deterministic', 'ok', 'version']);
    for (const forbidden of ['recommendedConceptId', 'ranking', 'best', 'top1', 'composite', 'survivors', 'rejected']) {
      expect(res).not.toHaveProperty(forbidden);
      for (const p of res.concepts) expect(p).not.toHaveProperty(forbidden);
    }
  });

  it('degrades (never throws) on empty / bad input', () => {
    expect(diagnoseConcepts({ concepts: [] })).toMatchObject({ ok: false, reason: 'no_concepts' });
    expect(diagnoseConcepts(null)).toMatchObject({ ok: false, reason: 'no_concepts' });
    expect(diagnoseConcept(undefined).conceptId).toBeUndefined();
  });
});

describe('determinism', () => {
  it('produces byte-identical output across repeated runs', () => {
    const set = { concepts: [mk({ id: 'a' }), mk({ id: 'b', heroObject: GENERIC_HERO_FALLBACK }), mk({ id: 'c', coreIdea: 'שאחטה' })] };
    expect(JSON.stringify(diagnoseConcepts(set))).toEqual(JSON.stringify(diagnoseConcepts(set)));
  });
});

describe('(rule 3) heroObjectMismatch — broken / contradictory / wrong hero is serious', () => {
  it('flags a money-tree concept whose hero is a coffee-mug', () => {
    const p = profileOf(mk({
      name: 'עץ הכסף', strategicAngle: 'צמיחה פיננסית', coreIdea: 'עץ שממנו צומחים שטרות כסף',
      headlineDirection: 'תן לכסף שלך לצמוח', visualDirection: 'עץ ירוק עם שטרות כסף תלויים כמו עלים על רקע נקי',
      heroObject: 'coffee mug', originalityScore: 8, brandFitScore: 7,
    }));
    expect(p.signals.heroObjectMismatch.flag).toBe(true);
    expect(p.signals.heroObjectMismatch.score).toBeGreaterThanOrEqual(0.6);
    expect(p.warnings.join(' ')).toMatch(/אובייקט הגיבור/);
  });

  it('flags an absent / fallback hero', () => {
    const p = profileOf(mk({ heroObject: GENERIC_HERO_FALLBACK }));
    expect(p.signals.heroObjectMismatch.flag).toBe(true);
  });

  it('flags two competing hero objects in one field', () => {
    const p = profileOf(mk({ heroObject: 'glowing tower, split desk' }));
    expect(p.signals.heroObjectMismatch.flag).toBe(true);
  });

  it('does NOT flag a clean concept whose hero is depicted in the visual', () => {
    expect(profileOf(mk()).signals.heroObjectMismatch.flag).toBe(false);
  });
});

describe('(rule 4) incoherentLanguage — broken language lowers grade; severe → reject risk', () => {
  it('flags the curated broken token שאחטה', () => {
    const p = profileOf(mk({ coreIdea: 'רעיון עם המילה שאחטה באמצע' }));
    expect(p.signals.incoherentLanguage.flag).toBe(true);
    expect(p.signals.incoherentLanguage.reasons.join(' ')).toMatch(/שאחטה/);
  });

  it('flags a structurally garbled token (3x char run) generically', () => {
    const p = profileOf(mk({ headlineDirection: 'כותרת אאא כאן' }));
    expect(p.signals.incoherentLanguage.flag).toBe(true);
  });

  it('flags a latin+hebrew mixed token generically', () => {
    const p = profileOf(mk({ name: 'כותרת bestטוב' }));
    expect(p.signals.incoherentLanguage.flag).toBe(true);
  });

  it('treats a placeholder concept as SEVERE and raises rejectRisk', () => {
    const p = profileOf(mk({ name: 'קונספט 1' }));
    expect(p.signals.incoherentLanguage.flag).toBe(true);
    expect(p.signals.incoherentLanguage.severe).toBe(true);
    expect(p.signals.rejectRisk.score).toBeGreaterThanOrEqual(0.6);
  });

  it('does NOT flag clean Hebrew copy', () => {
    expect(profileOf(mk()).signals.incoherentLanguage.flag).toBe(false);
  });
});

describe('(rule 7) genericityRisk — generic clarity is separate from creative value', () => {
  const generic = mk({
    id: 'gen', name: 'איכות מובילה', strategicAngle: 'מקצועיות', coreIdea: 'הפתרון הטוב ביותר',
    headlineDirection: 'השירות המקצועי המוביל', visualDirection: 'משרד נקי ומסודר',
    heroObject: 'clean office desk', originalityScore: 5, brandFitScore: 7,
  });

  it('flags generic vocabulary', () => {
    expect(profileOf(generic).signals.genericityRisk.flag).toBe(true);
  });

  it('a generic-but-CLEAR concept can be client-usable yet have LOW creative value', () => {
    const p = profileOf(generic);
    expect(p.signals.clientUsability.flag).toBe(true);            // clear & usable
    expect(p.signals.posterCampaignPotential.flag).toBe(false);   // but not real campaign value
    expect(p.signals.strongUnusualCandidate.flag).toBe(false);
  });

  it('does NOT over-flag a strong, specific concept', () => {
    expect(profileOf(mk()).signals.genericityRisk.flag).toBe(false);
  });
});

describe('(rule 2) strongUnusualCandidate — protect original/strange concepts', () => {
  it('flags an original, concrete, coherent concept', () => {
    const p = profileOf(mk({ originalityScore: 9 }));
    expect(p.signals.strongUnusualCandidate.flag).toBe(true);
    expect(p.signals.posterCampaignPotential.flag).toBe(true);
  });

  it('does NOT flag a low-originality generic concept (no over-promotion)', () => {
    const p = profileOf(mk({ originalityScore: 3, heroObject: GENERIC_HERO_FALLBACK, name: 'הצלחה מובטחת', coreIdea: 'הטוב ביותר' }));
    expect(p.signals.strongUnusualCandidate.flag).toBe(false);
    expect(p.signals.posterCampaignPotential.flag).toBe(false);
  });
});

describe('(rules 1 & 6) executionRoughButRescuable — strong idea, rough execution, NOT a reject', () => {
  // strong idea (orig 9, concrete hero, healthy metaphor) but rough execution:
  // one garbled token + a mixed cliché + an overlong headline.
  const roughStrong = mk({
    id: 'rough',
    originalityScore: 9, brandFitScore: 7,
    heroObject: 'single pulsing light',
    visualDirection: 'דופק אור יחיד נע על מדף אפל באלגנטיות',
    coreIdea: 'רעיון חזק עם טוקן גגג שבור',
    headlineDirection: 'זוהי כותרת ארוכה במיוחד שנמשכת והולכת ושוב נמשכת כדי לעבור בבירור ובוודאות מוחלטת את מאה ועשרים התווים המותרים לכותרת וכוללת גם את הביטוי game changer באמצע',
  });

  it('flags rough-but-rescuable and separates idea strength from execution polish', () => {
    const p = profileOf(roughStrong);
    const ex = p.signals.executionRoughButRescuable;
    expect(ex.flag).toBe(true);
    expect(ex.ideaStrength).toBeGreaterThanOrEqual(0.66);
    expect(ex.executionPolish).toBeLessThanOrEqual(0.55);
    expect(ex.ideaStrength).toBeGreaterThan(ex.executionPolish);
  });

  it('keeps rejectRisk LOW for a rough-but-strong idea (false-reject-of-best protection)', () => {
    const p = profileOf(roughStrong);
    expect(p.signals.rejectRisk.score).toBeLessThanOrEqual(0.3);
    expect(p.signals.rejectRisk.flag).toBe(false);
  });
});

describe('rejectRisk — a diagnostic RISK, conservative, structural problems dominate', () => {
  it('is HIGH for a structurally invalid concept EVEN when the idea is strong', () => {
    const p = profileOf(mk({ coreIdea: '', originalityScore: 9 })); // missing required field
    expect(p.signals.rejectRisk.score).toBeGreaterThanOrEqual(0.6);
  });

  it('is elevated for a fallback-hero generic low-originality concept', () => {
    const p = profileOf(mk({ heroObject: GENERIC_HERO_FALLBACK, name: 'הצלחה', coreIdea: 'הטוב ביותר', originalityScore: 3, brandFitScore: 4 }));
    expect(p.signals.rejectRisk.score).toBeGreaterThanOrEqual(0.6);
  });
});

describe('nearDuplicateRisk — reuses the diversity validator on the set', () => {
  it('flags both members of a near-duplicate pair, not the distinct one', () => {
    const distinct = mk({ id: 'concept-1' });
    const dupA = mk({
      id: 'concept-2', name: 'יישור שקוף', strategicAngle: 'טכנולוגיה דיסקרטית', coreIdea: 'יישור בלי שיראו',
      headlineDirection: 'אף אחד לא יבחין', visualDirection: 'קשתית שקופה מונחת על שיניים לבנות',
      heroObject: 'clear aligner', originalityScore: 8, brandFitScore: 8,
    });
    const dupB = mk({
      id: 'concept-3', name: 'יישור דיסקרטי', strategicAngle: 'טכנולוגיה דיסקרטית', coreIdea: 'יישור בלי שיראו',
      headlineDirection: 'אף אחד לא יבחין', visualDirection: 'קשתית שקופה מונחת על שיניים לבנות',
      heroObject: 'clear aligner', originalityScore: 6, brandFitScore: 6,
    });
    const res = diagnoseConcepts({ concepts: [distinct, dupA, dupB] });
    const byId = Object.fromEntries(res.concepts.map((p) => [p.conceptId, p]));
    expect(byId['concept-2'].signals.nearDuplicateRisk.flag).toBe(true);
    expect(byId['concept-3'].signals.nearDuplicateRisk.flag).toBe(true);
    expect(byId['concept-1'].signals.nearDuplicateRisk.flag).toBe(false);
  });

  it('flags nothing for three distinct concepts', () => {
    const res = diagnoseConcepts({ concepts: SYNTHETIC_V1.b01.concepts });
    expect(res.concepts.every((p) => p.signals.nearDuplicateRisk.flag === false)).toBe(true);
  });
});

describe('no false positives on the real-shaped SYNTHETIC V1 set (30 concepts)', () => {
  const all = Object.values(SYNTHETIC_V1).flatMap((b) => b.concepts);

  it('only fallback heroes trigger heroObjectMismatch; concrete heroes never false-positive', () => {
    for (const c of all) {
      const flag = profileOf(c).signals.heroObjectMismatch.flag;
      const isFallback = !c.heroObject || c.heroObject === GENERIC_HERO_FALLBACK;
      expect(flag).toBe(isFallback);
    }
  });

  it('no clean Hebrew concept is flagged as incoherent language', () => {
    for (const c of all) {
      expect(profileOf(c).signals.incoherentLanguage.flag).toBe(false);
    }
  });
});
