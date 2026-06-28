// ===================================================================
// judgeSchema — STRICT validator + contract for the offline Semantic Creative Judge.
//
// OFFLINE-ONLY / RUNTIME-INERT: no runtime module imports the judge layer. This is
// the deterministic post-processing boundary around the (model-produced) judge
// output: it parses, strictly validates, clamps, and bounds — turning untrusted
// model text into a typed concept-level SEMANTIC DIAGNOSTIC, or a safe degraded
// marker. It NEVER throws and NEVER fabricates a verdict.
//
// HARD INVARIANTS (Phase 0D scope):
//   • concept-level diagnostics ONLY — NO ranking, NO recommendedConceptId, NO
//     bestConceptId, NO composite/score. Any such key → degraded (leak guard).
//   • numeric dimensions/confidence clamped to 0..1; rationale length-bounded.
//   • unknown dimension/flag keys → degraded (strict shape).
// ===================================================================

export const JUDGE_VERSION = 'semantic-judge-v1';
export const MAX_RATIONALE = 280;

export const DIMENSION_KEYS = Object.freeze([
  'briefRelevance', 'heroCoherence', 'meaningCoherence', 'originality', 'posterPotential', 'clientUsability',
]);
export const FLAG_KEYS = Object.freeze([
  'semanticHeroMismatch', 'incoherentMeaning', 'offBriefContamination', 'genericButUsable', 'strangeButStrong', 'roughButRescuable',
]);
// Keys that would indicate a SELECTOR / ranking leaked into the judge output. Their
// presence is a contract violation → degraded (this slice produces no selection).
export const FORBIDDEN_KEYS = Object.freeze([
  'recommendedConceptId', 'bestConceptId', 'ranking', 'rank', 'composite', 'score', 'survivors', 'rejected',
]);

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n)));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isBool = (v) => typeof v === 'boolean';
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

const degraded = (reason, conceptId) => ({ ok: false, degraded: true, reason, ...(conceptId != null ? { conceptId: String(conceptId) } : {}) });

// Tolerant JSON extraction: accept a parsed object, or a string that is JSON, or a
// string that WRAPS JSON (code fences / preamble). Anything else → null.
function coerceObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { /* fall through to brace extraction */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
  return null;
}

/**
 * Validate one (model-produced) judge output into the strict concept-level contract.
 * @param {string|object} raw model output (JSON string or parsed object)
 * @param {{ conceptId?: string }} [opts] conceptId to stamp (authoritative over any in raw)
 * @returns {object} a valid judge result, or { ok:false, degraded:true, reason }
 */
export function validateJudgeOutput(raw, opts = {}) {
  const obj = coerceObject(raw);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return degraded('json_parse_failed', opts.conceptId);

  for (const k of FORBIDDEN_KEYS) if (k in obj) return degraded(`forbidden_key:${k}`, opts.conceptId);

  if (!obj.dimensions || typeof obj.dimensions !== 'object' || Array.isArray(obj.dimensions)) return degraded('missing_dimensions', opts.conceptId);
  for (const k of Object.keys(obj.dimensions)) if (!DIMENSION_KEYS.includes(k)) return degraded(`unknown_dimension:${k}`, opts.conceptId);
  const dimensions = {};
  for (const k of DIMENSION_KEYS) { if (!isNum(obj.dimensions[k])) return degraded(`missing_dimension:${k}`, opts.conceptId); dimensions[k] = clamp01(obj.dimensions[k]); }

  if (!obj.flags || typeof obj.flags !== 'object' || Array.isArray(obj.flags)) return degraded('missing_flags', opts.conceptId);
  for (const k of Object.keys(obj.flags)) if (!FLAG_KEYS.includes(k)) return degraded(`unknown_flag:${k}`, opts.conceptId);
  const flags = {};
  for (const k of FLAG_KEYS) { if (!isBool(obj.flags[k])) return degraded(`missing_flag:${k}`, opts.conceptId); flags[k] = obj.flags[k]; }

  if (obj.nearDuplicateOf !== undefined && !(Array.isArray(obj.nearDuplicateOf) && obj.nearDuplicateOf.every((x) => typeof x === 'string'))) {
    return degraded('bad_nearDuplicateOf', opts.conceptId);
  }
  const nearDuplicateOf = (obj.nearDuplicateOf || []).map((x) => String(x)).filter(Boolean);

  if (obj.rationale !== undefined && typeof obj.rationale !== 'string') return degraded('bad_rationale', opts.conceptId);
  const rationale = String(obj.rationale || '').slice(0, MAX_RATIONALE);

  if (obj.confidence !== undefined && !isNum(obj.confidence)) return degraded('bad_confidence', opts.conceptId);
  const confidence = clamp01(obj.confidence == null ? 0 : obj.confidence);

  const conceptId = opts.conceptId != null ? opts.conceptId : obj.conceptId;
  if (!isStr(conceptId)) return degraded('missing_conceptId', opts.conceptId);

  return {
    conceptId: String(conceptId),
    judgeVersion: JUDGE_VERSION,
    deterministic: false,
    ok: true,
    dimensions,
    flags,
    nearDuplicateOf,
    rationale,
    confidence,
  };
}
