// ===================================================================
// Canonical OfferCampaignBrief contract — TYPES ONLY (no runtime code).
//
// The Offer Campaign Bridge turns a lightweight prospect/business signal into a
// deterministic, multi-channel "offer campaign" brief: diagnosis → offer →
// campaign angle → sales message → WhatsApp outreach → poster/ad brief →
// landing hero → follow-up → objection handling → visual direction → risks.
//
// Architecture: a GENERIC, preset-agnostic engine + a swappable PRESET that holds
// the business knowledge. The first preset ('artvalue_services') is optimized for
// Art Value's services (smart CRM, custom business systems, AI assistant inside
// systems, websites, landing pages, automations, sales funnels, custom demos,
// digital-presence packages, creative campaign assets), but the engine stays
// generic so additional presets can be added without engine changes.
//
// It is NOT a judge, critic, selector, renderer, persisted entity, or UI feature.
// It calls no model and imports nothing from runtime. This file is type-only and
// never imported at runtime, so it cannot affect the build.
//
// FUTURE (not implemented here, for context only): an AI Provider Router
// (primary = Gemini API, fallback = local OpenAI-compatible model, with timeout /
// retry / schema validation / degraded result) may LATER read this deterministic
// brief and return an enhanced/polished brief of the SAME shape. The schema is
// therefore designed as a stable, fully-deterministic baseline such a layer can
// enrich without structural change. No provider code exists in this slice.
// ===================================================================

export type OfferBriefStatus = 'draft';

// ---- input: OfferCampaignRequest ----
export type OfferProspect = {
  businessType: string;   // freeform; the preset maps it to pains + a recommended offer
  businessName?: string;
  audience?: string;
  region?: string;
  notes?: string;
};

export type OfferSignals = {
  painPoints?: string[];
  currentSituation?: string;
};

export type OfferGoal = {
  objective: string;      // reuses the canonical objective vocabulary in spirit
  channel: string;        // reuses the canonical channel vocabulary in spirit
  language?: string;      // defaults to 'he-IL'
  tone?: string[];
};

export type OfferOverride = {
  service: string;            // bypass preset selection with an explicit service
  valueProposition?: string;
};

export type OfferCampaignRequest = {
  prospect: OfferProspect;
  signals?: OfferSignals;
  goal: OfferGoal;
  preset?: string;            // preset id; defaults to 'artvalue_services'
  offerOverride?: OfferOverride;
};

// ---- output: OfferCampaignBrief ----
export type OfferDiagnosis = {
  businessPain: string[];     // never empty (signals + preset pains, deduped)
  context: string;
};

export type OfferDetails = {
  service: string;
  valueProposition: string;
  whatsIncluded: string[];
  proofPoints: string[];
};

export type OfferCampaignAngle = {
  angle: string;
  keyMessage: string;
  hook: string;
};

export type OfferSalesMessage = {
  short: string;
  full: string;
};

export type OfferWhatsappOutreach = {
  opener: string;
  body: string;
  cta: string;
};

export type OfferPosterAdBrief = {
  headline: string;
  subheadline: string;
  heroIdea: string;
  avoidList: string[];
};

export type OfferLandingHero = {
  headline: string;
  subheadline: string;
  cta: string;
  sections: string[];
};

export type OfferFollowUp = {
  angle: string;
  message: string;
};

export type OfferObjection = {
  objection: string;
  reply: string;
};

export type OfferVisualDirection = {
  mood: string;
  heroIdea: string;
  palette?: string[];
};

export type OfferRisk = {
  type: string;
  level: string;          // 'low' | 'medium' | 'high'
  note: string;
};

export type OfferCampaignBrief = {
  prospect: { businessType: string; businessName?: string };
  status: OfferBriefStatus;   // always 'draft' in this slice
  preset: string;             // e.g. 'artvalue_services'

  diagnosis: OfferDiagnosis;
  offer: OfferDetails;
  campaignAngle: OfferCampaignAngle;
  salesMessage: OfferSalesMessage;
  whatsappOutreach: OfferWhatsappOutreach;
  posterAdBrief: OfferPosterAdBrief;
  landingHero: OfferLandingHero;
  followUp: OfferFollowUp;
  objectionHandling: OfferObjection[];
  visualDirection: OfferVisualDirection;
  risks: OfferRisk[];
};

// ---- preset interface (a preset is data + a small deterministic interface) ----
export type OfferSelection = {
  service: string;
  serviceId: string;
  valueProposition: string;
  whatsIncluded: string[];
  proofPoints: string[];
  pains: string[];
  angle: OfferCampaignAngle;
  visual: OfferVisualDirection;
  matchType: 'rule' | 'default' | 'override';
};

export type OfferDefaults = {
  language: string;
  tone: string[];
  channel: string;
  objective: string;
};

export type OfferPreset = {
  id: string;
  selectOffer: (request: OfferCampaignRequest) => OfferSelection;
  defaultsFor: (request: OfferCampaignRequest) => OfferDefaults;
  objectionsFor: (selection: OfferSelection) => OfferObjection[];
};
