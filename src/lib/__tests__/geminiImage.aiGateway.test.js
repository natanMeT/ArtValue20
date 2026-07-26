// ===================================================================
// M2 J3C S4.2 — ImageStudio text→image wired to the protected AI Gateway.
//
// Pins the geminiImage.js hosted lane end-to-end (callAiGateway mocked, no
// network, no live provider): exact action + byte-exact { prompt, aspectRatio }
// payload for all three aspect presets, exactly one attempt, JPEG→UI-shape
// conversion, fail-closed on malformed/PNG/empty, NO retry and NO second
// provider on any configured-Gateway failure, and Pollinations demo isolated to
// supabase_not_configured + token. Local ComfyUI / A1111 precedence stays intact.
// A source-guard block pins the ImageStudio wiring (label / download / non-text
// modes / prompt-enhance) without rendering the page.
// ===================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The image module reads isSupabaseConfigured for availability and calls the
// protected Gateway client for generation — both are mocked so no browser key,
// no Supabase client, and no network are ever touched.
vi.mock('../supabase.js', () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock('../aiGatewayClient.js', () => ({ callAiGateway: vi.fn() }));

// Fresh module graph per case: stub env → reset → re-import. A clean baseline
// (no local engine, no demo token) means one test's stubbed engine URL can never
// leak into the next; `env` overrides only what a case needs. The mocked
// callAiGateway handle is re-acquired each load (the factory re-runs on reset),
// so the returned spy is the exact one generateImage will call.
async function load(env = {}) {
  const base = { VITE_COMFYUI_URL: '', VITE_LOCAL_IMAGE_URL: '', VITE_POLLINATIONS_TOKEN: '', ...env };
  for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v);
  vi.resetModules();
  const gw = await import('../aiGatewayClient.js');
  const mod = await import('../geminiImage.js');
  return { ...mod, callAiGateway: gw.callAiGateway };
}

