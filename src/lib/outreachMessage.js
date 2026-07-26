// ===================================================================
// S0F.1 — account-aware cold-outreach opening message (pure, deterministic).
// No React, no DOM, no network, no storage, no clock, no randomness.
//
// WHY: the legacy category templates in src/data/outreach.js open with
// "שמי נתן מ-Art Value…" — one specific person and one specific business.
// In the authenticated cloud beta that copy is shown to EVERY signed-in
// account, so it both leaks ArtValue's positioning and re-introduces a
// named person (the identity class of blocker S0C closed elsewhere).
//
// CONTRACT (locked S0F.1 product decisions):
//   * Every fact comes from the ACTIVE account: the session-derived display
//     name (S0C) + the durable, approved Business Context (S0D) + the
//     account's own lead record. Nothing else.
//   * A business name is REQUIRED to build a message. Without it we return
//     null and the caller shows a truthful "setup required" state — we never
//     invent a business name, services or a sender identity, and we never
//     fall back to the legacy ArtValue/Nathan copy.
//   * Optional profile fields are simply omitted when empty (no filler).
//   * Pure text only: this module never sends, queues or delivers anything.
// ===================================================================

const str = (v) => (typeof v === 'string' ? v.trim() : '');

const MAX_SERVICES = 3;

// Truthful state shown instead of a message when the account has no approved
// Business Context yet. The caller pairs it with the existing setup entry point.
export const OUTREACH_SETUP_REQUIRED =
  'כדי להכין הודעת פנייה בשם העסק שלך צריך קודם להשלים את ההקשר העסקי (שם העסק, מיצוב ושירותים) בהגדרות. עד אז לא נציג נוסח — כדי לא להמציא פרטים על העסק שלך.';

/**
 * Can an account-aware message be built at all?
 * Mirrors the S0D "usable profile" floor: a business name must be present.
 */
export function canBuildAccountOutreach(businessProfile) {
  const p = businessProfile;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  return Boolean(str(p.businessName));
}

// Approved service names only (never pitches — the opening stays short).
function serviceNames(businessProfile) {
  const list = Array.isArray(businessProfile.services) ? businessProfile.services : [];
  return list
    .map((s) => (s && typeof s === 'object' ? str(s.name) : str(s)))
    .filter(Boolean)
    .slice(0, MAX_SERVICES);
}

/**
 * Build the opening message from the active account's own facts.
 * @param {{ leadName?: string, need?: string, senderName?: string,
 *           businessProfile?: object }} args
 * @returns {string|null} null when the account has no usable Business Context.
 */
export function buildAccountOutreachMessage({ leadName, need, senderName, businessProfile } = {}) {
  if (!canBuildAccountOutreach(businessProfile)) return null;

  const p = businessProfile;
  const business = str(p.businessName);
  const sender = str(senderName);
  const lead = str(leadName);
  const positioning = str(p.positioning);
  const services = serviceNames(p);
  const leadNeed = str(need);

  const lines = [];
  lines.push(`היי ${lead || '{שם העסק}'} 👋`);
  lines.push(sender ? `שמי ${sender} מ־${business}.` : `אנחנו מ־${business}.`);
  if (positioning) lines.push(positioning);
  if (services.length) lines.push(`אנחנו עוזרים בעיקר עם: ${services.join(' · ')}.`);
  if (leadNeed) lines.push(`חשבתי שזה יכול להתאים לכם סביב: ${leadNeed}.`);
  lines.push('נוכל לדבר 15 דקות השבוע?');

  return lines.join('\n');
}
