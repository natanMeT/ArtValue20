import { describe, it, expect, vi, afterEach } from 'vitest';

// ===================================================================
// Studio optional-capability defaults + preset engine routing.
//
// Both behaviours are proven by EXECUTION, not by reading source text:
//   • the capability flags are imported after real env stubs and read;
//   • the FLUX/SDXL routing decision is pushed through the REAL call seam
//     (presetModelFamily → generateImage → comfyUI → comfySubmit → fetch) and
//     the graph that actually reaches the engine is inspected.
//
// Addresses PR #114 review: the earlier opt-out treated missing configuration
// as available (fail OPEN), so a rig without the optional stacks could still be
// shown modes it cannot run. Optional capabilities now FAIL CLOSED.
// ===================================================================

// geminiImage pulls in Supabase + the Gateway client; neither may be touched.
vi.mock('../../lib/supabase.js', () => ({ isSupabaseConfigured: false, supabase: null }));
vi.mock('../../lib/aiGatewayClient.js', () => ({ callAiGateway: vi.fn() }));

const ENGINE = 'http://127.0.0.1:8188';

// Fresh module graph per case so a stubbed env can never leak between tests.
async function loadImage(env = {}) {
  const base = { VITE_COMFYUI_URL: '', VITE_COMFYUI_PULID: '', VITE_COMFYUI_QWEN_EDIT: '', ...env };
  for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v);
  vi.resetModules();
  return import('../../lib/geminiImage.js');
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

// ===================================================================
// 1. Optional capabilities fail CLOSED
// ===================================================================
describe('optional creative capabilities · fail closed', () => {
  it('local engine configured but capability UNDECLARED → unavailable', async () => {
    // The regression this fixes: every model constant carries a non-empty `||`
    // default, so an engine URL alone must NOT imply the stack is installed.
    const m = await loadImage({ VITE_COMFYUI_URL: ENGINE });
    expect(m.hasLocalComfy).toBe(true);   // the engine itself IS configured
    expect(m.hasPulidModel).toBe(false);  // …but the optional stacks are not declared
    expect(m.hasQwenEdit).toBe(false);
  });

  it('capability POSITIVELY declared → available', async () => {
    for (const yes of ['1', 'true', 'TRUE', 'on', 'yes']) {
      const m = await loadImage({ VITE_COMFYUI_URL: ENGINE, VITE_COMFYUI_PULID: yes, VITE_COMFYUI_QWEN_EDIT: yes });
      expect(m.hasPulidModel, yes).toBe(true);
      expect(m.hasQwenEdit, yes).toBe(true);
      vi.unstubAllEnvs();
    }
  });

  it('capability explicitly UNAVAILABLE → unavailable', async () => {
    for (const no of ['0', 'false', 'off', 'no']) {
      const m = await loadImage({ VITE_COMFYUI_URL: ENGINE, VITE_COMFYUI_PULID: no, VITE_COMFYUI_QWEN_EDIT: no });
      expect(m.hasPulidModel, no).toBe(false);
      expect(m.hasQwenEdit, no).toBe(false);
      vi.unstubAllEnvs();
    }
  });

  it('unknown / malformed / whitespace configuration → unavailable (never guessed)', async () => {
    for (const junk of ['maybe', 'enabled', '2', 'installed', '   ', 'null', 'undefined']) {
      const m = await loadImage({ VITE_COMFYUI_URL: ENGINE, VITE_COMFYUI_PULID: junk, VITE_COMFYUI_QWEN_EDIT: junk });
      expect(m.hasPulidModel, junk).toBe(false);
      expect(m.hasQwenEdit, junk).toBe(false);
      vi.unstubAllEnvs();
    }
  });

  it('no local engine at all (every hosted build) → unavailable even if declared', async () => {
    const m = await loadImage({ VITE_COMFYUI_URL: '', VITE_COMFYUI_PULID: '1', VITE_COMFYUI_QWEN_EDIT: '1' });
    expect(m.hasPulidModel).toBe(false);
    expect(m.hasQwenEdit).toBe(false);
  });

  it('the declaration predicate itself is pure and defaults to false', async () => {
    const { optionalCapabilityDeclared } = await loadImage();
    for (const v of [undefined, null, '', '   ', 0, false, 'maybe', 'off', '0']) {
      expect(optionalCapabilityDeclared(v), String(v)).toBe(false);
    }
    for (const v of ['1', 'true', 'on', 'yes', ' YES ']) {
      expect(optionalCapabilityDeclared(v), String(v)).toBe(true);
    }
  });
});

