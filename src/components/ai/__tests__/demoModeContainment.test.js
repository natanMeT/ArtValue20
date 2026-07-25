import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shouldAutoOpenDemo } from '../DemoMode.jsx';

// ===================================================================
// S0E dual-tour correction — the legacy DemoMode walkthrough must never
// auto-open in authenticated cloud mode, where the S0E guided business
// onboarding is the single automatic first-run flow. On a fresh browser both
// used to open at once (App mounts <DemoMode /> and <OnboardingOwner />, and
// DemoMode auto-opened purely on the absence of `artvalue_demo_seen_v1`).
//
// The decision itself is a pure helper, so it is tested behaviorally. The
// wiring around it (manual opener always registered, seen key written only on
// an explicit close) is pinned against the source — there is no DOM renderer
// in this repo.
// ===================================================================
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const demo = read('../DemoMode.jsx');
const app = read('../../../App.jsx');
const dashboard = read('../../../pages/Dashboard.jsx');
const wizard = read('../../onboarding/OnboardingWizard.jsx');

// 1 + 3) The auto-open decision itself.
describe('shouldAutoOpenDemo (pure)', () => {
  it('cloud mode + missing seen key → does NOT auto-open (S0E owns first run)', () => {
    expect(shouldAutoOpenDemo({ cloudMode: true, seen: false })).toBe(false);
  });
  it('cloud mode + seen key present → still does not auto-open', () => {
    expect(shouldAutoOpenDemo({ cloudMode: true, seen: true })).toBe(false);
  });
  it('local/demo mode + missing seen key → auto-opens, exactly as before', () => {
    expect(shouldAutoOpenDemo({ cloudMode: false, seen: false })).toBe(true);
  });
  it('local/demo mode + seen key present → does not auto-open, exactly as before', () => {
    expect(shouldAutoOpenDemo({ cloudMode: false, seen: true })).toBe(false);
  });
});

// The component asks the helper with the existing cloud-mode signal.
describe('DemoMode consults the helper with the existing cloud-mode signal', () => {
  it('imports isSupabaseConfigured and passes it as cloudMode with the seen key', () => {
    expect(demo.includes("import { isSupabaseConfigured } from '../../lib/supabase.js';")).toBe(true);
    expect(demo.includes('shouldAutoOpenDemo({ cloudMode: isSupabaseConfigured, seen: !!localStorage.getItem(SEEN_KEY) })')).toBe(true);
  });
  it('the raw "no seen key → open" condition is gone (the only auto-open path is the helper)', () => {
    expect(demo.includes('if (!localStorage.getItem(SEEN_KEY))')).toBe(false);
    expect((demo.match(/shouldAutoOpenDemo\(/g) || []).length).toBe(2); // 1 definition + 1 call site
  });
});

// 2 + 5) The manual opener is unconditional — cloud keeps the tour reachable,
// and it never consults the seen key.
describe('manual artvalue:demo:open opener stays available in both modes', () => {
  it('registers + cleans up the listener unconditionally (no cloud gate, outside the try)', () => {
    expect(demo.includes("window.addEventListener('artvalue:demo:open', onOpen);")).toBe(true);
    expect(demo.includes("window.removeEventListener('artvalue:demo:open', onOpen);")).toBe(true);
    const eff = demo.slice(demo.indexOf('useEffect(() => {'), demo.indexOf("window.addEventListener('artvalue:demo:open'"));
    // between the effect start and the registration there is exactly one guarded
    // block (the try/catch auto-open) — the registration is never nested in it.
    expect(eff.includes('} catch { /* ignore */ }')).toBe(true);
    expect(eff.indexOf('} catch { /* ignore */ }')).toBeLessThan(eff.indexOf('const onOpen ='));
  });
  it('the handler opens at step 0 regardless of mode or seen key', () => {
    expect(demo.includes('const onOpen = () => { setStep(0); setOpen(true); };')).toBe(true);
    const handler = demo.slice(demo.indexOf('const onOpen ='), demo.indexOf('const onOpen =') + 60);
    expect(handler.includes('SEEN_KEY')).toBe(false);
    expect(handler.includes('isSupabaseConfigured')).toBe(false);
  });
  it("the Dashboard's manual tour button is unchanged", () => {
    expect(dashboard.includes("window.dispatchEvent(new CustomEvent('artvalue:demo:open'))")).toBe(true);
    expect(dashboard.includes('מצב הדגמה')).toBe(true);
  });
});

// 4) Closing still records the seen key — and nothing records it automatically.
describe('seen key is written only by an explicit user action', () => {
  it('closing records artvalue_demo_seen_v1 (local/demo behavior preserved)', () => {
    expect(demo.includes("const SEEN_KEY = 'artvalue_demo_seen_v1';")).toBe(true);
    expect(demo.includes("const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } };")).toBe(true);
    expect(demo.includes('const close = () => { markSeen(); setOpen(false); };')).toBe(true);
  });
  it('there is exactly one writer, and the auto-open effect is not one of them', () => {
    expect((demo.match(/localStorage\.setItem\(SEEN_KEY/g) || []).length).toBe(1);
    const eff = demo.slice(demo.indexOf('useEffect(() => {'), demo.indexOf('}, []);'));
    expect(eff.includes('setItem')).toBe(false);
    expect(eff.includes('markSeen')).toBe(false);
  });
  it('the tour is not deleted or disabled — all steps and the live ג׳יק examples remain', () => {
    expect((demo.match(/icon: '/g) || []).length).toBe(8);
    expect(demo.includes('export default function DemoMode()')).toBe(true);
  });
});

// 7) Jake seams untouched: the tour still drives ג׳יק exactly as before.
describe('Jake events and actions are unchanged', () => {
  it("still fires a single jake:ask, and adds no new Jake event", () => {
    expect((demo.match(/new CustomEvent\('jake:ask'/g) || []).length).toBe(1);
    expect(demo.includes("window.dispatchEvent(new CustomEvent('jake:ask', { detail: q }));")).toBe(true);
    expect(demo.includes('jake:prefill')).toBe(false);
    expect(demo.includes("new CustomEvent('jake:open'")).toBe(false);
  });
});

// 6) S0E onboarding is untouched — it remains the sole automatic first-run flow.
describe('S0E OnboardingOwner behavior is unchanged', () => {
  it('App still mounts both surfaces (DemoMode is contained, not removed)', () => {
    expect(app.includes("import DemoMode from './components/ai/DemoMode.jsx';")).toBe(true);
    expect(app.includes('<DemoMode />')).toBe(true);
    expect(app.includes("import { OnboardingOwner } from './components/onboarding/OnboardingWizard.jsx';")).toBe(true);
    expect(app.includes('<OnboardingOwner />')).toBe(true);
  });
  it('the owner keeps its hydration-gated, once-per-uid auto-open', () => {
    expect(wizard.includes('const hydrationReady = computeHydrationReady({ supabaseEnabled, authReady, loading, session, error });')).toBe(true);
    expect(wizard.includes('if (computeAutoOpen({ hydrationReady, profile, dismissed })) {')).toBe(true);
    expect(wizard.includes('if (!hydrationReady || !open) return null;')).toBe(true);
  });
  it('the wizard knows nothing about the demo tour (no coupling introduced)', () => {
    expect(wizard.includes('artvalue_demo_seen_v1')).toBe(false);
    expect(wizard.includes('artvalue:demo:open')).toBe(false);
    expect(wizard.includes('DemoMode')).toBe(false);
  });
});
