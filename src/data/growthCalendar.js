// ===================================================================
// Growth OS — Monthly Action Calendar (Slice 3)
// Pure, deterministic planning model. NO persistence, NO store, NO AI,
// NO network, NO Date.now, NO randomness. Imports ONLY from growthLeads.js
// (pure data) — never from src/creative/v2/offer/**.
//
// Translates a monthly income target into suggested activity volume, a
// 4-week focus breakdown, and prioritized lead categories. All numbers are
// planning estimates, never guarantees.
// ===================================================================

import {
  LEAD_CATEGORIES, serviceById, formatBand, levelMeta, actionById,
} from './growthLeads.js';

// Approved default planning assumptions (editable in the UI, never saved).
export const CALENDAR_DEFAULTS = {
  target: 20000,
  avgDeal: 5000,
  closeRate: 25,   // %
  qualifyRate: 30, // %
  workDays: 18,
};

export const CALENDAR_DISCLAIMER = 'הערכה תכנונית בלבד · לא תחזית מובטחת · ניתן לשינוי לפי המציאות';

// ---- safe numeric helpers (no NaN / no Infinity) ----
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const clampMin = (v, min) => (v < min ? min : v);

// Feasibility meta (advisory only). Reuses existing badge tones.
export const FEASIBILITY = {
  feasible: { id: 'feasible', label: 'אפשרי', cls: 'badge-completed' },
  tight: { id: 'tight', label: 'צפוף', cls: 'badge-payment' },
  unrealistic: { id: 'unrealistic', label: 'לא ריאלי כרגע', cls: 'badge-lost' },
};

// Calendar-local action display model (keys match planFromTargets().actions).
export const CALENDAR_ACTIONS = [
  { key: 'whatsapp',  label: 'הודעות וואטסאפ',          icon: 'whatsapp', note: 'פנייה ראשונה לכל ליד' },
  { key: 'calls',     label: 'שיחות טלפון',             icon: 'phone',    note: 'שיחה עם מי שהגיב' },
  { key: 'followUps', label: 'פולואפים',               icon: 'refresh',  note: 'מעקב אחרי מי שלא סגר' },
  { key: 'demos',     label: 'דמואים להכין',           icon: 'wand',     note: 'הדגמה ממוקדת לליד רציני' },
  { key: 'meetings',  label: 'פגישות',                 icon: 'calendar', note: 'פגישת עומק / הצגה' },
  { key: 'proposals', label: 'הצעות מחיר',             icon: 'doc',      note: 'הצעה כתובה לסגירה' },
  { key: 'content',   label: 'תוכן / פוסטרים / מודעות', icon: 'image',    note: 'נכסי שיווק לחיזוק הפנייה' },
];

// ---- core planning math (pure, deterministic) ----
export function planFromTargets(input = {}) {
  const target = clampMin(num(input.target, 0), 0);
  const avgDeal = clampMin(num(input.avgDeal, CALENDAR_DEFAULTS.avgDeal), 1);      // ≥1 → no /0
  const closeRate = clampMin(num(input.closeRate, CALENDAR_DEFAULTS.closeRate), 1); // %, ≥1
  const qualifyRate = clampMin(num(input.qualifyRate, CALENDAR_DEFAULTS.qualifyRate), 1); // %, ≥1
  const workDays = clampMin(num(input.workDays, CALENDAR_DEFAULTS.workDays), 1);

  const dealsNeeded = Math.ceil(target / avgDeal);
  const qualifiedLeadsNeeded = Math.ceil(dealsNeeded / (closeRate / 100));
  const leadsToApproach = Math.ceil(qualifiedLeadsNeeded / (qualifyRate / 100));

  const actions = {
    whatsapp: leadsToApproach,
    calls: qualifiedLeadsNeeded,
    followUps: qualifiedLeadsNeeded * 2,
    demos: qualifiedLeadsNeeded,
    meetings: qualifiedLeadsNeeded,
    proposals: qualifiedLeadsNeeded,
    content: 6,
  };

  const totalTouches = Object.values(actions).reduce((s, n) => s + n, 0);
  const perDay = Math.round((totalTouches / workDays) * 10) / 10;

  let feasibility = 'feasible';
  if (perDay > 20) feasibility = 'unrealistic';
  else if (perDay > 12) feasibility = 'tight';

  return {
    inputs: { target, avgDeal, closeRate, qualifyRate, workDays },
    dealsNeeded,
    qualifiedLeadsNeeded,
    leadsToApproach,
    actions,
    totalTouches,
    perDay,
    feasibility,
  };
}

