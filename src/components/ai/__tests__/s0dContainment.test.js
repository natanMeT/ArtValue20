import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ===================================================================
// S0D minimal cloud-beta containment (Option A) — source-level guards
// (the repo has no DOM renderer; components are pinned via readFileSync).
// Proves no signed-in cloud-beta account can view/send hardcoded ArtValue
// business facts through the mapped Growth surfaces or the Studio handoff,
// while local/demo behavior and all frozen LIVE lanes are preserved.
// ===================================================================

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const assistant = read('../Assistant.jsx');
const panel = read('../../growth/BusinessBrainPanel.jsx');
const growth = read('../../../pages/growth/Growth.jsx');
const growthContext = read('../../../data/growthContext.js');
const sidebar = read('../../layout/sidebarNav.js');

describe('S0D · Studio handoff gated in authenticated cloud beta', () => {
  it('every studioHandoffFor(text) call is gated by isSupabaseConfigured (both lanes)', () => {
    const all = (assistant.match(/studioHandoffFor\(text\)/g) || []).length;
    const gated = (assistant.match(/isSupabaseConfigured \? null : studioHandoffFor\(text\)/g) || []).length;
    expect(all).toBe(2);          // draft lane + chat lane
    expect(gated).toBe(2);        // and both are gated → zero ungated
  });

  it('preserves handoff behavior OUTSIDE cloud beta (ternary keeps studioHandoffFor for local/demo)', () => {
    // isSupabaseConfigured === false → studioHandoffFor(text) still runs.
    expect(assistant).toContain('? null : studioHandoffFor(text)');
  });

  it('direct ImageStudio access is untouched (open-in-Studio navigation + /studio route unaffected)', () => {
    expect(assistant).toContain("navigate('/studio'");            // Jake→Studio open handler still present
    const app = read('../../../App.jsx');
    expect(app).toContain('path="/studio"');                       // direct route intact
  });
});

describe('S0D · BusinessBrainPanel contained in cloud beta', () => {
  it('imports the cloud-beta signal and early-returns a neutral note before any ArtValue content', () => {
    expect(panel).toMatch(/import\s*\{\s*isSupabaseConfigured\s*\}\s*from\s*'[^']*lib\/supabase\.js'/);
    const gate = panel.indexOf('if (isSupabaseConfigured)');
    const neutral = panel.indexOf('עדיין אינו זמין בגרסת הבטא');
    const brandCopy = panel.indexOf('לפי השפה של ArtValue');
    const brandSeed = panel.indexOf('askJake(buildPosterBrief');
    expect(gate).toBeGreaterThan(-1);
    expect(neutral).toBeGreaterThan(gate);          // neutral note rendered inside the gated return
    // the ArtValue copy + active brand seeds are only reachable AFTER the gate
    expect(brandCopy).toBeGreaterThan(gate);
    expect(brandSeed).toBeGreaterThan(gate);
    expect(neutral).toBeLessThan(brandCopy);        // gate returns before the ArtValue panel
  });
});

describe('S0D · Growth seeds neutralized at source (no ArtValue brand sent)', () => {
  it('growthContext.js emits no hardcoded "ArtValue" business name/positioning in its seeds', () => {
    // header comment may reference the rule; code/output must not emit the brand.
    const nonComment = growthContext.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
    expect(nonComment).not.toContain('ArtValue');
    expect(growthContext).not.toContain('POSITIONING'); // brand positioning import removed
  });

  it('Growth hub subtitle is brand-neutral', () => {
    expect(growth).not.toContain('של Art Value');
  });
});

describe('S0D · frozen LIVE lanes + sidebar unchanged', () => {
  it('sidebar navigation is unchanged (Growth items still present, no beta gating change)', () => {
    expect(sidebar).toContain('GROWTH_NAV');
    expect(sidebar).toContain("label: 'צמיחה ולידים'");
    // Growth is NOT beta-hidden (unchanged) — only Projects/Inventory/Templates/Activity are.
    expect(sidebar).not.toContain("...GROWTH_NAV, betaHidden");
  });

  it('Creative V2 campaign lane is frozen (still imported + not brain-wrapped)', () => {
    expect(assistant).toContain("import { createArtValueCreative } from '../../creative/v2/createArtValueCreative.js'");
    expect(assistant).not.toContain('createArtValueCreative(withBusinessBrain');
  });

  it('force-actions lane stays lean (no business brain), briefing untouched', () => {
    expect(assistant).toContain('forceActionsJake(text, activePack.buildContext(data))');
    expect(assistant).not.toContain('forceActionsJake(text, withBusinessBrain');
    expect(assistant).toContain('activePack.briefing(data)');
  });
});
