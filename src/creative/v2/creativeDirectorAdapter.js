// ===================================================================
// Creative Director ADAPTER — the SINGLE translation boundary between the
// canonical Creative V2 contract and the FROZEN Creative Director V1
// (src/lib/gemini.js → runCreativeDirector). See fieldMapping.md for the exact,
// tested mapping. This module:
//   • validates the canonical V2 request
//   • maps it to the exact V1 `brand` + `opts` input (mapRequestToV1)
//   • calls V1 through an INJECTED runner (runV1) — never imports V1 internals,
//     so V1 stays decoupled and tests run with a fake runner (no LLM)
//   • normalizes the V1 output to the canonical V2 result (normalizeV1ToResult)
//   • validates the result and returns structured errors
//   • records execution metadata
// It NEVER duplicates V1 logic, copies V1 prompts, rewrites scoring, mutates the
// V1 output, or invents campaign data. V1 behavior is preserved exactly.
// ===================================================================
import { validateCreativeCampaignRequest, validateCreativeCampaignResult } from './schema.js';

/** Structured adapter error. `code` is machine-readable; UI shows a calm Hebrew msg. */
export class CreativeAdapterError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'CreativeAdapterError';
    this.code = code;
    this.details = details;
  }
}

// Hebrew labels for objectives (adapter-local — NOT a V1 internal import).
export const OBJECTIVE_LABELS = Object.freeze({
  generate_leads: 'גיוס לידים',
  increase_sales: 'הגדלת מכירות',
  promote_service: 'קידום שירות',
  promote_product: 'קידום מוצר',
  brand_awareness: 'מודעות למותג',
  customer_reactivation: 'החזרת לקוחות',
  informational: 'מסר אינפורמטיבי',
});

