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
const assistant = read('../../ai/Assistant.jsx');

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
  it('only after SUCCESSFUL hydration (via the pure computeHydrationReady helper)', () => {
    expect(wizard.includes('computeHydrationReady({ supabaseEnabled, authReady, loading, session, error })')).toBe(true);
  });
  it('reads the uid-scoped dismissal flag', () => {
    expect(wizard.includes('isAutoOpenDismissed(session)')).toBe(true);
  });
  it('"later"/close sets the uid-scoped dismissal (auto-open suppressed, banner remains)', () => {
    expect(wizard.includes('setAutoOpenDismissed(session)')).toBe(true);
  });
  it('renders nothing unless hydration is healthy and the wizard is open', () => {
    expect(wizard.includes('if (!hydrationReady || !open) return null;')).toBe(true);
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
  it('is predicate-driven and gated on successful hydration', () => {
    expect(dashboard.includes("import { shouldShowSetupBanner, computeHydrationReady } from '../lib/onboarding.js';")).toBe(true);
    expect(dashboard.includes('shouldShowSetupBanner(data.businessProfile)')).toBe(true);
    expect(dashboard.includes('computeHydrationReady({ supabaseEnabled, authReady, loading, session, error })')).toBe(true);
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

// ===================================================================
// Milestone 2 pins
// ===================================================================

// Completion-screen first-value CTA — single jake:prefill, only after {ok:true}.
describe('completion CTA → single jake:prefill, no auto-send', () => {
  it('uses the single-source prompt constant', () => {
    expect(wizard.includes('ONBOARDING_FIRST_VALUE_PROMPT')).toBe(true);
    expect(onboardingLib.includes('export const ONBOARDING_FIRST_VALUE_PROMPT')).toBe(true);
  });
  it('CTA dispatches exactly one jake:prefill with source onboarding', () => {
    expect(wizard.includes("window.dispatchEvent(new CustomEvent('jake:prefill', { detail: { text: ONBOARDING_FIRST_VALUE_PROMPT, source: 'onboarding' } }));")).toBe(true);
    expect((wizard.match(/new CustomEvent\('jake:prefill'/g) || []).length).toBe(1); // exactly one dispatch, no open/prefill race
    expect(wizard.includes('onClick={startWithJake}')).toBe(true);
    expect(wizard.includes('תן לי 3 פעולות ראשונות עם ג׳יק')).toBe(true);
  });
  it('the CTA lives only on the completion screen (reached after {ok:true})', () => {
    const doneIdx = wizard.indexOf('if (done) {');
    const ctaIdx = wizard.indexOf('onClick={startWithJake}');
    expect(doneIdx).toBeGreaterThanOrEqual(0);
    expect(ctaIdx).toBeGreaterThan(doneIdx); // CTA is inside the done-screen return block
  });
  it('the ordinary close (סיום) remains', () => {
    expect(wizard.includes('סיום')).toBe(true);
  });
  it('startWithJake never sends — only dispatches the prefill event + closes', () => {
    const h = wizard.slice(wizard.indexOf('const startWithJake'), wizard.indexOf('const meta = STEP_META[step];'));
    expect(h.includes('onDoneClose()')).toBe(true);
    expect(h.includes('chatJake') || h.includes('draftWithJake') || h.includes('sendRef') || h.includes('SAVE_BUSINESS_PROFILE')).toBe(false);
  });
});

// Draft ↔ authoritative-baseline precedence wiring in the wizard.
describe('wizard uses baseline-aware draft load/save', () => {
  it('loads the draft against the current durable-profile baseline', () => {
    expect(wizard.includes('loadOnboardingDraft(session, profile)')).toBe(true);
  });
  it('stamps saves with the current durable-profile baseline', () => {
    expect(wizard.includes('saveOnboardingDraft(session, form, profile)')).toBe(true);
  });
});

// Assistant additive prefill seam — pins SUPPLEMENT the applyJakePrefill
// behavioral tests (the primary no-auto-send / preserve-composer proof).
describe('Assistant jake:prefill seam (additive, no auto-send)', () => {
  it('imports the pure prefill helper', () => {
    expect(assistant.includes("import { applyJakePrefill } from '../../lib/jakePrefill.js';")).toBe(true);
  });
  it('registers a jake:prefill listener with cleanup (no duplicate handling)', () => {
    expect(assistant.includes("window.addEventListener('jake:prefill', onPrefill);")).toBe(true);
    expect(assistant.includes("window.removeEventListener('jake:prefill', onPrefill);")).toBe(true);
  });
  it('the handler only opens + fills via a send-free ctx (open/getInput/setInput)', () => {
    expect(assistant.includes('const onPrefill = (e) => applyJakePrefill(e && e.detail, { open: forceOpen, getInput: () => inputRef.current, setInput });')).toBe(true);
  });
  it('the existing jake:open / jake:ask seams remain', () => {
    expect(assistant.includes("window.addEventListener('jake:open', onOpen);")).toBe(true);
    expect(assistant.includes("window.addEventListener('jake:ask', onAsk);")).toBe(true);
  });
  it('clears the unsent composer on account switch (no A→B leak)', () => {
    expect(assistant.includes("Account A's input can never surface for")).toBe(true);
    expect(assistant.includes("setInput('');")).toBe(true);
  });
  it('does not change the Gateway call expression (business-context injection intact)', () => {
    expect(assistant.includes('withBusinessBrain(activePack.buildContext(data), text, data.businessProfile)')).toBe(true);
  });
});

// ===================================================================
// P2 correction pins
// ===================================================================

// Correction 1 — hydration-error gating across all S0E surfaces.
describe('S0E surfaces gate on successful hydration (never offer from a load error)', () => {
  it('owner reads the store error and derives hydrationReady from it', () => {
    expect(wizard.includes('const { data, dispatch, toast, session, authReady, loading, error, supabaseEnabled } = useStore();')).toBe(true);
    expect(wizard.includes('const hydrationReady = computeHydrationReady({ supabaseEnabled, authReady, loading, session, error });')).toBe(true);
  });
  it('external onboarding:open is ignored until hydration is healthy', () => {
    expect(wizard.includes('if (!readyRef.current) return;')).toBe(true);
  });
  it('the auto-open effect returns BEFORE latching the uid (no latch during an error)', () => {
    const cIdx = wizard.indexOf('Auto-open at most once per uid');
    const eff = wizard.slice(cIdx, cIdx + 700);
    const guardIdx = eff.indexOf('if (!hydrationReady) return;');
    const latchIdx = eff.indexOf('autoEvaluated.current = uid;');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(latchIdx).toBeGreaterThan(guardIdx);
  });
  it('Dashboard banner is gated on computeHydrationReady (not just cloud mode)', () => {
    expect(dashboard.includes("import { shouldShowSetupBanner, computeHydrationReady } from '../lib/onboarding.js';")).toBe(true);
    expect(dashboard.includes('computeHydrationReady({ supabaseEnabled, authReady, loading, session, error })')).toBe(true);
  });
  it('Settings launcher is gated on computeHydrationReady; the S0D editor stays available', () => {
    expect(settings.includes('const onboardingReady = computeHydrationReady({ supabaseEnabled, authReady, loading, session, error });')).toBe(true);
    expect(settings.includes('{onboardingReady && (')).toBe(true);
    expect(settings.includes('<BusinessContextEditor />')).toBe(true);
  });
});

// Correction 2 — field-specific validator errors surfaced on the owning step.
describe('validation errors routed + shown on the relevant step', () => {
  it('confirm jumps to the first affected step and keeps the exact validator errors', () => {
    expect(wizard.includes('setErrors(errs);')).toBe(true);
    expect(wizard.includes('const target = firstErrorStep(errs);')).toBe(true);
  });
  it('each step renders its field-specific validator message', () => {
    expect(wizard.includes("errorFor('businessName')")).toBe(true);
    expect(wizard.includes("errorFor('positioning')")).toBe(true);
    expect(wizard.includes("errorFor('services')")).toBe(true);
    expect(wizard.includes('errorFor(k)')).toBe(true);
    expect(wizard.includes('errorFor(`palette.${role}`)')).toBe(true);
  });
  it('review surfaces only unknown-field messages (routed to the review step)', () => {
    expect(wizard.includes('errors.filter((e) => stepForField(e.field) === step)')).toBe(true);
  });
  it('editing a field clears its stale error group', () => {
    expect(wizard.includes('const clearError = (field) =>')).toBe(true);
    expect(wizard.includes("clearError('services')")).toBe(true);
    expect(wizard.includes('clearError(`palette.${role}`)')).toBe(true);
    expect(wizard.includes('clearError(k)')).toBe(true);
  });
  it('still uses the S0D validator + truthful save (no duplicated rules)', () => {
    expect(wizard.includes('validateBusinessProfile(form)')).toBe(true);
    expect(wizard.includes("dispatch({ type: 'SAVE_BUSINESS_PROFILE', payload: value });")).toBe(true);
  });
});
