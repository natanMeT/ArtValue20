// ===================================================================
// Jake Decision Engine (v1) — pure, deterministic intent → decision.
//
// Jake's "scheduler": BEFORE deciding HOW to answer, decide WHAT the user
// is trying to do. This module ONLY classifies — it executes nothing,
// opens nothing, dispatches nothing. Later slices consume its decisions.
//
// Pure & deterministic: no window, no fetch, no Date.now, no Math.random,
// no localStorage, no network, no model. The ONLY import is the existing
// live-workflow registry (reused, never duplicated) so a workflow decision
// can be validated against real live ids — soon/deferred cards can never
// be selected, and an unknown workflow resolves to null.
//
// Pipeline this feeds (later slices, NOT here):
//   Jake → Decision Engine → Capability → Studio / Growth / CRM → Actions
// ===================================================================

import { liveWorkflows } from '../data/creativeWorkflows.js';

// ---- vocabulary (stable) -------------------------------------------------
export const INTENTS = Object.freeze([
  'create_marketing_asset',
  'build_campaign',
  'create_content_plan',
  'crm_operation',
  'growth_strategy',
  'creative_workflow',
  'product_visual',
  'product_lock',
  'business_strategy',
  'studio_prompt',
  'system_help',
  'general_chat',
  'unknown',
]);

export const DOMAINS = Object.freeze([
  'studio', 'growth', 'crm', 'business', 'creative', 'assistant', 'general',
]);

// intent → domain (every intent maps to exactly one domain)
const INTENT_DOMAIN = Object.freeze({
  create_marketing_asset: 'studio',
  studio_prompt: 'studio',
  product_visual: 'studio',
  product_lock: 'studio',
  build_campaign: 'business',
  create_content_plan: 'business',
  business_strategy: 'business',
  crm_operation: 'crm',
  growth_strategy: 'growth',
  creative_workflow: 'creative',
  system_help: 'assistant',
  general_chat: 'general',
  unknown: 'general',
});

// intent → canonical capability (text-independent default; buildDecision may
// refine crm_operation to 'lead-management' when the text is lead-specific).
const INTENT_CAPABILITY = Object.freeze({
  create_marketing_asset: 'poster',
  studio_prompt: 'fast-image',
  // PRODUCT BOUNDARY (2026-07-27): the presenter capability was removed with the
  // local engine. The intent still classifies, but it names no retired capability.
  product_visual: null,
  product_lock: 'product-lock',
  build_campaign: 'campaign',
  create_content_plan: 'monthly-plan',
  business_strategy: 'business-brain',
  crm_operation: 'crm-management',
  growth_strategy: 'growth-strategy',
  creative_workflow: 'creative-brief',
  system_help: null,
  general_chat: null,
  unknown: null,
});

// intent → intended live workflow id (validated against the real registry
// in resolveWorkflow; anything not live resolves to null).
const INTENT_WORKFLOW = Object.freeze({
  create_marketing_asset: 'fast-image',
  studio_prompt: 'fast-image',
  // (product_visual intentionally has NO workflow: the presenter card is retired)
  product_lock: 'product-lock',
  // everything else: no direct Studio workflow
});

// Live workflow ids, computed once from the registry (pure). Reused — never
// duplicated. This is what guarantees "no soon workflow is ever selected".
const LIVE_WORKFLOW_IDS = new Set(liveWorkflows().map((w) => w.id));

// ---- shared disambiguation guards ----------------------------------------
// A lead signal. Reused by the lead rule AND the campaign guard so a campaign
// named only as a lead's SOURCE doesn't get treated as a build request.
const LEAD_RE = /ליד(ים)?|\blead(s)?\b/i;
// Explicit build/create verbs — lets "תבנה קמפיין ללידים" stay a campaign
// build even though it mentions leads.
const BUILD_VERB_RE = /תבנ|תכין|בנ[הו]|ליצור|להקים|תיצור|\bbuild\b|\bcreate\b/i;
// Delete/removal verbs — a delete instruction is a CRM/removal action, never
// asset creation. Bare "מחק" is bounded so it can't match inside מחקר (research).
const DELETE_VERB_RE = /תמחק|תמחוק|למחוק|תסיר|להסיר|(^|\s)מחק(\s|$)|\bdelete\b|\bremove\b/i;

