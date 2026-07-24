import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// OnboardingWizard + wiring (S0E · M1) — source pins. There is no DOM
// renderer in this repo, so wizard/owner wiring is verified by pinning the
// exact reused seams (validator + persist path), the truthful save
// semantics, the hydration-gated auto-open, and that frozen surfaces
// (BusinessContextEditor, Growth beta-containment) are untouched.
// ===================================================================
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const wizard = read('../OnboardingWizard.jsx');
const onboardingLib = read('../../../lib/onboarding.js');
const app = read('../../../App.jsx');
const dashboard = read('../../../pages/Dashboard.jsx');
const settings = read('../../../pages/Settings.jsx');
const editor = read('../../settings/BusinessContextEditor.jsx');

// 9) Shared S0D validation + persist path are REUSED (no competing model).
describe('reuses the S0D validator, limits and persist path', () => {
  it('imports the shared validator/limits/palette rules from businessProfile.js', () => {
    expect(wizard.includes("from '../../lib/businessProfile.js';")).toBe(true);
    expect(wizard.includes('validateBusinessProfile')).toBe(true);
    expect(wizard.includes('BUSINESS_PROFILE_LIMITS')).toBe(true);
    expect(wizard.includes('PALETTE_ROLES')).toBe(true);
  });
  it('reuses the existing fromProfile mapping (BusinessContextEditor export)', () => {
    expect(wizard.includes("import { fromProfile } from '../settings/BusinessContextEditor.jsx';")).toBe(true);
  });
  it('validates before saving, through the shared boundary', () => {
    expect(wizard.includes('const { ok, errors: errs, value } = validateBusinessProfile(form);')).toBe(true);
  });
  it('persists via the existing truthful SAVE_BUSINESS_PROFILE dispatch', () => {
    expect(wizard.includes("dispatch({ type: 'SAVE_BUSINESS_PROFILE', payload: value });")).toBe(true);
  });
  it('onboarding lib itself reuses the S0D validator (no duplicated rules)', () => {
    expect(onboardingLib.includes("import { validateBusinessProfile } from './businessProfile.js';")).toBe(true);
  });
});

// 11 + 12) Truthful save: advance/clear ONLY on {ok:true}; failure preserves state.
describe('truthful persist-first save semantics', () => {
  it('advances + clears local state ONLY inside the canFinalizeSave branch', () => {
    expect(wizard.includes('if (canFinalizeSave(res)) {')).toBe(true);
    expect(wizard.includes('clearOnboardingLocal(session);')).toBe(true);
    expect(wizard.includes('setDone(true);')).toBe(true);
  });
  it('on failure: stays open, keeps input, marks no completion', () => {
    expect(wizard.includes('setSaveFailed(true);')).toBe(true);
    // failure branch must NOT clear the draft or mark done
    const failIdx = wizard.indexOf('setSaveFailed(true);');
    const clearIdx = wizard.indexOf('clearOnboardingLocal(session);');
    const doneIdx = wizard.indexOf('setDone(true);');
    expect(clearIdx).toBeLessThan(failIdx); // clear belongs to the success branch above
    expect(doneIdx).toBeLessThan(failIdx);
  });
});

// 6 + 7 + 8) Auto-open owner: cloud-only, hydration-gated, dismissal-aware.
describe('OnboardingOwner auto-open gating', () => {
  it('decides via the pure computeAutoOpen helper', () => {
    expect(wizard.includes('computeAutoOpen(')).toBe(true);
  });
  it('only after authoritative hydration (auth ready, not loading, has session)', () => {
    expect(wizard.includes('authReady && !loading && !!session')).toBe(true);
  });
  it('reads the uid-scoped dismissal flag', () => {
    expect(wizard.includes('isAutoOpenDismissed(session)')).toBe(true);
  });
  it('"later"/close sets the uid-scoped dismissal (auto-open suppressed, banner remains)', () => {
    expect(wizard.includes('setAutoOpenDismissed(session)')).toBe(true);
  });
  it('renders nothing outside cloud mode or when closed', () => {
    expect(wizard.includes('if (!supabaseEnabled || !open) return null;')).toBe(true);
  });
  it('STEP_META order matches ONBOARDING_STEPS', () => {
    const order = ['identity', 'offer', 'audience', 'brand', 'review'];
    const idxs = order.map((id) => wizard.indexOf(`id: '${id}'`));
    expect(idxs.every((i) => i >= 0)).toBe(true);
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });
});

// App wiring + Growth beta-containment untouched (14).
describe('App wiring + frozen Growth containment', () => {
  it('mounts the OnboardingOwner globally in AppShell', () => {
    expect(app.includes("import { OnboardingOwner } from './components/onboarding/OnboardingWizard.jsx';")).toBe(true);
    expect(app.includes('<OnboardingOwner />')).toBe(true);
  });
  it('Growth remains beta-contained (GrowthBetaGate → BetaUnavailable in cloud)', () => {
    expect(app.includes('function GrowthBetaGate')).toBe(true);
    expect(app.includes('if (isSupabaseConfigured) return <BetaUnavailable')).toBe(true);
  });
});

// Dashboard banner wiring.
describe('Dashboard setup banner', () => {
  it('is predicate-driven and cloud-only', () => {
    expect(dashboard.includes("import { shouldShowSetupBanner } from '../lib/onboarding.js';")).toBe(true);
    expect(dashboard.includes('supabaseEnabled && shouldShowSetupBanner(data.businessProfile)')).toBe(true);
  });
  it('opens the wizard via the onboarding:open event', () => {
    expect(dashboard.includes("new CustomEvent('onboarding:open')")).toBe(true);
  });
});

// Settings launcher (Run setup again / edit via wizard).
describe('Settings wizard launcher', () => {
  it('offers a "פתח אשף הקמה" control that opens the wizard', () => {
    expect(settings.includes('פתח אשף הקמה')).toBe(true);
    expect(settings.includes("new CustomEvent('onboarding:open')")).toBe(true);
  });
  it('keeps the granular BusinessContextEditor available', () => {
    expect(settings.includes('<BusinessContextEditor />')).toBe(true);
  });
});

// 13) Existing BusinessContextEditor behavior is unchanged (S0D invariants pinned).
describe('BusinessContextEditor (S0D) is untouched', () => {
  it('still declares its reuse intent and S0D behavior', () => {
    expect(editor.includes('Designed to be reused verbatim by a future Onboarding slice.')).toBe(true);
    expect(editor.includes('export function fromProfile')).toBe(true);
    expect(editor.includes('export function shouldAdoptSaved')).toBe(true);
  });
  it('still validates + persists through the shared S0D path', () => {
    expect(editor.includes('validateBusinessProfile(form)')).toBe(true);
    expect(editor.includes("dispatch({ type: 'SAVE_BUSINESS_PROFILE'")).toBe(true);
  });
});