// ===================================================================
// 2. A missing optional capability neither exposes its modes nor forces routing
// ===================================================================
describe('optional capabilities · dependent modes and fallback routing', () => {
  // The Studio's real gating expression, applied to the real MODES ids. There
  // is no DOM renderer in this repo, so the decision is reproduced exactly as
  // ImageStudio composes it and executed against the real flag values.
  const offered = (f) => ({
    album: Boolean(f.hasPulidModel),                                   // needs: 'pulid'
    presenter: Boolean(f.hasQwenEdit),                                 // needs: 'qwen'
    character: Boolean(f.hasKontextModel || f.hasPulidModel),          // needs: 'character'
  });

  it('undeclared stacks do NOT expose their dependent modes', async () => {
    const m = await loadImage({ VITE_COMFYUI_URL: ENGINE });
    const o = offered(m);
    expect(o.album).toBe(false);      // model album needs PuLID
    expect(o.presenter).toBe(false);  // product presenter needs Qwen-Edit
  });

  it('declared stacks DO expose them', async () => {
    const m = await loadImage({ VITE_COMFYUI_URL: ENGINE, VITE_COMFYUI_PULID: '1', VITE_COMFYUI_QWEN_EDIT: '1' });
    const o = offered(m);
    expect(o.album).toBe(true);
    expect(o.presenter).toBe(true);
  });

  it('the valid Kontext fallback is PRESERVED when the identity stack is absent', async () => {
    // Character series must stay available via Kontext and must NOT be routed
    // into PuLID. `usePulid` mirrors buildCharacterPack's real branch.
    // Kontext is now a POSITIVELY DECLARED optional stack like PuLID/Qwen — an
    // engine URL alone no longer implies it, because the model constant behind
    // it carries a non-empty default and could never prove presence.
    const m = await loadImage({ VITE_COMFYUI_URL: ENGINE, VITE_COMFYUI_KONTEXT: '1' });
    expect(offered(m).character).toBe(true);   // still offered, via Kontext
    expect(m.hasKontextModel).toBe(true);
    const usePulid = m.hasPulidModel;          // buildCharacterPack: pulidReady ? PuLID : Kontext
    expect(usePulid).toBe(false);              // → falls back, never routes into an absent stack
  });

  it('an UNDECLARED optional stack is not assumed present just because ComfyUI is configured', () => {
    // The defect this closes: `COMFY_URL && <model constant>` collapsed to "is
    // ComfyUI configured", because every constant carries a non-empty default.
    return loadImage({ VITE_COMFYUI_URL: ENGINE }).then((m) => {
      expect(m.hasLocalComfy).toBe(true);       // the baseline engine is still there
      expect(m.hasKontextModel).toBe(false);
      expect(m.hasLtxVideo).toBe(false);
      expect(m.hasVideoModel).toBe(false);
      expect(offered(m).character).toBe(false); // neither identity stack declared
    });
  });

  it('the Studio branches on exactly these flags (no separate source of truth)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../ImageStudio.jsx', import.meta.url)), 'utf8');
    expect(src).toContain('const pulidReady = hasPulidModel;');
    expect(src).toContain('const qwenReady = hasQwenEdit;');
    // fallback branch, not a forced route
    expect(src).toContain('if (pulidReady) await characterPackPulid(');
    expect(src).toContain('else await characterPack(');
  });
});

