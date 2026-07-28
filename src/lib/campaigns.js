// ===================================================================
// campaigns — the SINGLE pure boundary for the durable per-account BUSINESS
// campaign (Campaigns slice 1). Field rules, the status transition graph and
// row normalization all live here, so the IO layer (`api.js`) and the UI
// (`Campaigns.jsx`) cannot invent their own.
//
// NAMING BOUNDARY -- READ THIS BEFORE EXTENDING ANYTHING HERE.
//   A CAMPAIGN (this file, public.campaigns) is a durable, per-account
//   business object with a lifecycle and dates.
//   A CREATIVE SESSION (`src/creative/v2/campaignStore.js`) is a device-local
//   localStorage record of one brief -> 3 concepts -> selection. It uses the
//   same English word and is NOT the same thing: different lifetime, different
//   storage, different owner module.
//   This file MUST NOT import from `src/creative/v2/**`, and nothing under
//   `src/creative/v2/**` may import this file. The two vocabularies stay
//   separate on purpose; a shared enum is exactly how they would merge.
//   (Mirrors the existing never-import-`offer/` rule; pinned by a test.)
//
// Pure + dependency-free: NO store, NO network, NO React, NO Supabase,
// NO clock, NO randomness. Mirrors the assetLibrary.js / businessProfile.js
// precedent.
//
// AUTHORITY. Every rule here is a CLIENT-SIDE MIRROR of a server rule, kept so
// the user gets a truthful message instead of an opaque failure. The server is
// authoritative in every case:
//   * title / objective length -> campaigns_title_bounded, campaigns_objective_bounded
//   * status domain            -> campaigns_status_allowed
//   * status transitions       -> trg_campaigns_status_transition (errcode 23514)
//   * date order               -> campaigns_date_order
//   * 200-row quota            -> WITH CHECK of campaigns_insert_own
//   * ownership                -> RLS, all four policies
// When the two disagree, the SERVER wins and its refusal is surfaced as a
// failure. This file never decides that a write succeeded.
// ===================================================================

// Mirrors campaigns_title_bounded / campaigns_objective_bounded.
export const CAMPAIGN_LIMITS = Object.freeze({ title: 120, objective: 200 });

// Mirrors the `< 200` in the campaigns_insert_own WITH CHECK. ADVISORY ONLY --
// it exists to refuse before attempting a write, never to authorize one.
export const CAMPAIGN_QUOTA = 200;

// Mirrors campaigns_status_allowed.
export const CAMPAIGN_STATUSES = Object.freeze(['draft', 'active', 'completed', 'cancelled']);

export const CAMPAIGN_STATUS_LABELS = Object.freeze({
  draft: 'טיוטה',
  active: 'פעיל',
  completed: 'הושלם',
  cancelled: 'בוטל',
});

// Badge classes reused from the existing design system (no new CSS).
export const CAMPAIGN_STATUS_CLASS = Object.freeze({
  draft: 'badge-payment',
  active: 'badge-completed',
  completed: 'badge-completed',
  cancelled: 'badge-lost',
});

// Byte-for-byte mirror of the trigger's graph. `completed` and `cancelled` are
// TERMINAL (declared limitation L2 in the migration): reopening is out of scope
// for this slice, by design, not by omission.
export const CAMPAIGN_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['active', 'cancelled']),
  active: Object.freeze(['completed', 'cancelled']),
  completed: Object.freeze([]),
  cancelled: Object.freeze([]),
});

/**
 * Is `from -> to` a legal transition? An unchanged status is always legal
 * (editing a title must never be refused). Unknown states are never legal.
 * ADVISORY: the trigger is the authority.
 */
