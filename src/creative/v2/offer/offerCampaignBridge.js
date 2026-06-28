// ===================================================================
// offerCampaignBridge — the GENERIC, preset-agnostic deterministic composer.
//
//   OfferCampaignRequest  →  OfferCampaignBrief
//
// The engine holds NO business knowledge. It talks only to a PRESET interface
// (selectOffer / defaultsFor / objectionsFor) and arranges the preset's domain
// nouns into a multi-channel brief using language-structure templates (he-IL) that
// are not specific to any one business. The first preset ('artvalue_services') is
// the built-in default; any conforming preset can be injected via opts, so adding
// a new specialization never requires changing this engine.
//
// It is NOT a judge, critic, selector, renderer, persistence layer, or UI feature.
// It calls NO model, imports ONLY its sibling preset, performs NO I/O, uses NO
// Date.now and NO randomness, and NEVER mutates its input.
//
// FUTURE (not here): an AI Provider Router (primary = Gemini, fallback = local
// model) may later POLISH this output into the same shape. This module produces a
// stable, fully-deterministic baseline so that layer can enrich it without
// structural change. No provider code exists in this slice.
// ===================================================================
import { artValueServicesPreset, ARTVALUE_PRESET_ID } from './presets/artValueServices.js';

export class OfferBridgeError extends Error {
  constructor(code, message) { super(message); this.name = 'OfferBridgeError'; this.code = code; }
}

const BUILTIN_PRESETS = { [ARTVALUE_PRESET_ID]: artValueServicesPreset };

// ---- deterministic, business-agnostic copy constants ----
const CTA_PRIMARY = 'קבעו שיחה קצרה';
const POSTER_AVOID = Object.freeze(['קלישאות פרסום', 'הבטחות מוגזמות', 'סטוק גנרי', 'עומס טקסט']);
const LANDING_SECTIONS = Object.freeze(['הבעיה', 'הפתרון', 'מה כלול', 'הוכחות', 'קריאה לפעולה']);
const OBJECTIVE_LABEL = Object.freeze({
  generate_leads: 'יצירת לידים',
  increase_sales: 'הגדלת מכירות',
  promote_service: 'קידום שירות',
  promote_product: 'קידום מוצר',
  brand_awareness: 'חיזוק מודעות למותג',
  customer_reactivation: 'החזרת לקוחות',
  informational: 'מסירת מידע',
});

// ---- low-level helpers ----
const str = (v) => String(v == null ? '' : v).trim();
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

