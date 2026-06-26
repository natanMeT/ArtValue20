// ===================================================================
// criticTerms — ISOLATED vocabulary for the Concept Critic slice.
//
// Per the approved slice decision (D-vocab-A) this is a NEW, self-contained
// module. It intentionally MIRRORS the generic/cliché vocabulary that
// productionBriefEngine.js uses, but it does NOT import from — and the completed
// ProductionPackage slice is NOT modified to import from — this file. The minor,
// documented duplication keeps the two slices fully decoupled. A future,
// separately-approved refactor could point both at this single source.
//
// Pure data + frozen arrays only. No logic, no React, no provider.
// ===================================================================

// The adapter's hero-object fallback string (a generic placeholder). Its presence
// is the strongest single signal that V1 produced no concrete hero object.
export const GENERIC_HERO_FALLBACK = 'אובייקט מרכזי בקומפוזיציה';

// Generic success / power / quality / leadership marketing vocabulary (he + en).
// A concept leaning on these is, by itself, non-specific.
export const GENERIC_TERMS = Object.freeze([
  'הצלחה', 'מצליח', 'הכוח', 'כוח', 'המפתח', 'איכות', 'איכותי', 'הטוב ביותר', 'הטובה ביותר',
  'שירות מקצועי', 'מקצועי', 'מקצועיות', 'מוביל', 'מובילה', 'פתרון', 'נוכחות', 'חוויה',
  'מהפכה', 'פורץ דרך', 'חדשנות', 'מספר 1', 'גלה את',
  'success', 'power', 'best', 'leading', 'quality', 'solution', 'ultimate', 'innovation',
]);

// Mixed-language clichés — an English slogan dropped into Hebrew copy.
export const MIXED_CLICHE = Object.freeze([
  /one[\s-]?stop[\s-]?shop/i, /all[\s-]?in[\s-]?one/i, /game[\s-]?changer/i,
  /next[\s-]?level/i, /must[\s-]?have/i,
]);

// Pinned generic phrases that, when they show up in a concept NAME / HEADLINE /
// CORE IDEA, read as cliché slogan-ware rather than a concrete idea.
export const CLICHE_PHRASES = Object.freeze([
  'הצלחה מובטחת', 'גלה את הכוח', 'One Stop Shop',
  'הצלחה', 'כוח', 'הטוב ביותר', 'מוביל', 'איכות', 'מקצועיות', 'חדשנות', 'פתרון',
]);

// The adapter's deterministic fallback templates (creativeDirectorAdapter.js). A
// concept whose fields match these is a PLACEHOLDER, not a real idea → hard reject.
export const PLACEHOLDER_PATTERNS = Object.freeze([
  /^קונספט \d+$/,
  /^מנגנון קריאטיבי \d+$/,
  /^רעיון מרכזי \d+$/,
  /^כיוון כותרת \d+$/,
  /^כיוון ויזואלי \d+$/,
]);

// HARD list separators used to count competing hero objects. Deliberately
// CONSERVATIVE: only explicit enumeration (comma / middot / plus / "and"/"vs" /
// vav-conjunction before a Hebrew word). Contrast words (מול / לצד / vs) are NOT
// here — a contrast is a relationship inside one metaphor, not a second hero — so
// they never inflate the hard reject count (they feed the soft overload signal).
export const HERO_SEPARATORS = /\s*[,،;]\s*|\s+·\s+|\s*\+\s*|\s+ו(?=[א-ת])|\b(?:and|vs)\b/giu;

// Soft contrast markers — feed the metaphor-overload RISK score only (never reject).
export const CONTRAST_MARKERS = Object.freeze([/\bמול\b/u, /\bלצד\b/u, /\bvs\.?\b/i, /\bversus\b/i]);

export const CRITIC_THRESHOLDS = Object.freeze({
  // dimension scores are 0..1; V1 scores are 0..10.
  V1_SCORE_MAX: 10,
  ORIGINALITY_LOW: 0.5,        // < 0.5 (V1 < 5) counts as "low originality"
  ORIGINALITY_STRONG: 0.8,     // >= 0.8 (V1 >= 8) qualifies for strong-unusual protection
  BRAND_SPECIFICITY_LOW: 0.34, // < 0.34 counts as "low brand specificity"
  GENERICITY_HIGH: 0.66,       // >= 0.66 counts as "high genericity risk"
  DEMOTE_COMPOSITE: 0.45,      // survivors below this composite are flagged "demoted"
  OVERLOAD_REJECT_OBJECTS: 3,  // >= 3 competing hero objects → hard reject
  METAPHOR_OVERLOAD_CHARS: 160,// visualDirection longer than this → overload signal
  METAPHOR_THIN_TOKENS: 2,     // fewer word-tokens than this → thin/incoherent metaphor
  MIN_SURVIVORS: 2,            // floor (D3): never reject below this many survivors
});
