// ===================================================================
// posterOverlay — pure derivation of the Hebrew advertising overlay shown ON TOP of
// the transient ComfyUI poster image. No React/DOM here so it is unit-testable.
//
// The ComfyUI key visual is generated WITHOUT lettering (text is a separate layer);
// this helper turns the (Hebrew) offer brief into the four overlay strings the result
// card composites over the image: headline / subheadline / cta / label.
//
// Pure: no model, no I/O, no Date.now, no randomness, never mutates its input.
// Empty fields are returned as '' so the card can HIDE them (no empty bands).
// ===================================================================

const str = (v) => String(v == null ? '' : v).trim();
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

// Reliable Hebrew CTA fallback (matches the offer engine's CTA_PRIMARY copy) so the
// poster always has a call to action even if landingHero.cta is somehow empty.
export const POSTER_OVERLAY_CTA_FALLBACK = 'קבעו שיחה קצרה';

/**
 * Derive the Hebrew overlay fields from an OfferCampaignBrief.
 * Fallback chains (first non-empty wins; '' = hidden):
 *   headline    : posterAdBrief.headline → campaignAngle.keyMessage → offer.service → ''
 *   subheadline : posterAdBrief.subheadline → offer.valueProposition → ''
 *   cta         : landingHero.cta → POSTER_OVERLAY_CTA_FALLBACK
 *   label       : offer.service → prospect.businessType → ''
 *
 * @param {object} offerBrief - an OfferCampaignBrief (may be partial/missing)
 * @returns {{ headline:string, subheadline:string, cta:string, label:string }}
 */
export function buildPosterOverlay(offerBrief) {
  const brief = isObj(offerBrief) ? offerBrief : {};
  const poster = isObj(brief.posterAdBrief) ? brief.posterAdBrief : {};
  const angle = isObj(brief.campaignAngle) ? brief.campaignAngle : {};
  const offer = isObj(brief.offer) ? brief.offer : {};
  const landing = isObj(brief.landingHero) ? brief.landingHero : {};
  const prospect = isObj(brief.prospect) ? brief.prospect : {};

  const headline = str(poster.headline) || str(angle.keyMessage) || str(offer.service);
  const subheadline = str(poster.subheadline) || str(offer.valueProposition);
  const cta = str(landing.cta) || POSTER_OVERLAY_CTA_FALLBACK;
  const label = str(offer.service) || str(prospect.businessType);

  return { headline, subheadline, cta, label };
}

export default buildPosterOverlay;
