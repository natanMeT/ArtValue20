// ===================================================================
// conceptDiagnostics — OFFLINE, RUNTIME-INERT diagnostics for Creative V2 concepts.
//
// WHAT THIS IS (Phase 0A): a pure, deterministic layer that PROFILES each canonical
// concept across a fixed set of advisory signals aligned with "ArtValue Creative
// Standard v1". It is diagnostics INFRASTRUCTURE only.
//
// WHAT THIS IS NOT:
//   • NOT wired into runtime — no runtime module imports this folder, so it has ZERO
//     runtime impact (it never loads during the app).
//   • NOT a replacement for conceptCritic — it does not score-to-select, rerank,
//     reject, or recommend. There is intentionally NO single selection-driving score
//     and NO `recommendedConceptId` / `ranking` in the output.
//   • NOT a mutation of any V1 / critic behavior, thresholds, or the model seam.
//
// It READS concepts and returns a SEPARATE descriptive profile per concept, in the
// INPUT order. Pure (no mutation of inputs), deterministic (no clock / randomness),
// and never throws (degrades to { ok:false }), mirroring the critic's discipline.
//
// Standard v1 rules encoded (see README of this slice / the brief):
//   1. Don't reject a strong idea only because execution/language is rough.
//   2. Prefer original/strange concepts with visual/poster/campaign potential.
//   3. A broken or contradictory hero object is serious.
//   4. Broken language lowers grade; if it makes the concept structurally
//      incoherent, raise reject RISK.
//   5. `best` = real client/poster/campaign potential, not merely least-broken.
//   6. Separate "idea strength" from "execution polish".
//   7. Separate "generic clarity" from "creative value".
// ===================================================================
import { validateConceptShape } from '../schema.js';
import { validateConceptDiversity } from '../diversity.js';
import {
  GENERIC_HERO_FALLBACK, GENERIC_TERMS, MIXED_CLICHE, CLICHE_PHRASES,
  PLACEHOLDER_PATTERNS, HERO_SEPARATORS, CONTRAST_MARKERS, CRITIC_THRESHOLDS as T,
} from '../criticTerms.js';
import { DIAGNOSTIC_THRESHOLDS as D, OBJECT_LEXICON, INCOHERENT_TOKENS } from './diagnosticsTerms.js';

export const DIAGNOSTICS_VERSION = 'concept-diagnostics-v1';

// ---- pure helpers (local; the critic's are not exported, so we do not import them) ----
const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const str = (v) => String(v == null ? '' : v).trim();
const num = (v, d = NaN) => (Number.isFinite(Number(v)) ? Number(v) : d);
const TOKEN_RE = /[a-z0-9֐-׿]+/gi;
const tokenList = (s) => str(s).toLowerCase().match(TOKEN_RE) || [];
const tokenSet = (s) => new Set(tokenList(s));
const includesAny = (text, terms) => terms.filter((term) => text.includes(term));
const matchesAny = (text, regexes) => regexes.some((re) => re.test(text));
const isFallbackHero = (hero) => !hero || hero === GENERIC_HERO_FALLBACK;
const signal = (score, flag, reasons = []) => ({ score: clamp01(score), flag: !!flag, reasons });

// Final-form Hebrew letters; valid ONLY as the last char of a token.
const FINAL_FORMS = new Set(['ך', 'ם', 'ן', 'ף', 'ץ']);
const HEBREW_RE = /[֐-׿]/;
const LATIN_RE = /[a-z]/i;

// Concatenate the descriptive surface of a concept (for vocabulary / object scans).
function descriptiveBlob(concept) {
  return ['name', 'strategicAngle', 'coreIdea', 'headlineDirection', 'visualDirection', 'whyItWorks']
    .map((k) => str(concept[k])).filter(Boolean).join(' \n ');
}

// healthy metaphor = enough substance, not too thin, not overloaded/abstract. 0..1.
function metaphorHealth(visualDirection) {
  const vd = str(visualDirection);
  if (!vd) return 0;
  const toks = tokenSet(vd).size;
  if (toks < T.METAPHOR_THIN_TOKENS) return 0.3;          // thin
  if (vd.length > T.METAPHOR_OVERLOAD_CHARS) return 0.4;  // overloaded / abstract
  return 1;
}

