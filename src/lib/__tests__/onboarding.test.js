import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEPS, ONBOARDING_FIRST_VALUE_PROMPT,
  isOnboardingComplete, shouldShowSetupBanner, determineFirstIncompleteStep,
  computeAutoOpen, canFinalizeSave, profileBaselineSignature,
  onboardingDraftKey, onboardingDismissKey,
  loadOnboardingDraft, saveOnboardingDraft, clearOnboardingLocal,
  isAutoOpenDismissed, setAutoOpenDismissed,
} from '../onboarding.js';

// ===================================================================
// onboarding (S0E · M1+M2) — PURE helpers. No DOM renderer in this repo, so
// every guarantee is proven at the pure-logic boundary. Storage is injected
// (a Map-backed fake) so draft/dismissal isolation + baseline precedence are
// testable without jsdom. NO real account identifiers — synthetic uids.
// ===================================================================

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}
const sessA = { user: { id: 'uid-aaaa-1111' } };
const sessB = { user: { id: 'uid-bbbb-2222' } };

const complete = { businessName: 'סטודיו', positioning: 'עיצוב לעסקים', services: [{ name: 'מיתוג', pitch: 'לוגו' }] };
const nameOnly = { businessName: 'סטודיו' };
const noService = { businessName: 'סטודיו', positioning: 'עיצוב לעסקים' };

// 1) Completion predicate (LOCKED floor: name + positioning + >=1 named service).
describe('isOnboardingComplete · locked floor', () => {
  it('null → false', () => { expect(isOnboardingComplete(null)).toBe(false); });
  it('name only → false', () => { expect(isOnboardingComplete(nameOnly)).toBe(false); });
  it('name + positioning, no service → false', () => { expect(isOnboardingComplete(noService)).toBe(false); });
  it('a service without a name does NOT satisfy the floor', () => {
    expect(isOnboardingComplete({ ...noService, services: [{ pitch: 'רק תיאור' }] })).toBe(false);
  });
  it('name + positioning + named service → true', () => { expect(isOnboardingComplete(complete)).toBe(true); });
  it('palette is optional — complete without a palette', () => {
    expect(isOnboardingComplete(complete)).toBe(true);
    expect(isOnboardingComplete({ ...complete, brandPalette: null })).toBe(true);
  });
  it('a valid palette does not break completion', () => {
    expect(isOnboardingComplete({ ...complete, brandPalette: { primary: '#112233' } })).toBe(true);
  });
});

// 10) Palette optional + existing S0D validation intact (delegation).
describe('shared S0D validation is used (palette rule still enforced)', () => {
  it('an invalid palette (secondary without primary) makes the profile not complete', () => {
    expect(isOnboardingComplete({ ...complete, brandPalette: { secondary: '#123456' } })).toBe(false);
  });
});

// The default first-value prompt is an explicit non-executing constant.
describe('ONBOARDING_FIRST_VALUE_PROMPT', () => {
  it('is a single-source-of-truth string that forbids acting without approval', () => {
    expect(typeof ONBOARDING_FIRST_VALUE_PROMPT).toBe('string');
    expect(ONBOARDING_FIRST_VALUE_PROMPT).toContain('אל תבצע דבר בלי אישור.');
  });
});

// 2) First-incomplete-step selection.
describe('determineFirstIncompleteStep', () => {
  it('null → identity', () => { expect(determineFirstIncompleteStep(null)).toBe(ONBOARDING_STEPS.indexOf('identity')); });
  it('name only → identity (positioning missing)', () => { expect(determineFirstIncompleteStep(nameOnly)).toBe(ONBOARDING_STEPS.indexOf('identity')); });
  it('name + positioning, no service → offer', () => { expect(determineFirstIncompleteStep(noService)).toBe(ONBOARDING_STEPS.indexOf('offer')); });
  it('floor met → review', () => { expect(determineFirstIncompleteStep(complete)).toBe(ONBOARDING_STEPS.indexOf('review')); });
});

describe('ONBOARDING_STEPS canonical order', () => {
  it('is identity → offer → audience → brand → review', () => {
    expect(ONBOARDING_STEPS).toEqual(['identity', 'offer', 'audience', 'brand', 'review']);
  });
});

// 3) uid-scoped keys.
describe('uid-scoped keys (stable user.id only, never name/email)', () => {
  it('draft + dismissal keys are namespaced by user.id', () => {
    expect(onboardingDraftKey(sessA)).toBe('artvalue_onboarding_draft_uid-aaaa-1111');
    expect(onboardingDismissKey(sessA)).toBe('artvalue_onboarding_dismissed_uid-aaaa-1111');
  });
  it('different uids → different keys', () => {
    expect(onboardingDraftKey(sessA)).not.toBe(onboardingDraftKey(sessB));
    expect(onboardingDismissKey(sessA)).not.toBe(onboardingDismissKey(sessB));
  });
  it('no session / no uid → null key (never a device-global fallback)', () => {
    expect(onboardingDraftKey(null)).toBe(null);
    expect(onboardingDraftKey({})).toBe(null);
    expect(onboardingDraftKey({ user: {} })).toBe(null);
    expect(onboardingDismissKey(undefined)).toBe(null);
  });
});