function dedupeStrings(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const s = str(item);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function resolvePreset(request, opts) {
  if (isObj(opts.preset) && typeof opts.preset.selectOffer === 'function') return opts.preset;
  const registry = { ...BUILTIN_PRESETS, ...(isObj(opts.presets) ? opts.presets : {}) };
  const id = str(opts.presetId) || (isObj(request) ? str(request.preset) : '') || ARTVALUE_PRESET_ID;
  return registry[id] || artValueServicesPreset;
}

// ---- section composers (generic structure over preset-provided nouns) ----
function composeSalesMessage(angle, offer) {
  const short = dedupeStrings([angle.hook, angle.keyMessage]).join(' ') || offer.valueProposition || CTA_PRIMARY;
  const includedLine = offer.whatsIncluded.length ? `מה שכלול: ${offer.whatsIncluded.join(', ')}.` : '';
  const full = [angle.keyMessage, offer.valueProposition, includedLine, CTA_PRIMARY].filter(Boolean).join('\n');
  return { short, full: full || short };
}

function composeWhatsapp(angle, offer, businessName, businessType) {
  const opener = `שלום${businessName ? ` ${businessName}` : ''},`;
  const body = [angle.keyMessage, offer.valueProposition].filter(Boolean).join(' ')
    || offer.valueProposition || angle.keyMessage || CTA_PRIMARY;
  const cta = `אם רלוונטי, אשלח דוגמה קצרה שמתאימה ל${businessType}. מתי נוח לדבר?`;
  return { opener, body, cta };
}

function composePoster(angle, offer, visual) {
  return {
    headline: angle.hook || angle.keyMessage || offer.valueProposition || CTA_PRIMARY,
    subheadline: offer.valueProposition || angle.keyMessage || offer.service,
    heroIdea: str(visual.heroIdea) || 'אובייקט גיבור יחיד שממחיש את הפתרון',
    avoidList: [...POSTER_AVOID],
  };
}

function composeLanding(angle, offer) {
  return {
    headline: angle.keyMessage || offer.valueProposition || offer.service,
    subheadline: offer.valueProposition || angle.hook || offer.service,
    cta: CTA_PRIMARY,
    sections: [...LANDING_SECTIONS],
  };
}

function composeFollowUp(angle, offer) {
  const nudge = angle.hook || angle.keyMessage || offer.valueProposition;
  return {
    angle: 'תזכורת עם ערך',
    message: `רק מוודא שראיתם — ${nudge} אם זה לא הזמן הנכון, אחזור בעוד מספר ימים.`,
  };
}

function composeRisks(matchType, signalPains, currentSituation) {
  const risks = [];
  if (matchType === 'default') {
    risks.push({ type: 'generic_business_type', level: 'medium', note: 'סוג העסק לא זוהה במיפוי הייעודי; ההיצע נבחר לפי ברירת מחדל.' });
  }
  if (matchType === 'override') {
    risks.push({ type: 'override', level: 'low', note: 'ההיצע נבחר ידנית (offerOverride) ולא לפי מיפוי סוג העסק.' });
  }
  if (signalPains.length === 0 && !currentSituation) {
    risks.push({ type: 'low_signal', level: 'medium', note: 'לא סופקו סיגנלים על כאבי הלקוח; האבחון מבוסס על הנחות לפי סוג העסק.' });
  }
  return risks;
}

/**
 * Build a deterministic OfferCampaignBrief from an OfferCampaignRequest.
 * Pure: no model, no I/O, no Date.now, no randomness, no input mutation.
 *
 * @param {object} request - an OfferCampaignRequest
 * @param {object} [opts] - { preset?: OfferPreset, presets?: Record<string,OfferPreset>, presetId?: string }
 * @returns {object} OfferCampaignBrief (status 'draft')
 */
export function buildOfferCampaignBrief(request, opts = {}) {
  if (!isObj(request)) {
    throw new OfferBridgeError('INVALID_REQUEST', 'buildOfferCampaignBrief requires an OfferCampaignRequest object');
  }
  const preset = resolvePreset(request, opts);
  const prospect = isObj(request.prospect) ? request.prospect : {};
  const signals = isObj(request.signals) ? request.signals : {};
  const businessType = str(prospect.businessType) || 'general';
  const businessName = str(prospect.businessName);

  const defaults = preset.defaultsFor(request) || {};
  const objective = str(defaults.objective) || 'generate_leads';
  const objectiveLabel = OBJECTIVE_LABEL[objective] || objective;

  const selection = preset.selectOffer(request) || {};
  const offer = {
    service: str(selection.service),
    valueProposition: str(selection.valueProposition),
    whatsIncluded: arr(selection.whatsIncluded).map(str).filter(Boolean),
    proofPoints: arr(selection.proofPoints).map(str).filter(Boolean),
  };
  const selAngle = isObj(selection.angle) ? selection.angle : {};
  const campaignAngle = { angle: str(selAngle.angle), keyMessage: str(selAngle.keyMessage), hook: str(selAngle.hook) };
  const selVisual = isObj(selection.visual) ? selection.visual : {};
  const palette = arr(selVisual.palette).map(str).filter(Boolean);
  const visualDirection = {
    mood: str(selVisual.mood),
    heroIdea: str(selVisual.heroIdea),
    ...(palette.length ? { palette } : {}),
  };

  const signalPains = arr(signals.painPoints).map(str).filter(Boolean);
  const businessPain = dedupeStrings([...signalPains, ...arr(selection.pains).map(str)]);
  const currentSituation = str(signals.currentSituation);
  const who = businessName || 'העסק';
  const context = `אבחון עבור ${who} (${businessType})${currentSituation ? ` — ${currentSituation}` : ''}. מטרת הקמפיין: ${objectiveLabel}.`;

  const objectionHandling = arr(preset.objectionsFor(selection))
    .filter((o) => isObj(o) && str(o.objection) && str(o.reply))
    .map((o) => ({ objection: str(o.objection), reply: str(o.reply) }));

  return {
    prospect: businessName ? { businessType, businessName } : { businessType },
    status: 'draft',
    preset: str(preset.id) || ARTVALUE_PRESET_ID,

    diagnosis: { businessPain, context },
    offer,
    campaignAngle,
    salesMessage: composeSalesMessage(campaignAngle, offer),
    whatsappOutreach: composeWhatsapp(campaignAngle, offer, businessName, businessType),
    posterAdBrief: composePoster(campaignAngle, offer, selVisual),
    landingHero: composeLanding(campaignAngle, offer),
    followUp: composeFollowUp(campaignAngle, offer),
    objectionHandling,
    visualDirection,
    risks: composeRisks(selection.matchType, signalPains, currentSituation),
  };
}

// Exported so callers/tests share a single source of truth for the built-in id.
export const OFFER_DEFAULT_PRESET_ID = ARTVALUE_PRESET_ID;