const HEX_RE = /^#?[0-9a-fA-F]{3,8}$/;
const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];
const firstStr = (...vals) => { for (const v of vals) { if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; };
const clip = (s, n) => { const t = String(s || ''); return t.length > n ? `${t.slice(0, n).trim()}…` : t; };

/**
 * REQUEST PATH — canonical V2 request → V1 { brand, opts }. Pure; mirrors
 * fieldMapping.md section A exactly. Does not mutate `request`.
 * @param {import('./types').CreativeCampaignRequest} request
 */
export function mapRequestToV1(request) {
  const b = request.business;
  const br = request.brand;
  const c = request.campaign;
  const objectiveLabel = OBJECTIVE_LABELS[c.objective] || c.objective;
  const productNames = [...(b.products || []), ...(b.services || [])].map((p) => p && p.name).filter(Boolean);

  const positioning = [
    b.description || b.name,
    objectiveLabel,
    c.offer ? `הצעה: ${c.offer}` : '',
    productNames.length ? `מוצרים/שירותים: ${productNames.join(', ')}` : '',
  ].filter(Boolean).join(' · ') || b.name;

  const toneStr = (br.tone || []).join(' ').toLowerCase();
  const luxuryLevel = /יוקרה|פרימיום|luxury|premium/.test(toneStr) ? 'premium' : 'mid';

  const brand = {
    business: `${b.name} — ${b.industry}`,
    positioning,
    audience: uniq([...(br.audience || []), c.targetAudience]).join('; '),
    industry: b.industry || '',
    differentiators: uniq([...(b.relevantInsights || []), ...(br.designRules || [])]),
    emotional_triggers: [...(b.relevantInsights || [])],
    tone: [...(br.tone || [])],
    trust_signals: [],
    luxury_level: luxuryLevel,
    weaknesses: [],
    do_not: [...(br.forbiddenStyles || [])],
    palette: (br.colors || []).filter((x) => HEX_RE.test(x)),
    cards: [],
  };

  // Use V1's own default brainstorm pool so its kill-safe gate reliably yields the
  // requested concepts. (maxRounds:2 only triggers a 2nd round if the first is short.)
  const opts = { target: request.requestedConceptCount, brainstormSize: 30, maxRounds: 2, withCritique: false };
  return { brand, opts };
}

/**
 * RESPONSE PATH — V1 output → canonical V2 result. Pure; mirrors fieldMapping.md
 * section B exactly. Does NOT mutate the V1 output. Throws V1_OUTPUT_INVALID if
 * V1 returned no concepts.
 * @param {{strategy?:object, note?:object, concepts?:any[]}} v1
 * @param {import('./types').CreativeCampaignRequest} request
 * @param {{model?:string, durationMs?:number, createdAt?:string}} meta
 * @returns {import('./types').CreativeCampaignResult}
 */
export function normalizeV1ToResult(v1, request, meta = {}) {
  if (!v1 || typeof v1 !== 'object' || !Array.isArray(v1.concepts)) {
    throw new CreativeAdapterError('V1_OUTPUT_INVALID', 'V1 returned no concepts array', { got: v1 === null ? 'null' : typeof v1 });
  }
  const c = request.campaign;
  const objectiveLabel = OBJECTIVE_LABELS[c.objective] || c.objective;
  const s = v1.strategy || {};
  const note = v1.note || {};
  const colors = request.brand.colors || [];
  const take = v1.concepts.slice(0, request.requestedConceptCount);

  const strategy = {
    businessProblem: firstStr(s.promise, note.feel) || `קמפיין ${objectiveLabel} עבור ${request.business.name}`,
    campaignObjective: objectiveLabel,
    audienceInsight: firstStr(s.triggers && s.triggers.psychological) || c.targetAudience,
    strategicDirection: firstStr(s.visual_direction, s.dna) || 'כיוון קריאטיבי ממוקד',
    keyMessage: firstStr(s.core_message),
  };

  const concepts = take.map((cc, i) => {
    const layout = (cc && cc.layout) || {};
    const composition = firstStr(
      [layout.text_zone, layout.overlay ? `overlay ${layout.overlay}` : '', layout.font_weight ? `משקל ${layout.font_weight}` : ''].filter(Boolean).join(' · '),
    ) || 'קומפוזיציה ממוקדת — מוקד יחיד';
    const total = Number(cc && cc.total) || 0;
    const critique = cc && cc.critique;
    const risks = (critique && typeof critique === 'object')
      ? [critique.why_fail, critique.weakest].filter((x) => typeof x === 'string' && x.trim())
      : [];
    return {
      id: `concept-${i + 1}`,
      name: clip(firstStr(cc && cc.copy && cc.copy.headline, cc && cc.core_idea, cc && cc.idea) || `קונספט ${i + 1}`, 48),
      strategicAngle: firstStr(cc && cc.marketing_principle, cc && cc.mechanism) || `מנגנון קריאטיבי ${i + 1}`,
      emotionalTone: firstStr(cc && cc.emotional_reaction, cc && cc.psychological_principle) || 'טון רגשי',
      coreIdea: firstStr(cc && cc.core_idea, cc && cc.idea) || `רעיון מרכזי ${i + 1}`,
      headlineDirection: firstStr(cc && cc.copy && cc.copy.headline, cc && cc.core_idea) || `כיוון כותרת ${i + 1}`,
      visualDirection: clip(firstStr(cc && cc.visual_metaphor, cc && cc.image_prompt) || `כיוון ויזואלי ${i + 1}`, 280),
      heroObject: firstStr(cc && cc.hero_object, cc && cc.word) || 'אובייקט מרכזי בקומפוזיציה',
      compositionDirection: composition,
      colorDirection: [...colors],
      whyItWorks: firstStr(cc && cc.psychological_principle, cc && cc.marketing_principle) || 'מנגנון פסיכולוגי שמושך תשומת לב ועוצר גלילה',
      risks,
      originalityScore: total,
      brandFitScore: total,
    };
  });

  let recommendedConceptId;
  if (concepts.length) {
    let best = 0;
    take.forEach((cc, i) => { if ((Number(cc && cc.total) || 0) > (Number(take[best] && take[best].total) || 0)) best = i; });
    recommendedConceptId = (concepts[best] || concepts[0]).id;
  }

  return {
    requestId: request.requestId,
    strategy,
    concepts,
    recommendedConceptId,
    metadata: {
      engineVersion: 'creative-director-v1',
      ...(meta.model ? { model: meta.model } : {}),
      ...(meta.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
      createdAt: meta.createdAt || new Date().toISOString(),
    },
  };
}

/**
 * Build the adapter. `runV1` is the injected V1 entry point — in production the
 * bridge injects the real runCreativeDirector; tests inject a deterministic fake.
 * @param {{ runV1: (brand:object, opts:object)=>Promise<any>, model?:string, now?:()=>number, clock?:()=>string }} deps
 * @returns {{ run: (request:import('./types').CreativeCampaignRequest)=>Promise<import('./types').CreativeCampaignResult> }}
 */
export function createCreativeDirectorAdapter({ runV1, model, now, clock } = {}) {
  if (typeof runV1 !== 'function') {
    throw new CreativeAdapterError('ADAPTER_MISCONFIGURED', 'createCreativeDirectorAdapter requires a runV1 function');
  }
  const nowMs = typeof now === 'function' ? now : () => Date.now();
  const isoNow = typeof clock === 'function' ? clock : () => new Date().toISOString();

  return {
    async run(request) {
      const reqCheck = validateCreativeCampaignRequest(request);
      if (!reqCheck.ok) throw new CreativeAdapterError('REQUEST_INVALID', 'Canonical V2 request failed validation', reqCheck.errors);

      const { brand, opts } = mapRequestToV1(request);

      const startedAt = nowMs();
      let v1;
      try {
        v1 = await runV1(brand, opts);
      } catch (e) {
        throw new CreativeAdapterError('V1_EXECUTION_FAILED', 'Creative Director V1 execution failed', String((e && e.message) || e));
      }
      const durationMs = nowMs() - startedAt;

      const result = normalizeV1ToResult(v1, request, { model, durationMs, createdAt: isoNow() });

      const resCheck = validateCreativeCampaignResult(result);
      if (!resCheck.ok) throw new CreativeAdapterError('RESULT_INVALID', 'Normalized canonical result failed validation', resCheck.errors);

      return result;
    },
  };
}
