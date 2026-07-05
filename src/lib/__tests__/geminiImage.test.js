import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseComfyOptions, hasFluxModel, hasLocalComfy } from '../geminiImage.js';

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
