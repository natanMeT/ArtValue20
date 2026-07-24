// ===================================================================
// onboarding (S0E · Milestone 1) — PURE helpers for the guided business
// onboarding wizard. No React, no network, no store, no clock, no
// randomness. The ONLY authoritative source of onboarding completion is
// the durable business_profile passed in (the confirmed cloud value the
// store holds). localStorage carries just a uid-scoped in-progress DRAFT
// and an auto-open dismissal flag — it NEVER asserts completion.
//
// Reuses the S0D validator/model (businessProfile.js). It does NOT define
// its own field rules, limits, or a competing profile shape.
// ===================================================================

import { validateBusinessProfile } from './businessProfile.js';

const str = (v) => (v == null ? '' : String(v)).trim();

// Wizard step order — the single source of truth for step ids/indices. The
// wizard UI's STEP_META must line up with this (asserted by a focused test).
export const ONBOARDING_STEPS = Object.freeze(['identity', 'offer', 'audience', 'brand', 'review']);

// The default first-value prompt seeded into Jake's composer after onboarding
// (S0E M2). SINGLE source of truth — UI + tests import this exact string. It is
// advisory: it explicitly asks Jake NOT to act without approval.
export const ONBOARDING_FIRST_VALUE_PROMPT = 'בהתבסס על העסק שהגדרתי, הצע לי 3 פעולות עסקיות ראשונות לפי סדר עדיפות, עם הסבר קצר. אל תבצע דבר בלי אישור.';

// -------------------------------------------------------------------
// Completion predicate (LOCKED product floor, Milestone 1):
//   valid businessName (via the shared S0D validator) + non-empty
//   positioning + at least one service with a non-empty name.
// Recommended-but-non-blocking (audiences / tone / differentiators /
// palette) do NOT gate completion. Derived ONLY from the durable profile.
// -------------------------------------------------------------------
export function isOnboardingComplete(profile) {
  const { ok, value } = validateBusinessProfile(profile);
  if (!ok || !value) return false;               // invalid/empty businessName → not complete
  if (!value.positioning) return false;           // positioning required by the floor
  if (!value.services.some((s) => s && str(s.name))) return false; // >=1 named service
  return true;
}

// The persistent Dashboard setup banner shows while the durable profile is
// not complete. (Pure mirror of the completion predicate.)
export function shouldShowSetupBanner(profile) {
  return !isOnboardingComplete(profile);
}

// First step whose REQUIRED work is unfinished — used to resume a prefilled
// wizard at the right place. Field-checked (robust for durable + dirty input).
export function determineFirstIncompleteStep(profile) {
  const p = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  if (!str(p.businessName) || !str(p.positioning)) return ONBOARDING_STEPS.indexOf('identity');
  const services = Array.isArray(p.services) ? p.services : [];
  if (!services.some((s) => s && str(s.name))) return ONBOARDING_STEPS.indexOf('offer');
  return ONBOARDING_STEPS.indexOf('review'); // floor already met → land on review
}

// Auto-open decision (pure). Never opens before authoritative hydration,
// never for a complete profile, never when this uid dismissed the auto-open.
export function computeAutoOpen({ hydrationReady, profile, dismissed }) {
  if (!hydrationReady) return false;
  if (dismissed) return false;
  return !isOnboardingComplete(profile);
}

// Hydration is "ready" only when the cloud store has SUCCESSFULLY loaded: cloud
// mode + auth resolved + not loading + an authenticated session + NO store
// error. A failed fetchAll sets `error` while still flipping loading→false, so
// the empty fallback profile must NOT be treated as authoritative — onboarding
// must never be offered/auto-opened from a load error (it could overwrite an
// existing profile that simply could not be loaded).
export function computeHydrationReady({ supabaseEnabled, authReady, loading, session, error } = {}) {
  if (!supabaseEnabled) return false;
  if (!authReady) return false;
  if (loading) return false;
  if (!session) return false;
  if (error) return false;
  return true;
}

// Which wizard step owns a given validator error field. Unknown fields (not a
// known step field) route to Review, where the exact message is still shown.
const FIELD_STEP = Object.freeze({
  businessName: 'identity', positioning: 'identity',
  services: 'offer',
  audiences: 'audience', tone: 'audience', differentiators: 'audience',
  'palette.primary': 'brand', 'palette.secondary': 'brand', 'palette.accent': 'brand',
  'palette.neutral1': 'brand', 'palette.neutral2': 'brand',
});
export function stepForField(field) {
  return ONBOARDING_STEPS.indexOf(FIELD_STEP[field] || 'review');
}

// The FIRST (earliest) wizard step carrying a validation error, so the wizard
// jumps the user straight to the field to fix. Empty/no errors → -1. When every
// error is an unknown field → the Review step index (show the exact message there).
export function firstErrorStep(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return -1;
  let best = Infinity;
  for (const e of errors) {
    const idx = stepForField(e && e.field);
    if (idx >= 0 && idx < best) best = idx;
  }
  return best === Infinity ? ONBOARDING_STEPS.indexOf('review') : best;
}

// A cloud save may be finalized (advance + clear draft) ONLY on a settled
// { ok: true } from the truthful SAVE_BUSINESS_PROFILE path.
export function canFinalizeSave(res) {
  return !!(res && res.ok === true);
}

// -------------------------------------------------------------------
// uid-scoped local storage — DRAFT + auto-open dismissal.
// Scope is the STABLE session user.id ONLY (never name/email). A missing
// uid yields a null key: callers then skip all local ops (never a
// device-global fallback, so nothing can leak between accounts).
// -------------------------------------------------------------------
const DRAFT_KEY_BASE = 'artvalue_onboarding_draft';
const DISMISS_KEY_BASE = 'artvalue_onboarding_dismissed';

