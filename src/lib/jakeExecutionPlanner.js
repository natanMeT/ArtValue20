// ===================================================================
// Jake Execution Planner (v1) — pure, deterministic decision → plan.
//
// The Decision Engine answers "WHAT is the user trying to do?"; this
// planner answers "WHICH chain of system capabilities should solve it?".
// It ONLY plans — it executes nothing, dispatches nothing, navigates
// nowhere, calls no model, writes no storage. Confirmation flags are
// LABELS for later slices; the existing engine confirm-mode remains the
// sole real gate.
//
// Option B: plans carry metadata + declarative SEED REFERENCES —
// `{ builder: 'buildPosterBrief', args: [...] }` string keys into the
// existing Business Brain / Growth builders. The builders are NEVER
// imported or called here (the future handoff slice resolves references
// against a whitelist); the only runtime import is the Decision Engine.
//
// OS chain this completes (later slices, NOT here):
//   Jake → Decision Engine → Execution Planner → Capability → Actions
// ===================================================================

import { buildDecision, INTENTS, DOMAINS } from './jakeDecisionEngine.js';

// ---- stable vocabularies (frozen — later slices consume these) -----------
export const PLAN_TYPES = Object.freeze([
  'studio_marketing_asset',
  'business_campaign',
  'content_plan',
  'crm_operation',
  'growth_focus',
  'creative_workflow_advice',
  'business_strategy_advice',
  'direct_answer',
  'clarify',
]);

export const STEP_IDS = Object.freeze([
  'business-brain',
  'poster-brief',
  'service-campaign',
  'monthly-content-plan',
  'studio-prompt',
  'studio-workflow',
  'growth-context',
  'daily-focus',
  'content-sequence',
  'follow-up-message',
  'workflow-map',
  'recommend-workflow',
  'crm-context',
  'action-preview',
  'positioning',
  'offer-angle',
  'next-actions',
  'answer-directly',
  'ask-clarifying-question',
]);

export const HANDOFF_TARGETS = Object.freeze([
  'studio', 'growth', 'crm', 'workflow', 'assistant', null,
]);

export const SUGGESTED_ACTIONS = Object.freeze([
  'prepare_studio_prompt',
  'prepare_campaign',
  'prepare_content_plan',
  'prepare_crm_action_preview',
  'prepare_growth_focus',
  'recommend_workflow',
  'answer_directly',
  'ask_clarifying_question',
]);

// ---- step definitions: id → Hebrew label + capability ---------------------
const STEP_DEFS = Object.freeze({
  'business-brain': { label: 'עיגון במיצוב ובשפה של ArtValue', capability: 'business-brain' },
  'poster-brief': { label: 'בניית בריף פוסטר', capability: 'poster' },
  'service-campaign': { label: 'בניית קמפיין לשירות', capability: 'campaign' },
  'monthly-content-plan': { label: 'תכנון חודש תוכן', capability: 'monthly-plan' },
  'studio-prompt': { label: 'הכנת פרומפט באנגלית ל-Studio', capability: 'fast-image' },
  'studio-workflow': { label: 'המלצה על Workflow מתאים ב-Studio', capability: 'creative-brief' },
  'growth-context': { label: 'הקשר Growth OS', capability: 'growth-strategy' },
  'daily-focus': { label: 'מוקד פעולה יומי', capability: 'growth-strategy' },
  'content-sequence': { label: 'רצף פוסטים לקמפיין', capability: 'campaign' },
  'follow-up-message': { label: 'הודעת פולואפ בוואטסאפ', capability: 'campaign' },
  'workflow-map': { label: 'מפת ה-Workflows החיים', capability: 'creative-brief' },
  'recommend-workflow': { label: 'המלצה על ה-Workflow המתאים', capability: 'creative-brief' },
  'crm-context': { label: 'שליפת הקשר CRM עדכני', capability: 'crm-management' },
  'action-preview': { label: 'תצוגת פעולה לאישור (ללא ביצוע)', capability: 'crm-management' },
  positioning: { label: 'מיצוב ובידול', capability: 'business-brain' },
  'offer-angle': { label: 'זווית הצעה', capability: 'business-brain' },
  'next-actions': { label: 'צעדים מומלצים להמשך', capability: 'business-brain' },
  'answer-directly': { label: 'מענה ישיר', capability: null },
  'ask-clarifying-question': { label: 'שאלת הבהרה קצרה', capability: null },
});