// 4) Account B never reads Account A's draft/dismissal.
describe('cross-account isolation', () => {
  it('B cannot read A draft or dismissal', () => {
    const s = memStorage();
    saveOnboardingDraft(sessA, { businessName: 'A-סוד' }, null, s);
    setAutoOpenDismissed(sessA, s);
    expect(loadOnboardingDraft(sessA, null, s)).toEqual(expect.objectContaining({ businessName: 'A-סוד' }));
    expect(loadOnboardingDraft(sessB, null, s)).toBe(null);
    expect(isAutoOpenDismissed(sessA, s)).toBe(true);
    expect(isAutoOpenDismissed(sessB, s)).toBe(false);
  });
  it('clearing A never touches B', () => {
    const s = memStorage();
    saveOnboardingDraft(sessA, { businessName: 'A' }, null, s);
    saveOnboardingDraft(sessB, { businessName: 'B' }, null, s);
    setAutoOpenDismissed(sessB, s);
    clearOnboardingLocal(sessA, s);
    expect(loadOnboardingDraft(sessA, null, s)).toBe(null);
    expect(loadOnboardingDraft(sessB, null, s)).toEqual(expect.objectContaining({ businessName: 'B' }));
    expect(isAutoOpenDismissed(sessB, s)).toBe(true);
  });
});

// 5) Malformed local draft fails safely.
describe('malformed draft fails safely (never throws)', () => {
  it('bad JSON → null', () => {
    const s = memStorage();
    s.setItem(onboardingDraftKey(sessA), '{not json');
    expect(loadOnboardingDraft(sessA, null, s)).toBe(null);
  });
  it('non-object payloads → null', () => {
    const s = memStorage();
    for (const bad of ['123', '"str"', '[1,2]', 'null', 'true']) {
      s.setItem(onboardingDraftKey(sessA), bad);
      expect(loadOnboardingDraft(sessA, null, s)).toBe(null);
    }
  });
  it('a valid envelope round-trips its form', () => {
    const s = memStorage();
    saveOnboardingDraft(sessA, { businessName: 'x', positioning: 'y' }, null, s);
    expect(loadOnboardingDraft(sessA, null, s)).toEqual(expect.objectContaining({ businessName: 'x', positioning: 'y' }));
  });
});

// draft payload carries NO secrets / Auth identifiers.
describe('draft payload sanitization', () => {
  it('stores only known wizard fields — no uid/session/extra keys leak in', () => {
    const s = memStorage();
    saveOnboardingDraft(sessA, { businessName: 'x', secret: 'TOKEN', user: { id: 'z' }, accessToken: 'zzz' }, null, s);
    const env = JSON.parse(s.getItem(onboardingDraftKey(sessA)));
    expect(env.form.businessName).toBe('x');
    expect(env.form).not.toHaveProperty('secret');
    expect(env.form).not.toHaveProperty('user');
    expect(env.form).not.toHaveProperty('accessToken');
    expect(Object.keys(env.form).sort()).toEqual(['audiences', 'brandPalette', 'businessName', 'differentiators', 'positioning', 'services', 'tone']);
    // whole envelope carries no secret / uid
    const whole = JSON.stringify(env);
    expect(whole).not.toContain('TOKEN');
    expect(whole).not.toContain('uid-aaaa');
  });
});

