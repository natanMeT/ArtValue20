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

// ===================================================================
// B2 — seam-ring mask: AI is allowed to repaint ONLY this ring (edge
// band + optional contact shadow). The product interior is excluded by
// GEOMETRY, never by prompt wording.
// ===================================================================

// Ring sizing from the product's on-canvas pixel width.
export function seamRingSizes(prodWidthPx) {
  const w = Number.isFinite(Number(prodWidthPx)) ? Math.max(0, Number(prodWidthPx)) : 0;
  return { inner: Math.max(3, Math.round(w * 0.015)), outer: Math.max(10, Math.round(w * 0.06)) };
}

// Contact-shadow ellipse under the product's bottom edge, from the pixel
// placement ({cx,cy,w,h} as returned by placementToPixels). Pure math.
export function shadowEllipseFor(px) {
  return { cx: px.cx, cy: px.cy + px.h / 2, rx: px.w * 0.55, ry: Math.max(2, px.w * 0.09) };
}

// Two-pass city-block (chamfer) distance to the nearest feature pixel. O(n).
function chamferDistance(feature, w, h) {
  const INF = 1 << 29;
  const d = new Int32Array(w * h);
  for (let i = 0; i < d.length; i += 1) d[i] = feature[i] ? 0 : INF;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (x > 0 && d[i - 1] + 1 < d[i]) d[i] = d[i - 1] + 1;
      if (y > 0 && d[i - w] + 1 < d[i]) d[i] = d[i - w] + 1;
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = y * w + x;
      if (x < w - 1 && d[i + 1] + 1 < d[i]) d[i] = d[i + 1] + 1;
      if (y < h - 1 && d[i + w] + 1 < d[i]) d[i] = d[i + w] + 1;
    }
  }
  return d;
}

// Build the seam-ring inpaint mask from the product silhouette rendered at
// the base image's resolution (RGBA {data,width,height}; alpha = product).
// ring = dilate(S, outer) − erode(S, inner): only a band around the edge.
// Pixels deeper than `inner` inside the product stay black — including under
// the optional shadow ellipse — so the interior can never be repainted.
// Feather softens the OUTER edge only; the inner edge is never feathered
// into the product. Returns a NEW white-on-black RGBA image (red-channel
// compatible with ImageToMask); input untouched. Empty silhouette → empty mask.
export function buildSeamRingMask(silhouette, opts = {}) {
  const w = silhouette?.width; const h = silhouette?.height; const src = silhouette?.data;
  if (!src || !w || !h) return null;
  const inner = Math.max(1, Math.round(opts.inner ?? 3));
  const outer = Math.max(1, Math.round(opts.outer ?? 10));
  const feather = Math.max(0, Math.round(opts.feather ?? 2));
  const shadow = opts.shadow || null;
  const n = w * h;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i += 1) out[i * 4 + 3] = 255; // opaque black
  const S = new Uint8Array(n);
  const notS = new Uint8Array(n);
  let any = false;
  for (let i = 0; i < n; i += 1) {
    const on = src[i * 4 + 3] >= 8 ? 1 : 0;
    S[i] = on; notS[i] = 1 - on; if (on) any = true;
  }
  if (!any) return { data: out, width: w, height: h };
  const distToS = chamferDistance(S, w, h);     // 0 on/inside the product
  const distToBg = chamferDistance(notS, w, h); // depth inside the product
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (distToBg[i] > inner) continue; // deep interior — protected, stays black
      let v = 0;
      if (distToS[i] <= outer) v = 255;
      else if (feather && distToS[i] <= outer + feather) {
        v = Math.round((255 * (outer + feather - distToS[i])) / feather);
      }
      if (shadow && v < 255) {
        const dx = (x - shadow.cx) / (shadow.rx || 1);
        const dy = (y - shadow.cy) / (shadow.ry || 1);
        if (dx * dx + dy * dy <= 1) v = 255;
      }
      if (v > 0) { const o = i * 4; out[o] = v; out[o + 1] = v; out[o + 2] = v; }
    }
  }
  return { data: out, width: w, height: h };
}
