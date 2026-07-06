// ===================================================================
// productLock — PURE helpers for the Product Lock composite workflow.
// Placement math + pixel-level cutout over plain {data,width,height}
// objects (testable in node, no DOM/canvas/network). The ProductPlacer
// component owns all canvas/DOM work; nothing here has side effects.
//
// Placement model (resolution-independent):
//   nx, ny    — product CENTER, normalized to the base image (0..1)
//   scale     — product width as a fraction of the base width
//   rotation  — degrees, normalized to [-180, 180)
// ===================================================================

// Reasonable assisted starting point: centered, lower-middle, ~1/3 width.
export function defaultPlacement() {
  return { nx: 0.5, ny: 0.62, scale: 0.32, rotation: 0 };
}

// Keep the placement usable: center stays on-canvas, scale stays sane,
// rotation wraps to [-180, 180). Never mutates the input.
export function clampPlacement(p) {
  const src = p || {};
  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  let rotation = num(src.rotation, 0);
  rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return {
    nx: Math.min(0.98, Math.max(0.02, num(src.nx, 0.5))),
    ny: Math.min(0.98, Math.max(0.02, num(src.ny, 0.62))),
    scale: Math.min(1.5, Math.max(0.05, num(src.scale, 0.32))),
    rotation,
  };
}

// Convert a normalized placement into pixel-space draw params for a given
// base resolution. Product aspect ratio is preserved. Pure.
export function placementToPixels(p, baseW, baseH, prodW, prodH) {
  const w = p.scale * baseW;
  const h = prodW > 0 ? w * (prodH / prodW) : w;
  return { cx: p.nx * baseW, cy: p.ny * baseH, w, h, rotation: p.rotation || 0 };
}

// Does this image already carry meaningful transparency? (e.g. a product
// PNG with a transparent background — then no cutout is needed.)
// img = { data: Uint8ClampedArray(RGBA), width, height }.
export function hasTransparency(img) {
  const d = img?.data;
  if (!d) return false;
  let count = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 250) {
      count += 1;
      if (count > 16) return true; // more than a few stray pixels
    }
  }
  return false;
}

// Simple clean-background cutout: near-white, low-chroma pixels become
// transparent. Intended for e-commerce style product shots on a clean
// light background. Returns a NEW {data,width,height}; input untouched.
export function applyCleanCutout(img, opts = {}) {
  const threshold = opts.threshold ?? 240; // min channel value considered "background white"
  const maxChroma = opts.maxChroma ?? 18;  // max channel spread (keeps colored pixels)
  const out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i]; const g = out[i + 1]; const b = out[i + 2];
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
    if (mn >= threshold && (mx - mn) <= maxChroma) out[i + 3] = 0;
  }
  return { data: out, width: img.width, height: img.height };
}