// Whitelisted seed builder names (string references — NEVER called here).
export const SEED_BUILDERS = Object.freeze([
  'buildPosterBrief',
  'buildServiceCampaignSeed',
  'buildMonthlyContentPlanSeed',
  'buildStudioPromptSeed',
  'buildBusinessBrainContext',
  'buildGrowthPromptSeed',
]);

// ---- intent → plan templates ----------------------------------------------
// seed is a FACTORY (userText, decision) → reference | null, so args stay
// deterministic per input. steps list ids; optional ids carry '?' suffix.
const PLAN_TABLE = Object.freeze({
  create_marketing_asset: {
    planType: 'studio_marketing_asset',
    steps: ['business-brain', 'poster-brief', 'studio-prompt', 'studio-workflow'],
    handoffTarget: 'studio',
    suggestedNextAction: 'prepare_studio_prompt',
    requiresConfirmation: true,
    seed: (userText) => ({ builder: 'buildPosterBrief', args: [userText] }),
  },
  build_campaign: {
    planType: 'business_campaign',
    steps: ['business-brain', 'service-campaign', 'content-sequence', 'follow-up-message'],
    handoffTarget: 'growth',
    suggestedNextAction: 'prepare_campaign',
    requiresConfirmation: true,
    seed: (userText) => ({ builder: 'buildServiceCampaignSeed', args: [userText] }),
  },
  create_content_plan: {
    planType: 'content_plan',
    steps: ['business-brain', 'monthly-content-plan', 'growth-context'],
    handoffTarget: 'growth',
    suggestedNextAction: 'prepare_content_plan',
    requiresConfirmation: true,
    seed: (userText) => ({ builder: 'buildMonthlyContentPlanSeed', args: [{ focusService: userText }] }),
  },
  // PRODUCT DECISION (2026-07-27): the product presenter and Product Lock were
  // REMOVED from the Studio. Both intents still classify — a user may well ask
  // for either — but they now land on the ONE hosted lane that exists, keeping
  // the useful part (their prompt) instead of planning a retired flow.
  product_visual: {
    planType: 'studio_marketing_asset',
    steps: ['business-brain', 'studio-prompt', 'studio-workflow'],
    handoffTarget: 'studio',
    suggestedNextAction: 'prepare_studio_prompt',
    requiresConfirmation: true,
    seed: (userText) => ({ builder: 'buildStudioPromptSeed', args: ['fast-image', userText] }),
  },
  product_lock: {
    planType: 'studio_marketing_asset',
    steps: ['business-brain', 'studio-prompt', 'studio-workflow'],
    handoffTarget: 'studio',
    suggestedNextAction: 'prepare_studio_prompt',
    requiresConfirmation: true,
    seed: (userText) => ({ builder: 'buildStudioPromptSeed', args: ['fast-image', userText] }),
  },
  studio_prompt: {
    planType: 'studio_marketing_asset',
    steps: ['business-brain', 'studio-prompt', 'studio-workflow'],
    handoffTarget: 'studio',
    suggestedNextAction: 'prepare_studio_prompt',
    requiresConfirmation: true,
    seed: (userText, decision) => ({ builder: 'buildStudioPromptSeed', args: [decision.workflow || 'fast-image', userText] }),
  },
  crm_operation: {
    planType: 'crm_operation',
    steps: ['crm-context', 'action-preview'],
    handoffTarget: 'crm',
    suggestedNextAction: 'prepare_crm_action_preview',
    // conservative blanket: the decision cannot yet distinguish read vs
    // mutate — real action safety stays with the engine's confirm mode.
    requiresConfirmation: true,
    seed: () => null,
  },
  growth_strategy: {
    planType: 'growth_focus',
    steps: ['growth-context', 'daily-focus', 'monthly-content-plan'],
    handoffTarget: 'growth',
    suggestedNextAction: 'prepare_growth_focus',
    requiresConfirmation: false,
    seed: () => ({ builder: 'buildGrowthPromptSeed', args: ['daily_focus'] }),
  },
  creative_workflow: {
    planType: 'creative_workflow_advice',
    steps: ['workflow-map', 'recommend-workflow'],
    handoffTarget: 'workflow',
    suggestedNextAction: 'recommend_workflow',
    requiresConfirmation: false,
    seed: () => null,
  },
  business_strategy: {
    planType: 'business_strategy_advice',
    steps: ['business-brain', 'positioning', 'offer-angle', 'next-actions'],
    handoffTarget: 'assistant',
    suggestedNextAction: 'answer_directly',
    requiresConfirmation: false,
    seed: () => ({ builder: 'buildBusinessBrainContext', args: [] }),
  },
  system_help: {
    planType: 'direct_answer',
    steps: ['answer-directly'],
    handoffTarget: 'assistant',
    suggestedNextAction: 'answer_directly',
    requiresConfirmation: false,
    seed: () => null,
  },
  general_chat: {
    planType: 'direct_answer',
    steps: ['answer-directly'],
    handoffTarget: null,
    suggestedNextAction: 'answer_directly',
    requiresConfirmation: false,
    seed: () => null,
  },
  unknown: {
    planType: 'clarify',
    steps: ['ask-clarifying-question', 'answer-directly?'],
    handoffTarget: null,
    suggestedNextAction: 'ask_clarifying_question',
    requiresConfirmation: false,
    seed: () => null,
  },
});