export function canTransition(from, to) {
  if (!CAMPAIGN_STATUSES.includes(from) || !CAMPAIGN_STATUSES.includes(to)) return false;
  if (from === to) return true;
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

/** The states reachable from `from`, for rendering only the legal buttons. */
export function nextStatuses(from) {
  return CAMPAIGN_STATUSES.includes(from) ? [...CAMPAIGN_TRANSITIONS[from]] : [];
}

const str = (v) => (v == null ? '' : String(v)).trim();

// A date input is either blank or an ISO calendar date. Anything else is a
// visible error, never a silently dropped field.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(v, field, errors) {
  const s = str(v);
  if (!s) return null;
  if (!DATE_RE.test(s)) {
    errors.push(`${field}: תאריך חייב להיות בפורמט YYYY-MM-DD`);
    return null;
  }
  // Reject a well-formed string that is not a real calendar date (2026-02-31).
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    errors.push(`${field}: תאריך לא קיים`);
    return null;
  }
  return s;
}

/**
 * Validate + normalize the editable fields of a campaign.
 * Over-limit is a visible ERROR, never a silent truncation of saved data
 * (the businessProfile.js rule).
 *
 * @returns {{ ok: boolean, errors: string[], value: null | {
 *   title: string, objective: string|null,
 *   startDate: string|null, endDate: string|null } }}
 */
export function validateCampaign(input = {}) {
  const errors = [];
  const src = input && typeof input === 'object' ? input : {};

  const title = str(src.title);
  if (!title) errors.push('שם הקמפיין הוא שדה חובה');
  else if (title.length > CAMPAIGN_LIMITS.title) {
    errors.push(`שם הקמפיין ארוך מ-${CAMPAIGN_LIMITS.title} תווים`);
  }

  const objectiveRaw = str(src.objective);
  if (objectiveRaw.length > CAMPAIGN_LIMITS.objective) {
    errors.push(`מטרת הקמפיין ארוכה מ-${CAMPAIGN_LIMITS.objective} תווים`);
  }

  const startDate = normalizeDate(src.startDate, 'תאריך התחלה', errors);
  const endDate = normalizeDate(src.endDate, 'תאריך סיום', errors);
  if (startDate && endDate && endDate < startDate) {
    errors.push('תאריך הסיום מוקדם מתאריך ההתחלה');
  }

  if (errors.length) return { ok: false, errors, value: null };
  return {
    ok: true,
    errors: [],
    value: { title, objective: objectiveRaw || null, startDate, endDate },
  };
}

/**
 * Advisory pre-refusal for the 200-row quota. Returns true when a create may
 * be ATTEMPTED — never when it has succeeded.
 */
export function canCreateWithin(currentCount) {
  // `typeof === 'number'` deliberately, NOT Number(): Number(null), Number('')
  // and Number([]) are all 0, so a coercing check would read "no campaigns yet"
  // from a value that actually means "the count is unknown" and permit the
  // attempt. An unknown count must refuse.
  if (typeof currentCount !== 'number' || !Number.isFinite(currentCount)) return false;
  return currentCount >= 0 && currentCount < CAMPAIGN_QUOTA;
}

/**
 * Cloud row -> the canonical camelCase in-memory shape. Returns null for a row
 * that cannot be trusted (missing id/user_id/title, or an unknown status), so a
 * malformed row is dropped rather than rendered as a half-campaign.
 */
export function normalizeCampaignRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = str(row.id);
  const userId = str(row.user_id);
  const title = str(row.title);
  const status = str(row.status);
  if (!id || !userId || !title) return null;
  if (!CAMPAIGN_STATUSES.includes(status)) return null;
  return {
    id,
    userId,
    title,
    objective: str(row.objective) || null,
    status,
    startDate: str(row.start_date) || null,
    endDate: str(row.end_date) || null,
    createdAt: str(row.created_at) || null,
    updatedAt: str(row.updated_at) || null,
  };
}

/** Newest first, matching the campaigns_user_created_idx ordering. */
export function sortCampaignsNewestFirst(items) {
  return [...(Array.isArray(items) ? items : [])]
    .filter(Boolean)
    .sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)));
}
