// ===================================================================
// businessProfile — the SINGLE normalize/validate boundary for the
// per-account Business Context (S0D). Used identically by:
//   * direct save/upsert            (store SAVE_BUSINESS_PROFILE → api.upsertBusinessProfile)
//   * import / bulkUpload           (api.bulkUpload)
//   * hydration of cloud rows       (api.rowToBusinessProfile)
// so import can NEVER bypass the field/count/HEX rules, and a malformed
// cloud row is rejected the same way a malformed save is.
//
// Pure + dependency-free: NO store, NO network, NO React, NO clock, NO
// randomness. Does NOT import businessBrain (no cycle). The canonical
// in-memory shape is camelCase:
//   { businessName, positioning, audiences[], tone[], differentiators[],
//     services:[{name, pitch?}], brandPalette:{primary, secondary?, accent?,
//     neutral1?, neutral2?} | null }
// ===================================================================

export const BUSINESS_PROFILE_LIMITS = Object.freeze({
  businessName: 80,
  positioning: 200,
  audiences: Object.freeze({ max: 6, each: 80 }),
  tone: Object.freeze({ max: 6, each: 30 }),
  differentiators: Object.freeze({ max: 6, each: 160 }),
  services: Object.freeze({ max: 8, name: 60, pitch: 160 }),
});

// primary is required WHEN a palette is present; the rest are optional.
export const PALETTE_ROLES = Object.freeze(['primary', 'secondary', 'accent', 'neutral1', 'neutral2']);

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const str = (v) => (v == null ? '' : String(v)).trim();

// Canonical uppercase #RRGGBB, or null when blank/invalid.
export function normalizeHex(v) {
  const s = str(v);
  if (!s) return null;
  return HEX_RE.test(s) ? s.toUpperCase() : null;
}

// Trim + drop blank entries. Count/length are enforced by the validator
// (over-limit is a visible ERROR — never a silent truncation of saved data).
function cleanStringList(v) {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter(Boolean);
}

// Palette: optional as a whole. If ANY role is provided, `primary` is required.
// Each provided role must be a valid HEX (normalized to uppercase #RRGGBB) or
// it is a visible error. Returns { palette|null } and pushes errors.
function normalizePalette(raw, errors) {
  if (raw == null) return null;
  const src = typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  let any = false;
  let primaryProvided = false;
  for (const role of PALETTE_ROLES) {
    const s = str(src[role]);
    if (!s) continue;
    any = true;
    if (role === 'primary') primaryProvided = true;
    const hex = normalizeHex(s);
    if (!hex) { errors.push({ field: `palette.${role}`, message: `צבע לא תקין (${role}) — נדרש #RRGGBB.` }); continue; }
    out[role] = hex;
  }
  if (!any) return null; // no colors → no palette (skippable)
  if (!primaryProvided) errors.push({ field: 'palette.primary', message: 'צבע ראשי (primary) חובה כשמגדירים פלטת מותג.' });
  return out;
}

// THE validator. Returns { ok, errors:[{field,message}], value|null }.
// `value` is the normalized canonical profile ONLY when ok === true.
// An entirely empty profile (no business_name after trim) is rejected — it is
// never saved as a misleading "configured" row.
export function validateBusinessProfile(raw) {
  const errors = [];
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const L = BUSINESS_PROFILE_LIMITS;

  // business_name — REQUIRED (1..80) once the user chooses to save.
  const businessName = str(src.businessName);
  if (!businessName) {
    errors.push({ field: 'businessName', message: 'שם העסק חובה כדי לשמור פרופיל עסקי.' });
  } else if (businessName.length > L.businessName) {
    errors.push({ field: 'businessName', message: `שם העסק ארוך מדי (עד ${L.businessName} תווים).` });
  }

  // positioning — optional ≤200
  const positioning = str(src.positioning);
  if (positioning.length > L.positioning) {
    errors.push({ field: 'positioning', message: `מיצוב ארוך מדי (עד ${L.positioning} תווים).` });
  }

  // flat string lists — blanks removed, then count + each-length enforced.
  const lists = {};
  for (const key of ['audiences', 'tone', 'differentiators']) {
    const lim = L[key];
    const cleaned = cleanStringList(src[key]);
    if (cleaned.length > lim.max) errors.push({ field: key, message: `יותר מדי פריטים (עד ${lim.max}).` });
    if (cleaned.some((s) => s.length > lim.each)) errors.push({ field: key, message: `פריט ארוך מדי (עד ${lim.each} תווים).` });
    lists[key] = cleaned;
  }

  // services — drop fully-blank items; each RETAINED item needs a name (≤60);
  // pitch optional (≤160). Count ≤8.
  const services = [];
  for (const it of Array.isArray(src.services) ? src.services : []) {
    const name = str(it && it.name);
    const pitch = str(it && it.pitch);
    if (!name && !pitch) continue; // fully blank → dropped
    if (!name) { errors.push({ field: 'services', message: 'לכל שירות חייב להיות שם.' }); continue; }
    if (name.length > L.services.name) errors.push({ field: 'services', message: `שם שירות ארוך מדי (עד ${L.services.name}).` });
    if (pitch.length > L.services.pitch) errors.push({ field: 'services', message: `תיאור שירות ארוך מדי (עד ${L.services.pitch}).` });
    services.push(pitch ? { name, pitch } : { name });
  }
  if (services.length > L.services.max) errors.push({ field: 'services', message: `יותר מדי שירותים (עד ${L.services.max}).` });

  // palette — optional; primary required if present; canonical uppercase HEX.
  const brandPalette = normalizePalette(src.brandPalette, errors);

  const ok = errors.length === 0;
  const value = ok
    ? {
      businessName,
      positioning,
      audiences: lists.audiences,
      tone: lists.tone,
      differentiators: lists.differentiators,
      services,
      brandPalette,
    }
    : null;
  return { ok, errors, value };
}

// Convenience for hydration/import paths that only need "valid value or null"
// (malformed → null → neutral, never a partial/misleading profile).
export function normalizeBusinessProfile(raw) {
  const { ok, value } = validateBusinessProfile(raw);
  return ok ? value : null;
}

// A profile is "empty/unconfigured" when it has no business name.
export function isEmptyBusinessProfile(value) {
  return !value || !str(value.businessName);
}
