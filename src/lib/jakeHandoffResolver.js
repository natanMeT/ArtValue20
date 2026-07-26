// ===================================================================
// Jake Handoff Resolver (Phase 1) — pure plan → handoff payload.
//
// Completes the OS chain:
//   User Text → Decision Engine → Execution Planner → HANDOFF PAYLOAD
//
// The Execution Planner emits declarative seed REFERENCES
// (`{ builder: 'buildPosterBrief', args: [...] }`); this module is the
// single place allowed to resolve them — through an EXPLICIT STATIC
// whitelist map of real builder functions (never dynamic property
// lookup from user-controlled strings). The output is deterministic
// metadata + a resolved prompt string. It executes NOTHING: no UI, no
// navigation, no events, no storage, no model calls, no generation,
// no timestamps (a future UI layer stamps time if it needs it).
// ===================================================================

import { SEED_BUILDERS, HANDOFF_TARGETS, PLAN_TYPES } from './jakeExecutionPlanner.js';
import {
  buildPosterBrief, buildServiceCampaignSeed, buildMonthlyContentPlanSeed,
  buildStudioPromptSeed, buildBusinessBrainContext,
} from '../data/businessBrain.js';
import { buildGrowthPromptSeed } from '../data/growthContext.js';

// The only valid payload source (future integrations may extend this list).
export const HANDOFF_SOURCES = Object.freeze(['jake']);

// ---- explicit static whitelist: seed builder name → real function ----
// Keys MUST mirror the planner's SEED_BUILDERS exactly (pinned by tests).
export const SEED_RESOLVERS = Object.freeze({
  buildPosterBrief,
  buildServiceCampaignSeed,
  buildMonthlyContentPlanSeed,
  buildStudioPromptSeed,
  buildBusinessBrainContext,
  buildGrowthPromptSeed,
});

// ---- static Hebrew labels per plan type (no generated prose) ----
export const HANDOFF_TITLES = Object.freeze({
  studio_marketing_asset: 'פוסטר / נכס שיווקי ב-Studio',
  business_campaign: 'קמפיין לשירות',
  content_plan: 'תוכנית חודש תוכן',
  product_visual: 'ויזואל מוצר עם פרזנטור',
  product_lock_flow: 'מוצר מדויק — Product Lock',
  crm_operation: 'פעולת CRM',
  growth_focus: 'מוקד צמיחה יומי',
  creative_workflow_advice: 'המלצת Workflow יצירתי',
  business_strategy_advice: 'אסטרטגיה עסקית',
  direct_answer: 'מענה ישיר',
  clarify: 'נדרשת הבהרה',
});

export const HANDOFF_DESCRIPTIONS = Object.freeze({
  studio_marketing_asset: 'בריף ופרומפט מוכנים ליצירת הנכס ב-Image Studio — היצירה עצמה רק לאחר אישור.',
  business_campaign: 'שלד קמפיין ממותג לשירות שנבחר — רצף פוסטים, CTA ופולואפ.',
  content_plan: 'תוכנית תוכן לפי עמודי התוכן של ArtValue — ימים ממוספרים, בלי תאריכים.',
  product_visual: 'בריף לויזואל מוצר עם פרזנטור — התוצאה מבוססת AI ועשויה להיות מקורבת.',
  product_lock_flow: 'קומפוזיט מדויק ושיפור חיבור וצללים — פיקסלי המוצר נשמרים 1:1.',
  crm_operation: 'הקשר CRM ותצוגת פעולה לאישור — שום פעולה לא מתבצעת בלי אישור.',
  growth_focus: 'מוקד פעולה יומי מתוך Growth OS — צעדים ידניים בלבד.',
  creative_workflow_advice: 'המלצה על ה-Workflow המתאים מתוך המפה החיה.',
  business_strategy_advice: 'מיצוב, בידול וזווית הצעה לפי המוח העסקי.',
  direct_answer: 'מענה ישיר של ג׳יק.',
  clarify: 'הבקשה לא זוהתה — ג׳יק יבקש הבהרה קצרה.',
});

// ---- helpers ---------------------------------------------------------------

// Validate a handoff target against the planner's vocabulary. Invalid → null.
export function normalizeHandoffTarget(target) {
  return HANDOFF_TARGETS.includes(target) ? target : null;
}

// Is this a well-formed seed reference we are allowed to resolve?
function validSeedRef(seed) {
  return Boolean(
    seed && typeof seed === 'object' && !Array.isArray(seed)
    && typeof seed.builder === 'string'
    && Array.isArray(seed.args)
    && Object.prototype.hasOwnProperty.call(SEED_RESOLVERS, seed.builder),
  );
}

// ---- public API -------------------------------------------------------------

// Resolve a plan's seed reference into the actual prompt string.
// null/missing/malformed seed → null; non-whitelisted builder → null;
// builder throws → caught → null. Never throws; no side effects.
export function resolvePlanSeed(plan) {
  const seed = plan && typeof plan === 'object' ? plan.seed : null;
  if (!validSeedRef(seed)) return null;
  try {
    const out = SEED_RESOLVERS[seed.builder](...seed.args);
    return typeof out === 'string' && out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

// Turn an Execution Planner plan into a deterministic handoff payload.
// Pure metadata + resolved prompt — no id randomness, no timestamps, no
// execution. Never throws; malformed plans get the safe clarify payload.
export function buildHandoffPayload(plan, _options = {}) {
  const p = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {};
  const validType = PLAN_TYPES.includes(p.planType);
  const planType = validType ? p.planType : 'clarify';
  return {
    id: validType ? `jake-${planType}` : 'jake-unknown',
    source: 'jake',
    target: normalizeHandoffTarget(p.handoffTarget),
    planType,
    workflow: typeof p.workflow === 'string' ? p.workflow : null,
    suggestedNextAction: typeof p.suggestedNextAction === 'string' ? p.suggestedNextAction : null,
    title: HANDOFF_TITLES[planType],
    description: HANDOFF_DESCRIPTIONS[planType],
    prompt: resolvePlanSeed(p),
    seed: validSeedRef(p.seed) ? { builder: p.seed.builder, args: [...p.seed.args] } : null,
    requiresConfirmation: p.requiresConfirmation === true,
  };
}

// NOTE: the whitelist ↔ planner SEED_BUILDERS consistency is pinned by tests
// (a missing resolver would be a programming error; unresolvable seeds are
// still safe at runtime — they simply resolve to null).
export { SEED_BUILDERS };
