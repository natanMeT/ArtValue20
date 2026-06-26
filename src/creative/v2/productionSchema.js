// ===================================================================
// Runtime validator for the Production Package contract (productionTypes.ts).
// Hand-rolled and dependency-free, matching the slice's schema.js style (the
// repo is JS with no zod/TS toolchain). Returns { ok, errors[] }.
//
// Also the enforcement point for the no-text-in-image rule: a package whose
// imagePrompt.negativeEn does not forbid text is REJECTED.
// ===================================================================

const isStr = (v) => typeof v === 'string';
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isArr = (v) => Array.isArray(v);
const HEBREW_RE = /[֐-׿]/; // U+0590–U+05FF — promptEn must be English only

const RISK_LEVELS = ['low', 'medium', 'high'];

/**
 * Validate a ProductionPackage shape (nested VOs included).
 * @param {any} pkg
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateProductionPackage(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== 'object') return { ok: false, errors: ['package missing'] };

  if (!isNonEmptyStr(pkg.campaignId)) errors.push('campaignId required');
  if (!isNonEmptyStr(pkg.conceptId)) errors.push('conceptId required');
  if (!isNonEmptyStr(pkg.tenantId)) errors.push('tenantId required');

  // ---- creativeCore (nested VO) ----
  const cc = pkg.creativeCore;
  if (!cc || typeof cc !== 'object') {
    errors.push('creativeCore required');
  } else {
    ['creativeMechanism', 'visualMetaphor', 'wordplayDirection', 'surpriseMechanism', 'heroObject', 'memoryHook']
      .forEach((k) => { if (!isStr(cc[k])) errors.push(`creativeCore.${k} must be a string`); });
    const gr = cc.genericityRisk;
    if (!gr || typeof gr !== 'object') {
      errors.push('creativeCore.genericityRisk required');
    } else {
      if (!RISK_LEVELS.includes(gr.level)) errors.push('genericityRisk.level must be low|medium|high');
      if (typeof gr.score !== 'number' || !Number.isFinite(gr.score)) errors.push('genericityRisk.score must be a finite number');
      if (!isArr(gr.reasons)) errors.push('genericityRisk.reasons must be an array');
    }
  }

  // ---- copyPackage (nested VO) ----
  const cp = pkg.copyPackage;
  if (!cp || typeof cp !== 'object') {
    errors.push('copyPackage required');
  } else {
    if (!isNonEmptyStr(cp.headline)) errors.push('copyPackage.headline must be non-empty');
    if (!isStr(cp.subline)) errors.push('copyPackage.subline must be a string');
    if (!isStr(cp.cta)) errors.push('copyPackage.cta must be a string');
    if (!isArr(cp.bodyVariants) || cp.bodyVariants.length === 0) errors.push('copyPackage.bodyVariants must be a non-empty array');
  }

  // ---- visualBrief (nested VO) ----
  const vb = pkg.visualBrief;
  if (!vb || typeof vb !== 'object') {
    errors.push('visualBrief required');
  } else {
    if (!isStr(vb.heroObject)) errors.push('visualBrief.heroObject must be a string');
    if (!isArr(vb.palette)) errors.push('visualBrief.palette must be an array');
    if (!isArr(vb.do)) errors.push('visualBrief.do must be an array');
    if (!isArr(vb.dont)) errors.push('visualBrief.dont must be an array');
  }

  // ---- imagePrompt (nested VO) ----
  const ip = pkg.imagePrompt;
  if (!ip || typeof ip !== 'object') {
    errors.push('imagePrompt required');
  } else {
    if (!isNonEmptyStr(ip.promptEn)) errors.push('imagePrompt.promptEn must be non-empty');
    else if (HEBREW_RE.test(ip.promptEn)) errors.push('imagePrompt.promptEn must be English only (no Hebrew)');
    if (!isNonEmptyStr(ip.negativeEn)) errors.push('imagePrompt.negativeEn must be non-empty');
    else if (!/text/i.test(ip.negativeEn)) errors.push('imagePrompt.negativeEn must forbid text in the image');
    if (!isStr(ip.aspect)) errors.push('imagePrompt.aspect must be a string');
  }

  return { ok: errors.length === 0, errors };
}