// ---- helpers ---------------------------------------------------------------
const cleanText = (v) => (typeof v === 'string' ? v.trim() : '');

// A safe fallback decision when a foreign decision object is malformed.
const FALLBACK_DECISION = Object.freeze({
  intent: 'unknown', domain: 'general', capability: null, workflow: null,
  confidence: 0.3, reason: 'החלטה לא תקינה — נדרשת הבהרה.',
});

// Defensive normalization: never trust a foreign decision blindly.
function normalizeDecision(decision) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) return FALLBACK_DECISION;
  const intent = INTENTS.includes(decision.intent) ? decision.intent : 'unknown';
  if (intent === 'unknown' && decision.intent !== 'unknown') return FALLBACK_DECISION;
  return {
    intent,
    domain: DOMAINS.includes(decision.domain) ? decision.domain : 'general',
    capability: typeof decision.capability === 'string' ? decision.capability : null,
    workflow: typeof decision.workflow === 'string' ? decision.workflow : null,
    confidence: typeof decision.confidence === 'number' && decision.confidence > 0 && decision.confidence <= 1
      ? decision.confidence : 0.3,
    reason: typeof decision.reason === 'string' && decision.reason ? decision.reason : 'ללא נימוק.',
  };
}

// Fresh step objects each call (no shared mutable state). '?' = optional.
function buildSteps(ids) {
  return ids.map((raw) => {
    const optional = raw.endsWith('?');
    const id = optional ? raw.slice(0, -1) : raw;
    const def = STEP_DEFS[id];
    return { id, label: def.label, capability: def.capability, status: 'planned', optional };
  });
}

// ---- public API -------------------------------------------------------------

// Turn a Decision Engine decision into a deterministic execution plan.
// Pure label-making: nothing here executes, confirms, or navigates.
// Never throws; always returns the stable 12-key shape.
export function buildPlan(decision, options = {}) {
  const d = normalizeDecision(decision);
  const userText = cleanText(options && options.userText);
  const t = PLAN_TABLE[d.intent];
  return {
    intent: d.intent,
    domain: d.domain,
    capability: d.capability,
    workflow: d.workflow,
    planType: t.planType,
    steps: buildSteps(t.steps),
    suggestedNextAction: t.suggestedNextAction,
    handoffTarget: t.handoffTarget,
    requiresConfirmation: t.requiresConfirmation,
    seed: t.seed(userText, d),
    confidence: d.confidence,
    reason: d.reason,
  };
}

// Convenience: text → decision → plan. Deterministic; never throws.
export function planFromText(userText) {
  return buildPlan(buildDecision(userText), { userText: cleanText(userText) });
}
