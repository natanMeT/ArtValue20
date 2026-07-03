// ===================================================================
// Growth OS — Deterministic Context Pack
// Pure, deterministic text builders. NO persistence, NO store, NO AI,
// NO provider, NO network, NO events, NO Date.now, NO randomness.
//
// Composes the existing Growth OS data modules (lead mapping, calendar
// planning, call prep, content library) into compact Hebrew context
// strings and prompt seeds. These are PREPARED for a future slice that
// may embed them into the existing `jake:ask` seam — nothing here
// dispatches events or touches the assistant engine.
// ===================================================================

import { CALENDAR_DEFAULTS, CALENDAR_DISCLAIMER, CALENDAR_ACTIONS, planFromTargets, rankCategoryFocus } from './growthCalendar.js';
import { buildCallPrep } from './growthCalls.js';
import { POSITIONING } from './growthContentAds.js';

// Bounded output — keeps a future prompt comfortably small.
const DEFAULTS = {
  categoryLimit: 3,
  templateLimit: 3,
};

const ACTION_LABELS = Object.fromEntries(CALENDAR_ACTIONS.map((a) => [a.key, a.label]));

// Grounding + manual-only rules appended to every context/prompt. The
// no-guarantees line matches the calendar's own planning disclaimer.
export const GROWTH_CONTEXT_SAFETY = [
  'לא לשלוח, לא לפרסם ולא להתקשר אוטומטית — להציע צעדים ידניים בלבד.',
  'לא להבטיח תוצאות או לוחות זמנים — כל המספרים הם הערכה תכנונית בלבד.',
  'להתבסס רק על המידע שבהקשר הזה — לא להמציא נתונים חיצוניים.',
];

const safetyBlock = () => ['כללי בטיחות:', ...GROWTH_CONTEXT_SAFETY.map((r) => `- ${r}`)].join('\n');

// ---- full Growth OS context ----------------------------------------------
// Compact Hebrew snapshot: purpose, monthly plan volumes, top focus
// categories with their recommended offer. Safe defaults mirror the
// Growth Calendar (its state is local UI state, never persisted).
// Forwards ALL planning assumptions (target, avgDeal, closeRate,
// qualifyRate, workDays) so a caller showing an edited plan can hand
// Jake the SAME numbers; planFromTargets back-fills any missing one
// with the calendar defaults.
const planFromOptions = (options) => planFromTargets({
  target: options.target ?? CALENDAR_DEFAULTS.target,
  avgDeal: options.avgDeal ?? CALENDAR_DEFAULTS.avgDeal,
  closeRate: options.closeRate,
  qualifyRate: options.qualifyRate,
  workDays: options.workDays,
});

export function buildGrowthContext(options = {}) {
  const categoryLimit = options.categoryLimit ?? DEFAULTS.categoryLimit;
  const plan = planFromOptions(options);
  const focus = rankCategoryFocus(categoryLimit);

  const actionLines = Object.entries(plan.actions)
    .map(([key, count]) => `- ${ACTION_LABELS[key] || key}: ${count} בחודש`)
    .join('\n');

  const focusLines = focus
    .map((f, i) => `${i + 1}. ${f.label} — ${f.who} הצעה מומלצת: ${f.offerName}${f.priceBand ? ` (${f.priceBand})` : ''}. למה מתאים: ${f.whyFit}`)
    .join('\n');

  return [
    'הקשר Growth OS של ArtValue:',
    '',
    'מטרת המערכת:',
    `ArtValue בונה לעסקים מערכות דיגיטליות (${POSITIONING.services}). Growth OS הוא מרכז הצמיחה הפנימי: מיפוי קטגוריות לידים, לוח פעולה חודשי, הכנת שיחות וספריית תוכן.`,
    '',
    `תוכנית חודשית (יעד ₪${plan.inputs.target.toLocaleString('en-US')}, עסקה ממוצעת ₪${plan.inputs.avgDeal.toLocaleString('en-US')} — ${CALENDAR_DISCLAIMER}):`,
    `- עסקאות נדרשות: ${plan.dealsNeeded} · לידים לפנייה: ${plan.leadsToApproach} · ~${plan.perDay} פעולות ביום`,
    actionLines,
    '',
    `קטגוריות מיקוד מומלצות (לפי פוטנציאל, דחיפות והסתברות סגירה):`,
    focusLines,
    '',
    safetyBlock(),
  ].join('\n');
}

// ---- short daily-focus context --------------------------------------------
export function buildGrowthDailyFocusContext(options = {}) {
  const plan = planFromOptions(options);
  const top = rankCategoryFocus(1)[0];

  return [
    'מוקד פעולה יומי — Growth OS של ArtValue:',
    `- קצב נדרש: ~${plan.perDay} פעולות ביום (וואטסאפ ${plan.actions.whatsapp}, שיחות ${plan.actions.calls}, פולואפים ${plan.actions.followUps} בחודש).`,
    top ? `- קטגוריית המיקוד המובילה: ${top.label} — ${top.whyFit} הצעה: ${top.offerName}.` : '',
    `- ${CALENDAR_DISCLAIMER}.`,
    '',
    safetyBlock(),
  ].filter(Boolean).join('\n');
}

