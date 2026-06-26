// ===================================================================
// Canonical Creative V2 contract — RUNTIME VALIDATION (the real guard).
//
// The repo is JavaScript (no zod/TS toolchain). Per the spec's "lightweight and
// appropriate solution", these are hand-rolled, dependency-free runtime
// validators that enforce the exact shape declared in types.ts. Every validator
// returns { ok, errors } and NEVER throws on bad input — callers decide how to
// surface failures. Validators are pure (no mutation of the input).
// ===================================================================

/** @typedef {import('./types').CreativeCampaignRequest} CreativeCampaignRequest */
/** @typedef {import('./types').CreativeCampaignResult} CreativeCampaignResult */
/** @typedef {import('./types').CreativeConcept} CreativeConcept */

export const OBJECTIVES = Object.freeze([
  'generate_leads', 'increase_sales', 'promote_service', 'promote_product',
  'brand_awareness', 'customer_reactivation', 'informational',
]);
export const CHANNELS = Object.freeze([
  'instagram_post', 'instagram_story', 'facebook_post', 'whatsapp', 'print',
]);
export const FORMATS = Object.freeze(['1:1', '4:5', '9:16', '16:9', 'A4', 'A5']);
export const SUPPORTED_LANGUAGE = 'he-IL';
export const REQUIRED_CONCEPT_COUNT = 3;

// ---- low-level predicates ----
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isOptStr = (v) => v === undefined || typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isNonEmptyStrArray = (v) => isStrArray(v) && v.length > 0;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function checkProductList(list, label, errors) {
  if (list === undefined) return;
  if (!Array.isArray(list)) { errors.push(`${label} must be an array`); return; }
  list.forEach((p, i) => {
    if (!isObj(p)) { errors.push(`${label}[${i}] must be an object`); return; }
    if (!isStr(p.id)) errors.push(`${label}[${i}].id required`);
    if (!isStr(p.name)) errors.push(`${label}[${i}].name required`);
    if (!isOptStr(p.description)) errors.push(`${label}[${i}].description must be a string`);
    if (p.price !== undefined && !isNum(p.price)) errors.push(`${label}[${i}].price must be a number`);
    if (p.margin !== undefined && !isNum(p.margin)) errors.push(`${label}[${i}].margin must be a number`);
  });
}

/**
 * Validate a canonical Creative V2 request.
 * @param {unknown} req
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCreativeCampaignRequest(req) {
  const errors = [];
  if (!isObj(req)) return { ok: false, errors: ['request must be an object'] };

  if (!isStr(req.requestId)) errors.push('requestId required (non-empty string)');
  if (!isStr(req.tenantId)) errors.push('tenantId required (non-empty string)');
  if (!isOptStr(req.userId)) errors.push('userId must be a string');

  // business
  if (!isObj(req.business)) {
    errors.push('business required (object)');
  } else {
    if (!isStr(req.business.name)) errors.push('business.name required');
    if (!isStr(req.business.industry)) errors.push('business.industry required');
    if (!isOptStr(req.business.description)) errors.push('business.description must be a string');
    checkProductList(req.business.products, 'business.products', errors);
    checkProductList(req.business.services, 'business.services', errors);
    if (req.business.relevantInsights !== undefined && !isStrArray(req.business.relevantInsights)) {
      errors.push('business.relevantInsights must be a string[]');
    }
  }

  // brand
  if (!isObj(req.brand)) {
    errors.push('brand required (object)');
  } else {
    if (!isStr(req.brand.brandName)) errors.push('brand.brandName required');
    if (!isNonEmptyStrArray(req.brand.audience)) errors.push('brand.audience required (non-empty string[])');
    if (!isNonEmptyStrArray(req.brand.tone)) errors.push('brand.tone required (non-empty string[])');
    ['colors', 'visualStyles', 'designRules', 'forbiddenStyles'].forEach((k) => {
      if (req.brand[k] !== undefined && !isStrArray(req.brand[k])) errors.push(`brand.${k} must be a string[]`);
    });
    if (req.brand.language !== SUPPORTED_LANGUAGE) errors.push(`brand.language must be "${SUPPORTED_LANGUAGE}" (only supported language this phase)`);
  }

  // campaign
  if (!isObj(req.campaign)) {
    errors.push('campaign required (object)');
  } else {
    if (!OBJECTIVES.includes(req.campaign.objective)) errors.push(`campaign.objective must be one of: ${OBJECTIVES.join(', ')}`);
    if (!isStr(req.campaign.targetAudience)) errors.push('campaign.targetAudience required');
    if (!isOptStr(req.campaign.offer)) errors.push('campaign.offer must be a string');
    if (!CHANNELS.includes(req.campaign.channel)) errors.push(`campaign.channel must be one of: ${CHANNELS.join(', ')}`);
    if (!FORMATS.includes(req.campaign.format)) errors.push(`campaign.format must be one of: ${FORMATS.join(', ')}`);
    if (!isStrArray(req.campaign.constraints)) errors.push('campaign.constraints must be a string[] (may be empty)');
  }

  if (req.requestedConceptCount !== REQUIRED_CONCEPT_COUNT) {
    errors.push(`requestedConceptCount must be exactly ${REQUIRED_CONCEPT_COUNT} this phase`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a single canonical CreativeConcept.
 * @param {unknown} c
 * @param {string} where
 * @returns {string[]} errors
 */
