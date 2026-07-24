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

// Safe load: returns a plain object of wizard fields, or null. NEVER throws;
// a missing key / bad JSON / non-object / array payload → null (ignored).
export function loadOnboardingDraft(session, storage) {
  const key = onboardingDraftKey(session);
  const s = getStorage(storage);
  if (!key || !s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOnboardingDraft(session, form, storage) {
  const key = onboardingDraftKey(session);
  const s = getStorage(storage);
  if (!key || !s) return;
  try { s.setItem(key, JSON.stringify(pickDraftFields(form))); } catch { /* ignore quota/serialization */ }
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