// Count an explicit ENUMERATION of >= `min` SHORT (1–3 token) noun phrases in a
// field. Conservative — prose with an incidental comma is not an enumeration (mirrors
// the critic's sceneObjects rule). Used for both the hero field and the visual scene.
function enumeratedObjects(text) {
  const src = str(text);
  if (!src) return 0;
  const segs = src.split(HERO_SEPARATORS).map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return 1;
  const short = segs.filter((s) => {
    const n = (s.toLowerCase().match(TOKEN_RE) || []).length;
    return n >= 1 && n <= 3;
  });
  return short.length >= 2 ? short.length : 1;
}

// Which OBJECT_LEXICON keys are named in a token set (by any synonym).
function recognizedObjects(tokens) {
  const keys = new Set();
  for (const entry of OBJECT_LEXICON) {
    if (entry.syn.some((s) => tokens.has(s))) keys.add(entry.key);
  }
  return keys;
}

// ---- structural language coherence ----
// Returns { brokenTokens:[], placeholder:bool, mixedCliche:bool }.
function languageBreakage(concept) {
  const broken = new Set();
  // structural garble across the whole descriptive surface
  for (const tok of tokenList(descriptiveBlob(concept))) {
    if (INCOHERENT_TOKENS.includes(tok)) { broken.add(tok); continue; }
    if (LATIN_RE.test(tok) && HEBREW_RE.test(tok)) { broken.add(tok); continue; } // latin+hebrew in one token
    if (/(.)\1\1/.test(tok)) { broken.add(tok); continue; }                        // 3x char run
    // final-form letter followed by a Hebrew BASE letter (real orthographic garble).
    // A geresh/gershayim or digit after a final form is legitimate (e.g. בראנץ׳).
    for (let i = 0; i < tok.length - 1; i += 1) {
      if (FINAL_FORMS.has(tok[i]) && /[א-ת]/.test(tok[i + 1])) { broken.add(tok); break; }
    }
  }
  const nameish = ['name', 'headlineDirection', 'coreIdea'].map((k) => str(concept[k]));
  const placeholder = nameish.some((v) => matchesAny(v, PLACEHOLDER_PATTERNS));
  const mixedCliche = matchesAny(descriptiveBlob(concept), MIXED_CLICHE);
  return { brokenTokens: [...broken], placeholder, mixedCliche };
}

// ---- individual signal scorers (each returns { score, flag, reasons }) ----

// (3) heroObjectMismatch — a broken/absent/contradictory hero, or a hero that does
// not match the depicted object (recognition-gated cross-check).
function scoreHeroObjectMismatch(concept) {
  const hero = str(concept.heroObject);
  const reasons = [];
  if (isFallbackHero(hero)) return signal(0.9, true, ['אובייקט גיבור חסר/חלופי (לא קונקרטי)']);

  // contradictory hero: two+ competing objects, or a contrast inside the hero field
  if (enumeratedObjects(hero) >= 2) reasons.push('שני אובייקטי גיבור מתחרים בשדה אחד');
  if (matchesAny(hero, CONTRAST_MARKERS)) reasons.push('סתירה פנימית בתוך אובייקט הגיבור');
  if (reasons.length) return signal(0.7, true, reasons);

  // recognition-gated mismatch: hero is a known object, none of its synonyms appear
  // in the descriptive text, but a DIFFERENT known object IS named there.
  const heroTokens = tokenSet(hero);
  const heroKeys = recognizedObjects(heroTokens);
  if (heroKeys.size) {
    const textTokens = tokenSet(descriptiveBlob(concept));
    const heroEchoed = OBJECT_LEXICON.some((e) => heroKeys.has(e.key) && e.syn.some((s) => textTokens.has(s)));
    if (!heroEchoed) {
      const textKeys = recognizedObjects(textTokens);
      const others = [...textKeys].filter((k) => !heroKeys.has(k));
      if (others.length) {
        return signal(0.8, true, [`אובייקט הגיבור (${[...heroKeys].join('/')}) אינו האובייקט המתואר (${others.join('/')})`]);
      }
    }
  }
  return signal(0, false, []);
}

// (4) incoherentLanguage — broken language lowers grade; severe = structurally
// incoherent (placeholder or multiple broken tokens). `severe` drives rejectRisk.
function scoreIncoherentLanguage(breakage) {
  const reasons = [];
  let pts = 0;
  if (breakage.brokenTokens.length) {
    pts += Math.min(breakage.brokenTokens.length, 2);
    reasons.push(`טוקנים שבורים/לא קוהרנטיים: ${breakage.brokenTokens.join(', ')}`);
  }
  if (breakage.placeholder) { pts += 2; reasons.push('שפה תבניתית (placeholder) ללא תוכן ממשי'); }
  if (breakage.mixedCliche) { pts += 1; reasons.push('סלוגן אנגלי בתוך עברית'); }
  const severe = breakage.placeholder || breakage.brokenTokens.length >= 2;
  const sig = signal(pts / 4, pts > 0, reasons);
  sig.severe = severe;
  return sig;
}