const OK_JPEG = (base64 = 'QUJD') => ({ ok: true, result: { image: { mimeType: 'image/jpeg', base64 } } });

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('generateImage · hosted AI Gateway lane (M2 J3C S4.2)', () => {
  it('sends exactly ONE callAiGateway("studio.generate_image", { prompt, aspectRatio }) — byte-exact for each preset', async () => {
    for (const [aspect, aspectRatio] of [['square', '1:1'], ['portrait', '2:3'], ['landscape', '3:2']]) {
      const { generateImage, callAiGateway } = await load();
      callAiGateway.mockClear();
      callAiGateway.mockResolvedValue(OK_JPEG());
      // Deliberately pass local-engine opts too — none may leak into the payload.
      await generateImage('  a golden logo  ', {
        aspect, model: 'RealVisXL.safetensors', arch: 'sdxl', width: 1024, height: 1216, hd: true, quality: 'max',
      });
      expect(callAiGateway).toHaveBeenCalledTimes(1);
      const [action, payload] = callAiGateway.mock.calls[0];
      expect(action).toBe('studio.generate_image');
      expect(payload).toEqual({ prompt: 'a golden logo', aspectRatio }); // trimmed prompt + mapped ratio
    }
  });

  it('the payload carries NO authority fields — only prompt + aspectRatio (#9)', async () => {
    const { generateImage, callAiGateway } = await load();
    callAiGateway.mockResolvedValue(OK_JPEG());
    await generateImage('x', { aspect: 'landscape', model: 'm', arch: 'flux', width: 1216, height: 832, hd: true });
    const [, payload] = callAiGateway.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['aspectRatio', 'prompt']);
    for (const banned of ['provider', 'model', 'apiKey', 'key', 'endpoint', 'imageSize', 'mimeType', 'count', 'hd', 'width', 'height', 'arch', 'aspect', 'retry', 'fallback', 'safety', 'temperature']) {
      expect(banned in payload, banned).toBe(false);
    }
  });

  it('converts a valid JPEG result into the existing UI shape (#3)', async () => {
    const { generateImage, callAiGateway } = await load();
    callAiGateway.mockResolvedValue(OK_JPEG('SGVsbG8gd29ybGQ='));
    const r = await generateImage('x', { aspect: 'square' });
    expect(r).toEqual({
      src: 'data:image/jpeg;base64,SGVsbG8gd29ybGQ=',
      engine: 'gateway',
      demo: false,
      mimeType: 'image/jpeg',
    });
  });

  it('fails VISIBLY on malformed / non-JPEG / empty result — one attempt, no retry, no fallback (#4)', async () => {
    const { generateImage, callAiGateway } = await load();
    const bad = [
      { ok: true, result: { image: { mimeType: 'image/png', base64: 'QUJD' } } }, // PNG rejected
      { ok: true, result: { image: { mimeType: 'image/jpeg', base64: '' } } },    // empty base64
      { ok: true, result: { image: { mimeType: 'image/jpeg', base64: 123 } } },   // non-string
      { ok: true, result: { image: { mimeType: 'image/jpeg' } } },                // missing base64
      { ok: true, result: { image: null } },
      { ok: true, result: {} },
      { ok: true, result: null },
      { ok: true },
    ];
    for (const res of bad) {
      callAiGateway.mockClear();
      callAiGateway.mockResolvedValue(res);
      const err = await generateImage('x', { aspect: 'square' }).catch((e) => e);
      expect(err, JSON.stringify(res)).toBeInstanceOf(Error);
      expect(/נכשלה/.test(err.message)).toBe(true);
      expect(callAiGateway).toHaveBeenCalledTimes(1); // one attempt, no retry
    }
  });

  it('every configured-Gateway failure → generic Hebrew error, ONE attempt, never a second provider — even WITH a Pollinations token (#5)', async () => {
    const { generateImage, callAiGateway } = await load({ VITE_POLLINATIONS_TOKEN: 'pk_demo_token' });
    const codes = [
      'unauthenticated', 'unauthorized', 'invalid_payload', 'rate_limited', 'budget_exceeded',
      'budget_guard_unavailable', 'provider_error', 'provider_not_configured', 'invalid_provider_response',
      'timeout', 'network_error', 'gateway_error', 'not_implemented', 'something_unexpected',
    ];
    for (const code of codes) {
      callAiGateway.mockClear();
      callAiGateway.mockResolvedValue({ ok: false, error: { code, message: 'raw server detail sk-LEAK 500' } });
      const err = await generateImage('x', { aspect: 'square' }).catch((e) => e);
      expect(err, code).toBeInstanceOf(Error);
      // generic, content-free copy — never the raw code / server message
      expect(/להתחבר|עמוס|נכשלה/.test(err.message), code).toBe(true);
      expect(/sk-LEAK|500|provider_error|budget_exceeded/.test(err.message), code).toBe(false);
      expect(callAiGateway).toHaveBeenCalledTimes(1); // one attempt, no Pollinations even with a token
    }
  });

  it('Pollinations demo runs ONLY for supabase_not_configured AND only with a token (#6)', async () => {
    // supabase_not_configured + token → the demo path
    {
      const { generateImage, callAiGateway } = await load({ VITE_POLLINATIONS_TOKEN: 'pk_demo_token' });
      callAiGateway.mockClear();
      callAiGateway.mockResolvedValue({ ok: false, error: { code: 'supabase_not_configured' } });
      const r = await generateImage('a cat', { aspect: 'square' });
      expect(r.engine).toBe('pollinations');
      expect(callAiGateway).toHaveBeenCalledTimes(1);
    }
    // supabase_not_configured + NO token → throws, no demo, no fallback
    {
      const { generateImage, callAiGateway } = await load();
      callAiGateway.mockClear();
      callAiGateway.mockResolvedValue({ ok: false, error: { code: 'supabase_not_configured' } });
      await expect(generateImage('a cat', { aspect: 'square' })).rejects.toThrow();
      expect(callAiGateway).toHaveBeenCalledTimes(1);
    }
  });

  it('toGatewayAspectRatio maps the three presets and defaults everything else to 1:1', async () => {
    const { toGatewayAspectRatio } = await load();
    expect(toGatewayAspectRatio('square')).toBe('1:1');
    expect(toGatewayAspectRatio('portrait')).toBe('2:3');
    expect(toGatewayAspectRatio('landscape')).toBe('3:2');
    for (const junk of [undefined, null, '', 'wide', 'SQUARE', '2:3', 42, {}, []]) {
      expect(toGatewayAspectRatio(junk)).toBe('1:1');
    }
  });
});

