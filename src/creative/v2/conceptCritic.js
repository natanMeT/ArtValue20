// ===================================================================
// conceptCritic — ADDITIVE evaluation + rerank layer for the Creative V2 slice.
//
// Runs AFTER the FROZEN Creative Director V1 + adapter + store have produced and
// PERSISTED the canonical concepts. It never imports, modifies, or re-runs V1; it
// is wired in only at the composition root (createArtValueCreative.js) as a
// failure-safe decorator. It:
//   • READS the concepts (never mutates them, never reorders the input array)
//   • scores each on the spec's dimensions (deterministic; optional model seam OFF)
//   • REUSES the existing validateConceptDiversity (no new diversity logic)
//   • conservatively hard-rejects only clearly measurable failures, DEMOTES the
//     rest, and never drops below MIN_SURVIVORS (D3)
//   • produces a SEPARATE ranking + its OWN recommendedConceptId
//
// It does NOT: overwrite result.recommendedConceptId, touch persistence, depend on
// React, add a provider, or throw (it returns { ok:false } instead). The original
// V1 output stays the auditable source of truth.
// ===================================================================
import { validateConceptDiversity } from './diversity.js';
import { validateConceptShape } from './schema.js';
import {
  GENERIC_HERO_FALLBACK, GENERIC_TERMS, MIXED_CLICHE, CLICHE_PHRASES,
  PLACEHOLDER_PATTERNS, HERO_SEPARATORS, CONTRAST_MARKERS, CRITIC_THRESHOLDS as T,
} from './criticTerms.js';

export const CRITIQUE_VERSION = 'concept-critic-v1';

// Positive-dimension weights (sum = 1.00). Higher dimension score = better.
const POSITIVE_WEIGHTS = Object.freeze({
  originality: 0.16,
  brandSpecificity: 0.16,
  strategicRelevance: 0.14,
  singleHeroDiscipline: 0.12,
  visualMetaphorCoherence: 0.10,
  clarity: 0.10,
  executability: 0.08,
  memorability: 0.08,
  emotionalFit: 0.06,
});
// Risk-dimension weights → a single 0..1 riskPenalty. Higher risk = worse.
const RISK_WEIGHTS = Object.freeze({ genericityRisk: 0.5, metaphorOverload: 0.3, clicheLanguage: 0.2 });
const RISK_FACTOR = 0.5;      // how much riskPenalty subtracts from composite
const DIVERSITY_FACTOR = 0.25; // how much a near-duplicate subtracts from composite
// Subjective dimensions a model seam may override (deterministic stays the floor).
const SEAM_DIMENSIONS = Object.freeze(['originality', 'strategicRelevance', 'memorability', 'emotionalFit', 'visualMetaphorCoherence']);

// ---- pure helpers ----
const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const str = (v) => String(v == null ? '' : v).trim();
const num = (v, d = NaN) => (Number.isFinite(Number(v)) ? Number(v) : d);
const TOKEN_RE = /[a-z0-9֐-׿]+/gi;
const tokenize = (s) => new Set(str(s).toLowerCase().match(TOKEN_RE) || []);
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  if (!a.size || !b.size) return 0;
  let inter = 0; a.forEach((t) => { if (b.has(t)) inter += 1; });
  return inter / (a.size + b.size - inter);
}
const includesAny = (text, terms) => terms.filter((term) => text.includes(term));
const matchesAny = (text, regexes) => regexes.some((re) => re.test(text));
const isFallbackHero = (hero) => !hero || hero === GENERIC_HERO_FALLBACK;

// Detect an explicit ENUMERATION of >= 3 SHORT objects in the scene description.
// DELIBERATELY conservative (clarification #3): descriptive prose that happens to
// contain a comma or a vav-conjunction is NOT an enumeration — only a list of >= 3
// short (1–3 token) noun phrases counts. So a single hero described in flowing
// Hebrew never trips the hard "too many competing objects" reject; only a real
// pile-up of objects does. Returns { count, overload }.
function sceneObjects(concept) {
  const src = str(concept.visualDirection) || str(concept.heroObject);
  if (!src) return { count: 0, overload: false };
  const segs = src.split(HERO_SEPARATORS).map((s) => s.trim()).filter(Boolean);
  if (segs.length < T.OVERLOAD_REJECT_OBJECTS) return { count: 1, overload: false };
  const short = segs.filter((s) => {
    const n = (s.toLowerCase().match(TOKEN_RE) || []).length;
    return n >= 1 && n <= 3; // list items are short noun phrases, not clauses
  });
  const overload = short.length >= T.OVERLOAD_REJECT_OBJECTS;
  return { count: overload ? short.length : 1, overload };
}

