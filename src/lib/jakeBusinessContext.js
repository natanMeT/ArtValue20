// ===================================================================
// jakeBusinessContext — conditional Business Brain grounding for Jake's
// FREE-FORM lanes (drafting + default chat). Pure and deterministic:
// no window, no network, no clock, no randomness, no engine imports.
//
// The router is CONSERVATIVE by design: business/marketing/content/
// Studio-flavored messages get the compact Business Brain appended to
// the live CRM context; ordinary CRM/ERP operational messages stay
// lean. A router miss just means today's behavior (no regression); a
// false positive costs only a bounded extra context block.
//
// Ask-Jake button prompts (Growth + BusinessBrainPanel) already carry
// their own brain context — they are detected via the shared safety
// sentinel and never double-pay.
// ===================================================================

import { buildAccountBusinessContext, hasDurableProfile } from '../data/businessBrain.js';

// Dedupe sentinel: the first Business Brain safety rule, present in EVERY
// brain builder output (buildPosterBrief / campaign / plan / studio seeds).
export const BUSINESS_CONTEXT_MARKER = 'אל תמציא נתונים שלא סופקו.';

// STRONG terms — marketing/content/Studio words that alone mark a business
// request. Hebrew substrings (no word boundaries in Hebrew) + English \b terms.
const STRONG_HE = /(פוסטר|פוסט|פרסום|שיווק|שווק|תוכן|מודע(ה|ות)|קופי|סלוגן|מיתוג|באנר|סטורי|ריל|קמפיין|פרומפט|סטודיו|ויזואל|תמונה למוצר|בריף)/;
const STRONG_EN = /\b(post|poster|marketing|campaign|content|copy|slogan|branding|banner|story|reel|studio|prompt|visual)\b/i;

// WEAK terms — service/product words that are common in operational CRM
// messages too ("תוסיף לקוח למערכת"). They count only together with a
// sell/positioning/offer INTENT.
const WEAK = /(crm|אוטומציה|אוטומציות|מערכת|אתר|דף נחיתה|שירות|automation|website|landing page|service)/i;
const INTENT = /(למכור|מכירה|לבדל|בידול|הצעה ללקוח|לקוחות חדשים|קהל|offer|sell|positioning|audience)/i;

// Does this free-form message deserve Business Brain grounding (marketing/
// content/Studio intent)?
export function shouldIncludeBusinessBrain(userText) {
  if (typeof userText !== 'string') return false;
  const t = userText.trim();
  if (!t) return false;
  if (STRONG_HE.test(t) || STRONG_EN.test(t)) return true;
  return WEAK.test(t) && INTENT.test(t);
}

// S0D: DIRECT Business-Context questions — a user asking ABOUT their saved
// profile (name / positioning / audiences / tone / differentiators / services /
// brand palette / the business context itself). These do not match the
// marketing router, but must still surface the account profile (configured) or
// the truthful neutral "not configured" block (unconfigured) — never hardcoded
// ArtValue facts and never a bare/lean answer that invents them.
const CONTEXT_Q_HE = /(שם ה?עסק|שם ה?חברה|פרופיל ה?עסק|הפרופיל של ה?עסק|הקשר ה?עסקי|מיצוב|בידול|מה מייחד|קהל ה?יעד|קהלי ה?יעד|הקהל שלי|טון ה?דיבור|טון ה?מותג|הטון שלי|צבעי ה?מותג|פלטת|פלטה|השירותים שלי|שירותים שהגדרתי|איזה שירותים)/;
const CONTEXT_Q_EN = /\b(business name|company name|business profile|business context|positioning|target audience|tone of voice|differentiators|brand palette|brand colou?rs|my services)\b/i;
export function isBusinessContextQuestion(userText) {
  if (typeof userText !== 'string') return false;
  const t = userText.trim();
  if (!t) return false;
  return CONTEXT_Q_HE.test(t) || CONTEXT_Q_EN.test(t);
}

// Capabilities are SUGGESTIONS — Jake proposes, the user executes/approves.
const ANTI_CLAIM = [
  'כלל פעולה נוסף:',
  'היכולות למעלה הן הצעות בלבד — אל תטען שיצרת תמונה, פרסמת פוסט או שלחת הודעה; הצע את הצעד ותן למשתמש לבצע/לאשר.',
].join('\n');

// Append the ACCOUNT-AWARE Business Context AFTER the live CRM context (which
// stays first — it is the accuracy-critical source of truth). Exactly ONE
// business block; the third argument is the signed-in account's DURABLE profile
// (or null when unconfigured), rendered as THAT account's approved facts or a
// neutral "not configured" block — NEVER the hardcoded ArtValue BUSINESS_BRAIN.
//
// When to append:
//   * dedupe (always first): a button-seed prompt already carries a brain-built
//     block (the marker) → return the context unchanged (no double block).
//   * CONFIGURED account → ALWAYS append its account context, so both generic
//     drafting AND direct profile questions ("מה שם העסק שלי?") are grounded —
//     not gated on the conservative marketing router.
//   * UNCONFIGURED account → append the neutral block only for marketing/content
//     requests OR direct Business-Context questions; ordinary operational CRM
//     messages stay lean.
export function withBusinessBrain(contextText, userText, businessProfile = null) {
  const base = String(contextText ?? '');
  // Button seeds carry their own brain block → never double-pay (dedupe first).
  if (String(userText ?? '').includes(BUSINESS_CONTEXT_MARKER)) return base;

  const include = hasDurableProfile(businessProfile)
    ? true // configured → ground every free-form chat/draft turn
    : (shouldIncludeBusinessBrain(userText) || isBusinessContextQuestion(userText));
  if (!include) return base;

  const brain = buildAccountBusinessContext(businessProfile, { maxCapabilities: 8 });
  return `${base}\n\n${brain}\n\n${ANTI_CLAIM}`;
}