describe('generateImage · local-engine precedence stays byte-compatible (#7)', () => {
  it('with COMFY_URL set, generation stays on ComfyUI and never calls the Gateway', async () => {
    const { generateImage, callAiGateway } = await load({ VITE_COMFYUI_URL: 'http://127.0.0.1:8188' });
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/prompt')) return { ok: false, status: 500 };       // submit fails
      if (u.includes('/system_stats')) return { ok: false, status: 500 }; // engine reported down
      return { ok: true, json: async () => ({}) };
    }));
    await expect(generateImage('x', { aspect: 'square', arch: 'sdxl' })).rejects.toThrow();
    expect(callAiGateway).not.toHaveBeenCalled(); // no fallback to the Gateway on a local failure
  });

  it('with LOCAL_URL (A1111/Forge) set, generation stays local and never calls the Gateway', async () => {
    const { generateImage, callAiGateway } = await load({ VITE_LOCAL_IMAGE_URL: 'http://127.0.0.1:7860' });
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/sdapi/v1/txt2img')) return { ok: true, json: async () => ({ images: ['UE5HYmFzZTY0'] }) };
      return { ok: true, json: async () => ({}) };
    }));
    const r = await generateImage('x', { aspect: 'square' });
    expect(r.engine).toBe('local');
    expect(r.src.startsWith('data:image/png;base64,')).toBe(true); // local PNG untouched, no transcode
    expect(callAiGateway).not.toHaveBeenCalled();
  });
});

// ---- source guards: geminiImage.js + ImageStudio.jsx wiring (no render) ----
const IMG = readFileSync(fileURLToPath(new URL('../geminiImage.js', import.meta.url)), 'utf8');
const STUDIO = readFileSync(fileURLToPath(new URL('../../pages/ImageStudio.jsx', import.meta.url)), 'utf8');

