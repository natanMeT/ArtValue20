// ===================================================================
// comfyPosterPrompt — DETERMINISTIC English poster-prompt builder.
//
//   OfferCampaignBrief  →  { promptEn, negativeEn, aspect, sizeHint, width, height, meta }
//
// Maps the Hebrew offer brief into an ENGLISH, TEXT-FREE ComfyUI key-visual prompt.
// It does NOT translate arbitrary Hebrew free-text (no model). Instead it maps the
// brief's stable, language-independent signals — the chosen service, the visual mood,
// the palette — through small deterministic dictionaries into English; unknown values
// fall back to safe English generics so NO Hebrew can ever leak into the prompt.
//
// The Hebrew headline / subheadline / CTA are NOT rendered inside the image in this
// MVP — they are a future typographic-overlay slice. The key visual is therefore
// generated WITHOUT any lettering (the no-text constraint), so text can be composited
// on top later.
//
// Pure: no imports, no model, no fetch, no I/O, no Date.now, no randomness, never
// mutates its input. Deliberately SELF-CONTAINED so posterBridge.js stays unwired.
// ===================================================================

export class ComfyPosterPromptError extends Error {
  constructor(code, message) { super(message); this.name = 'ComfyPosterPromptError'; this.code = code; }
}

// U+0590–U+05FF — used by tests + callers to prove the output is English-only.
export const POSTER_PROMPT_HEBREW_RE = /[֐-׿]/;
// The mandatory no-text constraint: the image must contain NO lettering (text is a
// separate layer added after rendering).
export const POSTER_PROMPT_NO_TEXT = 'no text, no letters, no words, no typography, no captions, no watermark, no logo, no signage';

const str = (v) => String(v == null ? '' : v).trim();
const arr = (v) => (Array.isArray(v) ? v : []);

// ---- deterministic Hebrew → English dictionaries ----
// Hebrew service NAME → an English iconographic hero concept (text-free key visual).
const SERVICE_THEME = {
  'מערכת CRM חכמה': 'a single sleek unified CRM dashboard screen glowing softly, centralizing customer leads and follow-ups',
  'מערכת ניהול עסקית מותאמת': 'a clean modular business management control panel with organized interlocking modules',
  'עוזר AI בתוך מערכת העסק': 'a smart glowing AI assistant orb reading flowing streams of business data',
  'אתר תדמית': 'an elegant business brand website displayed on a floating modern screen',
  'דף נחיתה': 'a single focused landing page on a device with one clear call-to-action area',
  'אוטומציות': 'interlocking automated gears and smoothly flowing connected pipelines, a hands-free workflow',
  'משפך מכירות': 'a clean stylized sales funnel converting flowing dots into steady results',
  'דמו מותאם': 'a live custom product demo on a screen showing a real workflow in motion',
  'חבילת נוכחות דיגיטלית': 'a cohesive digital-presence set — website, landing page and contact channels — arranged cleanly',
  'נכסים קריאטיביים לקמפיין': 'a set of polished creative campaign visual assets arranged as one hero composition',
};
const DEFAULT_THEME = 'a single premium abstract business hero object symbolizing growth and clarity';

// Hebrew mood phrase → English mood adjectives.
const MOOD_WORDS = {
  'נקי ומקצועי': 'clean and professional',
  'רגוע ונקי': 'calm and clean',
  'חם ומזמין': 'warm and inviting',
  'אנרגטי ומדויק': 'energetic and precise',
  'חכם ומאופק': 'smart, refined and restrained',
  'נקי ואלגנטי': 'clean and elegant',
};
const DEFAULT_MOOD = 'clean, premium and professional';

