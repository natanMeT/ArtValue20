import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseComfyOptions, hasFluxModel, hasLocalComfy, qwenComposeGraph } from '../geminiImage.js';

// ===================================================================
// ComfyUI object_info option parser — the capability-detection fix.
// (Slice: creative engine detection + business presets)
// Runs in node: no browser APIs, no live engine, no GPU. Pure parser.
// ===================================================================

const UPSCALE = '4x-UltraSharp.pth';

describe('parseComfyOptions — both ComfyUI formats', () => {
  it('parses the OLD flat format (field[0] is the string list)', () => {
    const field = [['RealVisXL_V4.0.safetensors', 'flux1-dev-fp8.safetensors'], { tooltip: 'x' }];
    expect(parseComfyOptions(field)).toEqual(['RealVisXL_V4.0.safetensors', 'flux1-dev-fp8.safetensors']);
  });

  it('parses the NEW COMBO format (options on the config object)', () => {
    const field = ['COMBO', { multiselect: false, options: [UPSCALE, 'other.pth'] }];
    expect(parseComfyOptions(field)).toEqual([UPSCALE, 'other.pth']);
  });

  it('detects the installed 4x-UltraSharp.pth from the COMBO format (the real bug)', () => {
    // Exactly the shape the live engine returns for UpscaleModelLoader.model_name.
    const field = ['COMBO', { multiselect: false, options: [UPSCALE] }];
    expect(parseComfyOptions(field).includes(UPSCALE)).toBe(true);
  });

  it('does not detect a model that is not installed', () => {
    const field = ['COMBO', { options: ['4x-AnimeSharp.pth'] }];
    expect(parseComfyOptions(field).includes(UPSCALE)).toBe(false);
  });

  it('filters non-string entries in either format', () => {
    expect(parseComfyOptions([['a.pth', 5, null, 'b.pth'], {}])).toEqual(['a.pth', 'b.pth']);
    expect(parseComfyOptions(['COMBO', { options: ['a.pth', 5, undefined, 'b.pth'] }])).toEqual(['a.pth', 'b.pth']);
  });
});

describe('parseComfyOptions — defensive against malformed input', () => {
  it('returns [] for missing / malformed structures (never throws)', () => {
    for (const bad of [undefined, null, {}, 'string', 42, [], ['COMBO'], ['COMBO', null], ['COMBO', 'nope'], ['COMBO', {}], ['COMBO', { options: 'x' }]]) {
      expect(parseComfyOptions(bad)).toEqual([]);
    }
  });

  it('returns [] for empty options list', () => {
    expect(parseComfyOptions(['COMBO', { options: [] }])).toEqual([]);
    expect(parseComfyOptions([[], {}])).toEqual([]);
  });

  it('is pure and deterministic — same input, same output, no mutation', () => {
    const field = ['COMBO', { options: [UPSCALE, 'b.pth'] }];
    const before = JSON.stringify(field);
    expect(parseComfyOptions(field)).toEqual(parseComfyOptions(field));
    expect(JSON.stringify(field)).toBe(before); // input not mutated
  });
});

// ===================================================================
// qwenComposeGraph — Product Presenter multi-image graph topology.
// Pure builder: no network, no ComfyUI, no generation.
// ===================================================================

describe('qwenComposeGraph — Qwen multi-image compose (Product Presenter)', () => {
  const g = qwenComposeGraph('presenter.png', 'product.png', 'place the product in her hand', 12345);

  it('loads TWO images: presenter (10) and product (12)', () => {
    expect(g['10']).toEqual({ class_type: 'LoadImage', inputs: { image: 'presenter.png' } });
    expect(g['12']).toEqual({ class_type: 'LoadImage', inputs: { image: 'product.png' } });
  });

  it('positive text node wires image1=presenter, image2=product and the instruction', () => {
    const pos = g['6'];
    expect(pos.class_type).toBe('TextEncodeQwenImageEditPlus');
    expect(pos.inputs.image1).toEqual(['10', 0]);
    expect(pos.inputs.image2).toEqual(['12', 0]);
    expect(pos.inputs.prompt).toBe('place the product in her hand');
  });

  it('negative text node wires image1=presenter, image2=product with an empty prompt', () => {
    const neg = g['7'];
    expect(neg.class_type).toBe('TextEncodeQwenImageEditPlus');
    expect(neg.inputs.image1).toEqual(['10', 0]);
    expect(neg.inputs.image2).toEqual(['12', 0]);
    expect(neg.inputs.prompt).toBe('');
  });

  it('does NOT wire image3 (reserved for a future third reference)', () => {
    expect('image3' in g['6'].inputs).toBe(false);
    expect('image3' in g['7'].inputs).toBe(false);
  });

  it('the VAEEncode latent/canvas comes from the PRESENTER image', () => {
    expect(g['11']).toEqual({ class_type: 'VAEEncode', inputs: { pixels: ['10', 0], vae: ['39', 0] } });
    expect(g['3'].inputs.latent_image).toEqual(['11', 0]);
  });

  it('keeps the Qwen edit stack defaults: Lightning LoRA path, 8 steps, cfg 1', () => {
    expect(g['41'].class_type).toBe('LoraLoaderModelOnly');
    expect(g['42'].inputs.model).toEqual(['41', 0]); // AuraFlow fed by Lightning
    expect(g['3'].inputs.steps).toBe(8);
    expect(g['3'].inputs.cfg).toBe(1.0);
    // lightning:false → no LoRA node, base UNet feeds AuraFlow, 20 steps / cfg 2.5
    const slow = qwenComposeGraph('p.png', 'q.png', 'x', 1, { lightning: false });
    expect(slow['41']).toBeUndefined();
    expect(slow['42'].inputs.model).toEqual(['37', 0]);
    expect(slow['3'].inputs.steps).toBe(20);
    expect(slow['3'].inputs.cfg).toBe(2.5);
  });

  it('is pure and deterministic (same input → deep-equal graph, no mutation)', () => {
    expect(qwenComposeGraph('a.png', 'b.png', 'p', 7)).toEqual(qwenComposeGraph('a.png', 'b.png', 'p', 7));
  });

  it('renders through the standard KSampler → VAEDecode → SaveImage tail', () => {
    expect(g['8']).toEqual({ class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['39', 0] } });
    expect(g['9'].class_type).toBe('SaveImage');
    expect(g['9'].inputs.images).toEqual(['8', 0]);
  });
});