// A concept whose fields are the adapter's deterministic fallbacks — not a real idea.
function isPlaceholder(concept) {
  const heroBad = isFallbackHero(str(concept.heroObject));
  const fields = ['name', 'strategicAngle', 'coreIdea', 'headlineDirection', 'visualDirection'].map((k) => str(concept[k]));
  const matchCount = fields.filter((v) => matchesAny(v, PLACEHOLDER_PATTERNS)).length;
  return (heroBad && matchCount >= 1) || matchCount >= 2;
}

// healthy = a metaphor with enough substance and not overloaded/abstract.
function metaphorHealth(visualDirection) {
  const vd = str(visualDirection);
  const toks = tokenize(vd).size;
  if (toks < T.METAPHOR_THIN_TOKENS) return 0.3;          // thin
  if (vd.length > T.METAPHOR_OVERLOAD_CHARS) return 0.4;  // overloaded / abstract
  return 1;
}

// Brand vocabulary tokens drawn from the canonical request (for specificity).
function brandVocabTokens(request) {
  const r = request || {};
  const b = r.business || {}; const br = r.brand || {}; const c = r.campaign || {};
  const names = []
    .concat(b.name || [], b.industry || [], br.brandName || [], c.offer || [], c.targetAudience || [])
    .concat((b.products || []).map((p) => p && p.name))
    .concat((b.services || []).map((p) => p && p.name))
    .concat(br.audience || []);
  const set = new Set();
  names.filter(Boolean).forEach((n) => tokenize(n).forEach((t) => { if (t.length >= 2) set.add(t); }));
  return set;
}

// ---- deterministic risk scorers (0..1, higher = worse) ----
function scoreGenericityRisk(concept) {
  const reasons = [];
  let pts = 0;
  const blob = ['name', 'strategicAngle', 'coreIdea', 'headlineDirection', 'visualDirection', 'whyItWorks']
    .map((k) => str(concept[k])).filter(Boolean).join(' \n ');
  if (isFallbackHero(str(concept.heroObject))) { pts += 2; reasons.push('אובייקט גיבור גנרי/חלופי'); }
  const hits = [...new Set(includesAny(blob, GENERIC_TERMS))];
  if (hits.length) { pts += Math.min(hits.length, 3); reasons.push(`שפה גנרית: ${hits.join(', ')}`); }
  if (matchesAny(blob, MIXED_CLICHE)) { pts += 2; reasons.push('סלוגן אנגלי בתוך עברית'); }
  const orig = num(concept.originalityScore);
  if (Number.isFinite(orig) && orig < 6) { pts += 2; reasons.push('ציון מקוריות נמוך מהמנוע'); }
  return { score: clamp01(pts / 6), reasons };
}
function scoreClicheLanguage(concept) {
  const blob = [concept.name, concept.headlineDirection, concept.coreIdea].map(str).filter(Boolean).join(' \n ');
  const hits = [...new Set(includesAny(blob, CLICHE_PHRASES))];
  return { score: clamp01(hits.length / 2), reasons: hits.length ? [`ביטויים קלישאתיים: ${hits.join(', ')}`] : [] };
}
function scoreMetaphorOverload(concept) {
  const scene = sceneObjects(concept);
  const vd = str(concept.visualDirection);
  const objSignal = scene.overload ? 1 : 0;
  const lenSignal = vd.length > T.METAPHOR_OVERLOAD_CHARS ? 1 : 0;
  const contrast = matchesAny(vd, CONTRAST_MARKERS) ? 0.15 : 0;
  const reasons = [];
  if (scene.overload) reasons.push(`ריבוי אובייקטים מתחרים (${scene.count})`);
  if (lenSignal) reasons.push('תיאור ויזואלי ארוך/עמוס');
  return { score: clamp01(objSignal * 0.8 + lenSignal * 0.5 + contrast), reasons, objectCount: scene.count, overload: scene.overload };
}