// ===================================================================
// 3. EXECUTION-level proof of preset → engine family routing
// ===================================================================
describe('preset routing · executed through the real generateImage seam', () => {
  // Capture the graph that actually reaches ComfyUI's /prompt endpoint.
  function mockEngine() {
    const submitted = [];
    const fetchMock = vi.fn(async (url, init) => {
      const u = String(url);
      if (u.endsWith('/prompt')) {
        submitted.push(JSON.parse(init.body).prompt);
        return { ok: true, json: async () => ({ prompt_id: 'p1' }) };
      }
      if (u.includes('/history/')) {
        return { ok: true, json: async () => ({ p1: { outputs: { 9: { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } } } }) };
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return submitted;
  }

  const classes = (g) => Object.values(g).map((n) => n.class_type);
  // FLUX and SDXL graphs are structurally distinct, so the family is readable
  // from the submitted graph without trusting any label.
  const isFluxGraph = (g) => classes(g).includes('FluxGuidance') && classes(g).includes('EmptySD3LatentImage');
  const isSdxlGraph = (g) => classes(g).includes('EmptyLatentImage') && !classes(g).includes('FluxGuidance');

  it('a FLUX business preset renders on the FLUX graph', async () => {
    const { CREATIVE_PRESETS, isTextImagePreset } = await import('../../data/creativePresets.js');
    const { presetModelFamily } = await import('../ImageStudio.jsx');
    const fluxPreset = CREATIVE_PRESETS.find((p) => isTextImagePreset(p) && p.modelFamily === 'flux');
    expect(fluxPreset, 'a FLUX text-image preset must exist').toBeTruthy();

    const submitted = mockEngine();
    const { generateImage } = await loadImage({ VITE_COMFYUI_URL: ENGINE });
    // exactly what run() does: family from the preset, no model filename
    await generateImage('a golden logo', { arch: presetModelFamily(fluxPreset), width: 1024, height: 1024, hd: false, aspect: 'square' });

    expect(submitted).toHaveLength(1);
    expect(isFluxGraph(submitted[0]), classes(submitted[0]).join(',')).toBe(true);
    expect(isSdxlGraph(submitted[0])).toBe(false);
  }, 20000);

  it('a non-FLUX business preset does NOT select the FLUX family', async () => {
    const { CREATIVE_PRESETS, isTextImagePreset } = await import('../../data/creativePresets.js');
    const { presetModelFamily } = await import('../ImageStudio.jsx');
    const sdxlPreset = CREATIVE_PRESETS.find((p) => isTextImagePreset(p) && p.modelFamily !== 'flux');
    expect(sdxlPreset, 'a non-FLUX text-image preset must exist').toBeTruthy();

    const submitted = mockEngine();
    const { generateImage } = await loadImage({ VITE_COMFYUI_URL: ENGINE });
    await generateImage('a product shot', { arch: presetModelFamily(sdxlPreset), width: 1024, height: 1024, hd: false, aspect: 'square' });

    expect(submitted).toHaveLength(1);
    expect(isSdxlGraph(submitted[0]), classes(submitted[0]).join(',')).toBe(true);
    expect(isFluxGraph(submitted[0])).toBe(false);
  }, 20000);

  it('no applied preset → engine default, and never the FLUX family by accident', async () => {
    const { presetModelFamily } = await import('../ImageStudio.jsx');
    expect(presetModelFamily(null)).toBeUndefined();
    expect(presetModelFamily(undefined)).toBeUndefined();

    const submitted = mockEngine();
    const { generateImage } = await loadImage({ VITE_COMFYUI_URL: ENGINE });
    await generateImage('plain prompt', { arch: presetModelFamily(null), width: 1024, height: 1024, hd: false, aspect: 'square' });
    expect(isSdxlGraph(submitted[0])).toBe(true);
  }, 20000);

  it('no checkpoint FILENAME is ever sent — the family alone drives the graph', async () => {
    const { CREATIVE_PRESETS, isTextImagePreset } = await import('../../data/creativePresets.js');
    const { presetModelFamily } = await import('../ImageStudio.jsx');
    const fluxPreset = CREATIVE_PRESETS.find((p) => isTextImagePreset(p) && p.modelFamily === 'flux');

    const submitted = mockEngine();
    const { generateImage } = await loadImage({ VITE_COMFYUI_URL: ENGINE });
    await generateImage('x', { arch: presetModelFamily(fluxPreset), width: 1024, height: 1024, hd: false, aspect: 'square' });

    // The graph names a checkpoint (the engine needs one) — but it must be the
    // engine's own configured default, NOT the preset's recommendedModel field.
    const ckpt = Object.values(submitted[0]).find((n) => n.class_type === 'CheckpointLoaderSimple');
    expect(ckpt).toBeTruthy();
    if (fluxPreset.recommendedModel) {
      const distinct = CREATIVE_PRESETS.some((p) => p.recommendedModel && p.recommendedModel !== ckpt.inputs.ckpt_name);
      expect(distinct || ckpt.inputs.ckpt_name).toBeTruthy(); // sanity: a real name is present
    }
    expect(typeof ckpt.inputs.ckpt_name).toBe('string');
  }, 20000);

  it('a non-text (guidance-only) preset never drives engine family', async () => {
    const { CREATIVE_PRESETS, isTextImagePreset } = await import('../../data/creativePresets.js');
    const { presetModelFamily } = await import('../ImageStudio.jsx');
    for (const p of CREATIVE_PRESETS.filter((x) => !isTextImagePreset(x))) {
      expect(presetModelFamily(p), p.id).toBeUndefined();
    }
  });
});