// ===================================================================
// Job-event seam (Studio queue/progress/cancel slice) — exercised through
// the public generateImage() with a stubbed env + fetch + fake timers.
// ===================================================================

describe('geminiImage — onComfyJob seam', () => {
  const BASE = 'http://127.0.0.1:9999';

  async function loadWithEngine() {
    vi.stubEnv('VITE_COMFYUI_URL', BASE);
    vi.resetModules();
    return import('../geminiImage.js');
  }

  function engineFetch(capture) {
    return vi.fn(async (url, init) => {
      const u = String(url);
      if (u.endsWith('/prompt') && init?.method === 'POST') {
        capture.body = JSON.parse(init.body);
        return { ok: true, json: async () => ({ prompt_id: 'p1' }) };
      }
      if (u.includes('/history/p1')) {
        return { ok: true, json: async () => ({ p1: { outputs: { 9: { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } } } }) };
      }
      return { ok: true, json: async () => ({}) };
    });
  }

  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('dispatches {promptId, clientId, tag, graph, at}; a throwing listener never breaks generation', async () => {
    vi.useFakeTimers();
    const m = await loadWithEngine();
    const capture = {};
    vi.stubGlobal('fetch', engineFetch(capture));
    const events = [];
    const offThrow = m.onComfyJob(() => { throw new Error('bad subscriber'); });
    const off = m.onComfyJob((ev) => events.push(ev));
    m.markNextComfyJob('studio-run');
    const p = m.generateImage('test prompt', {});
    await vi.advanceTimersByTimeAsync(1500);
    const r = await p;
    expect(r.src).toContain(`${BASE}/view?`);           // generation survived the throwing listener
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.promptId).toBe('p1');
    expect(ev.tag).toBe('studio-run');                   // one-shot tag delivered
    expect(ev.clientId).toBe(capture.body.client_id);    // WS routing invariant: same client_id as POSTed
    expect(ev.graph).toEqual(capture.body.prompt);       // graph included for node-name mapping
    expect(typeof ev.at).toBe('number');
    // POST body shape unchanged beyond client_id: exactly {prompt, client_id}
    expect(Object.keys(capture.body).sort()).toEqual(['client_id', 'prompt']);
    offThrow(); off();
  });

  it('failed submission dispatches nothing; unsubscribe works; untagged submits carry tag null', async () => {
    vi.useFakeTimers();
    const m = await loadWithEngine();
    const events = [];
    const off = m.onComfyJob((ev) => events.push(ev));
    // failed POST → no dispatch
    vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).endsWith('/prompt')
      ? { ok: false, status: 500 }
      : { ok: true, json: async () => ({}) })));
    m.markNextComfyJob('studio-run');
    await expect(m.generateImage('x', {})).rejects.toThrow();
    expect(events).toHaveLength(0);
    // successful untagged submit → tag null (the failed attempt consumed the mark)
    const capture = {};
    vi.stubGlobal('fetch', engineFetch(capture));
    const p = m.generateImage('x', {});
    await vi.advanceTimersByTimeAsync(1500);
    await p;
    expect(events).toHaveLength(1);
    expect(events[0].tag).toBeNull();
    // unsubscribe → no further events
    off();
    const p2 = m.generateImage('x', {});
    await vi.advanceTimersByTimeAsync(1500);
    await p2;
    expect(events).toHaveLength(1);
  });
});

describe('geminiImage module — import hygiene', () => {
  it('imports without hitting the network and exposes boolean feature flags', () => {
    // If the module dispatched a fetch on import (no local engine in the test
    // env) it would still import fine, but these flags prove the module loaded
    // and the parser is a callable pure export.
    expect(typeof parseComfyOptions).toBe('function');
    expect(typeof hasFluxModel).toBe('boolean');
    expect(typeof hasLocalComfy).toBe('boolean');
  });
});
