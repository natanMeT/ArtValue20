import { describe, it, expect } from 'vitest';
import {
  defaultPlacement, clampPlacement, placementToPixels, hasTransparency, applyCleanCutout,
} from '../productLock.js';

// ===================================================================
// productLock — pure placement math + cutout coverage. No DOM, no
// canvas, no network. Pixel helpers run over plain {data,width,height}.
// ===================================================================

// Build a tiny RGBA image from an array of [r,g,b,a] pixels.
const img = (pixels, width = pixels.length, height = 1) => ({
  data: new Uint8ClampedArray(pixels.flat()),
  width,
  height,
});

describe('defaultPlacement', () => {
  it('returns a safe assisted starting point (center-ish, lower-middle, ~1/3 width)', () => {
    const p = defaultPlacement();
    expect(p.nx).toBe(0.5);
    expect(p.ny).toBeGreaterThan(0.5);
    expect(p.ny).toBeLessThan(0.9);
    expect(p.scale).toBeGreaterThan(0.1);
    expect(p.scale).toBeLessThan(0.6);
    expect(p.rotation).toBe(0);
    // it survives its own clamp untouched
    expect(clampPlacement(p)).toEqual(p);
  });
});

describe('clampPlacement', () => {
  it('clamps center and scale into usable bounds', () => {
    expect(clampPlacement({ nx: -2, ny: 3, scale: 99, rotation: 0 }))
      .toEqual({ nx: 0.02, ny: 0.98, scale: 1.5, rotation: 0 });
    expect(clampPlacement({ nx: 0.5, ny: 0.5, scale: 0.001, rotation: 0 }).scale).toBe(0.05);
  });

  it('normalizes rotation into [-180, 180)', () => {
    expect(clampPlacement({ nx: 0.5, ny: 0.5, scale: 0.3, rotation: 370 }).rotation).toBe(10);
    expect(clampPlacement({ nx: 0.5, ny: 0.5, scale: 0.3, rotation: -190 }).rotation).toBe(170);
    expect(clampPlacement({ nx: 0.5, ny: 0.5, scale: 0.3, rotation: -45 }).rotation).toBe(-45);
  });

  it('fills missing/invalid fields with safe defaults and never mutates input', () => {
    const input = { nx: 'x', rotation: NaN };
    const before = JSON.stringify(input);
    const out = clampPlacement(input);
    expect(out.nx).toBe(0.5);
    expect(out.ny).toBe(0.62);
    expect(out.scale).toBe(0.32);
    expect(out.rotation).toBe(0);
    expect(JSON.stringify(input)).toBe(before);
    expect(clampPlacement(null)).toEqual({ nx: 0.5, ny: 0.62, scale: 0.32, rotation: 0 });
  });
});

describe('placementToPixels', () => {
  it('maps normalized placement to pixel draw params, preserving product aspect', () => {
    const px = placementToPixels({ nx: 0.5, ny: 0.62, scale: 0.32, rotation: 12 }, 1000, 800, 400, 200);
    expect(px.cx).toBe(500);
    expect(px.cy).toBeCloseTo(496);
    expect(px.w).toBeCloseTo(320);       // 0.32 × baseW
    expect(px.h).toBeCloseTo(160);       // aspect 2:1 preserved
    expect(px.rotation).toBe(12);
  });

  it('is resolution-independent (same normalized placement, different base sizes)', () => {
    const p = { nx: 0.25, ny: 0.75, scale: 0.4, rotation: 0 };
    const a = placementToPixels(p, 1000, 1000, 100, 100);
    const b = placementToPixels(p, 2000, 2000, 100, 100);
    expect(b.cx).toBe(a.cx * 2);
    expect(b.w).toBe(a.w * 2);
  });

  it('guards against zero product width', () => {
    const px = placementToPixels({ nx: 0.5, ny: 0.5, scale: 0.3, rotation: 0 }, 1000, 1000, 0, 0);
    expect(px.h).toBe(px.w); // falls back to square, no NaN
    expect(Number.isFinite(px.h)).toBe(true);
  });
});

describe('hasTransparency', () => {
  it('detects a transparent-background product PNG', () => {
    const pixels = Array.from({ length: 40 }, (_, i) => (i % 2 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    expect(hasTransparency(img(pixels))).toBe(true);
  });

  it('treats fully opaque images (and a few stray pixels) as non-transparent', () => {
    const opaque = Array.from({ length: 40 }, () => [200, 180, 160, 255]);
    expect(hasTransparency(img(opaque))).toBe(false);
    const stray = [...opaque]; stray[0] = [200, 180, 160, 0]; // a single stray pixel
    expect(hasTransparency(img(stray))).toBe(false);
    expect(hasTransparency(null)).toBe(false);
    expect(hasTransparency({})).toBe(false);
  });
});

describe('applyCleanCutout', () => {
  it('makes near-white low-chroma background transparent, keeps product pixels', () => {
    const source = img([
      [255, 255, 255, 255], // pure white bg → transparent
      [245, 244, 246, 255], // near-white bg → transparent
      [212, 175, 55, 255],  // gold (watch) → kept
      [30, 30, 30, 255],    // dark product → kept
      [250, 230, 230, 255], // light BUT chromatic (pinkish) → kept (min channel 230 < 240)
    ]);
    const out = applyCleanCutout(source);
    const a = (i) => out.data[i * 4 + 3];
    expect(a(0)).toBe(0);
    expect(a(1)).toBe(0);
    expect(a(2)).toBe(255);
    expect(a(3)).toBe(255);
    expect(a(4)).toBe(255);
    // RGB values of kept pixels untouched
    expect([out.data[8], out.data[9], out.data[10]]).toEqual([212, 175, 55]);
  });

  it('returns a NEW buffer and never mutates the source', () => {
    const source = img([[255, 255, 255, 255], [10, 20, 30, 255]]);
    const before = [...source.data];
    const out = applyCleanCutout(source);
    expect([...source.data]).toEqual(before);
    expect(out.data).not.toBe(source.data);
    expect(out.width).toBe(source.width);
    expect(out.height).toBe(source.height);
  });

  it('respects custom threshold options', () => {
    const source = img([[230, 230, 230, 255]]);
    expect(applyCleanCutout(source).data[3]).toBe(255);                    // default 240 keeps it
    expect(applyCleanCutout(source, { threshold: 220 }).data[3]).toBe(0);  // looser threshold cuts it
  });
});
