import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeLocalEnginesEnabled, resolveLocalEngineUrl, LOCAL_ENGINES_ENABLED } from '../localEngines.js';

// R2 — hosted local-engine probe gate.
//
// Production builds bake .env.local values into the bundle, so the studio
// machine's 127.0.0.1 engine URLs used to reach hosted visitors and probe
// their localhost (CORS/PNA console errors + 15s retry loops). These tests
// pin the gate: DEV / explicit opt-in keeps local development identical;
// default production resolves every local-engine URL to '' so NO local fetch
// can ever start.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('localEngines · gate decision (pure)', () => {
  it('enabled in DEV; disabled in default production; explicit opt-in only via VITE_ENABLE_LOCAL_ENGINES=true', () => {
    expect(computeLocalEnginesEnabled({ DEV: true })).toBe(true);
    expect(computeLocalEnginesEnabled({ DEV: false })).toBe(false);
    expect(computeLocalEnginesEnabled({ DEV: false, VITE_ENABLE_LOCAL_ENGINES: 'true' })).toBe(true);
    // anything but the exact string 'true' stays disabled (no accidental opt-in)
    for (const v of ['TRUE', '1', 'yes', true, '', undefined, null]) {
      expect(computeLocalEnginesEnabled({ DEV: false, VITE_ENABLE_LOCAL_ENGINES: v }), String(v)).toBe(false);
    }
    expect(computeLocalEnginesEnabled(null)).toBe(false);
    expect(computeLocalEnginesEnabled(undefined)).toBe(false);
  });

  it('under vitest (a DEV-mode environment) the live gate is open — local development behavior preserved', () => {
    expect(LOCAL_ENGINES_ENABLED).toBe(true);
    expect(resolveLocalEngineUrl('http://127.0.0.1:8188/')).toBe('http://127.0.0.1:8188'); // configured URL + slash trim
    expect(resolveLocalEngineUrl('', 'http://127.0.0.1:7865')).toBe('http://127.0.0.1:7865'); // dev default applies
    expect(resolveLocalEngineUrl(undefined)).toBe('');
  });
});

// ---- default-production (gate closed) behavior, end-to-end through the real
// engine modules: every local URL resolves '' and no fetch can start. ----
describe('localEngines · gate CLOSED (hosted production default)', () => {
  let fetchSpy;

  beforeEach(() => {
    vi.resetModules();
    // Simulate the production resolution: the gate module reports disabled.
    vi.doMock('../localEngines.js', () => ({
      LOCAL_ENGINES_ENABLED: false,
      computeLocalEnginesEnabled: () => false,
      resolveLocalEngineUrl: () => '',
    }));
    fetchSpy = vi.fn(async () => { throw new Error('NO NETWORK CALL MAY HAPPEN WITH THE GATE CLOSED'); });
    vi.stubGlobal('fetch', fetchSpy);
    // Even a configured studio machine env must be neutralized by the gate:
    vi.stubEnv('VITE_COMFYUI_URL', 'http://127.0.0.1:8188');
    vi.stubEnv('VITE_LOCAL_LLM_URL', 'http://127.0.0.1:11434/v1');
    vi.stubEnv('VITE_FOOOCUS_URL', 'http://127.0.0.1:7865');
  });

  afterEach(() => {
    vi.doUnmock('../localEngines.js');
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('ComfyUI: system_stats + object_info + model listing cannot fetch; feature flags read "not configured"', async () => {
    const img = await import('../geminiImage.js');
    expect(img.localEngineUrl).toBe('');
    expect(img.hasLocalComfy).toBe(false);
    expect(img.hasFluxModel).toBe(false);
    expect(img.hasVideoModel).toBe(false);
    expect(img.hasKontextModel).toBe(false);
    await expect(img.checkLocalEngine()).resolves.toBe(false);       // system_stats path
    await expect(img.listImageModels()).resolves.toEqual([]);        // object_info/CheckpointLoaderSimple
    await expect(img.hasPulidNode()).resolves.toBe(false);           // object_info/ApplyPulidFlux
    await expect(img.hasFaceDetailerNode()).resolves.toBe(false);    // object_info/FaceDetailer
    await expect(img.hasUpscaleModel()).resolves.toBe(false);        // object_info/UpscaleModelLoader
    await expect(img.hasQwenEditNode()).resolves.toBe(false);        // object_info/UnetLoaderGGUF
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Ollama / local Jake brain: useLocalLLM is false and the local brain is never offered', async () => {
    const gem = await import('../gemini.js');
    expect(gem.useLocalLLM).toBe(false);
    expect(gem.jakeBrainLabel().brain).not.toBe('local');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---- source guards: the gate cannot be bypassed. (R4.1: Fooocus.jsx was
// retired and deleted, so its per-file guards left with it; the /fooocus
// route now redirects to /studio in App.jsx.) ----
describe('localEngines · source guards (no bypass)', () => {
  const GEMINI = read('../gemini.js');
  const GEMINI_IMAGE = read('../geminiImage.js');

  it('every local-engine env URL resolves through resolveLocalEngineUrl()', () => {
    expect(GEMINI.includes("resolveLocalEngineUrl(import.meta.env.VITE_LOCAL_LLM_URL)")).toBe(true);
    expect(GEMINI.includes("resolveLocalEngineUrl(import.meta.env.VITE_COMFYUI_URL)")).toBe(true);
    expect(GEMINI_IMAGE.includes("resolveLocalEngineUrl(import.meta.env.VITE_LOCAL_IMAGE_URL)")).toBe(true);
    expect(GEMINI_IMAGE.includes("resolveLocalEngineUrl(import.meta.env.VITE_COMFYUI_URL)")).toBe(true);
    // the old ungated read pattern must not return in any of these files
    for (const [name, src] of [['gemini.js', GEMINI], ['geminiImage.js', GEMINI_IMAGE]]) {
      expect(/\(import\.meta\.env\.VITE_(COMFYUI_URL|LOCAL_LLM_URL|LOCAL_IMAGE_URL|FOOOCUS_URL)\s*\|\|/.test(src), name).toBe(false);
    }
  });

  it('only localEngines.js decides enablement (no scattered VITE_ENABLE_LOCAL_ENGINES reads)', () => {
    for (const [name, src] of [['gemini.js', GEMINI], ['geminiImage.js', GEMINI_IMAGE]]) {
      expect(src.includes('VITE_ENABLE_LOCAL_ENGINES'), name).toBe(false);
    }
    expect(read('../localEngines.js').includes("VITE_ENABLE_LOCAL_ENGINES === 'true'")).toBe(true);
  });

  it('gateway-backed paths are untouched: draftWithJake stays on the AI Gateway, ImageStudio enhance intact', () => {
    expect(GEMINI.includes("callAiGateway('jake.draft_message'")).toBe(true);
    const studio = read('../../pages/ImageStudio.jsx');
    expect(/callAiGateway\('studio\.prompt_enhance',\s*\{\s*prompt:/.test(studio)).toBe(true);
  });
});
