// ===================================================================
// Canonical PosterProductionBrief contract — TYPES ONLY (no runtime code).
//
// A PosterProductionBrief is a PURE DETERMINISTIC re-composition of a saved/draft
// ProductionPackage (see productionTypes.ts) into a poster-ready production brief:
// format, visual direction, layout structure, hero placement, typography hierarchy,
// messaging, image direction, avoid-list, color/mood/lighting, composition notes,
// production risks, and export notes.
//
// It is NOT a judge, critic, selector, renderer, persisted entity, or UI feature.
// It calls no model and imports nothing from runtime. This file is type-only and
// never imported at runtime, so it cannot affect the build.
//
// FUTURE (not implemented here, for context only): an AI Provider Router
// (primary = Gemini API, fallback = local OpenAI-compatible model, with timeout /
// retry / schema validation / degraded result) may LATER read this deterministic
// brief and return an enhanced/polished brief of the SAME shape. The schema is
// therefore designed to be a stable, fully-deterministic baseline that such a layer
// can enrich without structural change. No provider code exists in this slice.
// ===================================================================

export type PosterBriefStatus = 'draft';

// Poster format — aspect mirrors imagePrompt.aspect; sizeHint is derived from it.
export type PosterFormat = {
  aspect: string;       // ← productionPackage.imagePrompt.aspect (e.g. '4:5')
  sizeHint: string;     // deterministic, derived from aspect (e.g. 'portrait')
};

export type PosterRegion = {
  name: string;         // e.g. 'focal', 'headline', 'subheadline', 'cta', 'logoSafe'
  role: string;         // deterministic description of what occupies the region
};

export type PosterLayout = {
  structure: string;    // deterministic from aspect (e.g. 'hero-dominant-vertical')
  regions: PosterRegion[];
};

export type HeroPlacement = {
  object: string;       // ← visualBrief.heroObject (single dominant hero, no divergence)
  position: string;     // deterministic placement hint
  scaleHint: string;    // deterministic scale hint
};

export type TypographyLevel = {
  role: 'headline' | 'subheadline' | 'cta';
  text: string;         // ← copyPackage field for that role
  emphasisHint: string; // deterministic hierarchy hint
};

export type PosterTypography = {
  levels: TypographyLevel[]; // ordered: headline → subheadline → cta
};

export type PosterMessaging = {
  headline: string;     // never empty (carries copyPackage.headline)
  subheadline: string;  // ← copyPackage.subline
  cta: string;          // ← copyPackage.cta
  bodyHint: string;     // ← copyPackage.bodyVariants[0] (hint only)
};

export type PosterImageDirection = {
  promptEn: string;     // PASS-THROUGH of imagePrompt.promptEn (English only, unchanged)
  aspect: string;       // ← imagePrompt.aspect
};

export type PosterColorMoodLighting = {
  palette: string[];    // ← visualBrief.palette
  mood: string;         // ← visualBrief.vibe
  lightingHint: string; // deterministic lighting hint
};

export type PosterProductionRisk = {
  type: 'genericity' | 'copy';
  level: 'low' | 'medium' | 'high';
  note: string;
};

export type PosterProductionBrief = {
  campaignId: string;   // carried unchanged from ProductionPackage
  conceptId: string;    // carried unchanged
  tenantId: string;     // carried unchanged
  status: PosterBriefStatus; // always 'draft' in this slice

  format: PosterFormat;
  visualDirection: string;                 // derived from creativeCore / visualBrief
  layout: PosterLayout;
  heroPlacement: HeroPlacement;
  typography: PosterTypography;
  messaging: PosterMessaging;
  imageDirection: PosterImageDirection;
  avoidList: string[];                     // negativeEn + visualBrief.dont + mandatory no-text (deduped)
  colorMoodLighting: PosterColorMoodLighting;
  compositionNotes: string[];              // compositionNote + visualBrief.do
  productionRisks: PosterProductionRisk[];
  exportNotes: string[];                   // deterministic from aspect/format
};
