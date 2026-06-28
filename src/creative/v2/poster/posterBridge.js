// ===================================================================
// posterBridge — the PURE DETERMINISTIC composer of this slice.
//
//   ProductionPackage  →  PosterProductionBrief
//
// It re-composes an existing (draft or saved) ProductionPackage into a poster-ready
// production brief. It is NOT a judge, critic, selector, renderer, persistence
// layer, or UI feature. It calls NO model, imports NOTHING from runtime / judge /
// diagnostics / providers, performs NO I/O, uses NO Date.now and NO randomness, and
// NEVER mutates its input.
//
// FUTURE (not here): an AI Provider Router (primary = Gemini, fallback = local
// model) may later POLISH the output of this function into the same shape. This
// module deliberately produces a stable, fully-deterministic baseline so that layer
// can enrich it without structural change. No provider code exists in this slice.
// ===================================================================

export class PosterBridgeError extends Error {
  constructor(code, message) { super(message); this.name = 'PosterBridgeError'; this.code = code; }
}

const HEBREW_RE = /[֐-׿]/; // U+0590–U+05FF — promptEn must stay English-only
// The mandatory no-text constraint that MUST always be present in avoidList. Text is
// a separate layer added after rendering, so the key visual must contain no lettering.
const NO_TEXT_CONSTRAINT = 'no text, no lettering, no typography in the image';

const str = (v) => String(v == null ? '' : v).trim();
const arr = (v) => (Array.isArray(v) ? v : []);

// Deterministic, order-preserving de-duplication of trimmed non-empty strings.
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

// ---- format: aspect (mirrored) + deterministic sizeHint ----
const SIZE_BY_ASPECT = {
  '1:1': 'square',
  '4:5': 'portrait',
  '9:16': 'tall-portrait',
  '16:9': 'landscape',
};
function deriveFormat(aspect) {
  const a = str(aspect) || '4:5';
  return { aspect: a, sizeHint: SIZE_BY_ASPECT[a] || 'portrait' };
}

// ---- layout: deterministic structure + regions from aspect orientation ----
function deriveLayout(format) {
  const a = format.aspect;
  const vertical = a === '4:5' || a === '9:16';
  const square = a === '1:1';
  const structure = square ? 'hero-dominant-centered'
    : vertical ? 'hero-dominant-vertical'
      : 'hero-dominant-horizontal';
  const headlineRole = vertical ? 'headline band in the lower third'
    : square ? 'headline band along the lower edge'
      : 'headline band on one side';
  const regions = [
    { name: 'focal', role: 'single dominant hero object, high contrast, clean negative space' },
    { name: 'headline', role: headlineRole },
    { name: 'subheadline', role: 'supporting line directly beneath the headline' },
    { name: 'cta', role: 'call-to-action anchored at the safe bottom margin' },
    { name: 'logoSafe', role: 'reserved clean corner for brand mark' },
  ];
  return { structure, regions };
}

// ---- visualDirection: derived from creativeCore + visualBrief only ----
function deriveVisualDirection(creativeCore, visualBrief) {
  const metaphor = str(creativeCore.visualMetaphor);
  const composition = str(visualBrief.compositionNote);
  const vibe = str(visualBrief.vibe);
  const parts = [
    metaphor && `Visual metaphor: ${metaphor}`,
    composition && `Composition: ${composition}`,
    vibe && `Vibe: ${vibe}`,
  ].filter(Boolean);
  // Deterministic, never-empty fallback so the brief is always renderable.
  return parts.length ? parts.join(' · ') : 'Single dominant hero object, premium minimalist-rich key visual.';
}

// ---- heroPlacement: mirrors visualBrief.heroObject + deterministic hints ----
function deriveHeroPlacement(visualBrief, format) {
  const vertical = format.aspect === '4:5' || format.aspect === '9:16';
  return {
    object: str(visualBrief.heroObject),
    position: vertical ? 'upper-center focal point' : 'center focal point',
    scaleHint: 'dominant — occupies the primary focal mass',
  };
}

// ---- typography: ordered hierarchy headline → subheadline → cta ----
function deriveTypography(copyPackage) {
  const headline = str(copyPackage.headline) || 'כותרת';
  const subheadline = str(copyPackage.subline);
  const cta = str(copyPackage.cta);
  const levels = [
    { role: 'headline', text: headline, emphasisHint: 'primary — largest, highest weight' },
  ];
  if (subheadline) levels.push({ role: 'subheadline', text: subheadline, emphasisHint: 'secondary — medium weight, supports the headline' });
  if (cta) levels.push({ role: 'cta', text: cta, emphasisHint: 'tertiary — compact, high-visibility action' });
  return { levels };
}