// ---- deterministic positive scorers (0..1, higher = better) ----
function deterministicScores(concept, ctx, genericityRisk) {
  const heroConcrete = isFallbackHero(str(concept.heroObject)) ? 0 : 1;
  const mHealth = metaphorHealth(concept.visualDirection);

  const originality = clamp01(num(concept.originalityScore, 5) / T.V1_SCORE_MAX);

  const brandHits = [...ctx.brandVocab].filter((t) => str(concept.name + ' ' + concept.strategicAngle + ' '
    + concept.coreIdea + ' ' + concept.headlineDirection + ' ' + concept.visualDirection + ' ' + concept.whyItWorks)
    .toLowerCase().includes(t)).length;
  const brandSpecificity = clamp01(0.5 * heroConcrete + 0.3 * mHealth + 0.2 * Math.min(1, brandHits / 2) - (genericityRisk >= T.GENERICITY_HIGH ? 0.2 : 0));

  const stratTokens = ctx.strategyTokens;
  const conceptStratTokens = tokenize(`${concept.strategicAngle} ${concept.coreIdea} ${concept.headlineDirection}`);
  const overlap = jaccard(stratTokens, conceptStratTokens);
  const fitBase = clamp01(num(concept.brandFitScore, 5) / T.V1_SCORE_MAX);
  const strategicRelevance = clamp01(0.6 * fitBase + 0.4 * Math.min(1, overlap * 4));

  const required = ['name', 'strategicAngle', 'emotionalTone', 'coreIdea', 'headlineDirection', 'visualDirection', 'heroObject', 'whyItWorks'];
  const completeness = required.filter((k) => str(concept[k])).length / required.length;
  const headLenOk = str(concept.headlineDirection).length <= 120 ? 1 : 0.5;
  const clarity = clamp01(0.7 * completeness + 0.3 * headLenOk);

  const visualMetaphorCoherence = clamp01(0.5 * heroConcrete + 0.5 * mHealth);

  const scene = sceneObjects(concept);
  const singleHeroDiscipline = isFallbackHero(str(concept.heroObject))
    ? 0.3 : (scene.overload ? 0.2 : 1);

  const toneFallback = str(concept.emotionalTone) === 'טון רגשי' || !str(concept.emotionalTone);
  const toneOverlap = jaccard(tokenize(concept.emotionalTone), ctx.toneTokens);
  const emotionalFit = clamp01((toneFallback ? 0.3 : 0.6) + 0.4 * Math.min(1, toneOverlap * 4));

  const clichePenalty = ctx.clicheScore; // 0..1
  const memorability = clamp01(0.5 * (str(concept.whyItWorks) ? 1 : 0) + 0.3 * heroConcrete + 0.2 * (1 - clichePenalty));

  const executability = clamp01(0.5 * singleHeroDiscipline + 0.3 * heroConcrete + 0.2 * mHealth);

  return { originality, brandSpecificity, strategicRelevance, clarity, visualMetaphorCoherence, singleHeroDiscipline, memorability, emotionalFit, executability };
}

function compositeOf(scores, risks, diversityPenalty) {
  let positive = 0;
  for (const [k, w] of Object.entries(POSITIVE_WEIGHTS)) positive += w * clamp01(scores[k]);
  let riskPenalty = 0;
  for (const [k, w] of Object.entries(RISK_WEIGHTS)) riskPenalty += w * clamp01(risks[k]);
  return clamp01(positive - RISK_FACTOR * riskPenalty - DIVERSITY_FACTOR * clamp01(diversityPenalty));
}

/**
 * Critique + rerank a set of canonical V2 concepts. Pure, additive, never throws.
 *
 * @param {{ concepts: object[], strategy?: object, request?: object }} input
 * @param {{ scoreSeam?: (concept:object, ctx:object)=>Promise<object>,
 *           fallbackRecommendedId?: string, clock?: ()=>string }} [opts]
 * @returns {Promise<object>} ConceptCritique (see slice docs / types.ts)
 */