// (7, generic clarity) genericityRisk — mirrors the critic's deterministic
// genericity scorer (generic vocabulary / fallback hero / low originality).
function scoreGenericityRisk(concept) {
  const reasons = [];
  let pts = 0;
  const blob = descriptiveBlob(concept) + ' ' + str(concept.whyItWorks);
  if (isFallbackHero(str(concept.heroObject))) { pts += 2; reasons.push('אובייקט גיבור גנרי/חלופי'); }
  const hits = [...new Set(includesAny(blob, GENERIC_TERMS))];
  if (hits.length) { pts += Math.min(hits.length, 3); reasons.push(`שפה גנרית: ${hits.join(', ')}`); }
  if (matchesAny(blob, MIXED_CLICHE)) { pts += 2; reasons.push('סלוגן אנגלי בתוך עברית'); }
  const cliche = [...new Set(includesAny([concept.name, concept.headlineDirection, concept.coreIdea].map(str).join(' \n '), CLICHE_PHRASES))];
  if (cliche.length) { pts += 1; reasons.push(`ביטויים קלישאתיים: ${cliche.join(', ')}`); }
  const orig = num(concept.originalityScore);
  if (Number.isFinite(orig) && orig < 6) { pts += 2; reasons.push('ציון מקוריות נמוך מהמנוע'); }
  return signal(pts / 8, pts / 8 >= D.GENERICITY_FLAG, reasons);
}