// ---- ordered classification rules (first match wins) ---------------------
// Hebrew has no word boundaries → substring regexes; English terms use \b.
// Order encodes precedence: the most specific product/creative intents are
// tested before broad CRM/advisory ones. Each rule is a pure predicate.
const RULES = [
  {
    intent: 'product_lock',
    confidence: 0.9,
    reason: 'זוהתה בקשת מוצר מדויק / החלפת רקע למוצר.',
    test: (t) => /מוצר\s*מדויק|product\s*lock/i.test(t)
      || (/מוצר|product/i.test(t) && /רקע|להחליף רקע|רקע חדש|קומפוזיט|לשמור.*לוגו|background/i.test(t)),
  },
  {
    intent: 'product_visual',
    confidence: 0.9,
    reason: 'זוהתה בקשת ויזואל מוצר (פרזנטור).',
    test: (t) => /פרזנטור|presenter/i.test(t)
      || /תמונת מוצר|ויזואל למוצר|תמונה למוצר/i.test(t)
      || (/מוצר|product/i.test(t) && /ויזואל|שיווקי|דוגמן|visual/i.test(t)),
  },
  {
    intent: 'build_campaign',
    confidence: 0.9,
    reason: 'זוהתה בקשת בניית קמפיין.',
    // A campaign mentioned only as a lead's SOURCE ("ליד חדש מהקמפיין") is a
    // CRM lead op — defer to the lead rule UNLESS an explicit build verb is
    // present ("תבנה קמפיין ללידים" is still a campaign build).
    test: (t) => /קמפיי?ן|campaign/i.test(t) && (!LEAD_RE.test(t) || BUILD_VERB_RE.test(t)),
  },
  {
    intent: 'create_content_plan',
    confidence: 0.9,
    reason: 'זוהתה בקשת תוכנית תוכן חודשית.',
    test: (t) => /חודש\s*תוכן|תוכנית\s*תוכן|לוח\s*תוכן|content\s*plan|content\s*calendar/i.test(t)
      || (/תוכנית/.test(t) && /חודש/.test(t)),
  },
  {
    intent: 'create_marketing_asset',
    confidence: 0.9,
    reason: 'זוהתה בקשת נכס שיווקי (פוסטר/מודעה).',
    // A delete instruction ("תמחק את הפוסט") is a removal/CRM action — the פוסט
    // substring must not hijack it into asset creation.
    test: (t) => !DELETE_VERB_RE.test(t)
      && /פוסטר|פוסט|מודעה|מודעת|באנר|סטורי|ריל|קריאייטיב|poster|banner|social post/i.test(t),
  },
  {
    intent: 'studio_prompt',
    confidence: 0.9,
    reason: 'זוהתה בקשת פרומפט ל-Studio.',
    test: (t) => /פרומפט|prompt|בריף\s*ל[-־]?\s*studio|בריף\s*לסטודיו|studio\s*prompt/i.test(t),
  },
  {
    intent: 'creative_workflow',
    confidence: 0.9,
    reason: 'זוהתה בקשת בחירת Workflow יצירתי.',
    test: (t) => /workflow|וורקפלואו|מפת\s*workflow/i.test(t)
      || /איזה\s*(תהליך|כלי|מצב|וורקפלואו)/i.test(t),
  },
  // crm_operation — lead-specific first (capability override), then general.
  {
    intent: 'crm_operation',
    capability: 'lead-management',
    confidence: 0.85,
    reason: 'זוהתה פעולת CRM (ניהול ליד).',
    test: (t) => LEAD_RE.test(t),
  },
  {
    intent: 'crm_operation',
    confidence: 0.85,
    reason: 'זוהתה פעולת CRM.',
    test: (t) => /לקוח(ות)?|משימ(ה|ות)|הצעת\s*מחיר|מלאי|פייפליין|client(s)?|task(s)?|quote|inventory|pipeline/i.test(t),
  },
  {
    intent: 'growth_strategy',
    confidence: 0.8,
    reason: 'זוהתה בקשת אסטרטגיית צמיחה / מוקד יומי.',
    test: (t) => (/מה\s*(כדאי|לעשות|הכי חשוב)/.test(t) && /היום|עכשיו/.test(t))
      || /מוקד\s*(פעולה|יומי)|תוכנית\s*פעולה|אסטרטגיי?ת?\s*צמיחה|צמיחה|growth\s*strategy/i.test(t),
  },
  {
    intent: 'business_strategy',
    confidence: 0.8,
    reason: 'זוהתה בקשת אסטרטגיה עסקית / מיצוב.',
    test: (t) => /לשווק|למכור|לבדל|בידול|מיצוב|יתרון\s*תחרותי|positioning|how\s*to\s*sell|marketing\s*strategy/i.test(t),
  },
  {
    intent: 'system_help',
    confidence: 0.75,
    reason: 'זוהתה בקשת עזרה על יכולות המערכת.',
    test: (t) => /מה\s*אתה\s*יכול|מה\s*היכולות|איך\s*אתה\s*עוזר|יכולות\s*המערכת|מה\s*המערכת\s*יודעת|what\s*can\s*you\s*do|\bhelp\b/i.test(t),
  },
  {
    intent: 'general_chat',
    confidence: 0.7,
    reason: 'שיחה כללית / זהות.',
    test: (t) => /מי\s*אתה|מה\s*שלומ|שלום|בוקר טוב|ערב טוב|תודה|who\s*are\s*you|hello|thanks/i.test(t),
  },
];

