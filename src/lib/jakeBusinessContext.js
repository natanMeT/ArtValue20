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

import { buildBusinessBrainContext } from '../data/businessBrain.js';

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

// Does this free-form message deserve Business Brain grounding?
export function shouldIncludeBusinessBrain(userText) {
  if (typeof userText !== 'string') return false;
  const t = userText.trim();
  if (!t) return false;
  if (STRONG_HE.test(t) || STRONG_EN.test(t)) return true;
  return WEAK.test(t) && INTENT.test(t);
}

// Capabilities are SUGGESTIONS — Jake proposes, the user executes/approves.
const ANTI_CLAIM = [
  'כלל פעולה נוסף:',
  'היכולות למעלה הן הצעות בלבד — אל תטען שיצרת תמונה, פרסמת פוסט או שלחת הודעה; הצע את הצעד ותן למשתמש לבצע/לאשר.',
].join('\n');

// Append the compact Business Brain AFTER the live CRM context (which stays
// first — it is the accuracy-critical source of truth). Returns the original
// context unchanged when the router says no, or when the user message already
// carries a brain-built prompt (button seeds — the sentinel dedupe).
export function withBusinessBrain(contextText, userText) {
  const base = String(contextText ?? '');
  if (!shouldIncludeBusinessBrain(userText)) return base;
  if (String(userText).includes(BUSINESS_CONTEXT_MARKER)) return base;
  const brain = buildBusinessBrainContext({ maxServices: 6, maxCapabilities: 8 });
  return `${base}\n\n${brain}\n\n${ANTI_CLAIM}`;
}