// ---- public per-concept profile (nearDuplicateRisk is injected by diagnoseConcepts) ----
function buildProfile(concept, nearDup) {
  const shapeErrors = validateConceptShape(concept, 'concept');
  const heroConcrete = isFallbackHero(str(concept.heroObject)) ? 0 : 1;
  const mHealth = metaphorHealth(concept.visualDirection);
  const origNorm = clamp01(num(concept.originalityScore, 5) / T.V1_SCORE_MAX);

  const breakage = languageBreakage(concept);
  const heroObjectMismatch = scoreHeroObjectMismatch(concept);
  const incoherentLanguage = scoreIncoherentLanguage(breakage);
  const genericityRisk = scoreGenericityRisk(concept);

  const sceneOverload = enumeratedObjects(concept.visualDirection) >= T.OVERLOAD_REJECT_OBJECTS;

  // field completeness + headline sanity → execution polish + clarity
  const required = ['name', 'strategicAngle', 'emotionalTone', 'coreIdea', 'headlineDirection', 'visualDirection', 'heroObject', 'whyItWorks'];
  const completeness = required.filter((k) => str(concept[k])).length / required.length;
  const headlineOk = str(concept.headlineDirection).length <= 120 ? 1 : 0.5;
  const languageCoherence = clamp01(1 - incoherentLanguage.score);

  // (6) idea strength vs execution polish — kept as SEPARATE transparent measures,
  // never combined into a selection score. executionPolish is penalty-based so that
  // ROUGH language / headline can pull it low WITHOUT the concept being structurally
  // invalid — that decoupling is exactly what rule 1 ("don't reject a strong idea
  // only because execution is rough") needs.
  const ideaStrength = clamp01(0.55 * origNorm + 0.25 * heroConcrete + 0.20 * mHealth);
  let polishPenalty = Math.min(breakage.brokenTokens.length, 2) * 0.2;
  if (breakage.mixedCliche) polishPenalty += 0.15;
  if (headlineOk < 1) polishPenalty += 0.15;
  polishPenalty += (1 - completeness) * 0.5;
  const executionPolish = clamp01(1 - polishPenalty);

  // single-hero discipline (concrete + not overloaded)
  const singleHeroDiscipline = heroConcrete && !sceneOverload ? 1 : (heroConcrete ? 0.4 : 0.2);

  // (2) strongUnusualCandidate — original + concrete single hero + coherent metaphor
  // + not dominated by genericity. A positive opportunity signal.
  const strongQualifies = origNorm >= D.STRONG_UNUSUAL_ORIGINALITY && heroConcrete === 1
    && !sceneOverload && mHealth >= 0.6 && genericityRisk.score < D.GENERICITY_FLAG;
  const strongUnusualCandidate = signal(
    strongQualifies ? clamp01(0.7 + 0.3 * origNorm) : clamp01(0.5 * origNorm),
    strongQualifies,
    strongQualifies ? ['מקורי/בלתי שגרתי עם אובייקט גיבור קונקרטי ומטאפורה קוהרנטית'] : [],
  );

  // (7) clientUsability — clear & safe to hand a client/poster. EXPLICITLY separate
  // from creative value: a generic-but-clear concept can score well here yet have low
  // posterCampaignPotential.
  const clientUsability = signal(
    0.35 * completeness + 0.25 * headlineOk + 0.20 * heroConcrete + 0.20 * languageCoherence,
    (0.35 * completeness + 0.25 * headlineOk + 0.20 * heroConcrete + 0.20 * languageCoherence) >= D.CLIENT_USABILITY_OK,
    [],
  );

  // visualExplainability — can the visual be rendered/explained cleanly?
  const veScore = 0.5 * heroConcrete + 0.4 * mHealth + 0.1 * (str(concept.visualDirection) ? 1 : 0);
  const visualExplainability = signal(veScore, veScore >= D.VISUAL_EXPLAINABLE_OK,
    sceneOverload ? ['ריבוי אובייקטים מקשה על המחשה ויזואלית'] : []);

  // (5) posterCampaignPotential — real poster/campaign pull (NOT least-broken). High
  // when original + concrete striking metaphor; reduced by genericity.
  const striking = matchesAny(str(concept.visualDirection), CONTRAST_MARKERS) ? 1
    : (str(concept.emotionalTone) && str(concept.emotionalTone) !== 'טון רגשי' ? 0.5 : 0.2);
  let posterScore = 0.4 * origNorm + 0.2 * heroConcrete + 0.2 * mHealth + 0.2 * striking;
  if (genericityRisk.score >= D.GENERICITY_FLAG) posterScore -= 0.2;
  const posterCampaignPotential = signal(posterScore, posterScore >= D.POSTER_POTENTIAL_HIGH, []);

  // (1, 6) executionRoughButRescuable — strong idea + rough execution + not
  // structurally invalid/placeholder. The counter-signal to rejectRisk.
  const structurallyInvalid = shapeErrors.length > 0 || incoherentLanguage.severe;
  const rescuable = ideaStrength >= D.IDEA_STRENGTH_HIGH
    && executionPolish <= D.EXECUTION_POLISH_LOW
    && shapeErrors.length === 0 && !incoherentLanguage.severe;
  const executionRoughButRescuable = signal(
    rescuable ? clamp01(ideaStrength * (1 - executionPolish)) : 0,
    rescuable,
    rescuable ? ['רעיון חזק עם ביצוע/שפה גסים — שווה ליטוש, לא לפסילה'] : [],
  );
  executionRoughButRescuable.ideaStrength = clamp01(ideaStrength);
  executionRoughButRescuable.executionPolish = clamp01(executionPolish);

  // rejectRisk — a diagnostic RISK, NOT a reject decision. Conservative: structural
  // problems dominate; rough-but-strong ideas are explicitly de-risked (rules 1 & 2),
  // EXCEPT when structurally invalid/placeholder (a broken concept can't be rendered).
  const rejectReasons = [];
  let rejectScore = 0;
  if (shapeErrors.length) { rejectScore = Math.max(rejectScore, 0.9); rejectReasons.push('קונספט לא תקין מבנית'); }
  if (breakage.placeholder) { rejectScore = Math.max(rejectScore, 0.85); rejectReasons.push('קונספט תבניתי (placeholder)'); }
  if (incoherentLanguage.severe && !breakage.placeholder) { rejectScore = Math.max(rejectScore, 0.7); rejectReasons.push('שפה לא קוהרנטית מבנית'); }
  if (sceneOverload) { rejectScore = Math.max(rejectScore, 0.6); rejectReasons.push(`ריבוי אובייקטים מתחרים בסצנה`); }
  if (genericityRisk.score >= T.GENERICITY_HIGH && origNorm < T.ORIGINALITY_LOW) {
    rejectScore = Math.max(rejectScore, 0.6); rejectReasons.push('גנריות גבוהה עם מקוריות נמוכה');
  }
  if (nearDup.flag) { rejectScore = Math.max(rejectScore, 0.5); rejectReasons.push('כפילות קרובה לקונספט אחר'); }
  // rules 1 & 2: don't let a rough-but-strong idea read as high reject — but keep
  // structural-invalid / placeholder high (those are not "rough", they are broken).
  if ((strongQualifies || rescuable) && !structurallyInvalid) {
    if (rejectScore > 0.3) rejectReasons.push('סיכון הפסילה הוקטן: רעיון חזק/בלתי שגרתי הניתן לליטוש');
    rejectScore = Math.min(rejectScore, 0.3);
  }
  const rejectRisk = signal(rejectScore, rejectScore >= 0.6, rejectReasons);

  // assemble notes (descriptive) + warnings (risk). No composite, no recommendation.
  const notes = [];
  if (strongUnusualCandidate.flag) notes.push('מועמד חזק/בלתי שגרתי');
  if (executionRoughButRescuable.flag) notes.push('גס אך ניתן להצלה');
  if (posterCampaignPotential.flag) notes.push('פוטנציאל פוסטר/קמפיין');
  const warnings = []
    .concat(heroObjectMismatch.flag ? heroObjectMismatch.reasons : [])
    .concat(incoherentLanguage.flag ? incoherentLanguage.reasons : [])
    .concat(genericityRisk.flag ? genericityRisk.reasons : [])
    .concat(nearDup.flag ? nearDup.reasons : [])
    .concat(rejectRisk.flag ? rejectRisk.reasons : []);

  return {
    conceptId: concept && concept.id,
    signals: {
      heroObjectMismatch,
      incoherentLanguage,
      genericityRisk,
      strongUnusualCandidate,
      clientUsability,
      visualExplainability,
      nearDuplicateRisk: nearDup,
      rejectRisk,
      executionRoughButRescuable,
      posterCampaignPotential,
    },
    notes,
    warnings,
  };
}

