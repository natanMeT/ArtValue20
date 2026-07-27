import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ===================================================================
// Image Studio preset wiring — source-level guarantees (readFileSync
// pattern, no DOM deps). Ensures the preset picker is additive and can
// never auto-generate. (Slice: creative engine detection + presets)
// ===================================================================

const src = readFileSync(new URL('../ImageStudio.jsx', import.meta.url), 'utf8');

describe('ImageStudio preset picker — wiring', () => {
  it('imports the creative presets data + helper', () => {
    expect(src).toMatch(/import\s*\{[^}]*CREATIVE_PRESETS[^}]*\}\s*from\s*'[^']*data\/creativePresets\.js'/);
    expect(src).toContain('isTextImagePreset');
  });

  it('renders a preset picker labelled for business recipes', () => {
    expect(src).toContain('מתכוני עסק');
    expect(src).toContain('presets.map');
    expect(src).toContain('applyPreset');
  });

  it('preset buttons dispatch applyPreset from an explicit click handler', () => {
    expect(src).toContain('onClick={() => applyPreset(p)}');
  });
});

describe('ImageStudio preset picker — never auto-generates', () => {
  const applyBody = src.slice(src.indexOf('const applyPreset ='), src.indexOf('const copyText ='));

  it('applyPreset exists and is isolated for inspection', () => {
    expect(applyBody.length).toBeGreaterThan(50);
  });

  it('applyPreset never calls run() or a generation function', () => {
    expect(applyBody).not.toMatch(/\brun\(/);
    expect(applyBody).not.toMatch(/generateImage\(|generateImg2Img\(|editImage\(|inpaintImage\(|ltxVideo\(|animateImage\(/);
  });

  it('applyPreset adds no network/persistence call', () => {
    expect(applyBody).not.toMatch(/fetch\(|localStorage|addToGallery|indexedDB/);
  });

  it('applyPreset only fills prompt/aspect/model state (no image or unrelated resets)', () => {
    expect(applyBody).toContain('setPrompt(');
    // must NOT clear the uploaded image or reset gallery/result
    expect(applyBody).not.toMatch(/setFile\(|setResult\(|setGallery\(|setEndFile\(/);
  });
});

describe('ImageStudio preset picker — no scope creep', () => {
  it('adds no router / route definitions', () => {
    expect(src).not.toContain('createBrowserRouter');
    expect(src).not.toMatch(/<Route\b/);
  });

  it('the copy affordance is clipboard-only (no external send)', () => {
    expect(src).not.toContain('wa.me');
    expect(src).not.toContain('mailto:');
    expect(src).not.toContain('window.open(');
  });
});
