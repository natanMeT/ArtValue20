import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CREATIVE_PRESETS } from '../../data/creativePresets.js';

// ===================================================================
// S0F.1 (D5) — ImageStudio brand-palette consumption, wiring side.
// The palette VALUE rules are proven behaviorally in
// src/lib/__tests__/brandPalette.test.js; this file pins the page wiring:
// every generation branch uses the palette-composed prompt, the toggle is
// per-generation UI state only, no theme variable is recolored, and the
// Gateway image contract is unchanged.
// (No DOM renderer in this repo → the page is pinned via readFileSync.)
// ===================================================================

const imageStudio = readFileSync(new URL('../ImageStudio.jsx', import.meta.url), 'utf8');

describe('S0F.1 · ImageStudio palette wiring (D5)', () => {
  it('the engine prompt goes through withBrandPalette, gated by the toggle', () => {
    expect(imageStudio).toContain("import { activeBrandPalette, withBrandPalette } from '../lib/brandPalette.js'");
    expect(imageStudio).toContain('const p = withBrandPalette(prompt, data?.businessProfile, paletteOn);');
  });

  it('every generation branch in run() uses the palette-composed prompt', () => {
    const run = imageStudio.slice(imageStudio.indexOf('const run = async () => {'), imageStudio.indexOf('// Consistent-character pack'));
    expect(run).toContain('generateImage(p, {');
    expect(run).toContain('editImage(file, p)');
    expect(run).toContain('generateImg2Img(file, p, { strength })');
    expect(run).toContain('qwenCompose(file, endFile, p,');
    expect(run).toContain('inpaintImage(file, mask, p)');
    expect(run).toContain('flfVideo(file, endFile, p,');
    expect(run).toContain('ltxVideo(file, p,');
  });

  it('the toggle is per-generation UI state and never persisted', () => {
    expect(imageStudio).toContain('const [paletteOn, setPaletteOn] = useState(true)');
    expect(imageStudio).not.toContain('SAVE_BUSINESS_PROFILE');
    expect(imageStudio).not.toContain('upsertBusinessProfile');
    expect(imageStudio).not.toMatch(/setPaletteOn[\s\S]{0,200}dispatch\(/);
  });

  it('the palette block renders only when the account has a validated palette', () => {
    expect(imageStudio).toContain('const palette = useMemo(() => activeBrandPalette(data?.businessProfile)');
    expect(imageStudio).toContain('{palette && (');
  });

  it('the Gateway image contract is unchanged (same action + same option keys)', () => {
    expect(imageStudio).toContain('r = await generateImage(p, { arch: presetArch, width: asp.w, height: asp.h, hd, aspect });');
    // prompt_enhance is a meta-prompt lane and must NOT carry palette guidance
    expect(imageStudio).toContain('buildStudioEnhancePrompt(prompt, kind)');
  });

  it('no theme/CSS variable is recolored from the palette', () => {
    expect(imageStudio).not.toMatch(/setProperty\(\s*'--/);
    expect(imageStudio).not.toContain('documentElement.style');
  });

  it('the reachable preset label no longer names one tenant', () => {
    const preset = CREATIVE_PRESETS.find((x) => x.id === 'premium_business_visual');
    expect(preset).toBeTruthy();
    expect(preset.title).toBe('Premium Business Visual');
    expect(CREATIVE_PRESETS.some((x) => typeof x.title === 'string' && x.title.includes('ArtValue'))).toBe(false);
  });
});