export async function critiqueConcepts(input, opts = {}) {
  const nowIso = typeof opts.clock === 'function' ? opts.clock : () => new Date().toISOString();
  const base = (ok, extra) => ({
    ok,
    degraded: false,
    evaluations: [],
    ranking: [],
    survivors: [],
    rejected: [],
    recommendedConceptId: opts.fallbackRecommendedId,
    diversity: null,
    meta: { critiqueVersion: CRITIQUE_VERSION, deterministic: true, modelUsed: false, createdAt: nowIso() },
    ...extra,
  });

  try {
    const concepts = input && Array.isArray(input.concepts) ? input.concepts : null;
    if (!concepts || concepts.length === 0) return base(false, { reason: 'no_concepts' });

    const strategy = (input && input.strategy) || {};
    const request = input && input.request;
    const ctx = {
      brandVocab: brandVocabTokens(request),
      strategyTokens: tokenize(`${strategy.keyMessage || ''} ${strategy.strategicDirection || ''} ${strategy.businessProblem || ''} ${strategy.campaignObjective || ''}`),
      toneTokens: tokenize(((request && request.brand && request.brand.tone) || []).join(' ')),
    };

    // Diversity is REUSED (not re-implemented). Blocking pairs drive rule (c).
    const diversity = validateConceptDiversity(concepts, { expected: concepts.length });
    const blockingPairs = (diversity.issues || []).filter((iss) => !iss.soft && Array.isArray(iss.pair) && iss.pair[0] >= 0);
    const blockingSimByIndex = new Map();
    const blockingPartners = new Map(); // index -> Set(partner indices)
    for (const iss of blockingPairs) {
      const [a, b] = iss.pair;
      for (const [x, y] of [[a, b], [b, a]]) {
        blockingSimByIndex.set(x, Math.max(blockingSimByIndex.get(x) || 0, iss.similarity || 0));
        if (!blockingPartners.has(x)) blockingPartners.set(x, new Set());
        blockingPartners.get(x).add(y);
      }
    }

    let modelUsed = false;
    let degraded = false;

    // ---- per-concept evaluation (no mutation of the input objects) ----
    const evaluations = [];
    for (let i = 0; i < concepts.length; i += 1) {
      const c = concepts[i];
      const shapeErrors = validateConceptShape(c, `concept[${i}]`);
      const gen = scoreGenericityRisk(c);
      const cli = scoreClicheLanguage(c);
      const ovl = scoreMetaphorOverload(c);
      const risks = { genericityRisk: gen.score, metaphorOverload: ovl.score, clicheLanguage: cli.score };

      let scores = deterministicScores(c, { ...ctx, clicheScore: cli.score }, gen.score);

      // Optional model seam — OFF by default (D2-A). Only overrides the subjective
      // dimensions; a throw is non-fatal and flips `degraded` (deterministic floor kept).
      if (typeof opts.scoreSeam === 'function') {
        try {
          const seam = await opts.scoreSeam(c, { strategy, request });
          modelUsed = true;
          if (seam && typeof seam === 'object') {
            for (const dim of SEAM_DIMENSIONS) {
              if (Number.isFinite(Number(seam[dim]))) scores = { ...scores, [dim]: clamp01(Number(seam[dim])) };
            }
          }
        } catch { degraded = true; }
      }

      const diversityPenalty = clamp01(blockingSimByIndex.get(i) || 0);
      const composite = compositeOf(scores, risks, diversityPenalty);

      evaluations.push({
        conceptId: c && c.id,
        originalIndex: i,
        scores,
        risks,
        diversityPenalty,
        composite,
        objectCount: ovl.objectCount,
        overload: ovl.overload,
        shapeErrors,
        notes: [...gen.reasons, ...ovl.reasons, ...cli.reasons],
        // reject/demote decided below
        rejected: false,
        rejectReasons: [],
        protectedAsStrongUnusual: false,
        demoted: false,
      });
    }

    const compositeByIndex = (idx) => (evaluations[idx] ? evaluations[idx].composite : 0);

    // ---- conservative hard-reject rules (clarification #3) ----
    for (let i = 0; i < evaluations.length; i += 1) {
      const ev = evaluations[i];
      const c = concepts[i];
      const reasons = [];

      // (a) invalid or placeholder-only
      if (ev.shapeErrors.length > 0) reasons.push({ type: 'invalid', msg: 'קונספט לא תקין מבנית' });
      else if (isPlaceholder(c)) reasons.push({ type: 'placeholder', msg: 'קונספט גנרי-תבניתי (ללא רעיון ממשי)' });

      // (b) three or more competing hero objects (explicit enumeration only)
      if (ev.overload) reasons.push({ type: 'overload', msg: `ריבוי אובייקטים מתחרים (${ev.objectCount})` });

      // (c) blocking near-duplicate that is WEAKER than its partner
      const partners = blockingPartners.get(i);
      if (partners && partners.size) {
        const weakerThanSome = [...partners].some((j) => compositeByIndex(i) < compositeByIndex(j)
          || (compositeByIndex(i) === compositeByIndex(j) && i > j)); // stable: keep the earlier on a tie
        if (weakerThanSome) reasons.push({ type: 'duplicate', msg: 'כפילות קרובה לקונספט חזק יותר' });
      }

      // (d) high genericity AND low originality AND low brand specificity
      if (ev.risks.genericityRisk >= T.GENERICITY_HIGH
        && ev.scores.originality < T.ORIGINALITY_LOW
        && ev.scores.brandSpecificity < T.BRAND_SPECIFICITY_LOW) {
        reasons.push({ type: 'genericity', msg: 'גנריות גבוהה עם מקוריות וספציפיות נמוכות' });
      }

      // strong-unusual protection: high originality + single hero + not a near-dup
      const protectedStrong = ev.scores.originality >= T.ORIGINALITY_STRONG
        && ev.objectCount <= 1 && !isFallbackHero(str(c.heroObject))
        && !(partners && partners.size);
      ev.protectedAsStrongUnusual = protectedStrong;

      // Protection neutralizes the "soft-ish" hard rules (overload/genericity), but
      // never a structurally invalid/placeholder concept, and duplicates are already
      // excluded from protection by definition.
      const effective = protectedStrong ? reasons.filter((r) => r.type === 'invalid' || r.type === 'placeholder' || r.type === 'duplicate') : reasons;
      if (effective.length) { ev.rejected = true; ev.rejectReasons = effective.map((r) => r.msg); }
    }

    // ---- MIN_SURVIVORS floor (D3): un-reject the strongest rejected until the floor holds ----
    const floor = Math.min(T.MIN_SURVIVORS, evaluations.length);
    let survivorCount = evaluations.filter((e) => !e.rejected).length;
    if (survivorCount < floor) {
      const rescuable = evaluations.filter((e) => e.rejected).sort((a, b) => b.composite - a.composite);
      for (const ev of rescuable) {
        if (survivorCount >= floor) break;
        ev.rejected = false;
        ev.demoted = true;
        ev.notes = [...ev.notes, 'נשמר עקב רצפת מינימום של קונספטים'];
        survivorCount += 1;
      }
    }

    // ---- demotion: weak-but-kept survivors ----
    for (const ev of evaluations) {
      if (!ev.rejected && !ev.protectedAsStrongUnusual && ev.composite < T.DEMOTE_COMPOSITE) ev.demoted = true;
    }

    // ---- ranking: survivors by composite desc (stable by originalIndex), then rejected ----
    const byScoreStable = (a, b) => (b.composite - a.composite) || (a.originalIndex - b.originalIndex);
    const survivors = evaluations.filter((e) => !e.rejected).slice().sort(byScoreStable);
    const rejected = evaluations.filter((e) => e.rejected).slice().sort(byScoreStable);
    const ranking = [...survivors, ...rejected].map((e) => e.conceptId);

    const recommendedConceptId = survivors.length
      ? survivors[0].conceptId
      : (opts.fallbackRecommendedId || (concepts[0] && concepts[0].id));

    return {
      ok: true,
      degraded,
      evaluations, // original order, 1:1 with input ids
      ranking,
      survivors: survivors.map((e) => e.conceptId),
      rejected: rejected.map((e) => ({ conceptId: e.conceptId, reasons: e.rejectReasons })),
      recommendedConceptId,
      diversity,
      meta: { critiqueVersion: CRITIQUE_VERSION, deterministic: !modelUsed, modelUsed, createdAt: nowIso() },
    };
  } catch (e) {
    return base(false, { degraded: true, reason: (e && e.message) || 'critic_failed' });
  }
}