// ---- 4-week breakdown (deterministic allocation that sums to monthly totals) ----
const WEEK_META = [
  { id: 'w1', title: 'שבוע 1 — מיפוי + פנייה ראשונית', instruction: 'מיפוי קטגוריות, בניית רשימת לידים ושליחת פניות ראשונות.' },
  { id: 'w2', title: 'שבוע 2 — דמואים + פולואפ',       instruction: 'הכנת דמואים ממוקדים ומעקב אחרי מי שלא ענה.' },
  { id: 'w3', title: 'שבוע 3 — שיחות + הצעות מחיר',     instruction: 'שיחות עומק, פגישות ושליחת הצעות מחיר.' },
  { id: 'w4', title: 'שבוע 4 — סגירה + סיכום',          instruction: 'סגירות, פולואפ אחרון וסיכום מה עבד החודש.' },
];

// Per-action weekly weights (4 numbers summing to 1) — front-loaded outreach,
// back-loaded closing.
const WEEK_WEIGHTS = {
  whatsapp:  [0.4, 0.3, 0.2, 0.1],
  calls:     [0.1, 0.2, 0.4, 0.3],
  followUps: [0.1, 0.35, 0.25, 0.3],
  demos:     [0.1, 0.5, 0.3, 0.1],
  meetings:  [0.1, 0.2, 0.4, 0.3],
  proposals: [0.0, 0.1, 0.5, 0.4],
  content:   [0.4, 0.2, 0.2, 0.2],
};

// Largest-remainder split of an integer total across weights → integers summing
// exactly to total (deterministic, never negative).
function splitInteger(total, weights) {
  const t = Math.max(0, Math.round(total));
  const raw = weights.map((w) => t * w);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = t - floors.reduce((s, n) => s + n, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = floors.slice();
  for (let k = 0; k < order.length && remainder > 0; k++) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}

export function weeklyBreakdown(plan) {
  const actions = (plan && plan.actions) || {};
  const splits = {};
  for (const key of Object.keys(WEEK_WEIGHTS)) {
    splits[key] = splitInteger(num(actions[key], 0), WEEK_WEIGHTS[key]);
  }
  return WEEK_META.map((meta, w) => {
    const weekActions = {};
    for (const key of Object.keys(WEEK_WEIGHTS)) weekActions[key] = splits[key][w];
    return { ...meta, actions: weekActions };
  });
}

// ---- lead-category focus ranking (deterministic, top 5) ----
const LEVEL_SCORE = { high: 3, medium: 2, low: 1 };
const score = (cat) =>
  (LEVEL_SCORE[cat.salesPotential] || 0) +
  (LEVEL_SCORE[cat.closeProbability] || 0) +
  (LEVEL_SCORE[cat.urgency] || 0);

export function rankCategoryFocus(limit = 5) {
  return LEAD_CATEGORIES
    .map((cat, i) => ({ cat, i, s: score(cat) }))
    .sort((a, b) => b.s - a.s || a.i - b.i) // stable tiebreak by original order
    .slice(0, limit)
    .map(({ cat }) => {
      const offer = serviceById(cat.offerId);
      const action = actionById(cat.action);
      return {
        id: cat.id,
        label: cat.label,
        who: cat.who,
        whyFit: cat.whyFit,
        offerName: offer ? offer.name : '',
        priceBand: offer ? formatBand(offer) : '',
        potential: levelMeta('salesPotential', cat.salesPotential),
        urgency: levelMeta('urgency', cat.urgency),
        action: action ? { label: action.label, icon: action.icon } : null,
      };
    });
}
