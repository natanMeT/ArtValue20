// ===================================================================
// Runtime validators for the Offer Campaign Bridge contracts (offerTypes.ts).
// Hand-rolled and dependency-free, matching the repo's schema style (JS, no
// zod/TS toolchain). Every validator returns { ok, errors[] } and NEVER throws.
//
//   validateOfferCampaignRequest(req)   — light input guard (optional pre-check)
//   validateOfferCampaignBrief(brief)   — full output-shape guard
// ===================================================================

const isStr = (v) => typeof v === 'string';
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isArr = (v) => Array.isArray(v);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isStrArr = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isNonEmptyStrArr = (v) => isStrArr(v) && v.length > 0;

const RISK_LEVELS = ['low', 'medium', 'high'];

/**
 * Light guard for an OfferCampaignRequest. Never throws.
 * @param {any} req
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateOfferCampaignRequest(req) {
  const errors = [];
  if (!isObj(req)) return { ok: false, errors: ['request must be an object'] };

  if (!isObj(req.prospect)) errors.push('prospect required (object)');
  else if (!isNonEmptyStr(req.prospect.businessType)) errors.push('prospect.businessType required (non-empty string)');

  if (req.goal !== undefined && !isObj(req.goal)) errors.push('goal must be an object');
  if (req.signals !== undefined && !isObj(req.signals)) errors.push('signals must be an object');
  if (req.preset !== undefined && !isStr(req.preset)) errors.push('preset must be a string');
  if (req.offerOverride !== undefined) {
    if (!isObj(req.offerOverride)) errors.push('offerOverride must be an object');
    else if (!isNonEmptyStr(req.offerOverride.service)) errors.push('offerOverride.service required');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Full guard for an OfferCampaignBrief (nested sections included). Never throws.
 * @param {any} brief
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateOfferCampaignBrief(brief) {
  const errors = [];
  if (!isObj(brief)) return { ok: false, errors: ['brief missing'] };

  // ---- identity / status / preset ----
  if (!isObj(brief.prospect)) {
    errors.push('prospect required');
  } else {
    if (!isNonEmptyStr(brief.prospect.businessType)) errors.push('prospect.businessType must be non-empty');
    if (brief.prospect.businessName !== undefined && !isStr(brief.prospect.businessName)) {
      errors.push('prospect.businessName must be a string when present');
    }
  }
  if (brief.status !== 'draft') errors.push("status must be 'draft'");
  if (!isNonEmptyStr(brief.preset)) errors.push('preset must be a non-empty string');

  // ---- diagnosis ----
  if (!isObj(brief.diagnosis)) {
    errors.push('diagnosis required');
  } else {
    if (!isNonEmptyStrArr(brief.diagnosis.businessPain)) errors.push('diagnosis.businessPain must be a non-empty string array');
    if (!isNonEmptyStr(brief.diagnosis.context)) errors.push('diagnosis.context must be non-empty');
  }

  // ---- offer ----
  if (!isObj(brief.offer)) {
    errors.push('offer required');
  } else {
    if (!isNonEmptyStr(brief.offer.service)) errors.push('offer.service must be non-empty');
    if (!isNonEmptyStr(brief.offer.valueProposition)) errors.push('offer.valueProposition must be non-empty');
    if (!isNonEmptyStrArr(brief.offer.whatsIncluded)) errors.push('offer.whatsIncluded must be a non-empty string array');
    if (!isNonEmptyStrArr(brief.offer.proofPoints)) errors.push('offer.proofPoints must be a non-empty string array');
  }

  // ---- campaignAngle ----
  if (!isObj(brief.campaignAngle)) {
    errors.push('campaignAngle required');
  } else {
    for (const k of ['angle', 'keyMessage', 'hook']) {
      if (!isNonEmptyStr(brief.campaignAngle[k])) errors.push(`campaignAngle.${k} must be non-empty`);
    }
  }

  // ---- salesMessage ----
  if (!isObj(brief.salesMessage)) {
    errors.push('salesMessage required');
  } else {
    if (!isNonEmptyStr(brief.salesMessage.short)) errors.push('salesMessage.short must be non-empty');
    if (!isNonEmptyStr(brief.salesMessage.full)) errors.push('salesMessage.full must be non-empty');
  }

  // ---- whatsappOutreach ----
  if (!isObj(brief.whatsappOutreach)) {
    errors.push('whatsappOutreach required');
  } else {
    for (const k of ['opener', 'body', 'cta']) {
      if (!isNonEmptyStr(brief.whatsappOutreach[k])) errors.push(`whatsappOutreach.${k} must be non-empty`);
    }
  }

  // ---- posterAdBrief ----
  if (!isObj(brief.posterAdBrief)) {
    errors.push('posterAdBrief required');
  } else {
    for (const k of ['headline', 'subheadline', 'heroIdea']) {
      if (!isNonEmptyStr(brief.posterAdBrief[k])) errors.push(`posterAdBrief.${k} must be non-empty`);
    }
    if (!isNonEmptyStrArr(brief.posterAdBrief.avoidList)) errors.push('posterAdBrief.avoidList must be a non-empty string array');
  }

  // ---- landingHero ----
  if (!isObj(brief.landingHero)) {
    errors.push('landingHero required');
  } else {
    for (const k of ['headline', 'subheadline', 'cta']) {
      if (!isNonEmptyStr(brief.landingHero[k])) errors.push(`landingHero.${k} must be non-empty`);
    }
    if (!isNonEmptyStrArr(brief.landingHero.sections)) errors.push('landingHero.sections must be a non-empty string array');
  }

  // ---- followUp ----
  if (!isObj(brief.followUp)) {
    errors.push('followUp required');
  } else {
    if (!isNonEmptyStr(brief.followUp.angle)) errors.push('followUp.angle must be non-empty');
    if (!isNonEmptyStr(brief.followUp.message)) errors.push('followUp.message must be non-empty');
  }

  // ---- objectionHandling ----
  if (!isArr(brief.objectionHandling) || brief.objectionHandling.length === 0) {
    errors.push('objectionHandling must be a non-empty array');
  } else {
    brief.objectionHandling.forEach((o, i) => {
      if (!isObj(o)) { errors.push(`objectionHandling[${i}] must be an object`); return; }
      if (!isNonEmptyStr(o.objection)) errors.push(`objectionHandling[${i}].objection must be non-empty`);
      if (!isNonEmptyStr(o.reply)) errors.push(`objectionHandling[${i}].reply must be non-empty`);
    });
  }

  // ---- visualDirection ----
  if (!isObj(brief.visualDirection)) {
    errors.push('visualDirection required');
  } else {
    if (!isNonEmptyStr(brief.visualDirection.mood)) errors.push('visualDirection.mood must be non-empty');
    if (!isNonEmptyStr(brief.visualDirection.heroIdea)) errors.push('visualDirection.heroIdea must be non-empty');
    if (brief.visualDirection.palette !== undefined && !isStrArr(brief.visualDirection.palette)) {
      errors.push('visualDirection.palette must be a string array when present');
    }
  }

  // ---- risks ----
  if (!isArr(brief.risks)) {
    errors.push('risks must be an array');
  } else {
    brief.risks.forEach((r, i) => {
      if (!isObj(r)) { errors.push(`risks[${i}] must be an object`); return; }
      if (!isNonEmptyStr(r.type)) errors.push(`risks[${i}].type must be non-empty`);
      if (!RISK_LEVELS.includes(r.level)) errors.push(`risks[${i}].level must be low|medium|high`);
      if (!isStr(r.note)) errors.push(`risks[${i}].note must be a string`);
    });
  }

  return { ok: errors.length === 0, errors };
}