// ---- one-category deep context --------------------------------------------
// Unknown / missing id → a safe generic fallback string (never throws).
export function buildGrowthCategoryContext(categoryId, options = {}) {
  const templateLimit = options.templateLimit ?? DEFAULTS.templateLimit;
  const prep = buildCallPrep(categoryId);
  if (!prep) {
    return [
      'הקשר קטגוריה — Growth OS של ArtValue:',
      'הקטגוריה המבוקשת לא נמצאה במיפוי הלידים. אפשר לעבוד לפי קטגוריות המיקוד הכלליות.',
      '',
      safetyBlock(),
    ].join('\n');
  }

  const templates = (prep.templates || []).slice(0, templateLimit);
  const templateLines = templates.length
    ? templates.map((t) => `- ${t.title}${t.cta ? ` (קריאה לפעולה: ${t.cta})` : ''}`).join('\n')
    : '- אין תבניות מותאמות — אפשר להשתמש בתבניות הפולואפ הכלליות.';

  return [
    `הקשר קטגוריה — ${prep.label} (Growth OS של ArtValue):`,
    '',
    `מי הלקוח: ${prep.who}`,
    `כאבים מרכזיים: ${prep.pains.join(' · ')}`,
    `הצעה מומלצת: ${prep.offer ? prep.offer.name : '—'}${prep.hasEntry && prep.entryOffer ? ` (כניסה: ${prep.entryOffer.name})` : ''}`,
    `למה מתאים: ${prep.whyFit}`,
    `ערך צפוי ללקוח: ${prep.expectedValue}`,
    `הפעולה המומלצת: ${prep.action ? prep.action.label : '—'}`,
    `התנגדות נפוצה: "${prep.objection}" → מענה: "${prep.response}"`,
    `הוכחות לשיחה: ${prep.proof.join(' · ')}`,
    '',
    'תבניות תוכן מתאימות:',
    templateLines,
    '',
    safetyBlock(),
  ].join('\n');
}

// ---- prompt builder --------------------------------------------------------
// A final deterministic prompt string a future slice can pass to the
// existing jake:ask seam. This module never dispatches it.
const ANSWER_STYLE = [
  'סגנון תשובה נדרש:',
  '- לענות בעברית, קצר ופרקטי.',
  '- להמליץ על צעדים ידניים בלבד — בלי שליחה/פרסום/חיוג אוטומטיים.',
  '- בלי הבטחות תוצאה ובלי הגזמות.',
  '- להתבסס רק על ההקשר שסופק ועל נתוני ה-CRM שכבר יש לך; לא להמציא נתונים.',
].join('\n');

export function buildGrowthAskPrompt(question, options = {}) {
  const q = (typeof question === 'string' && question.trim()) || 'מה כדאי לי לעשות עכשיו כדי להתקדם?';
  const context = options.categoryId
    ? buildGrowthCategoryContext(options.categoryId, options)
    : buildGrowthContext(options);

  return [
    `שאלה: ${q}`,
    '',
    context,
    '',
    ANSWER_STYLE,
  ].join('\n');
}

// ---- canned prompt seeds ----------------------------------------------------
// type → question + which context flavor to use. Unknown type → daily focus.
// Category-flavored seeds carry a `generic` variant so the question stays
// coherent ("הקטגוריה הזו" must not dangle) when no categoryId is given.
const PROMPT_SEEDS = {
  daily_focus: {
    question: 'תכין לי מוקד פעולה להיום: 3 הצעדים הכי חשובים לפי התוכנית.',
    daily: true,
  },
  call_prep: {
    question: 'תכין אותי לשיחה עם ליד מהקטגוריה הזו: פתיחה, נקודות מפתח ומענה להתנגדות.',
    generic: 'תכין אותי לשיחת מכירה עם ליד: פתיחה, נקודות מפתח ומענה להתנגדות נפוצה.',
  },
  category_strategy: {
    question: 'מה האסטרטגיה הכי טובה לתקוף את הקטגוריה הזו החודש?',
    generic: 'איזו קטגוריית לידים הכי שווה לתקוף החודש, ומה האסטרטגיה?',
  },
  content_recommendation: {
    question: 'איזה תוכן או מודעה הכי שווה להכין עכשיו לקטגוריה הזו, ולמי לכוון אותם?',
    generic: 'איזה תוכן או מודעה הכי שווה להכין עכשיו, ולמי לכוון אותם?',
  },
  objection_handling: {
    question: 'איך לענות להתנגדות הנפוצה של הקטגוריה הזו בצורה משכנעת ולא לחוצה?',
    generic: 'איך לענות להתנגדויות נפוצות של לידים בצורה משכנעת ולא לחוצה?',
  },
};

export const GROWTH_PROMPT_SEED_TYPES = Object.keys(PROMPT_SEEDS);

export function buildGrowthPromptSeed(type, options = {}) {
  const seed = PROMPT_SEEDS[type] || PROMPT_SEEDS.daily_focus;
  if (seed.daily && !options.categoryId) {
    return [
      `שאלה: ${seed.question}`,
      '',
      buildGrowthDailyFocusContext(options),
      '',
      ANSWER_STYLE,
    ].join('\n');
  }
  const question = options.categoryId ? seed.question : (seed.generic || seed.question);
  return buildGrowthAskPrompt(question, options);
}
