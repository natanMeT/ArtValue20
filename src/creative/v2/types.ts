// ===================================================================
// Canonical Creative V2 contract — TYPES ONLY (no runtime code).
//
// This is the engine-independent contract that JakeOS, future business Packs,
// and a future Creative Director V2 all speak. It is deliberately decoupled from
// the frozen Creative Director V1 internals. Runtime validation lives in
// schema.js; this file is the authoritative type spec.
//
// NOTE: the Art Value app is JavaScript (Vite). These types are the canonical
// reference contract; the runtime guard is schema.js (hand-rolled validators).
// This file is type-only and is never imported at runtime, so it cannot affect
// the production build.
// ===================================================================

export type CampaignObjective =
  | 'generate_leads'
  | 'increase_sales'
  | 'promote_service'
  | 'promote_product'
  | 'brand_awareness'
  | 'customer_reactivation'
  | 'informational';

export type CampaignChannel =
  | 'instagram_post'
  | 'instagram_story'
  | 'facebook_post'
  | 'whatsapp'
  | 'print';

export type CampaignFormat = '1:1' | '4:5' | '9:16' | '16:9' | 'A4' | 'A5';

export type CreativeProductOrService = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  margin?: number;
};

export type CreativeCampaignRequest = {
  requestId: string;
  tenantId: string;
  userId?: string;

  business: {
    name: string;
    industry: string;
    description?: string;
    products?: CreativeProductOrService[];
    services?: CreativeProductOrService[];
    relevantInsights?: string[];
  };

  brand: {
    brandName: string;
    audience: string[];
    tone: string[];
    colors?: string[];
    visualStyles?: string[];
    designRules?: string[];
    forbiddenStyles?: string[];
    language: 'he-IL';
  };

  campaign: {
    objective: CampaignObjective;
    targetAudience: string;
    offer?: string;
    channel: CampaignChannel;
    format: CampaignFormat;
    constraints: string[];
  };

  requestedConceptCount: 3;
};

export type CreativeConcept = {
  id: string;
  name: string;

  strategicAngle: string;
  emotionalTone: string;
  coreIdea: string;

  headlineDirection: string;
  visualDirection: string;
  heroObject: string;
  compositionDirection: string;
  colorDirection: string[];

  whyItWorks: string;
  risks: string[];

  originalityScore: number;
  brandFitScore: number;
};

export type CreativeCampaignResult = {
  requestId: string;

  strategy: {
    businessProblem: string;
    campaignObjective: string;
    audienceInsight: string;
    strategicDirection: string;
    keyMessage: string;
  };

  concepts: CreativeConcept[];

  recommendedConceptId?: string;

  metadata: {
    engineVersion: string;
    model?: string;
    durationMs?: number;
    createdAt: string;
  };
};

export type CreativeCampaignStatus = 'draft' | 'concepts_ready' | 'concept_selected';

export type CreativeCampaignRecord = {
  id: string;
  tenantId: string;
  requestId: string;

  status: CreativeCampaignStatus;

  objective: string;
  targetAudience: string;
  channel: string;
  format: string;

  strategy: CreativeCampaignResult['strategy'];
  concepts: CreativeConcept[];

  selectedConceptId?: string;

  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};