function uidOf(session) {
  const uid = session && session.user && session.user.id;
  return uid ? String(uid) : null;
}
function scopeKey(base, session) {
  const uid = uidOf(session);
  return uid ? `${base}_${uid}` : null;
}
export const onboardingDraftKey = (session) => scopeKey(DRAFT_KEY_BASE, session);
export const onboardingDismissKey = (session) => scopeKey(DISMISS_KEY_BASE, session);

// Storage accessor — defaults to the real localStorage when present, but is
// injectable so the pure helpers stay testable without a DOM/jsdom.
function getStorage(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

// Only the known wizard fields are ever written — no uid, no session, no
// tokens, no Auth identifiers end up in the draft payload.
function pickDraftFields(form) {
  const o = form && typeof form === 'object' ? form : {};
  return {
    businessName: typeof o.businessName === 'string' ? o.businessName : '',
    positioning: typeof o.positioning === 'string' ? o.positioning : '',
    audiences: Array.isArray(o.audiences) ? o.audiences.map(String) : [],
    tone: Array.isArray(o.tone) ? o.tone.map(String) : [],
    differentiators: Array.isArray(o.differentiators) ? o.differentiators.map(String) : [],
    services: Array.isArray(o.services)
      ? o.services.map((s) => ({
        name: s && typeof s.name === 'string' ? s.name : '',
        pitch: s && typeof s.pitch === 'string' ? s.pitch : '',
      }))
      : [],
    brandPalette: o.brandPalette && typeof o.brandPalette === 'object' && !Array.isArray(o.brandPalette)
      ? { ...o.brandPalette }
      : {},
  };
}

// A deterministic, sanitized signature of the durable profile a draft was
// created against. Used to reject a STALE draft when the authoritative profile
// changed underneath it (Settings / import / refetch). Canonical + stable key
// order; contains NO uid / email / session / token — only the seven business
// fields. An unconfigured (no business name) profile → the stable 'none'
// baseline, so a brand-new account's draft still resumes across refresh.
export function profileBaselineSignature(profile) {
  const p = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : null;
  if (!p || !str(p.businessName)) return 'none';
  const canon = {
    businessName: str(p.businessName),
    positioning: str(p.positioning),
    audiences: Array.isArray(p.audiences) ? p.audiences.map(str).filter(Boolean) : [],
    tone: Array.isArray(p.tone) ? p.tone.map(str).filter(Boolean) : [],
    differentiators: Array.isArray(p.differentiators) ? p.differentiators.map(str).filter(Boolean) : [],
    services: Array.isArray(p.services)
      ? p.services.map((sv) => ({ name: str(sv && sv.name), pitch: str(sv && sv.pitch) })).filter((sv) => sv.name || sv.pitch)
      : [],
    brandPalette: p.brandPalette && typeof p.brandPalette === 'object' && !Array.isArray(p.brandPalette) ? p.brandPalette : null,
  };
  try { return JSON.stringify(canon); } catch { return 'none'; }
}

// Draft envelope version — bump to invalidate all older drafts safely.
const DRAFT_ENVELOPE_VERSION = 2;

// Safe load: returns the whitelisted wizard-field object, or null. NEVER throws.
// Returns null when: no key/storage, missing/bad JSON, wrong envelope version,
// malformed shape, OR the stored baseline no longer matches the CURRENT durable
// profile (a stale draft must never override an authoritative change).
export function loadOnboardingDraft(session, profileForBaseline, storage) {
  const key = onboardingDraftKey(session);
  const s = getStorage(storage);
  if (!key || !s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw);
    if (!env || typeof env !== 'object' || Array.isArray(env)) return null;
    if (env.v !== DRAFT_ENVELOPE_VERSION) return null;            // old/unrecognized → ignore safely
    if (typeof env.baseline !== 'string') return null;
    if (!env.form || typeof env.form !== 'object' || Array.isArray(env.form)) return null;
    if (env.baseline !== profileBaselineSignature(profileForBaseline)) return null; // stale → authoritative wins
    return env.form;
  } catch {
    return null;
  }
}

// Persist the in-progress draft as a versioned envelope stamped with the durable
// profile baseline it was created against (so a later authoritative change can
// invalidate it). Stores ONLY the seven whitelisted fields + a sanitized
// baseline signature — never uid / session / secret / Auth data.
export function saveOnboardingDraft(session, form, profileForBaseline, storage) {
  const key = onboardingDraftKey(session);
  const s = getStorage(storage);
  if (!key || !s) return;
  const envelope = {
    v: DRAFT_ENVELOPE_VERSION,
    baseline: profileBaselineSignature(profileForBaseline),
    form: pickDraftFields(form),
  };
  try { s.setItem(key, JSON.stringify(envelope)); } catch { /* ignore quota/serialization */ }
}

export function isAutoOpenDismissed(session, storage) {
  const key = onboardingDismissKey(session);
  const s = getStorage(storage);
  if (!key || !s) return false;
  try { return s.getItem(key) === '1'; } catch { return false; }
}

export function setAutoOpenDismissed(session, storage) {
  const key = onboardingDismissKey(session);
  const s = getStorage(storage);
  if (!key || !s) return;
  try { s.setItem(key, '1'); } catch { /* ignore */ }
}

// Clear ONLY the current uid's onboarding local state (draft + dismissal).
// Called after a confirmed cloud save. Never touches another uid's keys.
export function clearOnboardingLocal(session, storage) {
  const s = getStorage(storage);
  if (!s) return;
  const dk = onboardingDraftKey(session);
  const mk = onboardingDismissKey(session);
  try { if (dk) s.removeItem(dk); } catch { /* ignore */ }
  try { if (mk) s.removeItem(mk); } catch { /* ignore */ }
}
