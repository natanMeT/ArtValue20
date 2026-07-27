import { describe, it, expect } from 'vitest';
import {
  defaultPlacement, clampPlacement, placementToPixels, hasTransparency, applyCleanCutout,
  buildSeamRingMask, seamRingSizes, shadowEllipseFor,
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

// ===================================================================
// B2 — seam-ring mask + blend-graph safety. The graph shape assertions
// are product-protection guarantees: interior excluded by geometry,
// grow_mask_by 0, terminal paste-back of the original composite.
// ===================================================================

// 60×60 canvas with an opaque 20×20 product square at (20..39, 20..39).
const squareSilhouette = () => {
  const w = 60; const h = 60;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 20; y < 40; y += 1) {
    for (let x = 20; x < 40; x += 1) data[(y * w + x) * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
};
const maskAt = (mask, x, y) => mask.data[(y * mask.width + x) * 4]; // red channel

describe('seamRingSizes', () => {
  it('scales with product width and enforces floors', () => {
    expect(seamRingSizes(1000)).toEqual({ inner: 15, outer: 60 });
    expect(seamRingSizes(100)).toEqual({ inner: 3, outer: 10 });  // floors kick in
    expect(seamRingSizes(0)).toEqual({ inner: 3, outer: 10 });
    expect(seamRingSizes('x')).toEqual({ inner: 3, outer: 10 });
  });
});

describe('shadowEllipseFor', () => {
  it('places the ellipse at the product bottom-center, sized from the width', () => {
    const s = shadowEllipseFor({ cx: 100, cy: 100, w: 200, h: 100 });
    expect(s.cx).toBe(100);
    expect(s.cy).toBe(150);              // bottom edge
    expect(s.rx).toBeCloseTo(110);       // 0.55 × w
    expect(s.ry).toBeCloseTo(18);        // 0.09 × w
  });
});

describe('buildSeamRingMask', () => {
  const OPTS = { inner: 3, outer: 10, feather: 0 };

  it('excludes the product interior (deep pixels stay black)', () => {
    const mask = buildSeamRingMask(squareSilhouette(), OPTS);
    expect(maskAt(mask, 30, 30)).toBe(0); // center — 10px deep, way past inner=3
    expect(maskAt(mask, 25, 25)).toBe(0); // 5px deep > inner
  });

  it('covers the boundary band inside and outside the edge', () => {
    const mask = buildSeamRingMask(squareSilhouette(), OPTS);
    expect(maskAt(mask, 20, 30)).toBe(255); // edge pixel (1px from bg ≤ inner)
    expect(maskAt(mask, 15, 30)).toBe(255); // 5px outside ≤ outer
    expect(maskAt(mask, 10, 30)).toBe(255); // exactly outer=10 outside
  });

  it('respects inner/outer sizing (beyond the band stays black)', () => {
    const mask = buildSeamRingMask(squareSilhouette(), OPTS);
    expect(maskAt(mask, 8, 30)).toBe(0);    // 12px outside > outer=10 (no feather)
    expect(maskAt(mask, 30, 24)).toBe(0);   // 4px deep inside > inner=3
    const wide = buildSeamRingMask(squareSilhouette(), { inner: 3, outer: 15, feather: 0 });
    expect(maskAt(wide, 8, 30)).toBe(255);  // wider outer now covers it
  });

  it('feathers the OUTER edge only — never the inner edge into the product', () => {
    const mask = buildSeamRingMask(squareSilhouette(), { inner: 3, outer: 10, feather: 2 });
    const soft = maskAt(mask, 9, 30);       // 11px outside — inside the feather band
    expect(soft).toBeGreaterThan(0);
    expect(soft).toBeLessThan(255);
    expect(maskAt(mask, 30, 30)).toBe(0);   // interior untouched by feather
    expect(maskAt(mask, 30, 24)).toBe(0);
  });

  it('unions the shadow ellipse below the product without repainting the interior', () => {
    const shadow = { cx: 30, cy: 55, rx: 8, ry: 3 };
    const withShadow = buildSeamRingMask(squareSilhouette(), { ...OPTS, shadow });
    const without = buildSeamRingMask(squareSilhouette(), OPTS);
    expect(maskAt(without, 30, 55)).toBe(0);    // beyond the ring
    expect(maskAt(withShadow, 30, 55)).toBe(255); // shadow region enabled
    // a shadow covering the product center still cannot open the interior
    const evil = buildSeamRingMask(squareSilhouette(), { ...OPTS, shadow: { cx: 30, cy: 30, rx: 20, ry: 20 } });
    expect(maskAt(evil, 30, 30)).toBe(0);
  });

  it('returns an empty (all-black) mask for an empty silhouette', () => {
    const w = 20; const h = 20;
    const empty = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    const mask = buildSeamRingMask(empty, OPTS);
    for (let i = 0; i < w * h; i += 1) {
      expect(mask.data[i * 4]).toBe(0);
      expect(mask.data[i * 4 + 3]).toBe(255); // opaque
    }
    expect(buildSeamRingMask(null)).toBeNull();
  });

  it('never mutates the input silhouette', () => {
    const sil = squareSilhouette();
    const before = [...sil.data];
    buildSeamRingMask(sil, { ...OPTS, shadow: { cx: 30, cy: 45, rx: 10, ry: 4 } });
    expect([...sil.data]).toEqual(before);
  });
});

