// ===================================================================
// Pure builder for the committed baseline snapshot. Expands BRIEFS + SYNTHETIC_V1
// into a fully canonical { meta, snapshots } file (request + result per sample),
// validated against the REAL Creative V2 validators so it can never drift from the
// contract the critic reads. Deterministic: a fixed `createdAt` in → identical
// file out (dataset.test.js re-runs this and deep-equals the committed JSON).
//
// Imports only pure modules (schema validators + fixture data) → runnable under
// plain node. The REAL-run path (runCriticEval.js, real mode) bypasses this and
// records a separate candidate artifact; it never overwrites the committed file.
// ===================================================================
import { validateCreativeCampaignRequest, validateCreativeCampaignResult } from '../schema.js';
import { BRIEFS } from './briefs.js';
import { SYNTHETIC_V1 } from './fixtures/syntheticV1.js';

export const BASELINE_META = Object.freeze({
  source: 'fixture-synthetic',
  authoritative: false,
  mode: 'fixture',
  model: null,
  sampleCount: 1,
  warning: 'SYNTHETIC DETERMINISTIC FIXTURE — NOT a real-model quality baseline. Hand-authored concepts to exercise the harness; the fixture PASS is directional only. Authoritative quality requires a human-labeled real local-model run (see artifacts/critic-eval/). Do NOT treat this as evidence the critic is validated, and do NOT promote it to a real baseline.',
  note: 'Goldens are pinned to these samples. A real candidate has different concepts and must be promoted + re-labeled before its golden metrics apply.',
});

const OBJECTIVE_LABEL = {
  generate_leads: 'גיוס לידים', increase_sales: 'הגדלת מכירות', promote_service: 'קידום שירות',
  promote_product: 'קידום מוצר', brand_awareness: 'מודעות למותג', customer_reactivation: 'החזרת לקוחות', informational: 'מסר אינפורמטיבי',
};

/** Brief.data → canonical CreativeCampaignRequest (deterministic; no model). */
export function makeRequest(brief) {
  const { business, brand, campaign } = brief.data;
  return {
    requestId: brief.id,
    tenantId: 'artvalue',
    userId: 'eval',
    business: {
      name: business.name,
      industry: business.industry,
      ...(business.description ? { description: business.description } : {}),
      ...(business.products ? { products: business.products } : {}),
      ...(business.services ? { services: business.services } : {}),
      ...(business.relevantInsights ? { relevantInsights: business.relevantInsights } : {}),
    },
    brand: {
      brandName: brand.brandName,
      audience: brand.audience,
      tone: brand.tone,
      ...(brand.colors ? { colors: brand.colors } : {}),
      ...(brand.designRules ? { designRules: brand.designRules } : {}),
      ...(brand.forbiddenStyles ? { forbiddenStyles: brand.forbiddenStyles } : {}),
      language: 'he-IL',
    },
    campaign: {
      objective: campaign.objective,
      targetAudience: campaign.targetAudience,
      ...(campaign.offer ? { offer: campaign.offer } : {}),
      channel: campaign.channel,
      format: campaign.format,
      constraints: [],
    },
    requestedConceptCount: 3,
  };
}

/** Terse concept spec → full canonical CreativeConcept. */
function expandConcept(spec, colors) {
  return {
    id: spec.id,
    name: spec.name,
    strategicAngle: spec.strategicAngle,
    emotionalTone: spec.emotionalTone,
    coreIdea: spec.coreIdea,
    headlineDirection: spec.headlineDirection,
    visualDirection: spec.visualDirection,
    heroObject: spec.heroObject,
    compositionDirection: spec.compositionDirection || 'קומפוזיציה ממוקדת — מוקד יחיד',
    colorDirection: spec.colorDirection || colors || [],
    whyItWorks: spec.whyItWorks,
    risks: spec.risks || [],
    originalityScore: spec.originalityScore,
    brandFitScore: spec.brandFitScore,
  };
}

/** Build the whole committed snapshot file. Throws if any sample fails validation. */
export function buildSnapshotFile({ createdAt } = {}) {
  const ts = createdAt || '2026-06-26T00:00:00.000Z';
  const snapshots = {};
  for (const brief of BRIEFS) {
    const syn = SYNTHETIC_V1[brief.id];
    if (!syn) throw new Error(`missing SYNTHETIC_V1 for ${brief.id}`);
    const request = makeRequest(brief);
    const rq = validateCreativeCampaignRequest(request);
    if (!rq.ok) throw new Error(`request invalid for ${brief.id}: ${rq.errors.join('; ')}`);
    const colors = (brief.data.brand && brief.data.brand.colors) || [];
    const result = {
      requestId: brief.id,
      strategy: syn.strategy,
      concepts: syn.concepts.map((s) => expandConcept(s, colors)),
      recommendedConceptId: syn.rec,
      metadata: { engineVersion: 'creative-director-v1', createdAt: ts },
    };
    const rs = validateCreativeCampaignResult(result);
    if (!rs.ok) throw new Error(`result invalid for ${brief.id}: ${rs.errors.join('; ')}`);
    snapshots[brief.id] = { samples: [{ sampleId: `${brief.id}#sample0`, request, result }] };
  }
  return { meta: { ...BASELINE_META, createdAt: ts }, snapshots };
}