// A) Draft / authoritative-baseline precedence (M2 correction).
describe('draft ↔ authoritative-baseline precedence', () => {
  const partial = { businessName: 'סטודיו', positioning: 'עיצוב' };

  it('unchanged baseline → draft restored', () => {
    const s = memStorage();
    saveOnboardingDraft(sessA, { businessName: 'טיוטה', positioning: 'בעבודה' }, partial, s);
    expect(loadOnboardingDraft(sessA, partial, s)).toEqual(expect.objectContaining({ businessName: 'טיוטה' }));
  });
  it('newer/changed durable profile → stale draft rejected (authoritative wins)', () => {
    const s = memStorage();
    saveOnboardingDraft(sessA, { businessName: 'טיוטה' }, null, s); // stamped against unconfigured
    const changed = { businessName: 'סטודיו', positioning: 'חדש' }; // durable changed via Settings
    expect(loadOnboardingDraft(sessA, changed, s)).toBe(null);
  });
  it('null durable profile → draft resumes (matching empty baseline)', () => {
    const s = memStorage();
    saveOnboardingDraft(sessA, { businessName: 'טיוטה' }, null, s);
    expect(loadOnboardingDraft(sessA, null, s)).toEqual(expect.objectContaining({ businessName: 'טיוטה' }));
  });
  it('legacy raw / old-version / broken envelope → ignored safely', () => {
    const s = memStorage();
    s.setItem(onboardingDraftKey(sessA), JSON.stringify({ businessName: 'legacy-no-envelope' }));
    expect(loadOnboardingDraft(sessA, null, s)).toBe(null);
    s.setItem(onboardingDraftKey(sessA), JSON.stringify({ v: 1, baseline: 'none', form: { businessName: 'old' } }));
    expect(loadOnboardingDraft(sessA, null, s)).toBe(null);
    s.setItem(onboardingDraftKey(sessA), '{broken');
    expect(loadOnboardingDraft(sessA, null, s)).toBe(null);
  });
  it('Account A draft never loads for Account B', () => {
    const s = memStorage();
    saveOnboardingDraft(sessA, { businessName: 'A' }, null, s);
    expect(loadOnboardingDraft(sessB, null, s)).toBe(null);
  });
  it('profileBaselineSignature is deterministic, changes with the profile, and carries no identifiers', () => {
    expect(profileBaselineSignature(null)).toBe('none');
    expect(profileBaselineSignature({})).toBe('none');
    const a = profileBaselineSignature({ businessName: 'x', positioning: 'y', services: [{ name: 'z' }] });
    const a2 = profileBaselineSignature({ businessName: 'x', positioning: 'y', services: [{ name: 'z' }] });
    const b = profileBaselineSignature({ businessName: 'x', positioning: 'CHANGED', services: [{ name: 'z' }] });
    expect(a).toBe(a2);
    expect(a).not.toBe(b);
    expect(a).not.toContain('uid');
  });
});

// 6 + 7) Auto-open + banner: configured bypasses; incomplete shows after hydration only.
describe('computeAutoOpen', () => {
  it('never opens before authoritative hydration', () => {
    expect(computeAutoOpen({ hydrationReady: false, profile: null, dismissed: false })).toBe(false);
  });
  it('configured (complete) profile → never auto-opens', () => {
    expect(computeAutoOpen({ hydrationReady: true, profile: complete, dismissed: false })).toBe(false);
  });
  it('incomplete + not dismissed + hydrated → opens', () => {
    expect(computeAutoOpen({ hydrationReady: true, profile: null, dismissed: false })).toBe(true);
    expect(computeAutoOpen({ hydrationReady: true, profile: noService, dismissed: false })).toBe(true);
  });
  it('incomplete + dismissed → does not auto-open', () => {
    expect(computeAutoOpen({ hydrationReady: true, profile: null, dismissed: true })).toBe(false);
  });
});

describe('shouldShowSetupBanner', () => {
  it('configured user → no banner', () => { expect(shouldShowSetupBanner(complete)).toBe(false); });
  it('new/incomplete user → banner', () => {
    expect(shouldShowSetupBanner(null)).toBe(true);
    expect(shouldShowSetupBanner(noService)).toBe(true);
  });
});

// 8) "Later" suppresses auto-open but NOT the banner.
describe('"later" suppresses auto-open but keeps the banner', () => {
  it('after dismissal: auto-open false, banner still true', () => {
    const s = memStorage();
    const profile = null; // incomplete
    setAutoOpenDismissed(sessA, s);
    expect(computeAutoOpen({ hydrationReady: true, profile, dismissed: isAutoOpenDismissed(sessA, s) })).toBe(false);
    expect(shouldShowSetupBanner(profile)).toBe(true);
  });
});

// 12) Completion only after {ok:true}; confirmed save clears local state.
describe('canFinalizeSave · truthful completion', () => {
  it('{ok:true} → true; anything else → false', () => {
    expect(canFinalizeSave({ ok: true })).toBe(true);
    expect(canFinalizeSave({ ok: false })).toBe(false);
    expect(canFinalizeSave({ ok: false, error: new Error('x') })).toBe(false);
    expect(canFinalizeSave(null)).toBe(false);
    expect(canFinalizeSave(undefined)).toBe(false);
    expect(canFinalizeSave({})).toBe(false);
  });
});

describe('completion is derived from the durable profile, never from a draft', () => {
  it('a "complete-looking" local draft does not make an unconfigured account complete', () => {
    const s = memStorage();
    saveOnboardingDraft(sessA, complete, null, s); // draft looks complete...
    expect(isOnboardingComplete(null)).toBe(false); // ...but the durable profile is null → not complete
    expect(shouldShowSetupBanner(null)).toBe(true);
  });
});
