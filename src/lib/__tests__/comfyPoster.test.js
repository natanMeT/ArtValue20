import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

// Mock the LOCAL image engine. `hasLocalComfy` is exposed as a getter so each test can
// flip "ComfyUI configured?" without re-importing. checkLocalEngine / generateImage are
// spies so we can PROVE the fail-closed, ComfyUI-only contract (never Pollinations/Gemini).
const state = vi.hoisted(() => ({ hasLocalComfy: true }));
const checkLocalEngine = vi.hoisted(() => vi.fn());
const generateImage = vi.hoisted(() => vi.fn());
vi.mock('../geminiImage.js', () => ({
  get hasLocalComfy() { return state.hasLocalComfy; },
  checkLocalEngine,
  generateImage,
}));

import { generatePosterFromOffer } from '../comfyPoster.js';

const brief = { offer: { service: 'מערכת CRM חכמה' }, visualDirection: { mood: 'נקי ומקצועי', palette: ['כחול עמוק', 'לבן'] } };
const LOCAL_SRC = 'http://localhost:8188/view?filename=artvalue_x.png&type=output';

beforeEach(() => {
  state.hasLocalComfy = true;
  checkLocalEngine.mockReset().mockResolvedValue(true);
  generateImage.mockReset().mockResolvedValue({ src: LOCAL_SRC, engine: 'local' });
});

describe('comfyPoster — local ComfyUI-only adapter (fail-closed)', () => {
  it('ComfyUI not configured → { ok:false } and no engine calls at all', async () => {
    state.hasLocalComfy = false;
    const r = await generatePosterFromOffer(brief);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('comfy_not_configured');
    expect(checkLocalEngine).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('ComfyUI offline → { ok:false, reason:comfy_offline } and never submits a render', async () => {
    checkLocalEngine.mockResolvedValue(false);
    const r = await generatePosterFromOffer(brief);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('comfy_offline');
    expect(generateImage).not.toHaveBeenCalled();
    expect(r.prompt).toBeTruthy(); // the built prompt is returned for context
  });

  it('online success → { ok:true, src } using the LOCAL engine, SDXL by default', async () => {
    const r = await generatePosterFromOffer(brief);
    expect(r.ok).toBe(true);
    expect(r.src).toBe(LOCAL_SRC);
    expect(r.engine).toBe('local');
    expect(generateImage).toHaveBeenCalledTimes(1);
    const [promptArg, optsArg] = generateImage.mock.calls[0];
    expect(typeof promptArg).toBe('string');
    expect(optsArg.arch).toBe('sdxl');          // SDXL is the MVP default
    expect(optsArg.width).toBe(1024);
    expect(optsArg.height).toBe(1280);          // 4:5 portrait
  });

  it('passes an ENGLISH prompt to the engine (no Hebrew)', async () => {
    await generatePosterFromOffer(brief);
    const [promptArg] = generateImage.mock.calls[0];
    expect(/[֐-׿]/.test(promptArg)).toBe(false);
  });

  it('engine throws → { ok:false, reason:generation_failed } and does NOT throw', async () => {
    generateImage.mockRejectedValue(new Error('comfy 500'));
    await expect(generatePosterFromOffer(brief)).resolves.toEqual(
      expect.objectContaining({ ok: false, reason: 'generation_failed' }),
    );
  });

  it('rejects a non-local engine result (no Pollinations/Gemini image is ever surfaced)', async () => {
    generateImage.mockResolvedValue({ src: 'https://image.pollinations.ai/x', engine: 'pollinations' });
    const r = await generatePosterFromOffer(brief);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unexpected_engine');
  });

  it('missing src from the engine → { ok:false, reason:no_image }', async () => {
    generateImage.mockResolvedValue({ engine: 'local' });
    const r = await generatePosterFromOffer(brief);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_image');
  });

  it('malformed brief → { ok:false, reason:prompt_failed } before any engine call', async () => {
    const r = await generatePosterFromOffer(null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('prompt_failed');
    expect(checkLocalEngine).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('never throws for any input', async () => {
    for (const bad of [null, undefined, 42, 'x', [], {}]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(generatePosterFromOffer(bad)).resolves.toHaveProperty('ok');
    }
  });
});

describe('comfyPoster — source purity (no external provider/token in the poster path)', () => {
  const raw = fs.readFileSync('src/lib/comfyPoster.js', 'utf8');
  // Strip comments first: the doc header legitimately NAMES Pollinations/Gemini to say
  // they are NOT used — we scan executable code only (mirrors posterIsolation.test.js).
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  it('code contains no Pollinations usage or token', () => {
    expect(/pollinat/i.test(code)).toBe(false);
    expect(code.includes('VITE_POLLINATIONS')).toBe(false);
  });
  it('code contains no other external provider references', () => {
    expect(/openai|ollama/i.test(code)).toBe(false);
    expect(/VITE_GEMINI/i.test(code)).toBe(false);
  });
  it('imports only the local engine + the deterministic poster prompt builder', () => {
    const specs = [...raw.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specs.sort()).toEqual(['../creative/v2/poster/comfyPosterPrompt.js', './geminiImage.js']);
  });
});