// Hebrew color word → English color. Longer keys are checked first by the lookup
// (exact match), so "כחול עמוק" resolves before the bare "כחול".
const COLOR_WORDS = {
  'כחול עמוק': 'deep blue',
  'כחול כהה': 'dark blue',
  'ירוק רך': 'soft green',
  'חום חם': 'warm brown',
  'זהב מעודן': 'refined gold',
  'תכלת': 'sky blue',
  'כחול': 'blue',
  'לבן': 'white',
  'אפור': 'grey',
  'טורקיז': 'turquoise',
  'שמנת': 'cream',
  'נחושת': 'copper',
  'סגול': 'purple',
  'מגנטה': 'magenta',
  'שחור': 'black',
  'זהב': 'gold',
};

function mapColor(token) {
  const t = str(token);
  if (!t) return '';
  if (COLOR_WORDS[t]) return COLOR_WORDS[t];
  // Tolerate a value that is already English / a hex code, but DROP anything still
  // containing Hebrew so Hebrew can never leak into the English prompt.
  return POSTER_PROMPT_HEBREW_RE.test(t) ? '' : t;
}

const ASPECTS = {
  '1:1': { sizeHint: 'square', width: 1024, height: 1024 },
  '4:5': { sizeHint: 'portrait', width: 1024, height: 1280 },
  '9:16': { sizeHint: 'tall-portrait', width: 896, height: 1536 },
  '16:9': { sizeHint: 'landscape', width: 1344, height: 768 },
};

const NEG_BASE = 'text, letters, words, typography, captions, watermark, signature, logo, brand mark, signage, '
  + 'lowres, blurry, deformed, distorted, ugly, extra limbs, bad anatomy, jpeg artifacts, cluttered, busy, messy';

/**
 * Build a deterministic English ComfyUI poster prompt from an OfferCampaignBrief.
 * Pure: no model, no I/O, no Date.now, no randomness, no input mutation.
 *
 * @param {object} offerBrief - an OfferCampaignBrief (from generateOfferCampaignBrief)
 * @param {object} [opts] - { aspect?: '1:1'|'4:5'|'9:16'|'16:9' } (default '4:5' portrait)
 * @returns {{ promptEn:string, negativeEn:string, aspect:string, sizeHint:string, width:number, height:number, meta:object }}
 */
export function buildComfyPosterPrompt(offerBrief, opts = {}) {
  if (offerBrief == null || typeof offerBrief !== 'object' || Array.isArray(offerBrief)) {
    throw new ComfyPosterPromptError('NO_BRIEF', 'buildComfyPosterPrompt requires an OfferCampaignBrief object');
  }
  const offer = offerBrief.offer && typeof offerBrief.offer === 'object' ? offerBrief.offer : {};
  const visual = offerBrief.visualDirection && typeof offerBrief.visualDirection === 'object' ? offerBrief.visualDirection : {};

  const theme = SERVICE_THEME[str(offer.service)] || DEFAULT_THEME;
  const mood = MOOD_WORDS[str(visual.mood)] || DEFAULT_MOOD;
  const colors = arr(visual.palette).map(mapColor).filter(Boolean);
  const colorPhrase = colors.length ? `${colors.slice(0, 4).join(', ')} color palette` : '';

  const aspect = ASPECTS[str(opts.aspect)] ? str(opts.aspect) : '4:5';
  const a = ASPECTS[aspect];

  const promptEn = [
    theme,
    'premium minimalist advertising key visual, single dominant hero object',
    'clean composition, generous negative space, centered focal point',
    `${mood} mood`,
    colorPhrase,
    'soft studio lighting, high detail, sharp focus, commercial poster background',
    // Positive-side reminder that the image carries NO lettering (text is a later layer).
    POSTER_PROMPT_NO_TEXT,
  ].filter(Boolean).join(', ');

  const negativeEn = `${NEG_BASE}, ${POSTER_PROMPT_NO_TEXT}`;

  return {
    promptEn,
    negativeEn,
    aspect,
    sizeHint: a.sizeHint,
    width: a.width,
    height: a.height,
    meta: {
      service: str(offer.service),
      themeMatched: Boolean(SERVICE_THEME[str(offer.service)]),
      moodMatched: Boolean(MOOD_WORDS[str(visual.mood)]),
      colorCount: colors.length,
    },
  };
}

export default buildComfyPosterPrompt;
