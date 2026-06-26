// ===================================================================
// Canonical Production Package contract — TYPES ONLY (no runtime code).
//
// A ProductionPackage turns a SELECTED concept into ready-to-use deliverables
// WITHOUT flattening the campaign's creative idea: `creativeCore` preserves and
// deterministically derives the campaign's creative mechanism alongside the
// copy / visual brief / image prompt.
//
// ProductionPackage is the ONLY persisted root of this slice. creativeCore,
// copyPackage, visualBrief and imagePrompt are NESTED VALUE OBJECTS — they have
// no independent id, store, or lifecycle.
//
// Runtime validation lives in productionSchema.js (hand-rolled, no zod). This
// file is type-only and never imported at runtime, so it cannot affect the build.
// Derives from a CreativeConcept (see types.ts) — it never re-enters V1.
// ===================================================================

export type GenericityRisk = {
  level: 'low' | 'medium' | 'high';
  score: number;
  reasons: string[];
};

// Preserves the campaign's creative mechanism. Three fields are PRESERVED verbatim
// from the selected concept; three are deterministically DERIVED; genericityRisk
// is a deterministic anti-genericity guard (no model call).
export type CreativeCore = {
  creativeMechanism: string;   // PRESERVED ← concept.strategicAngle
  visualMetaphor: string;      // PRESERVED ← concept.visualDirection
  wordplayDirection: string;   // DERIVED   ← concept.headlineDirection
  surpriseMechanism: string;   // DERIVED   ← concept.coreIdea
  heroObject: string;          // PRESERVED ← concept.heroObject (one dominant Hero Object)
  memoryHook: string;          // DERIVED   ← concept.whyItWorks || concept.coreIdea
  genericityRisk: GenericityRisk;
};

export type CampaignCopyPackage = {
  headline: string;            // never empty — falls back to concept.headlineDirection
  subline: string;
  cta: string;
  bodyVariants: string[];      // never empty
};

export type VisualBrief = {
  heroObject: string;          // REUSES creativeCore.heroObject (single Hero Object — no divergence)
  vibe: string;                // ← concept.emotionalTone
  palette: string[];           // ← concept.colorDirection
  compositionNote: string;     // ← concept.compositionDirection
  do: string[];
  dont: string[];
};

export type ImagePrompt = {
  promptEn: string;            // deterministic English scaffold
  negativeEn: string;          // deterministic no-text constraint (forbids text in the image)
  aspect: string;              // derived from the campaign format
};

export type ProductionPackageStatus = 'draft' | 'saved';

export type ProductionPackage = {
  id: string;                  // OWN identity (assigned at save time)
  campaignId: string;          // FK → CreativeCampaignRecord
  conceptId: string;           // FK → selected CreativeConcept
  tenantId: string;            // = pack.id

  status: ProductionPackageStatus;

  creativeCore: CreativeCore;  // nested VO
  copyPackage: CampaignCopyPackage; // nested VO
  visualBrief: VisualBrief;    // nested VO
  imagePrompt: ImagePrompt;    // nested VO

  createdAt: string;
  updatedAt: string;
};