// ---- messaging: derived from copyPackage (headline never empty) ----
function deriveMessaging(copyPackage) {
  const bodyVariants = arr(copyPackage.bodyVariants);
  return {
    headline: str(copyPackage.headline) || 'כותרת',
    subheadline: str(copyPackage.subline),
    cta: str(copyPackage.cta),
    bodyHint: str(bodyVariants[0]),
  };
}

// ---- avoidList: negativeEn + visualBrief.dont + mandatory no-text (deduped) ----
function deriveAvoidList(imagePrompt, visualBrief) {
  const fromNegative = str(imagePrompt.negativeEn);
  const merged = [
    ...(fromNegative ? [fromNegative] : []),
    ...arr(visualBrief.dont),
    NO_TEXT_CONSTRAINT, // mandatory — always present
  ];
  return dedupeStrings(merged);
}

// ---- colorMoodLighting: palette (mirror) + mood (from vibe) + lighting hint ----
function deriveColorMoodLighting(visualBrief) {
  return {
    palette: dedupeStrings(arr(visualBrief.palette)),
    mood: str(visualBrief.vibe),
    lightingHint: 'directional key light, premium high-contrast, controlled shadows',
  };
}

// ---- compositionNotes: compositionNote + visualBrief.do (deduped) ----
function deriveCompositionNotes(visualBrief) {
  const note = str(visualBrief.compositionNote);
  return dedupeStrings([...(note ? [note] : []), ...arr(visualBrief.do)]);
}

// ---- productionRisks: from creativeCore.genericityRisk + copyPackage.copyWarning ----
function deriveProductionRisks(creativeCore, copyPackage) {
  const risks = [];
  const gr = creativeCore && creativeCore.genericityRisk;
  if (gr && typeof gr === 'object') {
    const level = ['low', 'medium', 'high'].includes(gr.level) ? gr.level : 'low';
    const reasons = arr(gr.reasons).map(str).filter(Boolean);
    risks.push({ type: 'genericity', level, note: reasons.length ? reasons.join('; ') : 'no specific genericity reasons' });
  }
  const warning = copyPackage && str(copyPackage.copyWarning);
  if (warning) risks.push({ type: 'copy', level: 'medium', note: warning });
  return risks;
}

// ---- exportNotes: deterministic from aspect/format ----
function deriveExportNotes(format) {
  return [
    `Export at ${format.aspect} (${format.sizeHint}).`,
    'Render the key visual WITHOUT text; add the headline/subheadline/CTA as a separate typographic layer.',
    'Keep the logo-safe corner clear; maintain safe margins for the CTA.',
  ];
}

/**
 * Build a deterministic PosterProductionBrief from a ProductionPackage.
 * Pure: no model, no I/O, no Date.now, no randomness, no input mutation.
 *
 * @param {object} productionPackage - a ProductionPackage (draft or saved)
 * @param {object} [opts] - reserved for future deterministic options (unused here)
 * @returns {object} PosterProductionBrief (status 'draft')
 */
export function buildPosterProductionBrief(productionPackage, opts = {}) {
  const pkg = productionPackage;
  if (!pkg || typeof pkg !== 'object') {
    throw new PosterBridgeError('NO_PACKAGE', 'buildPosterProductionBrief requires a ProductionPackage');
  }
  const creativeCore = pkg.creativeCore && typeof pkg.creativeCore === 'object' ? pkg.creativeCore : {};
  const copyPackage = pkg.copyPackage && typeof pkg.copyPackage === 'object' ? pkg.copyPackage : {};
  const visualBrief = pkg.visualBrief && typeof pkg.visualBrief === 'object' ? pkg.visualBrief : {};
  const imagePrompt = pkg.imagePrompt && typeof pkg.imagePrompt === 'object' ? pkg.imagePrompt : {};

  const format = deriveFormat(imagePrompt.aspect);

  return {
    campaignId: str(pkg.campaignId),
    conceptId: str(pkg.conceptId),
    tenantId: str(pkg.tenantId),
    status: 'draft',

    format,
    visualDirection: deriveVisualDirection(creativeCore, visualBrief),
    layout: deriveLayout(format),
    heroPlacement: deriveHeroPlacement(visualBrief, format),
    typography: deriveTypography(copyPackage),
    messaging: deriveMessaging(copyPackage),
    imageDirection: {
      promptEn: str(imagePrompt.promptEn), // PASS-THROUGH, never rewritten
      aspect: format.aspect,
    },
    avoidList: deriveAvoidList(imagePrompt, visualBrief),
    colorMoodLighting: deriveColorMoodLighting(visualBrief),
    compositionNotes: deriveCompositionNotes(visualBrief),
    productionRisks: deriveProductionRisks(creativeCore, copyPackage),
    exportNotes: deriveExportNotes(format),
  };
}

// Exported for the schema/tests so the mandatory constraint has a single source of truth.
export const POSTER_NO_TEXT_CONSTRAINT = NO_TEXT_CONSTRAINT;
export const POSTER_HEBREW_RE = HEBREW_RE;