// Extract a single self-contained function from source text and make it callable.
const extractFn = (name, src) => {
  const m = src.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`));
  expect(m, `${name} present`).not.toBe(null);
  // eslint-disable-next-line no-new-func
  return new Function(`${m[0]}\nreturn ${name};`)();
};

describe('S4.2 · direct-browser-Gemini retirement + Gateway wiring (source guards)', () => {
  it('geminiImage.js carries no browser-Gemini vectors and no direct Google fetch (#8)', () => {
    for (const banned of ['generativelanguage.googleapis.com', 'X-goog-api-key', 'VITE_GEMINI_API_KEY', 'API_KEY', 'VITE_GEMINI_IMAGE_MODEL', "engine: 'gemini'"]) {
      expect(IMG.includes(banned), banned).toBe(false);
    }
    // the hosted lane is a single protected Gateway attempt
    expect(IMG.includes("callAiGateway('studio.generate_image'")).toBe(true);
  });

  it('isImageAiConfigured is driven by isSupabaseConfigured, not the removed Gemini key (#10)', () => {
    expect(/export const isImageAiConfigured = Boolean\(isSupabaseConfigured/.test(IMG)).toBe(true);
  });

  it('ImageStudio prompt enhancement is still studio.prompt_enhance, byte-compatible (#11)', () => {
    expect(/callAiGateway\('studio\.prompt_enhance',\s*\{\s*prompt:\s*buildStudioEnhancePrompt\(/.test(STUDIO)).toBe(true);
  });

  // S0F.1 (D5): the engine argument is now `p` — the user's prompt after the
  // account's brand-palette block is (optionally) appended. The guard keeps its
  // full strength: the exact imported engine call per mode, the aspect preset id
  // in text mode, AND that `p` is produced by withBrandPalette from the user's
  // prompt (so no other value can be smuggled into the engine call).
  it('the engine prompt is the palette-composed prompt, derived from the user prompt', () => {
    expect(STUDIO.includes('const p = withBrandPalette(prompt, data?.businessProfile, paletteOn);')).toBe(true);
  });

  it('text mode passes the aspect preset id into generateImage opts', () => {
    expect(/generateImage\(p,\s*\{[^}]*aspect\s*\}\)/.test(STUDIO)).toBe(true);
  });

  it('every non-text ImageStudio mode keeps its exact imported engine call (#12)', () => {
    for (const call of [
      'editImage(file, p)',
      'generateImg2Img(file, p, { strength })',
      'qwenCompose(file, endFile, p',
      'inpaintImage(file, mask, p)',
      'flfVideo(file, endFile, p',
      'ltxVideo(file, p',
      'animateImage(file, {})',
    ]) {
      expect(STUDIO.includes(call), call).toBe(true);
    }
  });

  // Strengthened by the Studio local-engine UI containment slice. The result
  // badge used to branch on the ENGINE that produced the image (…'AI מאובטח'
  // for the Gateway, 'מקומי · FLUX.1' / 'Pollinations · Flux' otherwise). It
  // now names only WHAT was produced, plus demo-vs-real — so the original
  // guarantee (no browser/model/provider name) holds for every lane, not just
  // the Gateway lane.
  it('the result label names no engine, model or provider on ANY lane (#13)', () => {
    const badge = STUDIO.slice(STUDIO.indexOf('<span className={`badge ${result.demo'));
    const label = badge.slice(0, badge.indexOf('</span>'));
    for (const banned of [
      'gateway', 'gemini', 'Nano Banana', 'Pollinations', 'FLUX', 'SDXL',
      'Kontext', 'Qwen', 'LTX', 'SVD', 'מקומי', 'modelLabel',
    ]) {
      expect(label.includes(banned), banned).toBe(false);
    }
    // it still tells the truth about demo output and about what was made
    expect(label.includes('result.demo')).toBe(true);
    expect(label.includes('מצב הדגמה')).toBe(true);
    expect(STUDIO.includes("result.engine === 'gemini'")).toBe(false);
    expect(STUDIO.includes('Nano Banana')).toBe(false);
  });

  it('download filename: Gateway JPEG → .jpg, local video → .webp, local image → .png (#14)', () => {
    const studioDownloadName = extractFn('studioDownloadName', STUDIO);
    expect(studioDownloadName({ engine: 'gateway', mimeType: 'image/jpeg' })).toBe('artvalue-image.jpg');
    expect(studioDownloadName({ engine: 'gateway' })).toBe('artvalue-image.jpg');
    expect(studioDownloadName({ mimeType: 'image/jpeg' })).toBe('artvalue-image.jpg');
    expect(studioDownloadName({ isVideo: true })).toBe('artvalue-animation.webp');
    expect(studioDownloadName({ isVideo: true, engine: 'gateway' })).toBe('artvalue-animation.webp'); // video wins
    expect(studioDownloadName({ engine: 'local' })).toBe('artvalue-image.png');
    expect(studioDownloadName({ engine: 'pollinations' })).toBe('artvalue-image.png');
    expect(studioDownloadName(null)).toBe('artvalue-image.png');
    // the download button uses the helper, not a hardcoded .png
    expect(STUDIO.includes('downloadImage(result.src, studioDownloadName(result))')).toBe(true);
  });
});
