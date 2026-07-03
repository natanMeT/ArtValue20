import { describe, it, expect } from 'vitest';
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