// ---- normalization -------------------------------------------------------
const clean = (userText) => (typeof userText === 'string' ? userText.trim() : '');

// ---- public API ----------------------------------------------------------

// Which of the stable intents does this text express? Deterministic; empty /
// non-string / no match → 'unknown'. Never throws.
export function classifyIntent(userText) {
  const t = clean(userText);
  if (!t) return 'unknown';
  for (const rule of RULES) {
    if (rule.test(t)) return rule.intent;
  }
  return 'unknown';
}

// intent → canonical system capability (text-independent). Unknown → null.
export function resolveCapability(intent) {
  return Object.prototype.hasOwnProperty.call(INTENT_CAPABILITY, intent)
    ? INTENT_CAPABILITY[intent]
    : null;
}

// intent → a VALIDATED live workflow id, or null. Reuses the live registry:
// a mapped id that is not currently live (or no mapping) yields null, so a
// soon/deferred workflow can never be selected.
export function resolveWorkflow(intent) {
  const id = INTENT_WORKFLOW[intent];
  return id && LIVE_WORKFLOW_IDS.has(id) ? id : null;
}

// The full deterministic decision. Never throws; always returns the stable
// shape { intent, domain, capability, workflow, confidence, reason }.
export function buildDecision(userText) {
  const t = clean(userText);
  if (!t) {
    return {
      intent: 'unknown',
      domain: INTENT_DOMAIN.unknown,
      capability: null,
      workflow: null,
      confidence: 0.3,
      reason: 'קלט ריק או לא תקין.',
    };
  }
  for (const rule of RULES) {
    if (!rule.test(t)) continue;
    const intent = rule.intent;
    return {
      intent,
      domain: INTENT_DOMAIN[intent],
      // a rule may override the canonical capability (lead-management) —
      // otherwise use the intent's text-independent default.
      capability: rule.capability ?? resolveCapability(intent),
      workflow: resolveWorkflow(intent),
      confidence: rule.confidence,
      reason: rule.reason,
    };
  }
  return {
    intent: 'unknown',
    domain: INTENT_DOMAIN.unknown,
    capability: null,
    workflow: null,
    confidence: 0.3,
    reason: 'לא זוהתה כוונה ברורה.',
  };
}