/**
 * Diagnose ONE concept (nearDuplicateRisk needs the full set, so when called
 * standalone it is reported as 0/false unless `opts.nearDup` is supplied).
 * @param {object} concept canonical CreativeConcept
 * @param {{ nearDup?: {score:number,flag:boolean,reasons:string[]} }} [opts]
 */
export function diagnoseConcept(concept, opts = {}) {
  const nearDup = opts.nearDup || signal(0, false, []);
  return buildProfile(concept || {}, nearDup);
}

/**
 * Diagnose a SET of concepts. Computes set-level nearDuplicateRisk (REUSING the
 * frozen diversity validator — no new diversity logic) and returns one profile per
 * concept in INPUT order. Pure, deterministic, never throws. There is intentionally
 * NO ranking and NO recommendedConceptId — this is a profile, not a selection.
 * @param {{ concepts: object[] }} input
 * @returns {{ ok:boolean, version:string, deterministic:true, concepts: object[], reason?:string }}
 */
export function diagnoseConcepts(input) {
  try {
    const concepts = input && Array.isArray(input.concepts) ? input.concepts : null;
    if (!concepts || concepts.length === 0) {
      return { ok: false, version: DIAGNOSTICS_VERSION, deterministic: true, concepts: [], reason: 'no_concepts' };
    }

    // nearDuplicateRisk via the existing diversity validator (blocking pairs only).
    const nearDupByIndex = concepts.map(() => signal(0, false, []));
    const diversity = validateConceptDiversity(concepts, { expected: concepts.length });
    const blocking = (diversity.issues || []).filter((iss) => !iss.soft && Array.isArray(iss.pair) && iss.pair[0] >= 0);
    const maxSim = new Map();
    const partners = new Map();
    for (const iss of blocking) {
      const [a, b] = iss.pair;
      for (const [x, y] of [[a, b], [b, a]]) {
        maxSim.set(x, Math.max(maxSim.get(x) || 0, iss.similarity || 0));
        if (!partners.has(x)) partners.set(x, new Set());
        partners.get(x).add(y);
      }
    }
    for (let i = 0; i < concepts.length; i += 1) {
      const sim = maxSim.get(i) || 0;
      if (sim >= D.NEAR_DUP_FLAG || (partners.get(i) && partners.get(i).size)) {
        const partnerIds = [...(partners.get(i) || [])].map((j) => (concepts[j] && concepts[j].id) || `#${j + 1}`);
        nearDupByIndex[i] = signal(Math.max(sim, D.NEAR_DUP_FLAG), true, [`כפילות קרובה ל: ${partnerIds.join(', ')}`]);
      }
    }

    const profiles = concepts.map((c, i) => buildProfile(c || {}, nearDupByIndex[i]));
    return { ok: true, version: DIAGNOSTICS_VERSION, deterministic: true, concepts: profiles };
  } catch (e) {
    return { ok: false, version: DIAGNOSTICS_VERSION, deterministic: true, concepts: [], reason: (e && e.message) || 'diagnostics_failed' };
  }
}