export function validateConceptShape(c, where = 'concept') {
  const errors = [];
  if (!isObj(c)) return [`${where} must be an object`];
  const reqStr = ['id', 'name', 'strategicAngle', 'emotionalTone', 'coreIdea', 'headlineDirection', 'visualDirection', 'heroObject', 'compositionDirection', 'whyItWorks'];
  reqStr.forEach((k) => { if (!isStr(c[k])) errors.push(`${where}.${k} required (non-empty string)`); });
  if (!isStrArray(c.colorDirection)) errors.push(`${where}.colorDirection must be a string[]`);
  if (!isStrArray(c.risks)) errors.push(`${where}.risks must be a string[]`);
  if (!isNum(c.originalityScore)) errors.push(`${where}.originalityScore must be a number`);
  if (!isNum(c.brandFitScore)) errors.push(`${where}.brandFitScore must be a number`);
  return errors;
}

/**
 * Validate a canonical Creative V2 result. Enforces EXACTLY 3 valid concepts.
 * @param {unknown} res
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCreativeCampaignResult(res) {
  const errors = [];
  if (!isObj(res)) return { ok: false, errors: ['result must be an object'] };

  if (!isStr(res.requestId)) errors.push('requestId required');

  if (!isObj(res.strategy)) {
    errors.push('strategy required (object)');
  } else {
    ['businessProblem', 'campaignObjective', 'audienceInsight', 'strategicDirection', 'keyMessage'].forEach((k) => {
      if (!isStr(res.strategy[k])) errors.push(`strategy.${k} required (non-empty string)`);
    });
  }

  if (!Array.isArray(res.concepts)) {
    errors.push('concepts required (array)');
  } else {
    if (res.concepts.length !== REQUIRED_CONCEPT_COUNT) errors.push(`concepts must contain exactly ${REQUIRED_CONCEPT_COUNT} (got ${res.concepts.length})`);
    res.concepts.forEach((c, i) => { validateConceptShape(c, `concepts[${i}]`).forEach((e) => errors.push(e)); });
    const ids = res.concepts.map((c) => c && c.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) errors.push('concept ids must be unique');
  }

  if (res.recommendedConceptId !== undefined && !isStr(res.recommendedConceptId)) {
    errors.push('recommendedConceptId must be a string');
  }

  if (!isObj(res.metadata)) {
    errors.push('metadata required (object)');
  } else {
    if (!isStr(res.metadata.engineVersion)) errors.push('metadata.engineVersion required');
    if (!isStr(res.metadata.createdAt)) errors.push('metadata.createdAt required (ISO string)');
    if (res.metadata.model !== undefined && typeof res.metadata.model !== 'string') errors.push('metadata.model must be a string');
    if (res.metadata.durationMs !== undefined && !isNum(res.metadata.durationMs)) errors.push('metadata.durationMs must be a number');
  }

  return { ok: errors.length === 0, errors };
}
