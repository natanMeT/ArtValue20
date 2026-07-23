import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { visibleNavSections, NAV_SECTIONS } from '../../layout/sidebarNav.js';
import { GROWTH_NAV } from '../../../pages/growth/growthNav.js';
import { BETA_HIDDEN_MODULES } from '../../../lib/betaCapabilities.js';
import { buildGrowthContext } from '../../../data/growthContext.js';

// ===================================================================
// S0D cloud-beta containment (Option A, corrected P1) — the ENTIRE Growth
// OS is beta-contained via the existing BetaUnavailable route seam, so no
// signed-in cloud-beta account can view/send the ArtValue-specific Growth
// datasets or Ask-Jake seeds. Proven by the route gate + sidebar hiding
// (structural), NOT by string neutralization. Local/demo is unchanged.
// (No DOM renderer in this repo → App/Assistant pinned via readFileSync;
// sidebar + nav config verified behaviorally.)
// ===================================================================

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const app = read('../../../App.jsx');
const assistant = read('../Assistant.jsx');

const GROWTH_ROUTES = ['/growth', '/growth/leads', '/growth/calendar', '/growth/content', '/calls'];
const flat = (sections) => sections.flatMap((s) => s.items).map((i) => i.to);

describe('S0D · every Growth route is beta-contained (cloud beta) via a centralized gate', () => {
  it('App.jsx wires a GrowthBetaGate that renders BetaUnavailable when isSupabaseConfigured', () => {
    expect(app).toContain("import BetaUnavailable from './components/ui/BetaUnavailable.jsx'");
    expect(app).toMatch(/import\s*\{\s*isSupabaseConfigured\s*\}\s*from\s*'\.\/lib\/supabase\.js'/);
    expect(app).toMatch(/function GrowthBetaGate[\s\S]*?if \(isSupabaseConfigured\) return <BetaUnavailable[\s\S]*?return children/);
  });

  it('ALL five Growth routes are wrapped by the gate; no Growth page renders directly', () => {
    for (const p of GROWTH_ROUTES) {
      expect(app, p).toContain(`path="${p}" element={<GrowthBetaGate`);
    }
    expect((app.match(/<GrowthBetaGate/g) || []).length).toBe(GROWTH_ROUTES.length);
  });

  it('Outreach + ImageStudio are NOT gated (LIVE lanes untouched)', () => {
    expect(app).toContain('path="/outreach" element={<Outreach />}');
    expect(app).toContain('path="/studio" element={<ImageStudio />}');
    expect(app).not.toContain('GrowthBetaGate title=""'); // sanity: no empty gate
  });

  it('growth is in the central BETA_HIDDEN_MODULES classification', () => {
    expect(BETA_HIDDEN_MODULES.has('growth')).toBe(true);
  });
});

describe('S0D · sidebar hides all Growth items in cloud beta, keeps Outreach', () => {
  it('every GROWTH_NAV item is betaHidden', () => {
    expect(GROWTH_NAV.length).toBeGreaterThan(0);
    expect(GROWTH_NAV.every((i) => i.betaHidden === true)).toBe(true);
  });

  it('cloud-beta sidebar contains NO Growth route and DOES contain Outreach', () => {
    const visible = flat(visibleNavSections(true));
    for (const p of GROWTH_ROUTES) expect(visible, p).not.toContain(p);
    expect(visible).toContain('/outreach');
  });

  it('local/demo sidebar shows the FULL Growth group unchanged', () => {
    const visible = flat(visibleNavSections(false));
    for (const p of GROWTH_ROUTES) expect(visible, p).toContain(p);
    expect(visible).toContain('/outreach');
    // and the source-of-truth section still composes GROWTH_NAV
    expect(NAV_SECTIONS.some((s) => s.label === 'צמיחה ולידים')).toBe(true);
  });
});

describe('S0D · local/demo Growth datasets + behavior are unchanged (partial neutralization reverted)', () => {
  it('growthContext still emits its original ArtValue content for local/demo', () => {
    // toContain here proves the REVERT (local unchanged) — not a neutrality claim.
    expect(buildGrowthContext()).toContain('ArtValue');
  });
});

describe('S0D · Assistant Studio-handoff containment remains active', () => {
  it('both studioHandoffFor(text) calls stay gated by isSupabaseConfigured', () => {
    expect((assistant.match(/studioHandoffFor\(text\)/g) || []).length).toBe(2);
    expect((assistant.match(/isSupabaseConfigured \? null : studioHandoffFor\(text\)/g) || []).length).toBe(2);
    expect(assistant).toContain("navigate('/studio'"); // direct Studio open still present
  });
});
