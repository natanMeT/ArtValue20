// ===================================================================
// Runtime validator for the PosterProductionBrief contract (posterTypes.ts).
// Hand-rolled and dependency-free, matching the slice's productionSchema.js style
// (the repo is JS with no zod/TS toolchain). Returns { ok, errors[] } and NEVER
// throws on bad input.
//
// Enforcement points of record:
//   - imageDirection.promptEn must be ENGLISH ONLY (no Hebrew).
//   - avoidList must always carry the mandatory no-text constraint.
// ===================================================================
import { POSTER_NO_TEXT_CONSTRAINT, POSTER_HEBREW_RE } from './posterBridge.js';

const isStr = (v) => typeof v === 'string';
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isArr = (v) => Array.isArray(v);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

const RISK_LEVELS = ['low', 'medium', 'high'];
const RISK_TYPES = ['genericity', 'copy'];
const TYPO_ROLES = ['headline', 'subheadline', 'cta'];
// The no-text intent — satisfied by the mandatory constraint string OR any explicit
// "no text / without text / no lettering" phrasing in the avoid-list.
const NO_TEXT_RE = /\bno\s+text\b|\bwithout\s+text\b|\bno\s+lettering\b/i;

/**
 * Validate a PosterProductionBrief shape (nested sections included).
 * Never throws — returns an explicit { ok, errors }.
 * @param {any} brief
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePosterProductionBrief(brief) {
  const errors = [];
  if (!isObj(brief)) return { ok: false, errors: ['brief missing'] };

  // ---- identity ----
  if (!isNonEmptyStr(brief.campaignId)) errors.push('campaignId required');
  if (!isNonEmptyStr(brief.conceptId)) errors.push('conceptId required');
  if (!isNonEmptyStr(brief.tenantId)) errors.push('tenantId required');
  if (brief.status !== 'draft') errors.push("status must be 'draft'");

  // ---- format ----
  if (!isObj(brief.format)) {
    errors.push('format required');
  } else {
    if (!isNonEmptyStr(brief.format.aspect)) errors.push('format.aspect must be non-empty');
    if (!isStr(brief.format.sizeHint)) errors.push('format.sizeHint must be a string');
  }

  // ---- visualDirection ----
  if (!isNonEmptyStr(brief.visualDirection)) errors.push('visualDirection must be non-empty');

  // ---- layout + regions ----
  if (!isObj(brief.layout)) {
    errors.push('layout required');
  } else {
    if (!isNonEmptyStr(brief.layout.structure)) errors.push('layout.structure must be non-empty');
    if (!isArr(brief.layout.regions) || brief.layout.regions.length === 0) {
      errors.push('layout.regions must be a non-empty array');
    } else {
      brief.layout.regions.forEach((r, i) => {
        if (!isObj(r)) { errors.push(`layout.regions[${i}] must be an object`); return; }
        if (!isNonEmptyStr(r.name)) errors.push(`layout.regions[${i}].name must be non-empty`);
        if (!isNonEmptyStr(r.role)) errors.push(`layout.regions[${i}].role must be non-empty`);
      });
    }
  }

  // ---- heroPlacement ----
  if (!isObj(brief.heroPlacement)) {
    errors.push('heroPlacement required');
  } else {
    if (!isStr(brief.heroPlacement.object)) errors.push('heroPlacement.object must be a string');
    if (!isNonEmptyStr(brief.heroPlacement.position)) errors.push('heroPlacement.position must be non-empty');
    if (!isNonEmptyStr(brief.heroPlacement.scaleHint)) errors.push('heroPlacement.scaleHint must be non-empty');
  }

  // ---- typography levels ----
  if (!isObj(brief.typography)) {
    errors.push('typography required');
  } else if (!isArr(brief.typography.levels) || brief.typography.levels.length === 0) {
    errors.push('typography.levels must be a non-empty array');
  } else {
    const levels = brief.typography.levels;
    levels.forEach((lv, i) => {
      if (!isObj(lv)) { errors.push(`typography.levels[${i}] must be an object`); return; }
      if (!TYPO_ROLES.includes(lv.role)) errors.push(`typography.levels[${i}].role must be headline|subheadline|cta`);
      if (!isNonEmptyStr(lv.text)) errors.push(`typography.levels[${i}].text must be non-empty`);
      if (!isNonEmptyStr(lv.emphasisHint)) errors.push(`typography.levels[${i}].emphasisHint must be non-empty`);
    });
    if (!isObj(levels[0]) || levels[0].role !== 'headline') errors.push('typography.levels[0] must be the headline');
  }

  // ---- messaging ----
  if (!isObj(brief.messaging)) {
    errors.push('messaging required');
  } else {
    if (!isNonEmptyStr(brief.messaging.headline)) errors.push('messaging.headline must be non-empty');
    if (!isStr(brief.messaging.subheadline)) errors.push('messaging.subheadline must be a string');
    if (!isStr(brief.messaging.cta)) errors.push('messaging.cta must be a string');
    if (!isStr(brief.messaging.bodyHint)) errors.push('messaging.bodyHint must be a string');
  }

  // ---- imageDirection (English-only contract) ----
  if (!isObj(brief.imageDirection)) {
    errors.push('imageDirection required');
  } else {
    if (!isNonEmptyStr(brief.imageDirection.promptEn)) errors.push('imageDirection.promptEn must be non-empty');
    else if (POSTER_HEBREW_RE.test(brief.imageDirection.promptEn)) errors.push('imageDirection.promptEn must be English only (no Hebrew)');
    if (!isStr(brief.imageDirection.aspect)) errors.push('imageDirection.aspect must be a string');
  }

  // ---- avoidList (mandatory no-text constraint) ----
  if (!isArr(brief.avoidList) || brief.avoidList.length === 0) {
    errors.push('avoidList must be a non-empty array');
  } else if (!brief.avoidList.every((x) => isStr(x))) {
    errors.push('avoidList must contain only strings');
  } else {
    const hasNoText = brief.avoidList.includes(POSTER_NO_TEXT_CONSTRAINT)
      || brief.avoidList.some((x) => NO_TEXT_RE.test(x));
    if (!hasNoText) errors.push('avoidList must include the no-text constraint');
  }

  // ---- colorMoodLighting ----
  if (!isObj(brief.colorMoodLighting)) {
    errors.push('colorMoodLighting required');
  } else {
    if (!isArr(brief.colorMoodLighting.palette)) errors.push('colorMoodLighting.palette must be an array');
    if (!isStr(brief.colorMoodLighting.mood)) errors.push('colorMoodLighting.mood must be a string');
    if (!isStr(brief.colorMoodLighting.lightingHint)) errors.push('colorMoodLighting.lightingHint must be a string');
  }

  // ---- compositionNotes ----
  if (!isArr(brief.compositionNotes)) errors.push('compositionNotes must be an array');
  else if (!brief.compositionNotes.every((x) => isStr(x))) errors.push('compositionNotes must contain only strings');

  // ---- productionRisks ----
  if (!isArr(brief.productionRisks)) {
    errors.push('productionRisks must be an array');
  } else {
    brief.productionRisks.forEach((r, i) => {
      if (!isObj(r)) { errors.push(`productionRisks[${i}] must be an object`); return; }
      if (!RISK_TYPES.includes(r.type)) errors.push(`productionRisks[${i}].type must be genericity|copy`);
      if (!RISK_LEVELS.includes(r.level)) errors.push(`productionRisks[${i}].level must be low|medium|high`);
      if (!isStr(r.note)) errors.push(`productionRisks[${i}].note must be a string`);
    });
  }

  // ---- exportNotes ----
  if (!isArr(brief.exportNotes) || brief.exportNotes.length === 0) errors.push('exportNotes must be a non-empty array');
  else if (!brief.exportNotes.every((x) => isStr(x))) errors.push('exportNotes must contain only strings');

  return { ok: errors.length === 0, errors };
}
